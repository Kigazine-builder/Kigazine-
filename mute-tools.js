/* Kigazine admin mute tools.
   Adds admin-only controls to mute users from commenting or posting.
   Requires the main index.html Firebase globals: db, auth, doc, setDoc, getDocs, collection.
*/
(() => {
  let muteToolsBooted = false;

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

  function helper(name) {
    return window[name];
  }

  function db() {
    return window.db || null;
  }

  function authUser() {
    return window.auth?.currentUser || null;
  }

  function isAdminUser() {
    const email = authUser()?.email?.trim()?.toLowerCase() || "";
    const superAdmin = "ethan02px2035@saschina.org";
    const profileRole = window.currentProfile?.role || "";
    return email === superAdmin || profileRole === "admin";
  }

  function showStatus(message, type = "") {
    const box = byId("muteToolsMessage");
    if (!box) return;
    box.textContent = message;
    box.className = `notice ${type}`.trim();
    box.classList.remove("hidden");
  }

  function ensureStyles() {
    if (byId("kigazineMuteToolsStyles")) return;
    const style = document.createElement("style");
    style.id = "kigazineMuteToolsStyles";
    style.textContent = `
      .mute-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 800;
        border: 1px solid rgba(245,158,11,.28);
        background: rgba(245,158,11,.12);
        color: #fde68a;
        margin: 0 8px 8px 0;
      }
      .mute-chip.ok {
        border-color: rgba(34,197,94,.24);
        background: rgba(34,197,94,.11);
        color: #bbf7d0;
      }
      .mute-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 10px;
      }
      .muted-tools-note {
        margin-top: 10px;
        color: #94a3b8;
        line-height: 1.6;
        font-size: 13px;
      }
    `;
    document.head.appendChild(style);
  }

  function statusMarkup(user) {
    const mutedFromPosting = Boolean(user?.mutedFromPosting);
    const mutedFromCommenting = Boolean(user?.mutedFromCommenting);
    return `
      <div style="margin-top:10px;">
        <span class="mute-chip ${mutedFromPosting ? "" : "ok"}">${mutedFromPosting ? "Posting muted" : "Posting allowed"}</span>
        <span class="mute-chip ${mutedFromCommenting ? "" : "ok"}">${mutedFromCommenting ? "Comments muted" : "Comments allowed"}</span>
      </div>
    `;
  }

  function buttonMarkup(user) {
    const uid = esc(user.id || "");
    const mutedFromPosting = Boolean(user?.mutedFromPosting);
    const mutedFromCommenting = Boolean(user?.mutedFromCommenting);
    return `
      <div class="mute-actions">
        <button class="btn ${mutedFromPosting ? "btn-secondary" : "btn-primary"}" type="button" data-toggle-post-mute="${uid}">${mutedFromPosting ? "Unmute posting" : "Mute posting"}</button>
        <button class="btn ${mutedFromCommenting ? "btn-secondary" : "btn-primary"}" type="button" data-toggle-comment-mute="${uid}">${mutedFromCommenting ? "Unmute comments" : "Mute comments"}</button>
      </div>
    `;
  }

  function enhanceAdminUserCards() {
    if (!isAdminUser()) return;
    const results = byId("adminUserResults");
    if (!results) return;

    const cards = results.querySelectorAll(".person-card");
    cards.forEach(card => {
      if (card.querySelector("[data-toggle-post-mute], [data-toggle-comment-mute]")) return;
      const adminButton = card.querySelector("[data-make-admin-id], [data-demote-admin-id]");
      const uid = adminButton?.dataset.makeAdminId || adminButton?.dataset.demoteAdminId || "";
      if (!uid) return;

      const user = (window.allUsers || []).find(item => item.id === uid);
      if (!user) return;

      const holder = document.createElement("div");
      holder.className = "kigazine-mute-tools";
      holder.innerHTML = `${statusMarkup(user)}${buttonMarkup(user)}`;
      card.appendChild(holder);
    });
  }

  async function toggleMute(uid, field) {
    if (!isAdminUser() || !uid || !field) return;
    const setDoc = helper("setDoc");
    const doc = helper("doc");
    if (typeof setDoc !== "function" || typeof doc !== "function" || !db()) {
      showStatus("Mute tools are not ready yet. Refresh and try again.", "error");
      return;
    }

    const target = (window.allUsers || []).find(user => user.id === uid);
    if (!target) {
      showStatus("That user could not be found.", "error");
      return;
    }

    const nextValue = !Boolean(target[field]);
    try {
      await setDoc(doc(db(), "users", uid), {
        [field]: nextValue,
        mutedUpdatedAt: helper("serverTimestamp")?.() || new Date(),
        mutedUpdatedBy: authUser()?.email || "admin"
      }, { merge: true });

      target[field] = nextValue;
      if (window.currentUser?.uid === uid && window.currentProfile) {
        window.currentProfile[field] = nextValue;
      }
      enhanceAdminUserCardsAfterRefresh();
      showStatus(nextValue
        ? `${target.username || "User"} is now muted.`
        : `${target.username || "User"} has been unmuted.`, "success");
    } catch (error) {
      showStatus(error?.message || "Mute update failed.", "error");
    }
  }

  function enhanceAdminUserCardsAfterRefresh() {
    const results = byId("adminUserResults");
    if (!results) return;
    results.querySelectorAll(".kigazine-mute-tools").forEach(node => node.remove());
    enhanceAdminUserCards();
  }

  function installAdminPanelNotice() {
    const panel = byId("adminPeoplePanel");
    if (!panel || byId("muteToolsMessage")) return;
    const note = document.createElement("div");
    note.id = "muteToolsMessage";
    note.className = "notice hidden";
    note.setAttribute("role", "status");
    note.setAttribute("aria-live", "polite");
    panel.appendChild(note);

    const text = document.createElement("p");
    text.className = "muted-tools-note";
    text.textContent = "Mute posting or comments from the Admin access search results below. Muted users stay signed in, but Firestore rules should block new posts/comments.";
    panel.appendChild(text);
  }

  function bindClicks() {
    const results = byId("adminUserResults");
    if (!results || results.dataset.muteToolsBound === "true") return;
    results.dataset.muteToolsBound = "true";
    results.addEventListener("click", async event => {
      const postButton = event.target.closest("[data-toggle-post-mute]");
      if (postButton) {
        await toggleMute(postButton.dataset.togglePostMute, "mutedFromPosting");
        return;
      }
      const commentButton = event.target.closest("[data-toggle-comment-mute]");
      if (commentButton) {
        await toggleMute(commentButton.dataset.toggleCommentMute, "mutedFromCommenting");
      }
    });
  }

  function observeAdminResults() {
    const results = byId("adminUserResults");
    if (!results) return;
    const observer = new MutationObserver(() => enhanceAdminUserCards());
    observer.observe(results, { childList: true, subtree: true });
    enhanceAdminUserCards();
  }

  function bootMuteTools() {
    if (muteToolsBooted) return;
    if (!byId("adminPeoplePanel") || !byId("adminUserResults")) {
      window.setTimeout(bootMuteTools, 250);
      return;
    }
    muteToolsBooted = true;
    ensureStyles();
    installAdminPanelNotice();
    bindClicks();
    observeAdminResults();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootMuteTools);
  } else {
    bootMuteTools();
  }
})();
