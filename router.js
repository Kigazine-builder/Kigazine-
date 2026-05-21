window.KigazineRouter = (() => {
  const cache = new Map();

  async function fetchPartial(name) {
    if (cache.has(name)) return cache.get(name);
    const response = await fetch(`${name}.html`);
    if (!response.ok) {
      throw new Error(`Could not load ${name}.html`);
    }
    const html = await response.text();
    cache.set(name, html);
    return html;
  }

  async function loadInto(containerId, partialName) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Missing container: ${containerId}`);
    }

    container.innerHTML = await fetchPartial(partialName);

    document.dispatchEvent(new CustomEvent("kigazine:partial-loaded", {
      detail: {
        containerId,
        partialName
      }
    }));
  }

  async function loadCorePages() {
    await Promise.all([
      loadInto("homeMount", "home"),
      loadInto("viewMount", "view"),
      loadInto("membersMount", "members")
    ]);
  }

  function wireCallButtons() {
    document.addEventListener("click", event => {
      const button = event.target.closest("[data-call-section]");
      if (!button) return;
      const target = button.dataset.callSection;
      if (typeof window.showSection === "function") {
        window.showSection(target);
      }
    });
  }

  wireCallButtons();

  return {
    loadInto,
    loadCorePages
  };
})();
