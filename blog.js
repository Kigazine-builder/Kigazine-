// Kigazine Blog Club Module
// Discord-style joined blog club with Firestore database.
// Public means public inside the joined blog club, not public to the whole internet.
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
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  deleteDoc
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
const BLOG_CLUB_ID = "main";
let activeRoom = "public";
let unsubscribeChat = null;
let isBlogMember = false;

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

function membershipRef(user) {
  return doc(db, "blogClubs", BLOG_CLUB_ID, "members", user.uid);
}

async function checkMembership(user) {
  if (!user) {
    isBlogMember = false;
    return false;
  }
  const snap = await getDoc(membershipRef(user));
  isBlogMember = snap.exists();
  return isBlogMember;
}

async function joinBlogClub() {
  const user = auth.currentUser;
  if (!user) {
    setClubStatus("Log in before joining the blog club.", "error");
    return;
  }

  await setDoc(membershipRef(user), {
    uid: user.uid,
    username: getDisplayName(user),
    email: user.email || null,
    role: "member",
    joinedAt: serverTimestamp()
  }, { merge: true });

  isBlogMember = true;
  renderGateState();
  subscribeToRoom(activeRoom);
  setClubStatus("You joined the Kigazine Blog Club.");
}

function installBlogUI() {
  if (document.getElementById(BLOG_SECTION_ID)) return;

  const nav = document.querySelector(".nav");
  if (nav && !document.getElementById(BLOG_NAV_ID)) {
    const chatBtn = document.createElement("button");
    chatBtn.id = BLOG_NAV_ID;
    chatBtn.className = "nav-btn";
    chatBtn.dataset.section = BLOG_SECTION_ID;
    chatBtn.textContent = "💬 Blog Club";
    chatBtn.addEventListener("click", () => {
      if (typeof window.showSection === "function") {
        window.showSection(BLOG_SECTION_ID);
      } else {
        document.querySelectorAll(".section").forEach(section => section.classList.remove("active"));
        document.getElementById(BLOG_SECTION_ID)?.classList.add("active");
        document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
        chatBtn.classList.add("active");
      }
      renderGateState();
      if (isBlogMember) subscribeToRoom(activeRoom);
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
      <div class="section-kicker">Joined Blog Club</div>
      <h2>Kigazine Blog Club 💬</h2>
      <p>A Discord-style club space. You must <strong>join the blog club</strong> before reading or posting. Public means public to joined club members.</p>
    </div>

    <div id="blogJoinGate" class="card" style="display:none;margin-bottom:18px;border-color:rgba(96,165,250,.28);">
      <h3>Join the Kigazine Blog Club</h3>
      <p class="muted" style="line-height:1.6;">Join to unlock the public club feed and your private notes. Keep messages kind, safe, and school-appropriate.</p>
      <button id="joinBlogClubBtn" class="btn btn-primary" style="margin-top:12px;">Join Blog Club</button>
    </div>

    <div id="blogClubPanel" class="card" style="padding:0;overflow:hidden;display:none;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:16px;border-bottom:1px solid rgba(148,163,184,.18);">
        <div>
          <h3 style="margin:0;">Club Feed</h3>
          <p class="muted" style="margin:6px 0 0;">Real-time database messages. Public posts are visible to joined members only.</p>
        </div>
        <div class="row">
          <button id="publicRoomBtn" class="btn btn-primary">🌎 Club Public</button>
          <button id="privateRoomBtn" class="btn btn-secondary">🔒 Private Notes</button>
        </div>
      </div>

      <div id="chatMessages" style="height:440px;overflow-y:auto;padding:16px;display:grid;align-content:start;gap:12px;background:rgba(2,6,23,.24);">
        <p class="muted">Loading blog club...</p>
      </div>

      <div style="padding:14px;border-top:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.92);">
        <div class="row" style="align-items:flex-end;">
          <textarea id="chatInput" class="input" maxlength="1000" placeholder="Write a blog club post..." style="min-height:48px;resize:vertical;flex:1 1 260px;"></textarea>
          <button id="sendChatBtn" class="btn btn-primary">Post</button>
        </div>
        <p class="field-help" style="margin-top:10px;">Safety: no full names, addresses, phone numbers, school names, passwords, or private details.</p>
        <div id="chatStatus" class="notice hidden" role="status" aria-live="polite"></div>
      </div>
    </div>
  `;

  main.appendChild(section);

  document.getElementById("joinBlogClubBtn")?.addEventListener("click", joinBlogClub);
  document.getElementById("publicRoomBtn")?.addEventListener("click", () => setRoom("public"));
  document.getElementById("privateRoomBtn")?.addEventListener("click", () => setRoom("private"));
  document.getElementById("sendChatBtn")?.addEventListener("click", sendMessage);
  document.getElementById("chatInput")?.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
}

function renderGateState() {
  const gate = document.getElementById("blogJoinGate");
  const panel = document.getElementById("blogClubPanel");
  const user = auth.currentUser;

  if (!gate || !panel) return;

  if (!user || !isBlogMember) {
    gate.style.display = "block";
    panel.style.display = "none";
    if (unsubscribeChat) {
      unsubscribeChat();
      unsubscribeChat = null;
    }
  } else {
    gate.style.display = "none";
    panel.style.display = "block";
  }
}

function setClubStatus(text, type = "success") {
  const box = document.getElementById("chatStatus");
  if (!box) return;
  box.textContent = text;
  box.className = `notice ${type}`;
}

function setRoom(room) {
  activeRoom = room;
  document.getElementById("publicRoomBtn")?.classList.toggle("btn-primary", room === "public");
  document.getElementById("publicRoomBtn")?.classList.toggle("btn-secondary", room !== "public");
  document.getElementById("privateRoomBtn")?.classList.toggle("btn-primary", room === "private");
  document.getElementById("privateRoomBtn")?.classList.toggle("btn-secondary", room !== "private");
  if (isBlogMember) subscribeToRoom(room);
}

async function sendMessage() {
  const user = auth.currentUser;
  if (!user) {
    setClubStatus("Log in before posting.", "error");
    return;
  }

  if (!isBlogMember) {
    setClubStatus("Join the blog club before posting.", "error");
    return;
  }

  const input = document.getElementById("chatInput");
  const text = input?.value.trim();
  if (!text) {
    setClubStatus("Type a post first.", "error");
    return;
  }

  await addDoc(collection(db, "blogClubPosts"), {
    clubId: BLOG_CLUB_ID,
    uid: user.uid,
    username: getDisplayName(user),
    text,
    room: activeRoom,
    visibility: activeRoom,
    createdAt: serverTimestamp()
  });

  input.value = "";
  setClubStatus(activeRoom === "private" ? "Private note saved." : "Club post sent.");
}

function subscribeToRoom(room = "public") {
  const feed = document.getElementById("chatMessages");
  if (!feed) return;

  const user = auth.currentUser;
  if (unsubscribeChat) {
    unsubscribeChat();
    unsubscribeChat = null;
  }

  if (!user || !isBlogMember) {
    feed.innerHTML = `<p class="muted">Join the blog club to view posts.</p>`;
    return;
  }

  feed.innerHTML = `<p class="muted">Loading blog club...</p>`;

  let q;
  if (room === "private") {
    q = query(
      collection(db, "blogClubPosts"),
      where("clubId", "==", BLOG_CLUB_ID),
      where("room", "==", "private"),
      where("uid", "==", user.uid),
      orderBy("createdAt", "asc"),
      limit(100)
    );
  } else {
    q = query(
      collection(db, "blogClubPosts"),
      where("clubId", "==", BLOG_CLUB_ID),
      where("room", "==", "public"),
      orderBy("createdAt", "asc"),
      limit(100)
    );
  }

  unsubscribeChat = onSnapshot(q, snapshot => {
    const messages = [];
    snapshot.forEach(item => messages.push({ id: item.id, ...item.data() }));

    if (!messages.length) {
      feed.innerHTML = `<p class="muted">No posts yet. Start the blog club.</p>`;
      return;
    }

    feed.innerHTML = messages.map(message => {
      const isOwner = user && message.uid === user.uid;
      const initials = escapeHTML((message.username || "K").slice(0, 1).toUpperCase());
      const time = message.createdAt?.toDate ? message.createdAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "now";
      return `
        <div style="display:flex;gap:10px;align-items:flex-start;${isOwner ? "justify-content:flex-end;" : ""}">
          ${isOwner ? "" : `<div class="avatar small" aria-hidden="true">${initials}</div>`}
          <div style="max-width:min(720px,86%);padding:12px 14px;border-radius:18px;background:${isOwner ? "rgba(37,99,235,.24)" : "rgba(15,23,42,.82)"};border:1px solid rgba(148,163,184,.16);">
            <div class="mag-meta" style="margin-bottom:6px;">${escapeHTML(message.username || "Member")} · ${escapeHTML(time)} ${room === "private" ? "· 🔒 Private" : "· 🌎 Club Public"}</div>
            <div style="white-space:pre-wrap;line-height:1.55;color:#dbeafe;">${escapeHTML(message.text)}</div>
            ${isOwner ? `<button class="btn btn-secondary" data-delete-chat="${message.id}" style="margin-top:8px;padding:7px 10px;">Delete</button>` : ""}
          </div>
          ${isOwner ? `<div class="avatar small" aria-hidden="true">${initials}</div>` : ""}
        </div>
      `;
    }).join("");

    feed.querySelectorAll("[data-delete-chat]").forEach(button => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-delete-chat");
        if (!id) return;
        await deleteDoc(doc(db, "blogClubPosts", id));
      });
    });

    feed.scrollTop = feed.scrollHeight;
  }, error => {
    console.error("Could not load blog club:", error);
    feed.innerHTML = `<p class="notice error">Could not load blog club. Check Firestore rules and indexes.</p>`;
  });
}

onAuthStateChanged(auth, async user => {
  installBlogUI();
  await checkMembership(user);
  renderGateState();
  if (isBlogMember) setRoom(activeRoom);
});

window.kigazineLoadBlogs = subscribeToRoom;
