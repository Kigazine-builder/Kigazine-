/* Kigazine super-admin user selection tools.
   This adds a bulk selection panel inside Account > Admin access.

   IMPORTANT LIMIT:
   A public GitHub Pages / browser-only Firebase app cannot delete Firebase Authentication
   accounts for other users. The Firebase client SDK can only delete the currently signed-in
   account. This panel therefore safely bulk-deletes Kigazine Firestore profile documents now,
   and it exports the selected UIDs/emails so a future trusted backend/Admin SDK endpoint can
   delete the matching Firebase Auth accounts too.
*/
(() => {
  const SUPER_ADMIN_EMAIL = "ethan02px2035@saschina.org";
  let booted = false;
  let selectedUserIds = new Set();
  let searchTerm = "";

  function byId(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function currentAuthUser() {
    return window.auth?.currentUser || null;
  }

  function isSuperAdmin() {
    return (currentAuthUser()?.email || "").trim().toLowerCase() === SUPER_ADMIN_EMAIL;
  }

  function getUsers() {
    return Array.isArray(window.allUsers) ? window.allUsers : [];
  }

  function currentUserId() {
    return currentAuthUser()?.uid || "";
  }

  function ensureStyles() {
    if (byId("kigazineSuperAdminUsersStyles")) return;
    const style = document.createElement("style");
    style.id = "kigazineSuperAdminUsersStyles";
    style.textContent = `
      .bulk-user-panel {
        margin-top: 18px;
        padding-top: 18px;
        border-top: 1px solid rgba(148,163,184,.16);
      }
      .bulk-user-toolbar {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items: center;
        margin: 12px 0;
      }
      .bulk-user-toolbar .input {
        flex: 1 1 240px;
      }
      .bulk-user-summary {
        color: #bfd0f4;
        font-size: 13px;
        line-height: 1.55;
        margin: 8px 0 0;
      }
      .bulk-user-list {
        display: grid;
        gap: 10px;
        margin-top: 12px;
      }
      .bulk-user-row {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 12px;
        align-items: center;
        padding: 12px 14px;
        border: 1px solid #31415d;
        border-radius: 16px;
        background: rgba(11,18,32,.72);
      }
      .bulk-user-row input[type="checkbox"] {
        width: 18px;
        height: 18px;
        accent-color: #ef4444;
      }
      .bulk-user-copy {
        min-width: 0;
      }
      .bulk-user-copy strong {
        display: block;
        color: #f8fbff;
        margin-bottom: 4px;
      }
      .bulk-user-copy span {
        display: block;
        color: #94a3b8;
        font-size: 13px;
        overflow-wrap: anywhere;
      }
      .bulk-user-role {
        border: 1px solid rgba(96,165,250,.22);
        border-radius: 999px;
        padding: 6px 10px;
        color: #bfdbfe;
        background: rgba(96,165,250,.12);
        font-size: 12px;
        font-weight: 800;
      }
      .bulk-user-danger {
        border: 1px solid rgba(239,68,68,.3);
        background: rgba(239,68,68,.08);
        color: #fecaca;
        border-radius: 16px;
        padding: 12px 14px;
        line-height: 1.6;
        margin-top: 12px;
      }
      @media (max-width: 760px) {
        .bulk-user-row {
          grid-template-columns: auto 1fr;
        }
        .bulk-user-role {
          grid-column: 2;
          justify-self: start;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function panelMarkup() {
    return `
      <div id="bulkUserPanel" class="bulk-user-panel hidden">
        <h4 style="margin:0 0 8px;">Super admin: bulk-select user profiles</h4>
        <p class="muted" style="line-height:1.7; margin:0;">Select Kigazine user profiles, then remove those Firestore profile records in one batch. Browser-only Kigazine cannot remove Firebase Authentication accounts for other users without a trusted server/Admin SDK endpoint.</p>
        <div class="bulk-user-toolbar">
          <label class="label hidden" for="bulkUserSearchInput">Search user profiles</label>
          <input id="bulkUserSearchInput" class="input" placeholder="Search username or email" aria-label="Search user profiles" />
          <button id="bulkSelectVisibleBtn" class="btn btn-secondary" type="button">Select visible</button>
          <button id="bulkClearSelectedBtn" class="btn btn-secondary" type="button">Clear selection</button>
        </div>
        <div class="bulk-user-toolbar">
          <button id="bulkDeleteProfilesBtn" class="btn btn-primary" type="button">Delete selected Kigazine profiles</button>
          <button id="bulkCopySelectedBtn" class="btn btn-secondary" type="button">Copy selected emails + UIDs</button>
        </div>
        <p id="bulkUserSummary" class="bulk-user-summary">0 users selected.</p>
        <div id="bulkUserMessage" class="notice hidden" role="status" aria-live="polite"></div>
        <div class="bulk-user-danger">Deleting a Kigazine profile removes its profile document and may break that user's username/friends/profile display. It does not delete their Firebase Authentication login account yet.</div>
        <div id="bulkUserList" class="bulk-user-list"></div>
      </div>
    `;
  }

  function mountPanel() {
    if (byId("bulkUserPanel")) return;
    const adminPeoplePanel = byId("adminPeoplePanel");
    if (!adminPeoplePanel) return;
    adminPeoplePanel.insertAdjacentHTML("beforeend", panelMarkup());
  }

  function showPanelIfAllowed() {
    const panel = byId("bulkUserPanel");
    if (!panel) return;
    panel.classList.toggle("hidden", !isSuperAdmin());
  }

  function showMessage(message, type = "") {
    const box = byId("bulkUserMessage");
    if (!box) return;
    box.textContent = message;
    box.className = `notice ${type}`.trim();
    box.classList.remove("hidden");
  }

  function hideMessage() {
    const box = byId("bulkUserMessage");
    if (!box) return;
    box.textContent = "";
    box.className = "notice hidden";
  }

  function isProtectedUser(user) {
    const email = (user?.email || "").trim().toLowerCase();
    return user?.id === currentUserId() || email === SUPER_ADMIN_EMAIL;
  }

  function filteredUsers() {
    const q = searchTerm.trim().toLowerCase();
    return getUsers().filter(user => {
      if (isProtectedUser(user)) return false;
      if (!q) return true;
      return (user.username || "").toLowerCase().includes(q)
        || (user.email || "").toLowerCase().includes(q)
        || (user.id || "").toLowerCase().includes(q);
    });
  }

  function roleLabel(user) {
    return user?.role === "admin" ? "Admin" : "Writer";
  }

  function updateSummary() {
    const summary = byId("bulkUserSummary");
    if (!summary) return;
    summary.textContent = `${selectedUserIds.size} user${selectedUserIds.size === 1 ? "" : "s"} selected.`;
  }

  function renderList() {
    const list = byId("bulkUserList");
    if (!list) return;
    const users = filteredUsers();
    if (!users.length) {
      list.innerHTML = `<div class="bulk-user-row"><div class="bulk-user-copy"><strong>No matching selectable users.</strong><span>Try another search.</span></div></div>`;
      updateSummary();
      return;
    }

    list.innerHTML = users.map(user => `
      <label class="bulk-user-row">
        <input type="checkbox" data-bulk-user-id="${esc(user.id)}" ${selectedUserIds.has(user.id) ? "checked" : ""} />
        <span class="bulk-user-copy">
          <strong>${esc(user.username || "Kigazine user")}</strong>
          <span>${esc(user.email || "No email saved")} • UID: ${esc(user.id || "")}</span>
        </span>
        <span class="bulk-user-role">${esc(roleLabel(user))}</span>
      </label>
    `).join("");
    updateSummary();
  }

  function selectVisible() {
    filteredUsers().forEach(user => selectedUserIds.add(user.id));
    renderList();
  }

  function clearSelection() {
    selectedUserIds = new Set();
    renderList();
  }

  function selectedUsers() {
    return getUsers().filter(user => selectedUserIds.has(user.id) && !isProtectedUser(user));
  }

  async function firestoreFns() {
    return await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js");
  }

  async function deleteSelectedProfiles() {
    if (!isSuperAdmin()) return;
    const targets = selectedUsers();
    if (!targets.length) {
      showMessage("Select at least one user profile first.", "error");
      return;
    }

    const confirmation = window.confirm(`Delete ${targets.length} selected Kigazine profile document${targets.length === 1 ? "" : "s"}? This does NOT delete their Firebase Authentication login accounts.`);
    if (!confirmation) return;

    const button = byId("bulkDeleteProfilesBtn");
    if (button) {
      button.disabled = true;
      button.textContent = "Deleting profiles...";
    }

    try {
      const { doc, deleteDoc } = await firestoreFns();
      const db = window.db;
      if (!db) throw new Error("Firestore is not ready yet.");
      for (const user of targets) {
        await deleteDoc(doc(db, "users", user.id));
      }
      window.allUsers = getUsers().filter(user => !selectedUserIds.has(user.id));
      selectedUserIds = new Set();
      searchTerm = byId("bulkUserSearchInput")?.value || "";
      renderList();
      showMessage(`Deleted ${targets.length} Kigazine profile document${targets.length === 1 ? "" : "s"}. Their Firebase Authentication login accounts still need a future backend/Admin SDK deletion tool.`, "success");
    } catch (error) {
      showMessage(error?.message || "Profile deletion failed.", "error");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Delete selected Kigazine profiles";
      }
    }
  }

  async function copySelectedExport() {
    const targets = selectedUsers();
    if (!targets.length) {
      showMessage("Select at least one user first.", "error");
      return;
    }
    const text = targets.map(user => `${user.email || ""}\t${user.id || ""}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showMessage("Copied selected emails and UIDs.", "success");
    } catch (_) {
      showMessage("Clipboard copy was blocked. The selected users are still visible in the list.", "error");
    }
  }

  function bindEvents() {
    byId("bulkUserSearchInput")?.addEventListener("input", event => {
      searchTerm = event.target.value || "";
      hideMessage();
      renderList();
    });
    byId("bulkSelectVisibleBtn")?.addEventListener("click", selectVisible);
    byId("bulkClearSelectedBtn")?.addEventListener("click", clearSelection);
    byId("bulkDeleteProfilesBtn")?.addEventListener("click", deleteSelectedProfiles);
    byId("bulkCopySelectedBtn")?.addEventListener("click", copySelectedExport);
    byId("bulkUserList")?.addEventListener("change", event => {
      const checkbox = event.target.closest("[data-bulk-user-id]");
      if (!checkbox) return;
      const uid = checkbox.dataset.bulkUserId;
      if (checkbox.checked) selectedUserIds.add(uid);
      else selectedUserIds.delete(uid);
      updateSummary();
    });
  }

  function observeUserListRefresh() {
    const adminResults = byId("adminUserResults");
    if (!adminResults) return;
    const observer = new MutationObserver(() => {
      if (isSuperAdmin()) renderList();
    });
    observer.observe(adminResults, { childList: true, subtree: true });
  }

  function boot() {
    if (booted) return;
    if (!byId("adminPeoplePanel")) {
      window.setTimeout(boot, 250);
      return;
    }
    booted = true;
    ensureStyles();
    mountPanel();
    bindEvents();
    observeUserListRefresh();
    showPanelIfAllowed();
    renderList();

    const authState = window.onAuthStateChanged;
    if (typeof authState === "function" && window.auth) {
      authState(window.auth, () => {
        showPanelIfAllowed();
        renderList();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
