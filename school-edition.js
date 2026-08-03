import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2vOQPPWJ5LGg5Pxp48UR408P6qpYCEsE",
  authDomain: "kigazine-302ac.firebaseapp.com",
  projectId: "kigazine-302ac",
  storageBucket: "kigazine-302ac.firebasestorage.app",
  messagingSenderId: "821833747017",
  appId: "1:821833747017:web:dc20a182d1935408c34d98"
};

const BUILT_IN_ADMINS = new Set(["ethan02px2035@saschina.org"]);
const ROLE_LABELS = {
  student: "Student",
  teacher: "Teacher",
  school_admin: "School administrator",
  kigazine_admin: "Kigazine administrator"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

const byId = id => document.getElementById(id);
const authView = byId("authView");
const blockedView = byId("blockedView");
const portal = byId("portal");

const state = {
  user: null,
  participant: null,
  userProfile: null,
  isGlobalAdmin: false,
  schoolMap: new Map(),
  classes: [],
  reviewClasses: [],
  membershipIds: new Set(),
  myWork: [],
  feed: [],
  reviewQueue: [],
  reports: [],
  setupParticipants: [],
  setupClasses: [],
  selectedSetupSchoolId: "",
  reportTarget: null
};

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMessage(target, text, tone = "info") {
  const element = typeof target === "string" ? byId(target) : target;
  if (!element) return;
  element.textContent = text;
  element.className = `message ${tone}`;
}

function hideMessage(target) {
  const element = typeof target === "string" ? byId(target) : target;
  if (!element) return;
  element.textContent = "";
  element.className = "message hidden";
}

function setBusy(button, busy, busyLabel = "Working…") {
  if (!button) return;
  if (busy) {
    if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
    button.textContent = busyLabel;
  } else if (button.dataset.originalLabel) {
    button.textContent = button.dataset.originalLabel;
    delete button.dataset.originalLabel;
  }
  button.disabled = busy;
}

function friendlyError(error) {
  const code = error?.code || "";
  const messages = {
    "auth/email-already-in-use": "That sign-in email already has an account.",
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/too-many-requests": "Too many attempts. Wait a little and try again.",
    "auth/weak-password": "Use a temporary password with at least 12 characters.",
    "permission-denied": "Firebase stopped this action because this account does not have the required School Edition role.",
    "firestore/permission-denied": "Firebase stopped this action because this account does not have the required School Edition role.",
    "unavailable": "Firebase is temporarily unavailable. Check your connection and try again."
  };
  return messages[code] || error?.message || "Something went wrong. Please try again.";
}

function showOnly(view) {
  authView.classList.toggle("hidden", view !== "auth");
  blockedView.classList.toggle("hidden", view !== "blocked");
  portal.classList.toggle("hidden", view !== "portal");
}

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value) {
  const milliseconds = timestampMs(value);
  if (!milliseconds) return "Just now";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(milliseconds));
}

function sortNewest(items, field = "updatedAt") {
  return [...items].sort((a, b) => timestampMs(b[field]) - timestampMs(a[field]));
}

function roleLabel(role) {
  return ROLE_LABELS[role] || "School participant";
}

function statusLabel(status) {
  return {
    draft: "Draft",
    submitted: "Awaiting review",
    changes_requested: "Changes requested",
    approved: "Approved",
    rejected: "Not approved",
    new: "Open",
    resolved: "Resolved"
  }[status] || status;
}

function statusBadge(status) {
  const warning = ["submitted", "changes_requested", "new"].includes(status);
  const success = ["approved", "resolved"].includes(status);
  const tone = success ? "success" : warning ? "warning" : "";
  return `<span class="badge ${tone}">${escapeHtml(statusLabel(status))}</span>`;
}

function snapshotItems(snapshot) {
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

function classLabel(classItem) {
  if (!classItem) return "Unknown class";
  const school = state.schoolMap.get(classItem.schoolId);
  return state.isGlobalAdmin && school
    ? `${classItem.name} — ${school.name || classItem.schoolId}`
    : classItem.name;
}

function fillSelect(select, items, getValue, getLabel, emptyLabel = "No options available") {
  if (!select) return;
  const previous = select.value;
  if (!items.length) {
    select.innerHTML = `<option value="">${escapeHtml(emptyLabel)}</option>`;
    select.disabled = true;
    return;
  }
  select.disabled = false;
  select.innerHTML = items.map(item => (
    `<option value="${escapeHtml(getValue(item))}">${escapeHtml(getLabel(item))}</option>`
  )).join("");
  if (items.some(item => getValue(item) === previous)) select.value = previous;
}

function fillClassSelect(select, classes = state.classes, emptyLabel = "No assigned classes") {
  fillSelect(select, classes, item => item.id, classLabel, emptyLabel);
}

function currentRole() {
  return state.participant?.role || (state.isGlobalAdmin ? "kigazine_admin" : "");
}

function canUseSetup() {
  return state.isGlobalAdmin || state.participant?.role === "school_admin";
}

function canModerate() {
  return state.reviewClasses.length > 0;
}

function hasParticipantMembership(classId) {
  return Boolean(state.participant?.active && state.membershipIds.has(classId));
}

function privacyWarnings(text) {
  const checks = [
    [/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/i, "an email address"],
    [/(?:\+?\d[\s().-]*){7,}/, "a possible phone number"],
    [/\b\d{1,6}\s+[A-Za-z0-9.' -]{2,40}\b(?:street|st|road|rd|lane|ln|avenue|ave|drive|dr|boulevard|blvd)\b/i, "a possible street address"],
    [/\b(?:text me|call me|dm me|message me|add me on|meet me at|my password)\b/i, "a private-contact invitation or password reference"]
  ];
  return checks.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
}

function switchPanel(panelId) {
  document.querySelectorAll(".panel").forEach(panel => {
    panel.classList.toggle("active", panel.id === panelId);
  });
  document.querySelectorAll(".nav-button[data-panel]").forEach(button => {
    button.classList.toggle("active", button.dataset.panel === panelId);
  });
  const button = document.querySelector(`.nav-button[data-panel="${panelId}"]`);
  byId("portalTitle").textContent = button?.textContent.trim().replace(/^[^\s]+\s/, "") || "School Edition";
  closeSidebar();
  if (panelId === "feedSection") loadFeed();
  if (panelId === "workSection" && currentRole() === "student") loadMyWork();
  if (panelId === "reviewSection" && canModerate()) loadReviewQueue();
  if (panelId === "reportsSection" && canModerate()) loadReports();
  if (panelId === "setupSection" && canUseSetup()) loadSetupData();
}

function openSidebar() {
  portal.classList.add("sidebar-open");
  byId("sidebarToggle").setAttribute("aria-expanded", "true");
}

function closeSidebar() {
  portal.classList.remove("sidebar-open");
  byId("sidebarToggle").setAttribute("aria-expanded", "false");
}

async function loadMembershipIds() {
  state.membershipIds = new Set();
  if (!state.participant) return;
  const membershipQuery = query(
    collection(db, "schoolClassMembers"),
    where("uid", "==", state.user.uid)
  );
  const memberships = snapshotItems(await getDocs(membershipQuery));
  memberships.filter(item => item.active === true).forEach(item => state.membershipIds.add(item.classId));
}

async function loadSchools() {
  state.schoolMap = new Map();
  if (state.isGlobalAdmin) {
    const schools = snapshotItems(await getDocs(collection(db, "schools")));
    schools.filter(item => item.active !== false).forEach(item => state.schoolMap.set(item.id, item));
  } else if (state.participant?.schoolId) {
    const schoolSnapshot = await getDoc(doc(db, "schools", state.participant.schoolId));
    if (schoolSnapshot.exists()) {
      state.schoolMap.set(schoolSnapshot.id, { id: schoolSnapshot.id, ...schoolSnapshot.data() });
    }
  }
}

async function loadClasses() {
  await loadMembershipIds();
  let allClasses = [];
  if (state.isGlobalAdmin) {
    allClasses = snapshotItems(await getDocs(collection(db, "schoolClasses")));
  } else if (state.participant?.role === "student") {
    const classSnapshots = await Promise.all(
      [...state.membershipIds].map(classId => getDoc(doc(db, "schoolClasses", classId)))
    );
    allClasses = classSnapshots
      .filter(snapshot => snapshot.exists())
      .map(snapshot => ({ id: snapshot.id, ...snapshot.data() }));
  } else if (state.participant?.schoolId) {
    const classQuery = query(
      collection(db, "schoolClasses"),
      where("schoolId", "==", state.participant.schoolId)
    );
    allClasses = snapshotItems(await getDocs(classQuery));
  }

  allClasses = allClasses.filter(item => item.active !== false);
  if (!state.isGlobalAdmin && state.participant?.role === "teacher") {
    allClasses = allClasses.filter(item =>
      item.moderatorUids?.includes(state.user.uid) || state.membershipIds.has(item.id)
    );
  }

  state.classes = allClasses.sort((a, b) => classLabel(a).localeCompare(classLabel(b)));
  if (state.isGlobalAdmin || state.participant?.role === "school_admin") {
    state.reviewClasses = [...state.classes];
  } else if (state.participant?.role === "teacher") {
    state.reviewClasses = state.classes.filter(item => item.moderatorUids?.includes(state.user.uid));
  } else {
    state.reviewClasses = [];
  }
}

function configurePortal() {
  const role = currentRole();
  const school = state.participant ? state.schoolMap.get(state.participant.schoolId) : null;
  const nickname = state.participant?.nickname || "Kigazine admin";

  byId("headerRoleBadge").textContent = roleLabel(role);
  byId("portalSubtitle").textContent = school?.name || "Supervised publishing";
  byId("activeClassLabel").textContent = state.classes.length
    ? `${state.classes.length} active ${state.classes.length === 1 ? "class" : "classes"}`
    : "No active class yet";
  byId("welcomeHeading").textContent = `Welcome, ${nickname}.`;
  byId("welcomeCopy").textContent = role === "student"
    ? "Write in private, submit when ready, and wait for your assigned adult to approve the work before classmates can read it."
    : "Manage a supervised newsroom where every student submission stays private until an authorized adult reviews it.";

  document.querySelectorAll('[data-role-scope="student"]').forEach(element => {
    element.classList.toggle("hidden", role !== "student");
  });
  document.querySelectorAll('[data-role-scope="moderator"]').forEach(element => {
    element.classList.toggle("hidden", !canModerate());
  });
  document.querySelectorAll('[data-role-scope="setup"]').forEach(element => {
    element.classList.toggle("hidden", !canUseSetup());
  });
  byId("workStudentOnly").classList.toggle("hidden", role !== "student");
  byId("workUnavailable").classList.toggle("hidden", role === "student");
  byId("reportQueueWrap").classList.toggle("hidden", !canModerate());
  byId("reportForm").classList.toggle("hidden", !state.participant);
  byId("setupAdminOnly").classList.toggle("hidden", !state.isGlobalAdmin);

  byId("accountNickname").textContent = nickname;
  byId("accountRole").textContent = roleLabel(role);
  byId("accountSchool").textContent = school?.name || (state.isGlobalAdmin ? "All pilot schools" : state.participant?.schoolId || "—");
  byId("accountUid").textContent = state.user.uid;

  fillClassSelect(byId("feedClassSelect"));
  fillClassSelect(byId("magazineClassSelect"));
  fillClassSelect(byId("reviewClassSelect"), state.reviewClasses, "No classes assigned for review");
}

async function loadDashboardCounts() {
  let approved = 0;
  let pending = 0;
  let openReports = 0;

  try {
    if (state.isGlobalAdmin) {
      const [magazinesSnapshot, reportsSnapshot] = await Promise.all([
        getDocs(collection(db, "schoolMagazines")),
        getDocs(collection(db, "schoolReports"))
      ]);
      const magazines = snapshotItems(magazinesSnapshot);
      approved = magazines.filter(item => item.status === "approved").length;
      pending = magazines.filter(item => item.status === "submitted").length;
      openReports = snapshotItems(reportsSnapshot).filter(item => item.status === "new").length;
    } else if (currentRole() === "student") {
      const workQuery = query(
        collection(db, "schoolMagazines"),
        where("authorUid", "==", state.user.uid)
      );
      const work = snapshotItems(await getDocs(workQuery));
      pending = work.filter(item => item.status === "submitted").length;
      const approvedLists = await Promise.all(state.classes.map(item => getApprovedForClass(item.id)));
      approved = approvedLists.flat().length;
    } else {
      const classResults = await Promise.all(state.reviewClasses.map(async classItem => {
        const [magazines, reports] = await Promise.all([
          getMagazinesForClass(classItem.id),
          getReportsForClass(classItem.id)
        ]);
        return { magazines, reports };
      }));
      approved = classResults.flatMap(item => item.magazines).filter(item => item.status === "approved").length;
      pending = classResults.flatMap(item => item.magazines).filter(item => item.status === "submitted").length;
      openReports = classResults.flatMap(item => item.reports).filter(item => item.status === "new").length;
    }
  } catch (error) {
    console.warn("Could not load School Edition dashboard totals.", error);
  }

  byId("statClasses").textContent = String(state.classes.length);
  byId("statApproved").textContent = String(approved);
  byId("statPending").textContent = String(pending);
  byId("statReports").textContent = String(openReports);
}

async function getApprovedForClass(classId) {
  const feedQuery = query(
    collection(db, "schoolMagazines"),
    where("classId", "==", classId),
    where("status", "==", "approved")
  );
  return snapshotItems(await getDocs(feedQuery));
}

async function getMagazinesForClass(classId) {
  const classQuery = query(
    collection(db, "schoolMagazines"),
    where("classId", "==", classId)
  );
  return snapshotItems(await getDocs(classQuery));
}

async function getReportsForClass(classId) {
  const reportsQuery = query(
    collection(db, "schoolReports"),
    where("classId", "==", classId)
  );
  return snapshotItems(await getDocs(reportsQuery));
}

async function loadFeed() {
  const classId = byId("feedClassSelect").value;
  const container = byId("feedList");
  if (!classId) {
    container.innerHTML = '<div class="empty-state">No assigned class is available yet.</div>';
    hideMessage("feedStatus");
    return;
  }

  showMessage("feedStatus", "Loading approved class work…", "info");
  try {
    state.feed = sortNewest(await getApprovedForClass(classId), "publishedAt");
    hideMessage("feedStatus");
    if (!state.feed.length) {
      container.innerHTML = '<div class="empty-state">No work has been approved for this class yet.</div>';
      return;
    }
    container.innerHTML = state.feed.map(item => {
      const canReport = hasParticipantMembership(item.classId);
      return `
        <article class="card magazine-card">
          <h3>${escapeHtml(item.title)}</h3>
          <div class="magazine-meta">
            ${statusBadge(item.status)}
            <span>By ${escapeHtml(item.authorNickname)}</span>
            <span>Published ${escapeHtml(formatDate(item.publishedAt || item.updatedAt))}</span>
          </div>
          ${item.description ? `<p class="magazine-description">${escapeHtml(item.description)}</p>` : ""}
          <div class="magazine-content">${escapeHtml(item.content)}</div>
          ${canReport ? `<div class="card-actions"><button class="button danger small" type="button" data-report-magazine="${escapeHtml(item.id)}">Report privately</button></div>` : ""}
        </article>
      `;
    }).join("");
  } catch (error) {
    container.innerHTML = "";
    showMessage("feedStatus", friendlyError(error), "error");
  }
}

function resetMagazineForm() {
  byId("magazineForm").reset();
  byId("editingMagazineId").value = "";
  byId("magazineFormTitle").textContent = "Create a school magazine";
  byId("cancelEditButton").classList.add("hidden");
  hideMessage("magazineMessage");
  fillClassSelect(byId("magazineClassSelect"));
}

function magazinePayload(status) {
  const classId = byId("magazineClassSelect").value;
  const classItem = state.classes.find(item => item.id === classId);
  return {
    schoolId: classItem?.schoolId || "",
    classId,
    authorUid: state.user.uid,
    authorNickname: state.participant.nickname,
    title: byId("magazineTitle").value.trim(),
    description: byId("magazineDescription").value.trim(),
    content: byId("magazineContent").value.trim(),
    status,
    visibility: "class"
  };
}

function validateMagazine(payload, submitting) {
  if (!payload.classId || !payload.schoolId) return "Choose an assigned class.";
  if (!payload.title) return "Add a title before saving.";
  if (!payload.content) return "Add magazine content before saving.";
  if (!submitting) return "";
  if (!byId("safetyConfirm").checked) return "Confirm that you checked the work for private information.";
  const warnings = privacyWarnings(`${payload.title}\n${payload.description}\n${payload.content}`);
  if (warnings.length) {
    return `Check the draft again. It may contain ${warnings.join(" and ")}. Remove it before submitting.`;
  }
  return "";
}

async function saveMagazine(status) {
  if (currentRole() !== "student") return;
  const payload = magazinePayload(status);
  const validation = validateMagazine(payload, status === "submitted");
  if (validation) {
    showMessage("magazineMessage", validation, "warning");
    return;
  }

  const button = status === "submitted" ? byId("submitMagazineButton") : byId("saveDraftButton");
  setBusy(button, true, status === "submitted" ? "Submitting…" : "Saving…");
  hideMessage("magazineMessage");
  try {
    const editingId = byId("editingMagazineId").value;
    const writeData = {
      title: payload.title,
      description: payload.description,
      content: payload.content,
      status,
      updatedAt: serverTimestamp()
    };
    if (status === "submitted") writeData.submittedAt = serverTimestamp();

    if (editingId) {
      await updateDoc(doc(db, "schoolMagazines", editingId), writeData);
    } else {
      await addDoc(collection(db, "schoolMagazines"), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(status === "submitted" ? { submittedAt: serverTimestamp() } : {})
      });
    }

    resetMagazineForm();
    showMessage("magazineMessage", status === "submitted"
      ? "Submitted. Only an assigned adult can review it."
      : "Draft saved privately.", "success");
    await Promise.all([loadMyWork(), loadDashboardCounts()]);
  } catch (error) {
    showMessage("magazineMessage", friendlyError(error), "error");
  } finally {
    setBusy(button, false);
  }
}

async function loadMyWork() {
  if (currentRole() !== "student") return;
  const container = byId("myWorkList");
  showMessage("workStatus", "Loading your drafts and submissions…", "info");
  try {
    const workQuery = query(
      collection(db, "schoolMagazines"),
      where("authorUid", "==", state.user.uid)
    );
    state.myWork = sortNewest(snapshotItems(await getDocs(workQuery)));
    hideMessage("workStatus");
    if (!state.myWork.length) {
      container.innerHTML = '<div class="empty-state">Your drafts and submissions will appear here.</div>';
      return;
    }
    container.innerHTML = state.myWork.map(item => {
      const editable = ["draft", "changes_requested"].includes(item.status);
      return `
        <article class="card magazine-card">
          <h3>${escapeHtml(item.title)}</h3>
          <div class="magazine-meta">
            ${statusBadge(item.status)}
            <span>${escapeHtml(classLabel(state.classes.find(classItem => classItem.id === item.classId)))}</span>
            <span>Updated ${escapeHtml(formatDate(item.updatedAt))}</span>
          </div>
          ${item.reviewNote ? `<div class="review-warning"><strong>Moderator note:</strong> ${escapeHtml(item.reviewNote)}</div>` : ""}
          ${item.description ? `<p class="magazine-description">${escapeHtml(item.description)}</p>` : ""}
          ${editable ? `
            <div class="card-actions">
              <button class="button secondary small" type="button" data-edit-magazine="${escapeHtml(item.id)}">Edit</button>
              <button class="button danger small" type="button" data-delete-magazine="${escapeHtml(item.id)}">Delete</button>
            </div>
          ` : ""}
        </article>
      `;
    }).join("");
  } catch (error) {
    container.innerHTML = "";
    showMessage("workStatus", friendlyError(error), "error");
  }
}

function editMagazine(magazineId) {
  const item = state.myWork.find(work => work.id === magazineId);
  if (!item || !["draft", "changes_requested"].includes(item.status)) return;
  byId("editingMagazineId").value = item.id;
  byId("magazineClassSelect").value = item.classId;
  byId("magazineClassSelect").disabled = true;
  byId("magazineTitle").value = item.title || "";
  byId("magazineDescription").value = item.description || "";
  byId("magazineContent").value = item.content || "";
  byId("safetyConfirm").checked = false;
  byId("magazineFormTitle").textContent = item.status === "changes_requested" ? "Revise requested changes" : "Edit draft";
  byId("cancelEditButton").classList.remove("hidden");
  hideMessage("magazineMessage");
  byId("magazineForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function removeMagazine(magazineId) {
  const item = state.myWork.find(work => work.id === magazineId);
  if (!item || !["draft", "changes_requested"].includes(item.status)) return;
  if (!window.confirm(`Delete “${item.title}”? This cannot be undone.`)) return;
  try {
    await deleteDoc(doc(db, "schoolMagazines", magazineId));
    if (byId("editingMagazineId").value === magazineId) resetMagazineForm();
    await Promise.all([loadMyWork(), loadDashboardCounts()]);
  } catch (error) {
    showMessage("workStatus", friendlyError(error), "error");
  }
}

async function loadReviewQueue() {
  const classId = byId("reviewClassSelect").value;
  const container = byId("reviewQueue");
  if (!classId) {
    container.innerHTML = '<div class="empty-state">No class is assigned to this moderator.</div>';
    hideMessage("reviewStatus");
    return;
  }
  showMessage("reviewStatus", "Loading private submissions…", "info");
  try {
    const reviewQuery = query(
      collection(db, "schoolMagazines"),
      where("classId", "==", classId),
      where("status", "==", "submitted")
    );
    state.reviewQueue = sortNewest(snapshotItems(await getDocs(reviewQuery)), "submittedAt");
    hideMessage("reviewStatus");
    if (!state.reviewQueue.length) {
      container.innerHTML = '<div class="empty-state">The review queue is clear.</div>';
      return;
    }
    container.innerHTML = state.reviewQueue.map(item => `
      <article class="card review-card" data-review-card="${escapeHtml(item.id)}">
        <h3>${escapeHtml(item.title)}</h3>
        <div class="magazine-meta">
          ${statusBadge(item.status)}
          <span>By ${escapeHtml(item.authorNickname)}</span>
          <span>Submitted ${escapeHtml(formatDate(item.submittedAt || item.updatedAt))}</span>
        </div>
        ${item.description ? `<p class="magazine-description">${escapeHtml(item.description)}</p>` : ""}
        <div class="magazine-content">${escapeHtml(item.content)}</div>
        <div class="field" style="margin-top:17px;">
          <label for="review-note-${escapeHtml(item.id)}">Private review note</label>
          <textarea id="review-note-${escapeHtml(item.id)}" class="textarea" maxlength="1000" data-review-note="${escapeHtml(item.id)}" placeholder="Explain requested changes or the decision."></textarea>
        </div>
        <label class="check-row">
          <input type="checkbox" data-review-check="${escapeHtml(item.id)}" />
          <span>I read the full submission and checked it for private information and age-appropriate classroom content.</span>
        </label>
        <div class="card-actions">
          <button class="button primary small" type="button" data-review-action="approved" data-magazine-id="${escapeHtml(item.id)}">Approve for class</button>
          <button class="button secondary small" type="button" data-review-action="changes_requested" data-magazine-id="${escapeHtml(item.id)}">Request changes</button>
          <button class="button danger small" type="button" data-review-action="rejected" data-magazine-id="${escapeHtml(item.id)}">Reject</button>
        </div>
        <div class="message hidden" data-review-message="${escapeHtml(item.id)}" role="status"></div>
      </article>
    `).join("");
  } catch (error) {
    container.innerHTML = "";
    showMessage("reviewStatus", friendlyError(error), "error");
  }
}

async function writeAuditLog(action, item, extra = {}) {
  try {
    await addDoc(collection(db, "schoolAuditLogs"), {
      actorUid: state.user.uid,
      action,
      schoolId: item.schoolId,
      classId: item.classId,
      magazineId: item.id,
      createdAt: serverTimestamp(),
      ...extra
    });
  } catch (error) {
    console.warn("The action succeeded, but its School Edition audit entry could not be written.", error);
  }
}

async function reviewMagazine(magazineId, decision, button) {
  const item = state.reviewQueue.find(work => work.id === magazineId);
  if (!item) return;
  const card = button.closest("[data-review-card]");
  const message = card.querySelector("[data-review-message]");
  const note = card.querySelector("[data-review-note]").value.trim();
  const checked = card.querySelector("[data-review-check]").checked;
  if (decision === "approved" && !checked) {
    showMessage(message, "Complete the safety review checkbox before approval.", "warning");
    return;
  }
  if (["changes_requested", "rejected"].includes(decision) && !note) {
    showMessage(message, "Add a review note so the student understands the decision.", "warning");
    return;
  }

  setBusy(button, true, "Saving…");
  try {
    const update = {
      status: decision,
      reviewedBy: state.user.uid,
      reviewedAt: serverTimestamp(),
      reviewNote: note,
      updatedAt: serverTimestamp()
    };
    if (decision === "approved") update.publishedAt = serverTimestamp();
    await updateDoc(doc(db, "schoolMagazines", magazineId), update);
    await writeAuditLog(`magazine_${decision}`, item, { reviewNote: note });
    await Promise.all([loadReviewQueue(), loadDashboardCounts()]);
  } catch (error) {
    showMessage(message, friendlyError(error), "error");
  } finally {
    setBusy(button, false);
  }
}

function selectReportTarget(magazineId) {
  const item = state.feed.find(magazine => magazine.id === magazineId);
  if (!item || !hasParticipantMembership(item.classId)) return;
  state.reportTarget = item;
  byId("reportMagazineId").value = item.id;
  showMessage("reportTargetLabel", `Reporting “${item.title}” by ${item.authorNickname}.`, "info");
  hideMessage("reportMessage");
  switchPanel("reportsSection");
  byId("reportReason").focus();
}

async function submitReport(event) {
  event.preventDefault();
  const item = state.reportTarget;
  const reason = byId("reportReason").value.trim();
  if (!item || !hasParticipantMembership(item.classId)) {
    showMessage("reportMessage", "Choose a magazine from your class feed first.", "warning");
    return;
  }
  if (!reason) {
    showMessage("reportMessage", "Explain what the assigned adult should check.", "warning");
    return;
  }

  const button = byId("reportSubmit");
  setBusy(button, true, "Sending…");
  try {
    await addDoc(collection(db, "schoolReports"), {
      schoolId: item.schoolId,
      classId: item.classId,
      magazineId: item.id,
      reportedBy: state.user.uid,
      reason,
      status: "new",
      createdAt: serverTimestamp()
    });
    byId("reportForm").reset();
    state.reportTarget = null;
    showMessage("reportTargetLabel", "Choose “Report” on a magazine in the class feed.", "info");
    showMessage("reportMessage", "Your report was sent privately to an authorized adult.", "success");
    await loadDashboardCounts();
  } catch (error) {
    showMessage("reportMessage", friendlyError(error), "error");
  } finally {
    setBusy(button, false);
  }
}

async function loadReports() {
  if (!canModerate()) return;
  const container = byId("reportQueue");
  showMessage("reportQueueStatus", "Loading private reports…", "info");
  try {
    const results = await Promise.all(state.reviewClasses.map(item => getReportsForClass(item.id)));
    state.reports = sortNewest(results.flat(), "createdAt");
    hideMessage("reportQueueStatus");
    if (!state.reports.length) {
      container.innerHTML = '<div class="empty-state">No safety reports have been filed.</div>';
      return;
    }
    container.innerHTML = state.reports.map(item => `
      <article class="card">
        <div class="magazine-meta">
          ${statusBadge(item.status)}
          <span>${escapeHtml(classLabel(state.classes.find(classItem => classItem.id === item.classId)))}</span>
          <span>${escapeHtml(formatDate(item.createdAt))}</span>
        </div>
        <p class="magazine-description"><strong>Magazine ID:</strong> ${escapeHtml(item.magazineId)}</p>
        <div class="magazine-content">${escapeHtml(item.reason)}</div>
        ${item.status === "new" ? `<div class="card-actions"><button class="button primary small" type="button" data-resolve-report="${escapeHtml(item.id)}">Mark resolved</button></div>` : ""}
      </article>
    `).join("");
  } catch (error) {
    container.innerHTML = "";
    showMessage("reportQueueStatus", friendlyError(error), "error");
  }
}

async function resolveReport(reportId, button) {
  const item = state.reports.find(report => report.id === reportId);
  if (!item || item.status !== "new") return;
  setBusy(button, true, "Saving…");
  try {
    await updateDoc(doc(db, "schoolReports", reportId), {
      status: "resolved",
      resolvedBy: state.user.uid,
      resolvedAt: serverTimestamp()
    });
    await writeAuditLog("report_resolved", { ...item, id: item.magazineId }, { reportId });
    await Promise.all([loadReports(), loadDashboardCounts()]);
  } catch (error) {
    showMessage("reportQueueStatus", friendlyError(error), "error");
  } finally {
    setBusy(button, false);
  }
}

function setupSchoolOptions() {
  const schools = [...state.schoolMap.values()].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  fillSelect(byId("participantSchoolSelect"), schools, item => item.id, item => item.name || item.id, "Create a school first");
  fillSelect(byId("setupSchoolSelect"), schools, item => item.id, item => item.name || item.id, "Create a school first");
  if (!state.isGlobalAdmin && state.participant?.schoolId) {
    byId("setupSchoolSelect").value = state.participant.schoolId;
    byId("setupSchoolSelect").disabled = true;
  }
  if (state.selectedSetupSchoolId && state.schoolMap.has(state.selectedSetupSchoolId)) {
    byId("setupSchoolSelect").value = state.selectedSetupSchoolId;
  }
  state.selectedSetupSchoolId = byId("setupSchoolSelect").value;
}

async function loadSetupData() {
  if (!canUseSetup()) return;
  showMessage("classMessage", "Loading setup data…", "info");
  try {
    if (state.isGlobalAdmin) await loadSchools();
    setupSchoolOptions();
    const schoolId = byId("setupSchoolSelect").value;
    state.selectedSetupSchoolId = schoolId;
    if (!schoolId) {
      state.setupParticipants = [];
      state.setupClasses = [];
      byId("setupSummary").innerHTML = "Create a school workspace to continue.";
      fillSelect(byId("classModeratorSelect"), [], item => item.id, item => item.nickname);
      fillSelect(byId("enrollmentClassSelect"), [], item => item.id, item => item.name);
      fillSelect(byId("enrollmentParticipantSelect"), [], item => item.id, item => item.nickname);
      hideMessage("classMessage");
      return;
    }

    const [participantsSnapshot, classesSnapshot] = await Promise.all([
      getDocs(query(collection(db, "schoolParticipants"), where("schoolId", "==", schoolId))),
      getDocs(query(collection(db, "schoolClasses"), where("schoolId", "==", schoolId)))
    ]);
    state.setupParticipants = snapshotItems(participantsSnapshot)
      .filter(item => item.active === true)
      .sort((a, b) => a.nickname.localeCompare(b.nickname));
    state.setupClasses = snapshotItems(classesSnapshot)
      .filter(item => item.active !== false)
      .sort((a, b) => a.name.localeCompare(b.name));

    const adults = state.setupParticipants.filter(item => ["teacher", "school_admin"].includes(item.role));
    fillSelect(
      byId("classModeratorSelect"),
      adults,
      item => item.id,
      item => `${item.nickname} — ${roleLabel(item.role)}`,
      "Provision an adult account first"
    );
    fillSelect(byId("enrollmentClassSelect"), state.setupClasses, item => item.id, item => item.name, "Create a class first");
    fillSelect(
      byId("enrollmentParticipantSelect"),
      state.setupParticipants,
      item => item.id,
      item => `${item.nickname} — ${roleLabel(item.role)}`,
      "Provision an account first"
    );
    const school = state.schoolMap.get(schoolId);
    byId("setupSummary").innerHTML = `
      <div><strong>${escapeHtml(school?.name || schoolId)}</strong></div>
      <div>${state.setupParticipants.length} active participants · ${adults.length} adults · ${state.setupClasses.length} classes</div>
    `;
    hideMessage("classMessage");
  } catch (error) {
    showMessage("classMessage", friendlyError(error), "error");
  }
}

async function createSchool(event) {
  event.preventDefault();
  if (!state.isGlobalAdmin) return;
  const id = byId("schoolId").value.trim().toLowerCase();
  const name = byId("schoolName").value.trim();
  if (!/^[a-z0-9][a-z0-9-]{1,99}$/.test(id)) {
    showMessage("schoolMessage", "Use 2–100 lowercase letters, numbers, or hyphens for the workspace ID.", "warning");
    return;
  }
  if (!name) {
    showMessage("schoolMessage", "Add the approved school display name.", "warning");
    return;
  }
  const button = event.submitter;
  setBusy(button, true, "Creating…");
  try {
    const reference = doc(db, "schools", id);
    if ((await getDoc(reference)).exists()) {
      showMessage("schoolMessage", "That workspace ID already exists.", "warning");
      return;
    }
    await setDoc(reference, {
      name,
      active: true,
      pilotMode: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    byId("schoolForm").reset();
    state.selectedSetupSchoolId = id;
    showMessage("schoolMessage", "School workspace created.", "success");
    await loadSetupData();
  } catch (error) {
    showMessage("schoolMessage", friendlyError(error), "error");
  } finally {
    setBusy(button, false);
  }
}

let provisioningAuthInstance = null;

function getProvisioningAuth() {
  if (!provisioningAuthInstance) {
    const provisioningApp = initializeApp(firebaseConfig, "schoolProvisioning");
    provisioningAuthInstance = getAuth(provisioningApp);
  }
  return provisioningAuthInstance;
}

async function provisionParticipant(event) {
  event.preventDefault();
  if (!state.isGlobalAdmin) return;
  const schoolId = byId("participantSchoolSelect").value;
  const role = byId("participantRole").value;
  const nickname = byId("participantNickname").value.trim();
  const email = byId("participantEmail").value.trim();
  const password = byId("participantPassword").value;
  if (!schoolId || !nickname || !email || password.length < 12) {
    showMessage("participantMessage", "Choose a school and provide a nickname, valid email, and 12-character temporary password.", "warning");
    return;
  }

  const button = event.submitter;
  setBusy(button, true, "Creating account…");
  let createdUser = null;
  let provisioningAuth = null;
  try {
    provisioningAuth = getProvisioningAuth();
    const credential = await createUserWithEmailAndPassword(provisioningAuth, email, password);
    createdUser = credential.user;
    await setDoc(doc(db, "schoolParticipants", createdUser.uid), {
      uid: createdUser.uid,
      schoolId,
      nickname,
      role,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await signOut(provisioningAuth);
    byId("participantForm").reset();
    showMessage("participantMessage", "School account created. Share its temporary credentials through a school-approved private channel.", "success");
    await loadSetupData();
  } catch (error) {
    if (createdUser) {
      try { await deleteUser(createdUser); } catch (rollbackError) { console.warn("Could not roll back the unused Auth account.", rollbackError); }
    }
    if (provisioningAuth?.currentUser) {
      try { await signOut(provisioningAuth); } catch (_) {}
    }
    showMessage("participantMessage", friendlyError(error), "error");
  } finally {
    setBusy(button, false);
  }
}

async function createClass(event) {
  event.preventDefault();
  if (!canUseSetup()) return;
  const schoolId = byId("setupSchoolSelect").value;
  const name = byId("className").value.trim();
  const moderatorUid = byId("classModeratorSelect").value;
  if (!schoolId || !name || !moderatorUid) {
    showMessage("classMessage", "Choose a school and an active adult moderator, then add the class name.", "warning");
    return;
  }
  const button = event.submitter;
  setBusy(button, true, "Creating…");
  try {
    await addDoc(collection(db, "schoolClasses"), {
      schoolId,
      name,
      moderatorUids: [moderatorUid],
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    byId("classForm").reset();
    showMessage("classMessage", "Moderated class created.", "success");
    await refreshPortalData();
    await loadSetupData();
  } catch (error) {
    showMessage("classMessage", friendlyError(error), "error");
  } finally {
    setBusy(button, false);
  }
}

async function enrollParticipant(event) {
  event.preventDefault();
  if (!canUseSetup()) return;
  const classId = byId("enrollmentClassSelect").value;
  const participantUid = byId("enrollmentParticipantSelect").value;
  const classItem = state.setupClasses.find(item => item.id === classId);
  const participant = state.setupParticipants.find(item => item.id === participantUid);
  if (!classItem || !participant || classItem.schoolId !== participant.schoolId) {
    showMessage("enrollmentMessage", "Choose a class and participant from the same school.", "warning");
    return;
  }
  const button = event.submitter;
  setBusy(button, true, "Adding…");
  try {
    const memberId = `${classId}_${participantUid}`;
    const memberRef = doc(db, "schoolClassMembers", memberId);
    const existing = await getDoc(memberRef);
    if (existing.exists()) {
      await updateDoc(memberRef, {
        nickname: participant.nickname,
        active: true,
        updatedAt: serverTimestamp()
      });
    } else {
      await setDoc(memberRef, {
        uid: participantUid,
        schoolId: participant.schoolId,
        classId,
        nickname: participant.nickname,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    showMessage("enrollmentMessage", `${participant.nickname} was added to ${classItem.name}.`, "success");
    await refreshPortalData();
  } catch (error) {
    showMessage("enrollmentMessage", friendlyError(error), "error");
  } finally {
    setBusy(button, false);
  }
}

async function refreshPortalData() {
  await loadSchools();
  await loadClasses();
  configurePortal();
  await loadDashboardCounts();
}

async function openPortal(user) {
  const [participantSnapshot, userSnapshot] = await Promise.all([
    getDoc(doc(db, "schoolParticipants", user.uid)),
    getDoc(doc(db, "users", user.uid))
  ]);
  const participantData = participantSnapshot.exists() ? participantSnapshot.data() : null;
  const userData = userSnapshot.exists() ? userSnapshot.data() : null;
  const email = (user.email || "").toLowerCase();
  const isGlobalAdmin = BUILT_IN_ADMINS.has(email) || userData?.role === "admin";
  const isActiveParticipant = participantData?.active === true
    && ["student", "teacher", "school_admin"].includes(participantData.role);

  if (!isGlobalAdmin && !isActiveParticipant) {
    state.user = user;
    byId("blockedMessage").textContent = participantData
      ? "This School Edition account is inactive. Ask the assigned school moderator or Kigazine administrator."
      : "This account does not have an active School Edition role. Ask the pilot moderator before trying again.";
    showOnly("blocked");
    return;
  }

  state.user = user;
  state.participant = isActiveParticipant ? { id: participantSnapshot.id, ...participantData } : null;
  state.userProfile = userData;
  state.isGlobalAdmin = isGlobalAdmin;
  await refreshPortalData();
  showOnly("portal");
  switchPanel("homeSection");
}

byId("loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  const email = byId("loginEmail").value.trim();
  const password = byId("loginPassword").value;
  const button = byId("loginButton");
  hideMessage("loginMessage");
  setBusy(button, true, "Signing in…");
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    showMessage("loginMessage", friendlyError(error), "error");
    setBusy(button, false);
  }
});

async function logout() {
  try { await signOut(auth); } catch (error) { console.warn("Could not sign out.", error); }
}

byId("blockedLogout").addEventListener("click", logout);
byId("logoutButton").addEventListener("click", logout);
byId("sidebarToggle").addEventListener("click", () => portal.classList.contains("sidebar-open") ? closeSidebar() : openSidebar());
byId("sidebarBackdrop").addEventListener("click", closeSidebar);
byId("sidebarNav").addEventListener("click", event => {
  const button = event.target.closest("[data-panel]");
  if (button && !button.classList.contains("hidden")) switchPanel(button.dataset.panel);
});

byId("feedClassSelect").addEventListener("change", loadFeed);
byId("feedRefresh").addEventListener("click", loadFeed);
byId("feedList").addEventListener("click", event => {
  const button = event.target.closest("[data-report-magazine]");
  if (button) selectReportTarget(button.dataset.reportMagazine);
});

byId("saveDraftButton").addEventListener("click", () => saveMagazine("draft"));
byId("magazineForm").addEventListener("submit", event => {
  event.preventDefault();
  saveMagazine("submitted");
});
byId("cancelEditButton").addEventListener("click", resetMagazineForm);
byId("myWorkList").addEventListener("click", event => {
  const editButton = event.target.closest("[data-edit-magazine]");
  const deleteButton = event.target.closest("[data-delete-magazine]");
  if (editButton) editMagazine(editButton.dataset.editMagazine);
  if (deleteButton) removeMagazine(deleteButton.dataset.deleteMagazine);
});

byId("reviewClassSelect").addEventListener("change", loadReviewQueue);
byId("reviewRefresh").addEventListener("click", loadReviewQueue);
byId("reviewQueue").addEventListener("click", event => {
  const button = event.target.closest("[data-review-action]");
  if (button) reviewMagazine(button.dataset.magazineId, button.dataset.reviewAction, button);
});

byId("reportForm").addEventListener("submit", submitReport);
byId("reportQueue").addEventListener("click", event => {
  const button = event.target.closest("[data-resolve-report]");
  if (button) resolveReport(button.dataset.resolveReport, button);
});

byId("setupRefresh").addEventListener("click", loadSetupData);
byId("setupSchoolSelect").addEventListener("change", () => {
  state.selectedSetupSchoolId = byId("setupSchoolSelect").value;
  loadSetupData();
});
byId("schoolForm").addEventListener("submit", createSchool);
byId("participantForm").addEventListener("submit", provisionParticipant);
byId("classForm").addEventListener("submit", createClass);
byId("enrollmentForm").addEventListener("submit", enrollParticipant);

onAuthStateChanged(auth, async user => {
  if (!user) {
    Object.assign(state, {
      user: null,
      participant: null,
      userProfile: null,
      isGlobalAdmin: false,
      schoolMap: new Map(),
      classes: [],
      reviewClasses: [],
      membershipIds: new Set(),
      myWork: [],
      feed: [],
      reviewQueue: [],
      reports: [],
      reportTarget: null
    });
    byId("loginForm").reset();
    setBusy(byId("loginButton"), false);
    showOnly("auth");
    return;
  }

  setBusy(byId("loginButton"), true, "Opening portal…");
  try {
    await openPortal(user);
    hideMessage("loginMessage");
  } catch (error) {
    console.error("School Edition could not open.", error);
    showOnly("auth");
    showMessage("loginMessage", friendlyError(error), "error");
    await signOut(auth).catch(() => {});
  } finally {
    setBusy(byId("loginButton"), false);
  }
});
