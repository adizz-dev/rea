
from pathlib import Path
from playwright.sync_api import sync_playwright


def main():
    with sync_playwright() as p:
        # Open a persistent browser profile so login cookies can be retained.
        context = p.chromium.launch_persistent_context(
            user_data_dir="playwright_profile",
            headless=False,
        )

        try:
            page = context.new_page()

            url = input("Enter your practice quiz URL: ").strip()
            if not url:
                print("No URL entered. Exiting.")
                return

            page.goto(url, wait_until="domcontentloaded")

            print("\nBrowser opened.")
            print("Log in if necessary and navigate to a question.")
            input("When the question is visible, press Enter here...")

            print("\nCurrent URL:", page.url)
            print("Page title:", page.title())

            # Read the visible page text.
            page_text = page.locator("body").inner_text()

            print("\n--- VISIBLE PAGE TEXT ---")
            print(page_text[:8000])

            # Save the text for later review.
            output_file = Path("current_question.txt")
            output_file.write_text(page_text, encoding="utf-8")
            print(f"\nSaved page text to: {output_file.resolve()}")

            # Inspect visible answer labels.
            print("\n--- VISIBLE OPTION LABELS ---")
            labels = page.locator("label:visible")
            label_count = min(labels.count(), 30)

            for i in range(label_count):
                label = labels.nth(i)
                print(f"{i}: {label.inner_text().strip()!r}")

            # Inspect accessible buttons.
            print("\n--- NAVIGATION BUTTONS ---")
            buttons = page.get_by_role("button")
            button_count = min(buttons.count(), 30)

            for i in range(button_count):
                button = buttons.nth(i)
                try:
                    print(f"{i}: {button.inner_text().strip()!r}")
                except Exception as exc:
                    print(f"{i}: Could not read button text: {exc}")

            # Inspect visible links.
            print("\n--- LINKS ---")
            links = page.locator("a:visible")
            link_count = min(links.count(), 30)

            for i in range(link_count):
                link = links.nth(i)
                print(
                    i,
                    repr(link.inner_text().strip()[:100]),
                    "href =", link.get_attribute("href"),
                    "class =", link.get_attribute("class"),
                )

            # Inspect common interactive elements.
            print("\n--- INTERACTIVE ELEMENTS ---")
            clickable = page.locator(
                '[role="button"]:visible, '
                '[role="tab"]:visible, '
                'button:visible, '
                '[tabindex="0"]:visible'
            )
            clickable_count = min(clickable.count(), 50)

            for i in range(clickable_count):
                element = clickable.nth(i)
                try:
                    print(
                        i,
                        "tag =", element.evaluate("(e) => e.tagName"),
                        "text =", repr(element.inner_text().strip()[:100]),
                        "class =", element.get_attribute("class"),
                        "role =", element.get_attribute("role"),
                        "aria-label =", element.get_attribute("aria-label"),
                    )
                except Exception as exc:
                    print(f"{i}: Could not inspect element: {exc}")

            input(
                "\nInspection complete. "
                "Press Enter to close the browser..."
            )

        finally:
            context.close()


if __name__ == "__main__":
    main()
