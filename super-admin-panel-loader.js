/* Kigazine super-admin panel loader.
   Ensures the super admin user tools panel is mounted even if the account/admin HTML changes.
*/
(() => {
  let booted = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function findAdminAccessAnchor() {
    const direct = byId("adminPeoplePanel");
    if (direct) return direct;

    const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4"));
    const heading = headings.find(node => (node.textContent || "").trim().toLowerCase() === "admin access");
    if (!heading) return null;

    const existingWrapper = heading.closest(".card, .admin-subsection, section, div");
    if (existingWrapper) {
      if (!existingWrapper.id) existingWrapper.id = "adminPeoplePanel";
      return existingWrapper;
    }

    const wrapper = document.createElement("div");
    wrapper.id = "adminPeoplePanel";
    heading.parentElement?.insertBefore(wrapper, heading);
    wrapper.appendChild(heading);
    return wrapper;
  }

  function ensureScriptLoaded(src, id) {
    if (byId(id)) return;
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.defer = true;
    document.body.appendChild(script);
  }

  function boot() {
    if (booted) return;
    const anchor = findAdminAccessAnchor();
    if (!anchor) {
      window.setTimeout(boot, 250);
      return;
    }
    booted = true;
    ensureScriptLoaded("super-admin-users.js", "kigazineSuperAdminUsersScript");
    ensureScriptLoaded("super-admin-extra.js", "kigazineSuperAdminExtraScript");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
