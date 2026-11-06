(() => {
  const KEY = "manga_reader_mode";

  const css = document.createElement("style");
  css.textContent = `
    #reader-settings {
      position: fixed;
      bottom: 15px;
      right: 12px;
      z-index: 99999;
      background: #211735;
      color: white;
      padding: 12px;
      border: 1px solid #a855f7;
      border-radius: 12px;
      box-shadow: 0 4px 15px #0008;
    }

    #reader-settings button {
      display: block;
      width: 100%;
      margin-top: 6px;
      padding: 9px;
      border: 0;
      border-radius: 7px;
      background: #49316d;
      color: white;
      cursor: pointer;
    }

    #reader-settings button.active {
      background: #9333ea;
    }

    .mm-vertical {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
    }

    .mm-single {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
    }

    .mm-double {
      display: grid !important;
      grid-template-columns: repeat(2, 1fr) !important;
    }

    .mm-vertical img,
    .mm-single img,
    .mm-double img {
      width: 100% !important;
      height: auto !important;
      object-fit: contain !important;
    }

    @media(max-width:600px) {
      .mm-double {
        grid-template-columns: 1fr !important;
      }
    }
  `;
  document.head.appendChild(css);

  function getReader() {
    const elements = document.querySelectorAll(
      '[id*="reader"], [class*="reader"], [id*="chapter"], [class*="chapter"]'
    );

    return [...elements].find(el => el.querySelectorAll("img").length > 0);
  }

  function applyMode(mode) {
    const reader = getReader();
    if (!reader) return;

    reader.classList.remove(
      "mm-vertical",
      "mm-single",
      "mm-double"
    );

    reader.classList.add("mm-" + mode);

    document.querySelectorAll("#reader-settings button").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });

    localStorage.setItem(KEY, mode);
  }

  function createSettings() {
    if (document.getElementById("reader-settings")) return;

    const box = document.createElement("div");
    box.id = "reader-settings";

    box.innerHTML = `
      <strong>Reader Settings</strong>
      <button data-mode="vertical">Vertical Scroll</button>
      <button data-mode="single">Single Page</button>
      <button data-mode="double">Double Page</button>
    `;

    box.addEventListener("click", e => {
      const mode = e.target.dataset.mode;
      if (mode) applyMode(mode);
    });

    document.body.appendChild(box);

    applyMode(localStorage.getItem(KEY) || "vertical");
  }

  function init() {
    if (getReader()) createSettings();
  }

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("load", init);

  new MutationObserver(init).observe(document.body, {
    childList: true,
    subtree: true
  });
})();
