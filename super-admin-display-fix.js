/* Kigazine super-admin display compatibility fix.
   The main legacy index.html only labels the original root email as "Super admin".
   This add-on updates member/account role labels so Firestore role:"superAdmin"
   also displays as SUPER ADMIN everywhere visible after render.
*/
(() => {
  let booted = false;

  function roleIsSuper(user = {}) {
    return user?.role === "superAdmin" || user?.role === "super_admin" || user?.superAdmin === true;
  }

  function getUsers() {
    return Array.isArray(window.allUsers) ? window.allUsers : [];
  }

  function text(node) {
    return (node?.textContent || "").trim();
  }

  function fixMemberCards() {
    const users = getUsers();
    if (!users.length) return;

    document.querySelectorAll(".person-card").forEach(card => {
      const name = text(card.querySelector("h4"));
      if (!name) return;
      const user = users.find(item => (item.username || "") === name);
      if (!roleIsSuper(user)) return;

      const badge = card.querySelector(".role-badge");
      if (!badge) return;
      badge.textContent = "SUPER ADMIN";
      badge.classList.add("superadmin");
    });
  }

  function fixAccountSummary() {
    const profile = window.currentProfile || {};
    if (!roleIsSuper(profile)) return;
    const accountStatus = document.getElementById("accountStatus");
    if (!accountStatus) return;
    accountStatus.textContent = accountStatus.textContent.replace(/\bAdmin\b/g, "SUPER ADMIN");
  }

  function fixEverything() {
    fixMemberCards();
    fixAccountSummary();
  }

  function boot() {
    if (booted) return;
    booted = true;
    fixEverything();
    const observer = new MutationObserver(() => fixEverything());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.setInterval(fixEverything, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
