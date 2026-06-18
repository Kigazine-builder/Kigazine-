// Kigazine Blog Groups Module
// WeChat-style group chats: owners create groups and choose free join or owner approval.
// Load after the main Firebase script in index.html:
// <script type="module" src="blog.js"></script>

import {
  initializeApp,
  getApps,
  getApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getFirestore,
  collection,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  deleteDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2vOQPPWJ5LGg5Pxp48UR408P6qpYCEsE",
  authDomain: "kigazine-302ac.firebaseapp.com",
  projectId: "kigazine-302ac",
  storageBucket: "kigazine-302ac.firebasestorage.app",
  messagingSenderId: "821833747017",
  appId: "1:821833747017:web:dc20a182d1935408c34d98"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const BLOG_SECTION_ID = "blogSection";
const BLOG_NAV_ID = "blogNavBtn";

let groups = [];
let memberships = [];
let pendingRequests = [];
let ownerRequests = [];
let activeGroupId = "";
let unsubscribeMessages = null;
let unsubscribeGroups = null;
let unsubscribeMemberships = null;
let unsubscribeMyRequests = null;
let unsubscribeOwnerRequests = null;

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getDisplayName(user) {
  return user?.displayName || user?.email?.split("@")[0] || "Kigazine Member";
}

function getInitials(name = "K") {
  return escapeHTML(String(name || "K").slice(0, 1).toUpperCase());
}

function setStatus(id, text, type = "success") {
  const box = document.getElementById(id);
  if (!box) return;
  box.textContent = text;
  box.className = `notice ${type}`;
}

function clearStatus(id) {
  const box = document.getElementById(id);
  if (!box) return;
  box.textContent = "";
  box.className = "notice hidden";
}

function membershipId(groupId, uid) {
  return `${groupId}_${uid}`;
}

function requestId(groupId, uid) {
  return `${groupId}_${uid}`;
}

function isMember(groupId) {
  return memberships.some(item => item.groupId === groupId);
}

function isOwner(group) {
  const user = auth.currentUser;
  return Boolean(user && group?.ownerUid === user.uid);
}

function hasPendingRequest(groupId) {
  return pendingRequests.some(item => item.groupId === groupId && item.status === "pending");
}

function getActiveGroup() {
  return groups.find(group => group.id === activeGroupId) || null;
}

function installBlogUI() {
  if (document.getElementById(BLOG_SECTION_ID)) return;

  const nav = document.querySelector(".nav");
  if (nav && !document.getElementById(BLOG_NAV_ID)) {
    const chatBtn = document.createElement("button");
    chatBtn.id = BLOG_NAV_ID;
    chatBtn.className = "nav-btn";
    chatBtn.dataset.section = BLOG_SECTION_ID;
    chatBtn.textContent = "💬 Groups";
    chatBtn.addEventListener("click", () => {
      if (typeof window.showSection === "function") {
        window.showSection(BLOG_SECTION_ID);
      } else {
        document.querySelectorAll(".section").forEach(section => section.classList.remove("active"));
        document.getElementById(BLOG_SECTION_ID)?.classList.add("active");
        document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
        chatBtn.classList.add("active");
      }
      renderGroups();
      renderChatPanel();
    });
    nav.insertBefore(chatBtn, nav.children[nav.children.length - 1] || null);
  }

  const main = document.querySelector(".main") || document.querySelector("main");
  if (!main) return;

  const section = document.createElement("section");
  section.id = BLOG_SECTION_ID;
  section.className = "section";
  section.innerHTML = `
    <div class="hero">
      <div class="section-kicker">Group Chats</div>
      <h2>Kigazine Groups 💬</h2>
      <p>Create group chats like WeChat. Owners choose whether people can join freely or must request owner permission first.</p>
    </div>

    <div class="split">
      <div class="card">
        <h3>Create a group</h3>
        <p class="muted" style="line-height:1.65;">Make a safe topic-based group. Example: Space Club, Robotics Chat, Book Reviews.</p>
        <div class="form-grid">
          <div>
            <label class="label" for="groupNameInput">Group name</label>
            <input id="groupNameInput" class="input" maxlength="40" placeholder="Example: Robotics Chat" />
          </div>
          <div>
            <label class="label" for="groupDescInput">Description</label>
            <input id="groupDescInput" class="input" maxlength="120" placeholder="What is this group about?" />
          </div>
          <div>
            <label class="label" for="joinModeInput">Join mode</label>
            <select id="joinModeInput" class="input">
              <option value="open">Free join: anyone logged in can join</option>
              <option value="approval">Owner permission: users request to join</option>
            </select>
          </div>
          <button id="createGroupBtn" class="btn btn-primary" type="button">Create group</button>
          <div id="groupCreateStatus" class="notice hidden" role="status" aria-live="polite"></div>
        </div>
      </div>

      <div class="card">
        <h3>How it works</h3>
        <div class="helper-list">
          <div class="helper-item"><strong>Free join:</strong> logged-in users can join instantly.</div>
          <div class="helper-item"><strong>Owner permission:</strong> users send a join request and wait for the owner to approve.</div>
          <div class="helper-item"><strong>Owner tools:</strong> group owners can approve or deny requests.</div>
        </div>
      </div>
    </div>

    <div class="split" style="margin-top:16px;">
      <div class="card">
        <div class="toolbar">
          <div>
            <h3 style="margin:0 0 6px;">Groups</h3>
            <div class="muted">Join or open a group chat.</div>
          </div>
          <button id="refreshGroupsBtn" class="btn btn-secondary" type="button">Refresh</button>
        </div>
        <div id="groupList" class="people-list"></div>
      </div>

      <div class="card" style="padding:0;overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:16px;border-bottom:1px solid rgba(148,163,184,.18);">
          <div>
            <h3 id="activeGroupTitle" style="margin:0;">Choose a group</h3>
            <p id="activeGroupMeta" class="muted" style="margin:6px 0 0;">Join a group to read and send messages.</p>
          </div>
        </div>
        <div id="chatMessages" style="height:430px;overflow-y:auto;padding:16px;display:grid;align-content:start;gap:12px;background:rgba(2,6,23,.24);">
          <p class="muted">No group selected.</p>
        </div>
        <div style="padding:14px;border-top:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.92);">
          <div class="row" style="align-items:flex-end;">
            <textarea id="chatInput" class="input" maxlength="1000" placeholder="Write a group message..." style="min-height:48px;resize:vertical;flex:1 1 260px;"></textarea>
            <button id="sendChatBtn" class="btn btn-primary" type="button">Send</button>
          </div>
          <p class="field-help" style="margin-top:10px;">Safety: no full names, addresses, phone numbers, school names, passwords, or private details.</p>
          <div id="chatStatus" class="notice hidden" role="status" aria-live="polite"></div>
        </div>
      </div>
    </div>

    <div id="ownerRequestsCard" class="card hidden" style="margin-top:16px;">
      <h3>Owner approval requests</h3>
      <p class="muted" style="line-height:1.65;">Approve people you trust to join your permission-only groups.</p>
      <div id="ownerRequestList" class="admin-review-list"></div>
    </div>
  `;

  main.appendChild(section);

  document.getElementById("createGroupBtn")?.addEventListener("click", createGroup);
  document.getElementById("refreshGroupsBtn")?.addEventListener("click", loadOnce);
  document.getElementById("sendChatBtn")?.addEventListener("click", sendMessage);
  document.getElementById("chatInput")?.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  document.getElementById("groupList")?.addEventListener("click", handleGroupClick);
  document.getElementById("ownerRequestList")?.addEventListener("click", handleOwnerRequestClick);
}

async function createGroup() {
  const user = auth.currentUser;
  if (!user) {
    setStatus("groupCreateStatus", "Log in before creating a group.", "error");
    return;
  }

  const nameInput = document.getElementById("groupNameInput");
  const descInput = document.getElementById("groupDescInput");
  const modeInput = document.getElementById("joinModeInput");
  const name = nameInput?.value.trim() || "";
  const description = descInput?.value.trim() || "";
  const joinMode = modeInput?.value === "approval" ? "approval" : "open";

  if (!name) {
    setStatus("groupCreateStatus", "Add a group name first.", "error");
    return;
  }

  try {
    clearStatus("groupCreateStatus");
    const groupRef = await addDoc(collection(db, "blogGroups"), {
      name,
      description,
      joinMode,
      ownerUid: user.uid,
      ownerName: getDisplayName(user),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await setDoc(doc(db, "blogGroupMembers", membershipId(groupRef.id, user.uid)), {
      groupId: groupRef.id,
      uid: user.uid,
      username: getDisplayName(user),
      email: user.email || null,
      role: "owner",
      joinedAt: serverTimestamp()
    });

    nameInput.value = "";
    descInput.value = "";
    activeGroupId = groupRef.id;
    setStatus("groupCreateStatus", "Group created. You are the owner.");
    renderGroups();
    subscribeToMessages(activeGroupId);
  } catch (error) {
    console.error("Could not create group:", error);
    setStatus("groupCreateStatus", `Could not create group: ${error.code || error.message}`, "error");
  }
}

async function joinGroup(groupId) {
  const user = auth.currentUser;
  const group = groups.find(item => item.id === groupId);
  if (!user || !group) return;

  try {
    await setDoc(doc(db, "blogGroupMembers", membershipId(groupId, user.uid)), {
      groupId,
      uid: user.uid,
      username: getDisplayName(user),
      email: user.email || null,
      role: isOwner(group) ? "owner" : "member",
      joinedAt: serverTimestamp()
    }, { merge: true });
    activeGroupId = groupId;
    renderGroups();
    subscribeToMessages(groupId);
  } catch (error) {
    console.error("Could not join group:", error);
    alert(`Could not join group: ${error.code || error.message}`);
  }
}

async function requestJoinGroup(groupId) {
  const user = auth.currentUser;
  const group = groups.find(item => item.id === groupId);
  if (!user || !group) return;

  try {
    await setDoc(doc(db, "blogGroupJoinRequests", requestId(groupId, user.uid)), {
      groupId,
      groupName: group.name,
      ownerUid: group.ownerUid,
      uid: user.uid,
      username: getDisplayName(user),
      email: user.email || null,
      status: "pending",
      createdAt: serverTimestamp()
    }, { merge: true });
    renderGroups();
  } catch (error) {
    console.error("Could not request join:", error);
    alert(`Could not request join: ${error.code || error.message}`);
  }
}

async function approveRequest(requestDocId) {
  const request = ownerRequests.find(item => item.id === requestDocId);
  if (!request) return;

  try {
    await setDoc(doc(db, "blogGroupMembers", membershipId(request.groupId, request.uid)), {
      groupId: request.groupId,
      uid: request.uid,
      username: request.username || "Kigazine Member",
      email: request.email || null,
      role: "member",
      joinedAt: serverTimestamp()
    }, { merge: true });
    await updateDoc(doc(db, "blogGroupJoinRequests", requestDocId), {
      status: "approved",
      decidedAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Could not approve request:", error);
    alert(`Could not approve request: ${error.code || error.message}`);
  }
}

async function denyRequest(requestDocId) {
  try {
    await updateDoc(doc(db, "blogGroupJoinRequests", requestDocId), {
      status: "denied",
      decidedAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Could not deny request:", error);
    alert(`Could not deny request: ${error.code || error.message}`);
  }
}

function handleGroupClick(event) {
  const openButton = event.target.closest("[data-open-group]");
  if (openButton) {
    activeGroupId = openButton.dataset.openGroup;
    renderGroups();
    subscribeToMessages(activeGroupId);
    return;
  }

  const joinButton = event.target.closest("[data-join-group]");
  if (joinButton) {
    joinGroup(joinButton.dataset.joinGroup);
    return;
  }

  const requestButton = event.target.closest("[data-request-group]");
  if (requestButton) {
    requestJoinGroup(requestButton.dataset.requestGroup);
  }
}

function handleOwnerRequestClick(event) {
  const approveButton = event.target.closest("[data-approve-request]");
  if (approveButton) {
    approveRequest(approveButton.dataset.approveRequest);
    return;
  }

  const denyButton = event.target.closest("[data-deny-request]");
  if (denyButton) {
    denyRequest(denyButton.dataset.denyRequest);
  }
}

function renderGroups() {
  const list = document.getElementById("groupList");
  if (!list) return;

  if (!auth.currentUser) {
    list.innerHTML = `<div class="person-card"><p>Log in to use Kigazine group chats.</p></div>`;
    return;
  }

  if (!groups.length) {
    list.innerHTML = `<div class="person-card"><p>No groups yet. Create the first one.</p></div>`;
    return;
  }

  list.innerHTML = groups.map(group => {
    const member = isMember(group.id);
    const owner = isOwner(group);
    const pending = hasPendingRequest(group.id);
    const modeLabel = group.joinMode === "approval" ? "Owner permission" : "Free join";
    let action = "";

    if (member) {
      action = `<button class="btn btn-primary" type="button" data-open-group="${escapeHTML(group.id)}">Open chat</button>`;
    } else if (group.joinMode === "approval") {
      action = pending
        ? `<span class="friend-badge">Request pending</span>`
        : `<button class="btn btn-secondary" type="button" data-request-group="${escapeHTML(group.id)}">Request to join</button>`;
    } else {
      action = `<button class="btn btn-secondary" type="button" data-join-group="${escapeHTML(group.id)}">Join freely</button>`;
    }

    return `
      <div class="person-card" style="border-color:${activeGroupId === group.id ? "rgba(96,165,250,.45)" : "#31415d"};">
        <div class="person-head">
          <div class="avatar small" aria-hidden="true">${getInitials(group.name)}</div>
          <div class="person-head-copy">
            <h4>${escapeHTML(group.name || "Untitled group")}</h4>
            <p style="margin:0;">${escapeHTML(group.description || "No description yet.")}</p>
          </div>
        </div>
        <div class="member-meta">
          <span class="role-badge">${escapeHTML(modeLabel)}</span>
          <span class="role-badge">Owner: ${escapeHTML(group.ownerName || "Member")}</span>
          ${owner ? `<span class="role-badge superadmin">You own this</span>` : ""}
        </div>
        ${action}
      </div>
    `;
  }).join("");

  renderChatPanel();
  renderOwnerRequests();
}

function renderChatPanel() {
  const title = document.getElementById("activeGroupTitle");
  const meta = document.getElementById("activeGroupMeta");
  const input = document.getElementById("chatInput");
  const button = document.getElementById("sendChatBtn");
  const feed = document.getElementById("chatMessages");
  const group = getActiveGroup();

  if (!title || !meta || !input || !button || !feed) return;

  if (!group) {
    title.textContent = "Choose a group";
    meta.textContent = "Join a group to read and send messages.";
    input.disabled = true;
    button.disabled = true;
    if (!unsubscribeMessages) feed.innerHTML = `<p class="muted">No group selected.</p>`;
    return;
  }

  const member = isMember(group.id);
  title.textContent = group.name || "Group chat";
  meta.textContent = `${group.joinMode === "approval" ? "Owner permission" : "Free join"} • Owner: ${group.ownerName || "Member"}`;
  input.disabled = !member;
  button.disabled = !member;

  if (!member) {
    feed.innerHTML = `<p class="muted">Join this group before reading or sending messages.</p>`;
  }
}

function renderOwnerRequests() {
  const card = document.getElementById("ownerRequestsCard");
  const list = document.getElementById("ownerRequestList");
  if (!card || !list) return;

  const requests = ownerRequests.filter(item => item.status === "pending");
  card.classList.toggle("hidden", !requests.length);

  if (!requests.length) {
    list.innerHTML = "";
    return;
  }

  list.innerHTML = requests.map(item => `
    <div class="admin-review-item">
      <h4>${escapeHTML(item.username || "Kigazine Member")}</h4>
      <p>Wants to join <strong>${escapeHTML(item.groupName || "a group")}</strong>.</p>
      <div class="row">
        <button class="btn btn-primary" type="button" data-approve-request="${escapeHTML(item.id)}">Approve</button>
        <button class="btn btn-secondary" type="button" data-deny-request="${escapeHTML(item.id)}">Deny</button>
      </div>
    </div>
  `).join("");
}

async function sendMessage() {
  const user = auth.currentUser;
  const group = getActiveGroup();
  const input = document.getElementById("chatInput");
  const text = input?.value.trim() || "";

  if (!user) {
    setStatus("chatStatus", "Log in before sending a message.", "error");
    return;
  }

  if (!group || !isMember(group.id)) {
    setStatus("chatStatus", "Join a group before sending messages.", "error");
    return;
  }

  if (!text) {
    setStatus("chatStatus", "Type a message first.", "error");
    return;
  }

  try {
    await addDoc(collection(db, "blogGroupMessages"), {
      groupId: group.id,
      uid: user.uid,
      username: getDisplayName(user),
      text,
      createdAt: serverTimestamp()
    });
    await updateDoc(doc(db, "blogGroups", group.id), {
      updatedAt: serverTimestamp()
    });
    input.value = "";
    setStatus("chatStatus", "Message sent.");
  } catch (error) {
    console.error("Could not send group message:", error);
    setStatus("chatStatus", `Could not send: ${error.code || error.message}`, "error");
  }
}

function subscribeToMessages(groupId) {
  const feed = document.getElementById("chatMessages");
  if (!feed) return;

  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }

  const group = groups.find(item => item.id === groupId);
  if (!group || !isMember(groupId)) {
    renderChatPanel();
    return;
  }

  feed.innerHTML = `<p class="muted">Loading messages...</p>`;
  const q = query(
    collection(db, "blogGroupMessages"),
    where("groupId", "==", groupId),
    orderBy("createdAt", "asc"),
    limit(150)
  );

  unsubscribeMessages = onSnapshot(q, snapshot => {
    const messages = [];
    snapshot.forEach(item => messages.push({ id: item.id, ...item.data() }));

    if (!messages.length) {
      feed.innerHTML = `<p class="muted">No messages yet. Start the chat.</p>`;
      return;
    }

    const user = auth.currentUser;
    feed.innerHTML = messages.map(message => {
      const mine = user && message.uid === user.uid;
      const initials = getInitials(message.username);
      const time = message.createdAt?.toDate ? message.createdAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "now";
      return `
        <div style="display:flex;gap:10px;align-items:flex-start;${mine ? "justify-content:flex-end;" : ""}">
          ${mine ? "" : `<div class="avatar small" aria-hidden="true">${initials}</div>`}
          <div style="max-width:min(720px,86%);padding:12px 14px;border-radius:18px;background:${mine ? "rgba(37,99,235,.24)" : "rgba(15,23,42,.82)"};border:1px solid rgba(148,163,184,.16);">
            <div class="mag-meta" style="margin-bottom:6px;">${escapeHTML(message.username || "Member")} · ${escapeHTML(time)}</div>
            <div style="white-space:pre-wrap;line-height:1.55;color:#dbeafe;">${escapeHTML(message.text)}</div>
            ${mine || isOwner(group) ? `<button class="btn btn-secondary" data-delete-message="${escapeHTML(message.id)}" style="margin-top:8px;padding:7px 10px;">Delete</button>` : ""}
          </div>
          ${mine ? `<div class="avatar small" aria-hidden="true">${initials}</div>` : ""}
        </div>
      `;
    }).join("");

    feed.querySelectorAll("[data-delete-message]").forEach(button => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-delete-message");
        if (!id) return;
        await deleteDoc(doc(db, "blogGroupMessages", id));
      });
    });

    feed.scrollTop = feed.scrollHeight;
  }, error => {
    console.error("Could not load group messages:", error);
    feed.innerHTML = `<p class="notice error">Could not load group messages. Check Firestore rules and indexes.</p>`;
  });
}

function subscribeRealtime(user) {
  cleanupRealtime();
  if (!user) {
    groups = [];
    memberships = [];
    pendingRequests = [];
    ownerRequests = [];
    activeGroupId = "";
    renderGroups();
    return;
  }

  unsubscribeGroups = onSnapshot(
    query(collection(db, "blogGroups"), orderBy("createdAt", "desc"), limit(80)),
    snapshot => {
      groups = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      if (activeGroupId && !groups.some(group => group.id === activeGroupId)) activeGroupId = "";
      renderGroups();
      if (activeGroupId && isMember(activeGroupId)) subscribeToMessages(activeGroupId);
    },
    error => console.error("Could not load groups:", error)
  );

  unsubscribeMemberships = onSnapshot(
    query(collection(db, "blogGroupMembers"), where("uid", "==", user.uid)),
    snapshot => {
      memberships = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      renderGroups();
      if (activeGroupId && isMember(activeGroupId)) subscribeToMessages(activeGroupId);
    },
    error => console.error("Could not load memberships:", error)
  );

  unsubscribeMyRequests = onSnapshot(
    query(collection(db, "blogGroupJoinRequests"), where("uid", "==", user.uid), where("status", "==", "pending")),
    snapshot => {
      pendingRequests = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      renderGroups();
    },
    error => console.error("Could not load join requests:", error)
  );

  unsubscribeOwnerRequests = onSnapshot(
    query(collection(db, "blogGroupJoinRequests"), where("ownerUid", "==", user.uid), where("status", "==", "pending")),
    snapshot => {
      ownerRequests = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      renderOwnerRequests();
    },
    error => console.error("Could not load owner requests:", error)
  );
}

function cleanupRealtime() {
  [unsubscribeMessages, unsubscribeGroups, unsubscribeMemberships, unsubscribeMyRequests, unsubscribeOwnerRequests].forEach(unsub => {
    if (typeof unsub === "function") unsub();
  });
  unsubscribeMessages = null;
  unsubscribeGroups = null;
  unsubscribeMemberships = null;
  unsubscribeMyRequests = null;
  unsubscribeOwnerRequests = null;
}

async function loadOnce() {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const groupSnap = await getDocs(query(collection(db, "blogGroups"), orderBy("createdAt", "desc"), limit(80)));
    groups = groupSnap.docs.map(item => ({ id: item.id, ...item.data() }));
    const memberSnap = await getDocs(query(collection(db, "blogGroupMembers"), where("uid", "==", user.uid)));
    memberships = memberSnap.docs.map(item => ({ id: item.id, ...item.data() }));
    renderGroups();
  } catch (error) {
    console.error("Could not refresh groups:", error);
  }
}

onAuthStateChanged(auth, user => {
  installBlogUI();
  subscribeRealtime(user);
  renderGroups();
  renderChatPanel();
});

window.kigazineLoadBlogs = () => {
  renderGroups();
  if (activeGroupId) subscribeToMessages(activeGroupId);
};
