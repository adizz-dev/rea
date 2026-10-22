"""
Practice-quiz assistant.

Watches a quiz page in a persistent Chromium profile, extracts the visible
question + options, asks an LLM (Groq, with Gemini fallback) for a suggested answer, and OUTLINES the
suggested option(s) in the page. It never clicks, submits, or opens windows.

Controls:
    F8  start / pause monitoring
    F9  force a fresh Gemini query for the current question (ignores cache)

Usage:
    python practice_agent.py                 # run the agent
    python practice_agent.py --list-models   # show model IDs your key can use
    python practice_agent.py --debug         # log tabs/navigation/network errors
    python practice_agent.py --test          # check that your API keys/models work
    python practice_agent.py --attach        # use your real Chrome; attaches only while the agent is ON (F8)
"""

import hashlib
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
from urllib.parse import urlparse
from pathlib import Path

import keyboard
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright
from pydantic import BaseModel

load_dotenv(override=True)

# ----------------------------------------------------------------- config --
PROFILE_DIR = Path("playwright_profile")
LOG_FILE = Path("quiz_log.jsonl")
HOTKEY_TOGGLE = "f8"
HOTKEY_REFRESH = "f9"
POLL_INTERVAL = 0.5       # seconds between page polls
STABLE_SECONDS = 1.5      # content must be unchanged this long before querying
LOW_CONFIDENCE = 0.6      # below this, the outline turns orange instead of green
BROWSER_CHANNEL = os.getenv("BROWSER_CHANNEL", "")   # "" = bundled Chromium, or "chrome" / "msedge"
CDP_URL = os.getenv("CDP_URL", "http://localhost:9222")  # used with --attach
CHROME_PROFILE = os.getenv("CHROME_PROFILE", "chrome_agent_profile")  # real-Chrome profile dir
CHROME_PATH = os.getenv("CHROME_PATH", "")  # set only if Chrome is not found automatically

MIN_OPTIONS = 2           # MCQ only: pages with fewer options are ignored
MAX_OPTIONS = 8           # ...and pages with more are probably not an MCQ



def _key(*names):
    """Read an API key from the environment; strip quotes/spaces; ignore placeholders."""
    for name in names:
        v = (os.getenv(name) or "").strip().strip('"').strip("'").strip()
        if not v:
            continue
        if "," in v:
            v = v.split(",")[0].strip().strip('"').strip("'")
            print(f"[config] {name} contains several keys separated by commas. "
                  "Only the first one is used; put a single key in .env.")
        if v.lower().startswith("your_") or v.lower().endswith("_here"):
            print(f"[config] {name} in .env is still the placeholder. Paste your real key.")
            continue
        return v
    return None


GROQ_API_KEY = _key("GROQ_API_KEY")
# Comma-separated, tried in order. Limits are per model, so each gets its own quota.
GROQ_MODELS = [
    m.strip()
    for m in os.getenv("GROQ_MODELS", "openai/gpt-oss-120b,openai/gpt-oss-20b").split(",")
    if m.strip()
]
REASONING_EFFORT = os.getenv("REASONING_EFFORT", "high")  # low | medium | high (gpt-oss)

GEMINI_API_KEY = _key("GEMINI_API_KEY", "GOOGLE_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

running = False
force_refresh = False


# ------------------------------------------------------------ hotkeys -----
def toggle_agent():
    global running
    running = not running
    print("\n[agent] RUNNING" if running else "\n[agent] PAUSED")


def request_refresh():
    global force_refresh
    force_refresh = True
    print("\n[agent] Refresh requested")


# ------------------------------------------------- in-page extraction JS ---
# Raw strings so regex escapes reach JavaScript untouched.
EXTRACT_JS = r"""
() => {
  const NOISE = [
    /^save for later$/i, /^previous$/i, /^next$/i, /^save and next$/i,
    /^click here to check your answer$/i, /^q\s*\d+$/i,
    /^\d{1,2}:\d{2}(:\d{2})?$/, /^(time|timer|time left)\b/i,
    /^mark for review/i, /^clear( response)?$/i, /^submit/i,
    /^select any one$/i, /^review$/i, /^skip$/i
  ];
  const isNoise = t => NOISE.some(rx => rx.test(t));
  const clean = t => (t || '').replace(/\s+/g, ' ').trim();
  const visible = el => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' &&
           s.visibility !== 'hidden' && Number(s.opacity) !== 0;
  };

  // Remove tags from the previous poll.
  document.querySelectorAll('[data-pa-opt]')
    .forEach(e => e.removeAttribute('data-pa-opt'));

  // 1) Options from radio/checkbox inputs (or ARIA equivalents).
  const inputs = Array.from(document.querySelectorAll(
    'input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]'
  ));
  let opts = [];
  const seen = new Set();
  let sawCheckbox = false;

  for (const inp of inputs) {
    let el = null;
    if (inp.tagName === 'INPUT') {
      el = (inp.labels && inp.labels[0]) || inp.closest('label');
      if (!el && inp.id) {
        el = document.querySelector('label[for="' + CSS.escape(inp.id) + '"]');
      }
      if (!el || !visible(el)) el = inp.parentElement;
    } else {
      el = inp;
    }
    if (!el || !visible(el)) continue;
    const text = clean(el.innerText);
    if (!text || isNoise(text) || seen.has(text)) continue;
    seen.add(text);
    if (inp.type === 'checkbox' || inp.getAttribute('role') === 'checkbox') {
      sawCheckbox = true;
    }
    opts.push({ el, text });
  }

  // 2) Fallback: visible <label>s (what the old version did).
  if (opts.length < 2) {
    opts = [];
    seen.clear();
    for (const el of document.querySelectorAll('label')) {
      if (!visible(el)) continue;
      const text = clean(el.innerText);
      if (!text || isNoise(text) || seen.has(text)) continue;
      seen.add(text);
      opts.push({ el, text });
    }
  }

  if (opts.length < 2) return null;

  // 3) Find the question container: nearest ancestor of all options that
  //    also holds meaningful text beyond the options themselves.
  let c = opts[0].el;
  while (c.parentElement && !opts.every(o => c.contains(o.el))) c = c.parentElement;

  const optTexts = new Set(opts.map(o => o.text));
  const linesOf = node => (node.innerText || '').split('\n')
    .map(clean).filter(l => l && !optTexts.has(l) && !isNoise(l));

  for (let i = 0; i < 6 && c.parentElement; i++) {
    if (linesOf(c).join(' ').length > 15) break;
    c = c.parentElement;
  }

  const question = linesOf(c).join('\n');
  const multi = sawCheckbox ||
    /multiple|one or more|all that apply|select all|more than one/i.test(question);

  opts.forEach((o, i) => o.el.setAttribute('data-pa-opt', String(i)));

  return {
    question,
    options: opts.map(o => o.text),
    multi,
    url: location.href
  };
}
"""

HIGHLIGHT_JS = r"""
({ indices, color }) => {
  // Remove any previous marks, restoring the site's own box-shadow.
  document.querySelectorAll('[data-pa-hl]').forEach(e => {
    e.style.boxShadow = e.getAttribute('data-pa-shadow') || '';
    e.removeAttribute('data-pa-shadow');
    e.removeAttribute('data-pa-hl');
  });
  for (const i of indices) {
    const el = document.querySelector('[data-pa-opt="' + i + '"]');
    if (!el) continue;
    el.setAttribute('data-pa-shadow', el.style.boxShadow || '');
    // Thin 1px line on the left edge. Inset shadow = no layout shift.
    el.style.boxShadow = 'inset 1px 0 0 0 ' + color;
    el.setAttribute('data-pa-hl', '1');
  }
}
"""

CLEAR_JS = r"""
() => {
  document.querySelectorAll('[data-pa-hl]').forEach(e => {
    e.style.boxShadow = e.getAttribute('data-pa-shadow') || '';
    e.removeAttribute('data-pa-shadow');
    e.removeAttribute('data-pa-hl');
  });
}
"""


# ------------------------------------------------------------- helpers ----
def normalize(text):
    return re.sub(r"\s+", " ", text or "").strip()


def signature_for(content):
    raw = json.dumps(content, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def find_quiz(page):
    """Search the main page and all iframes for a question with options."""
    for frame in page.frames:
        try:
            data = frame.evaluate(EXTRACT_JS)
        except Exception:
            continue
        if data and MIN_OPTIONS <= len(data.get("options", [])) <= MAX_OPTIONS:
            return frame, {
                "question": data["question"],
                "options": [normalize(o) for o in data["options"]],
                "multi": bool(data["multi"]),
            }
    return None, None


def find_quiz_any(context):
    """Check every open tab (newest first) so popups and new tabs are followed."""
    for pg in reversed(context.pages):
        if pg.is_closed():
            continue
        frame, content = find_quiz(pg)
        if content is not None:
            return pg, frame, content
    return None, None, None


def highlight(frame, indices, confidence):
    color = "#00000099" if confidence >= LOW_CONFIDENCE else "#80808099"
    try:
        frame.evaluate(HIGHLIGHT_JS, {"indices": indices, "color": color})
    except Exception:
        pass  # page navigated mid-call; next poll will retry


def clear_highlight(frame):
    try:
        frame.evaluate(CLEAR_JS)
    except Exception:
        pass


# ------------------------------------------------------------ AI providers --
class Suggestion(BaseModel):
    answer_indices: list[int]
    reasoning: str
    confidence: float


SYSTEM_PROMPT = (
    "You are a study assistant helping a student check answers to practice "
    "multiple-choice questions. You get a question and numbered options. "
    "If the question needs a calculation, work it out step by step and "
    "double-check the arithmetic and units before choosing. Use standard "
    "textbook definitions and formulas. If the question is single-correct, "
    "return exactly one index; if multiple-correct, return every correct "
    "index. Indices are 0-based and refer to the numbers in square brackets. "
    "Reply with ONLY a JSON object with these keys: "
    '"answer_indices" (list of ints), "reasoning" (2-3 short sentences, '
    'include the key calculation if any), "confidence" (number 0 to 1). '
    "If the question text seems incomplete (it refers to a missing figure, "
    "table or code), say so in the reasoning and lower the confidence."
)

LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


class Provider:
    def __init__(self, name, model, fn):
        self.name, self.model, self.fn = name, model, fn
        self.blocked_until = 0.0

    @property
    def label(self):
        return f"{self.name}:{self.model}"

    def available(self):
        return time.monotonic() >= self.blocked_until

    def block(self, seconds):
        self.blocked_until = time.monotonic() + seconds


def make_groq_fn(client, model):
    def call(prompt):
        kwargs = dict(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_completion_tokens=3000,
            response_format={"type": "json_object"},
        )
        if model.startswith("openai/gpt-oss"):
            kwargs["extra_body"] = {"reasoning_effort": REASONING_EFFORT}
        resp = client.chat.completions.create(**kwargs)
        return resp.choices[0].message.content or ""

    return call


def make_gemini_fn(client, model):
    from google.genai import types

    def call(prompt):
        resp = client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=Suggestion,
                temperature=0.1,
            ),
        )
        return resp.text or ""

    return call


def build_providers():
    providers = []
    if GROQ_API_KEY:
        from openai import OpenAI

        if not GROQ_API_KEY.startswith("gsk_"):
            print("[config] GROQ_API_KEY doesn't start with 'gsk_'. Groq keys do, so it may be wrong.")
        groq = OpenAI(base_url="https://api.groq.com/openai/v1", api_key=GROQ_API_KEY)
        for model in GROQ_MODELS:
            providers.append(Provider("groq", model, make_groq_fn(groq, model)))
    if GEMINI_API_KEY:
        from google import genai

        gem = genai.Client(api_key=GEMINI_API_KEY)
        providers.append(
            Provider("gemini", GEMINI_MODEL, make_gemini_fn(gem, GEMINI_MODEL))
        )
    if not providers:
        sys.exit("No API keys found. Set GROQ_API_KEY and/or GEMINI_API_KEY in .env")
    return providers


def classify_error(exc):
    """Return how many seconds to sideline a provider after this error."""
    text = str(exc).lower()
    status = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    if status == 429 or any(k in text for k in ("429", "rate limit", "quota", "resource_exhausted")):
        if any(k in text for k in ("per day", "daily", "rpd", "tpd")):
            return 3600   # daily cap hit; don't retry for an hour
        return 65         # per-minute cap; try again after the window resets
    return 600            # bad model id, auth, outage... skip for a while


def parse_suggestion(raw, n_options, multi):
    match = re.search(r"\{.*\}", raw, re.S)
    if not match:
        raise ValueError("no JSON object in model reply")
    data = json.loads(match.group(0))
    indices = sorted(
        {int(i) for i in data.get("answer_indices", []) if 0 <= int(i) < n_options}
    )
    if not multi:
        indices = indices[:1]
    return {
        "indices": indices,
        "reasoning": str(data.get("reasoning", "")).strip(),
        "confidence": max(0.0, min(1.0, float(data.get("confidence", 0.5)))),
    }


def build_prompt(content):
    options_block = "\n".join(f"[{i}] {o}" for i, o in enumerate(content["options"]))
    kind = "MULTIPLE-correct" if content["multi"] else "SINGLE-correct"
    return (
        f"Question type: {kind}\n\n"
        f"Question:\n{content['question']}\n\n"
        f"Options:\n{options_block}"
    )


def ask_once(providers, content, exclude=()):
    """Try providers in order; skip any that are cooling down. Returns answer or None."""
    prompt = build_prompt(content)
    tried = False
    for p in providers:
        if p.label in exclude or not p.available():
            continue
        tried = True
        try:
            raw = p.fn(prompt)
            answer = parse_suggestion(raw, len(content["options"]), content["multi"])
            if not answer["indices"]:
                raise ValueError("model returned no valid option")
            answer["provider"] = p.label
            return answer
        except Exception as exc:
            wait = classify_error(exc)
            p.block(wait)
            short = str(exc).replace("\n", " ")[:160]
            print(f"[{p.label}] failed ({short}). Sidelined for {wait}s.")
            low = short.lower()
            if "401" in low or "invalid api key" in low or "api key not valid" in low:
                print(f"    -> Your {p.name.upper()} API key was rejected. Fix it in .env and restart.")
            elif "429" in low or "quota" in low or "rate limit" in low:
                print(f"    -> {p.name} free-tier limit reached; it will be retried automatically.")
    if not tried and not exclude:
        now = time.monotonic()
        waits = ", ".join(
            f"{p.label} ({max(0, int(p.blocked_until - now))}s left)" for p in providers
        )
        print(f"[agent] All providers are cooling down: {waits}. Will retry automatically.")
    return None


def ask_with_check(providers, content):
    """Ask once; if confidence is low, get a second opinion from another model."""
    first = ask_once(providers, content)
    if first is None:
        return None
    if first["confidence"] < LOW_CONFIDENCE:
        second = ask_once(providers, content, exclude={first["provider"]})
        if second and second["indices"] != first["indices"]:
            a = ",".join(LETTERS[i] for i in first["indices"])
            b = ",".join(LETTERS[i] for i in second["indices"])
            first["confidence"] = min(first["confidence"], second["confidence"], 0.4)
            first["reasoning"] += (
                f" [Models disagree: {first['provider']} says {a}, "
                f"{second['provider']} says {b}. Work this one out yourself.]"
            )
    return first


def test_providers(providers):
    """Send one tiny MCQ to every provider and report OK/FAIL (no browser needed)."""
    content = {
        "question": "What is 2 + 2?",
        "options": ["3", "4", "5", "6"],
        "multi": False,
    }
    prompt = build_prompt(content)
    for p in providers:
        t0 = time.monotonic()
        try:
            ans = parse_suggestion(p.fn(prompt), 4, False)
            ok = ans["indices"] == [1]
            print(f"OK    {p.label:40s} answered {ans['indices']} in {time.monotonic() - t0:.1f}s"
                  + ("" if ok else "  (unexpected answer!)"))
        except Exception as exc:
            print(f"FAIL  {p.label:40s} {str(exc).replace(chr(10), ' ')[:200]}")


def list_models():
    if GROQ_API_KEY:
        from openai import OpenAI

        groq = OpenAI(base_url="https://api.groq.com/openai/v1", api_key=GROQ_API_KEY)
        print("--- Groq ---")
        for m in groq.models.list().data:
            print(m.id)
    if GEMINI_API_KEY:
        from google import genai

        print("--- Gemini ---")
        for m in genai.Client(api_key=GEMINI_API_KEY).models.list():
            if "generateContent" in (getattr(m, "supported_actions", None) or []):
                print(m.name.replace("models/", ""))


# ---------------------------------------------------------------- main ----
def report(content, answer):
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    print("\n" + "=" * 70)
    print(content["question"])
    for i, opt in enumerate(content["options"]):
        mark = ">>" if answer and i in answer["indices"] else "  "
        print(f" {mark} {letters[i] if i < 26 else i}. {opt}")
    if answer:
        picks = ", ".join(letters[i] for i in answer["indices"]) or "none"
        print(f"\nSuggested: {picks}   (confidence {answer['confidence']:.0%}, via {answer['provider']})")
        print(f"Why: {answer['reasoning']}")
    else:
        print("\nNo suggestion available.")
    print("=" * 70)


def log(content, answer):
    entry = {"time": time.strftime("%Y-%m-%d %H:%M:%S"), **content, "answer": answer}
    with LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def _port_open(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            return True
    except OSError:
        return False


def ensure_chrome():
    """Start your real Google Chrome with a debugging port, unless it is already up."""
    port = urlparse(CDP_URL).port or 9222
    if _port_open(port):
        return
    candidates = [
        CHROME_PATH,
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        shutil.which("google-chrome") or "",
        shutil.which("chrome") or "",
    ]
    chrome = next((c for c in candidates if c and os.path.exists(c)), None)
    if not chrome:
        sys.exit("Could not find Chrome. Set CHROME_PATH in .env to your chrome.exe path.")
    subprocess.Popen([
        chrome,
        f"--remote-debugging-port={port}",
        f"--user-data-dir={Path(CHROME_PROFILE).resolve()}",
        "--start-maximized",
        "--no-first-run",
    ])
    print("Starting Google Chrome...")
    for _ in range(40):
        if _port_open(port):
            return
        time.sleep(0.5)
    sys.exit("Chrome started but its debugging port never opened. Close other Chrome windows that use the same profile and retry.")


def attach_debug(pg):
    """--debug: print tab, navigation and network events to find why a page won't open."""
    tag = "[debug]"
    print(f"{tag} watching tab: {pg.url or '(blank)'}")
    pg.on("framenavigated",
          lambda f: print(f"{tag} navigated: {f.url}") if f == pg.main_frame else None)
    pg.on("popup", lambda p: print(f"{tag} popup opened by page: {p.url or '(loading)'}"))
    pg.on("close", lambda: print(f"{tag} tab closed"))
    pg.on("dialog", lambda d: print(f"{tag} dialog: {d.type} - {d.message[:120]}"))
    pg.on("requestfailed",
          lambda r: print(f"{tag} request failed: {r.url[:110]} -> {r.failure}"))
    pg.on("response",
          lambda r: print(f"{tag} HTTP {r.status}: {r.url[:110]}")
          if r.request.resource_type == "document" and r.status >= 400 else None)
    pg.on("console",
          lambda m: print(f"{tag} console error: {m.text[:150]}") if m.type == "error" else None)


def main():
    global running, force_refresh

    if "--list-models" in sys.argv:
        list_models()
        return

    providers = build_providers()
    if "--test" in sys.argv:
        test_providers(providers)
        return

    keyboard.add_hotkey(HOTKEY_TOGGLE, toggle_agent)
    keyboard.add_hotkey(HOTKEY_REFRESH, request_refresh)

    cache = {}  # signature -> answer, so revisiting a question costs no API call
    attach = "--attach" in sys.argv
    debug = "--debug" in sys.argv
    cdp_port = urlparse(CDP_URL).port or 9222

    def open_context(pw):
        """Connect to real Chrome (--attach) or launch the bundled Chromium."""
        if attach:
            br = pw.chromium.connect_over_cdp(CDP_URL)
            ctx = br.contexts[0]
        else:
            kwargs = dict(
                user_data_dir=str(PROFILE_DIR),
                headless=False,
                no_viewport=True,              # page follows the real window size
                args=["--start-maximized"],    # open maximized
            )
            if BROWSER_CHANNEL:
                kwargs["channel"] = BROWSER_CHANNEL
            br = None
            ctx = pw.chromium.launch_persistent_context(**kwargs)
        ctx.on("page", lambda pg: print("\n[agent] New tab/window opened, following it."))
        if debug:
            for pg in ctx.pages:
                attach_debug(pg)
            ctx.on("page", attach_debug)
        return br, ctx

    def close_context(br, ctx, last_frame):
        if last_frame is not None:
            clear_highlight(last_frame)       # remove our mark from the page
        try:
            if attach:
                br.close()                    # only detaches; Chrome stays open
            else:
                ctx.close()
        except Exception:
            pass

    with sync_playwright() as pw:
        browser = context = last_frame = None
        try:
            if attach:
                ensure_chrome()
                print("Chrome is open and untouched. Browse normally.")
                print("F8 = start (attaches to Chrome) / pause (detaches), F9 = re-ask.")
            else:
                browser, context = open_context(pw)
                page = context.pages[0] if context.pages else context.new_page()
                url = input("Enter your practice quiz URL (blank to skip): ").strip()
                if url:
                    page.goto(url, wait_until="domcontentloaded")
                print("Log in and open a question. F8 = start/pause, F9 = re-ask.")
            print("Providers (in order):", ", ".join(pr.label for pr in providers))

            candidate = None          # signature currently being debounced
            candidate_since = 0.0
            handled = None            # signature we've already answered
            answer = None             # answer for `handled`
            retry_at = None           # when to try again if no provider answered

            while True:
                # --- attach lazily on F8, detach on pause (attach mode only) ---
                if attach:
                    if running and context is None:
                        try:
                            browser, context = open_context(pw)
                            print("[agent] Attached to Chrome.")
                        except Exception as exc:
                            print(f"[agent] Could not connect to Chrome: {exc}")
                            running = False
                            time.sleep(POLL_INTERVAL)
                            continue
                    elif not running and context is not None:
                        close_context(browser, context, last_frame)
                        browser = context = last_frame = None
                        print("[agent] Detached. Chrome is back to normal.")

                if context is not None and not context.pages:
                    print("\n[agent] Browser window closed.")
                    if not attach:
                        break
                    browser = context = last_frame = None
                    running = False
                    continue

                if not running:
                    candidate, handled, answer, retry_at = None, None, None, None
                    time.sleep(POLL_INTERVAL)
                    continue

                try:
                    page, frame, content = find_quiz_any(context)
                except Exception as exc:
                    if attach and not _port_open(cdp_port):
                        print("\n[agent] Chrome was closed. Pausing.")
                        browser = context = last_frame = None
                        running = False
                    else:
                        print(f"[extract] error: {exc}")
                    time.sleep(POLL_INTERVAL)
                    continue

                if content is None:
                    time.sleep(POLL_INTERVAL)
                    continue

                last_frame = frame
                sig = signature_for(content)
                now = time.monotonic()

                # Nothing answered last time: retry once a provider is available again.
                if sig == handled and answer is None and retry_at and now >= retry_at:
                    handled = None

                if sig != candidate:
                    # Question or options changed: reset and wait for it to settle.
                    candidate, candidate_since = sig, now
                    if sig != handled:
                        answer = None
                        clear_highlight(frame)

                elif sig != handled or force_refresh:
                    if now - candidate_since >= STABLE_SECONDS:
                        if force_refresh:
                            cache.pop(sig, None)
                            force_refresh = False
                            for pr in providers:      # F9 also clears cooldowns
                                pr.blocked_until = 0.0
                        if sig in cache:
                            answer = cache[sig]
                        else:
                            print("\n[agent] New question detected, asking AI...")
                            answer = ask_with_check(providers, content)
                            if answer:
                                cache[sig] = answer
                                log(content, answer)
                                retry_at = None
                            else:
                                earliest = min(pr.blocked_until for pr in providers)
                                retry_at = max(earliest, time.monotonic() + 30)

                        # Make sure the page hasn't changed while we waited.
                        _, latest = find_quiz(page)
                        if latest is not None and signature_for(latest) == sig:
                            handled = sig
                            report(content, answer)
                        else:
                            candidate = None  # restart debounce on the new content

                # Re-apply the mark every poll in case the page re-rendered.
                if sig == handled and answer and answer["indices"]:
                    highlight(frame, answer["indices"], answer["confidence"])

                time.sleep(POLL_INTERVAL)

        finally:
            keyboard.unhook_all()
            if context is not None:
                close_context(browser, context, None)


if __name__ == "__main__":
    main()