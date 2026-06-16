// Kigazine Club Chat Module
// Adds a Chess.com-club-style live chat with public and private rooms.
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
let activeRoom = "public";
let unsubscribeChat = null;

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

function installBlogUI() {
  if (document.getElementById(BLOG_SECTION_ID)) return;

  const nav = document.querySelector(".nav");
  if (nav && !document.getElementById(BLOG_NAV_ID)) {
    const chatBtn = document.createElement("button");
    chatBtn.id = BLOG_NAV_ID;
    chatBtn.className = "nav-btn";
    chatBtn.dataset.section = BLOG_SECTION_ID;
    chatBtn.textContent = "💬 Club Chat";
    chatBtn.addEventListener("click", () => {
      if (typeof window.showSection === "function") {
        window.showSection(BLOG_SECTION_ID);
      } else {
        document.querySelectorAll(".section").forEach(section => section.classList.remove("active"));
        document.getElementById(BLOG_SECTION_ID)?.classList.add("active");
        document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
        chatBtn.classList.add("active");
      }
      subscribeToRoom(activeRoom);
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
      <div class="section-kicker">Club Live Chat</div>
      <h2>Kigazine Club Chat 💬</h2>
      <p>Chat like a club room. Use <strong>Public Club</strong> for everyone, or <strong>Private Notes</strong> for messages only you can see.</p>
    </div>

    <div class="card" style="padding:0;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:16px;border-bottom:1px solid rgba(148,163,184,.18);">
        <div>
          <h3 style="margin:0;">Live Room</h3>
          <p class="muted" style="margin:6px 0 0;">Messages update in real time.</p>
        </div>
        <div class="row">
          <button id="publicRoomBtn" class="btn btn-primary">🌎 Public Club</button>
          <button id="privateRoomBtn" class="btn btn-secondary">🔒 Private Notes</button>
        </div>
      </div>

      <div id="chatMessages" style="height:440px;overflow-y:auto;padding:16px;display:grid;align-content:start;gap:12px;background:rgba(2,6,23,.24);">
        <p class="muted">Loading chat...</p>
      </div>

      <div style="padding:14px;border-top:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.92);">
        <div class="row" style="align-items:flex-end;">
          <textarea id="chatInput" class="input" maxlength="1000" placeholder="Type a club message..." style="min-height:48px;resize:vertical;flex:1 1 260px;"></textarea>
          <button id="sendChatBtn" class="btn btn-primary">Send</button>
        </div>
        <p class="field-help" style="margin-top:10px;">Safety: no full names, addresses, phone numbers, school names, passwords, or private details.</p>
        <div id="chatStatus" class="notice hidden" role="status" aria-live="polite"></div>
      </div>
    </div>
  `;

  main.appendChild(section);

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

function setChatStatus(text, type = "success") {
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
  subscribeToRoom(room);
}

async function sendMessage() {
  const user = auth.currentUser;
  if (!user) {
    setChatStatus("Log in before chatting.", "error");
    return;
  }

  const input = document.getElementById("chatInput");
  const text = input?.value.trim();
  if (!text) {
    setChatStatus("Type a message first.", "error");
    return;
  }

  await addDoc(collection(db, "clubChats"), {
    uid: user.uid,
    username: getDisplayName(user),
    text,
    room: activeRoom,
    visibility: activeRoom,
    createdAt: serverTimestamp()
  });

  input.value = "";
  setChatStatus(activeRoom === "private" ? "Private note sent." : "Club message sent.");
}

function subscribeToRoom(room = "public") {
  const feed = document.getElementById("chatMessages");
  if (!feed) return;

  const user = auth.currentUser;
  if (unsubscribeChat) {
    unsubscribeChat();
    unsubscribeChat = null;
  }

  if (room === "private" && !user) {
    feed.innerHTML = `<p class="muted">Log in to see private notes.</p>`;
    return;
  }

  feed.innerHTML = `<p class="muted">Loading chat...</p>`;

  let q;
  if (room === "private") {
    q = query(
      collection(db, "clubChats"),
      where("room", "==", "private"),
      where("uid", "==", user.uid),
      orderBy("createdAt", "asc"),
      limit(100)
    );
  } else {
    q = query(
      collection(db, "clubChats"),
      where("room", "==", "public"),
      orderBy("createdAt", "asc"),
      limit(100)
    );
  }

  unsubscribeChat = onSnapshot(q, snapshot => {
    const messages = [];
    snapshot.forEach(item => messages.push({ id: item.id, ...item.data() }));

    if (!messages.length) {
      feed.innerHTML = `<p class="muted">No messages yet. Start the club chat.</p>`;
      return;
    }

    feed.innerHTML = messages.map(message => {
      const isOwner = user && message.uid === user.uid;
      const initials = escapeHTML((message.username || "K").slice(0, 1).toUpperCase());
      const time = message.createdAt?.toDate ? message.createdAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "now";
      return `
        <div style="display:flex;gap:10px;align-items:flex-start;${isOwner ? "justify-content:flex-end;" : ""}">
          ${isOwner ? "" : `<div class="avatar small" aria-hidden="true">${initials}</div>`}
          <div style="max-width:min(680px,82%);padding:11px 13px;border-radius:16px;background:${isOwner ? "rgba(37,99,235,.24)" : "rgba(15,23,42,.82)"};border:1px solid rgba(148,163,184,.16);">
            <div class="mag-meta" style="margin-bottom:6px;">${escapeHTML(message.username || "Member")} · ${escapeHTML(time)} ${room === "private" ? "· 🔒" : ""}</div>
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
        await deleteDoc(doc(db, "clubChats", id));
      });
    });

    feed.scrollTop = feed.scrollHeight;
  }, error => {
    console.error("Could not load club chat:", error);
    feed.innerHTML = `<p class="notice error">Could not load chat. Check Firestore rules and indexes.</p>`;
  });
}

onAuthStateChanged(auth, () => {
  installBlogUI();
  setRoom(activeRoom);
});

window.kigazineLoadBlogs = subscribeToRoom;
