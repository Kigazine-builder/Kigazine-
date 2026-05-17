/* Kigazine extra super-admin email support.
   Adds additional hard-coded super-admin emails without requiring a large index.html rewrite.
*/
(() => {
  const EXTRA_SUPER_ADMIN_EMAILS = [
    "matthewxfighter@gmail.com"
  ];

  function normalize(email = "") {
    return String(email).trim().toLowerCase()；
  }

  function isExtraSuperAdminEmail(email = "") {
    return EXTRA_SUPER_ADMIN_EMAILS.includes(normalize(email));
  }

  function isAnySuperAdminEmail(email = "") {
    return normalize(email) === "ethan02px2035@saschina.org" || isExtraSuperAdminEmail(email);
  }

  function upgradeVisibleRoleLabels() {
    document.querySelectorAll(".person-card").forEach(card => {
      const text = card.textContent || "";
      if (!text.toLowerCase().includes("matthewxfighter@gmail.com")) return;
      const badge = card.querySelector(".role-badge");
      if (badge) {
        badge.textContent = "Super admin";
        badge.classList.add("superadmin");
      }
    });
  }

  // Expose helpers for add-on scripts that want to know super-admin status.
  window.KIGAZINE_EXTRA_SUPER_ADMIN_EMAILS = EXTRA_SUPER_ADMIN_EMAILS.slice();
  window.isKigazineSuperAdminEmail = isAnySuperAdminEmail;

  // The main app uses isAdminEmail() to decide admin privileges at sign-up/profile load.
  // This shim upgrades the current signed-in Matthew account to role: admin in Firestore,
  // so existing admin-gated Kigazine UI works too.
  async function ensureExtraSuperAdminProfile() {
    const auth = window.auth;
    const db = window.db;
    const user = auth?.currentUser;
    if (!user || !db || !isExtraSuperAdminEmail(user.email)) return;

    try {
      const { doc, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js");
      await setDoc(doc(db, "users", user.uid), {
        role: "admin",
        email: normalize(user.email),
        superAdminAccess: true,
        superAdminGrantedByConfig: true,
        superAdminGrantedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error("Kigazine super-admin profile upgrade failed:", error);
    }
  }

  function boot() {
    const auth = window.auth;
    const onAuthStateChanged = window.onAuthStateChanged;
    if (!auth || typeof onAuthStateChanged !== "function") {
      setTimeout(boot, 250);
      return;
    }

    onAuthStateChanged(auth, async () => {
      await ensureExtraSuperAdminProfile();
      setTimeout(upgradeVisibleRoleLabels, 450);
    });

    const observer = new MutationObserver(() => upgradeVisibleRoleLabels());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
