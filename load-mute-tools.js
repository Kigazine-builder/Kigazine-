document.addEventListener("DOMContentLoaded", () => {
  const existing = document.querySelector('script[src="mute-tools.js"]');
  if (!existing) {
    const script = document.createElement("script");
    script.src = "mute-tools.js";
    script.defer = true;
    document.body.appendChild(script);
  }

  installFitnessSidebarLink();
  installMagazineEditSection();
});

function installFitnessSidebarLink() {
  const nav = document.querySelector(".nav");
  if (!nav || document.getElementById("fitnessNavLink")) return;

  const fitnessLink = document.createElement("a");
  fitnessLink.id = "fitnessNavLink";
  fitnessLink.className = "nav-btn";
  fitnessLink.href = "fitness.html";
  fitnessLink.textContent = "🏃 Fitness";

  const helpButton = Array.from(nav.querySelectorAll(".nav-btn"))
    .find(button => button.textContent.includes("Help"));
  nav.insertBefore(fitnessLink, helpButton || null);
}

async function installMagazineEditSection() {
  const nav = document.querySelector(".nav");
  const main = document.querySelector(".main");
  if (!nav || !main || document.getElementById("editSection")) return;

  const firebase = await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js");
  const {
    collection,
    doc,
    getDocs,
    query,
    serverTimestamp,
    updateDoc,
    where
  } = firebase;

  const db = window.db;
  const auth = window.auth;
  if (!db || !auth || !window.onAuthStateChanged) return;

  let currentUser = auth.currentUser || null;
  let editableMagazines = [];

  const originalShowSection = window.showSection;
  if (typeof originalShowSection === "function" && !window.showSection.__editSectionAware) {
    window.showSection = sectionId => {
      document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
      originalShowSection(sectionId);
      document.querySelector(`[data-section="${sectionId}"]`)?.classList.add("active");
      if (sectionId === "editSection") {
        loadEditableMagazines();
      }
    };
    window.showSection.__editSectionAware = true;
  }

  const editNavButton = document.createElement("button");
  editNavButton.className = "nav-btn";
  editNavButton.dataset.section = "editSection";
  editNavButton.textContent = "📝 Edit";
  editNavButton.addEventListener("click", () => window.showSection("editSection"));
  const accountButton = nav.querySelector('[data-section="accountSection"]');
  nav.insertBefore(editNavButton, accountButton || null);

  const editSection = document.createElement("section");
  editSection.id = "editSection";
  editSection.className = "section";
  editSection.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="section-kicker">Edit Published Magazines</div>
        <h2 style="margin:0 0 6px;">Edit magazines</h2>
        <div class="muted">Published magazines you edit will go back to review before they appear again.</div>
      </div>
      <label class="label hidden" for="editSearchInput">Search your published magazines</label>
      <input id="editSearchInput" class="search" placeholder="Search your magazines..." aria-label="Search your published magazines" />
    </div>
    <div class="card" style="margin-bottom:16px;">
      <p class="muted" style="margin:0; line-height:1.7;">Only magazines that are already published and approved appear here. After you save an edit, the magazine is hidden from the public feed and sent to the admin review queue again.</p>
    </div>
    <div id="editStatus" class="notice hidden" role="status" aria-live="polite"></div>
    <div id="editMagazineList" class="admin-review-list"></div>
  `;
  const accountSection = document.getElementById("accountSection");
  main.insertBefore(editSection, accountSection || null);

  const editSearchInput = document.getElementById("editSearchInput");
  const editMagazineList = document.getElementById("editMagazineList");
  const editStatus = document.getElementById("editStatus");

  editSearchInput.addEventListener("input", () => renderEditableMagazines(editSearchInput.value));
  editMagazineList.addEventListener("click", async event => {
    const saveButton = event.target.closest("[data-save-edit-id]");
    if (!saveButton) return;
    await savePublishedMagazineEdit(saveButton.dataset.saveEditId, saveButton);
  });

  window.onAuthStateChanged(auth, user => {
    currentUser = user;
    editableMagazines = [];
    renderEditableMagazines();
    if (user) loadEditableMagazines();
  });

  async function loadEditableMagazines() {
    if (!currentUser) {
      editableMagazines = [];
      renderEditableMagazines();
      return;
    }

    try {
      const snap = await getDocs(query(
        collection(db, "magazines"),
        where("uid", "==", currentUser.uid),
        where("isPublic", "==", true)
      ));
      editableMagazines = snap.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
        .filter(m => m.status === "approved")
        .sort(sortNewestFirst);
      renderEditableMagazines(editSearchInput.value);
    } catch (err) {
      showEditMessage(getFriendlyError(err), "error");
    }
  }

  function renderEditableMagazines(filter = "") {
    if (!currentUser) {
      editMagazineList.innerHTML = `
        <div class="admin-review-item">
          <p>Log in to edit your published magazines.</p>
        </div>
      `;
      return;
    }

    const search = filter.trim().toLowerCase();
    const visibleMagazines = editableMagazines.filter(m => {
      return (m.title || "").toLowerCase().includes(search) ||
        (m.description || "").toLowerCase().includes(search);
    });

    if (!visibleMagazines.length) {
      editMagazineList.innerHTML = `
        <div class="admin-review-item">
          <p>No published magazines matched. Approved magazines you wrote will appear here.</p>
        </div>
      `;
      return;
    }

    editMagazineList.innerHTML = visibleMagazines.map(m => `
      <div class="admin-review-item">
        <h4>${escapeHtml(m.title || "Untitled magazine")}</h4>
        <p>${escapeHtml(m.description || "No description yet.")}</p>
        <div class="form-grid">
          <div>
            <label class="label" for="edit-title-${escapeHtml(m.id)}">Title</label>
            <input id="edit-title-${escapeHtml(m.id)}" class="input" maxlength="80" data-edit-title="${escapeHtml(m.id)}" value="${escapeHtml(m.title || "")}" />
          </div>
          <div>
            <label class="label" for="edit-desc-${escapeHtml(m.id)}">Description</label>
            <input id="edit-desc-${escapeHtml(m.id)}" class="input" maxlength="180" data-edit-desc="${escapeHtml(m.id)}" value="${escapeHtml(m.description || "")}" />
          </div>
          <div>
            <label class="label" for="edit-content-${escapeHtml(m.id)}">Content</label>
            <textarea id="edit-content-${escapeHtml(m.id)}" class="textarea" maxlength="5200" data-edit-content="${escapeHtml(m.id)}">${escapeHtml(m.content || "")}</textarea>
          </div>
          <div class="review-warning">Saving changes will unpublish this magazine and send it back to the review queue.</div>
          <label class="check-row">
            <input type="checkbox" data-edit-safe="${escapeHtml(m.id)}" />
            <span>I checked these edits and they do not include private information, mean content, unsafe dares, or anything I would not show a trusted grown-up.</span>
          </label>
          <div class="row">
            <button class="btn btn-primary" type="button" data-save-edit-id="${escapeHtml(m.id)}">Save edits for review</button>
          </div>
        </div>
      </div>
    `).join("");
  }

  async function savePublishedMagazineEdit(postId, saveButton) {
    const magazine = editableMagazines.find(m => m.id === postId);
    if (!currentUser || !magazine || magazine.uid !== currentUser.uid) {
      showEditMessage("This magazine could not be edited. Refresh and try again.", "error");
      return;
    }

    const title = editMagazineList.querySelector(`[data-edit-title="${postId}"]`)?.value.trim() || "";
    const description = editMagazineList.querySelector(`[data-edit-desc="${postId}"]`)?.value.trim() || "";
    const content = editMagazineList.querySelector(`[data-edit-content="${postId}"]`)?.value.trim() || "";
    const safeCheck = editMagazineList.querySelector(`[data-edit-safe="${postId}"]`);

    if (!title || !description || !content) {
      showEditMessage("Please fill in title, description, and content before saving edits.", "error");
      return;
    }

    if (!safeCheck?.checked) {
      showEditMessage("Please complete the safety check before saving edits.", "error");
      return;
    }

    const safetyHit = findPrivateInfo(`${title}\n${description}\n${content}`);
    if (safetyHit) {
      showEditMessage(`This edit looks like it may include a ${safetyHit}. Please remove private information before submitting.`, "error");
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = "Sending to review...";
    try {
      await updateDoc(doc(db, "magazines", postId), {
        title,
        description,
        content,
        isPublic: false,
        status: "pending_review",
        editedAt: serverTimestamp(),
        editedBy: currentUser.email || currentUser.uid,
        approvedBy: "",
        approvedAt: null
      });
      showEditMessage("Edits saved. This magazine is back in the review queue and is not public until approval.", "success");
      await loadEditableMagazines();
    } catch (err) {
      showEditMessage(getFriendlyError(err), "error");
      saveButton.disabled = false;
      saveButton.textContent = "Save edits for review";
    }
  }

  function sortNewestFirst(a, b) {
    const aTime = a.approvedAt?.seconds || a.createdAt?.seconds || 0;
    const bTime = b.approvedAt?.seconds || b.createdAt?.seconds || 0;
    return bTime - aTime;
  }

  function showEditMessage(message, type = "") {
    editStatus.textContent = message;
    editStatus.className = `notice ${type}`.trim();
    editStatus.classList.remove("hidden");
  }

  function escapeHtml(text = "") {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function findPrivateInfo(text = "") {
    const privateInfoPatterns = [
      { label: "phone number", pattern: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/ },
      { label: "email address", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i },
      { label: "street address", pattern: /\b\d{1,6}\s+[A-Za-z0-9.'-]+\s+(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way)\b/i },
      { label: "school name", pattern: /\b[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,3}\s+(Elementary|Middle|High|Primary|Secondary|International)?\s*School\b/ },
      { label: "school name", pattern: /\b(my|our|the)\s+school\s+(is|called|name is)\b/i },
      { label: "password", pattern: /\b(password|passcode|my login|my address|my school|phone number)\b/i }
    ];
    const match = privateInfoPatterns.find(item => item.pattern.test(text));
    return match?.label || "";
  }

  function getFriendlyError(err) {
    const code = err?.code || "";
    if (code === "permission-denied" || code === "firestore/permission-denied") {
      return "Firestore rules blocked this request. Check your Firebase rules.";
    }
    return err?.message || "Something went wrong.";
  }
}
