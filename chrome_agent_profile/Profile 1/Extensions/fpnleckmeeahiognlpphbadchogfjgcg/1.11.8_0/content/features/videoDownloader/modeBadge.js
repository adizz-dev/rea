// Auto-set the mode badge based on URL param
(function () {
  const type =
    new URLSearchParams(window.location.search).get("type") || "video";
  const badge = document.getElementById("mode-badge");
  badge.textContent = type.toUpperCase();
  const modeClass =
    type === "audio"
      ? "mode-audio"
      : type === "transcript"
        ? "mode-transcript"
        : "mode-video";
  badge.className = "mode-badge " + modeClass;
})();
