/* Kigazine private messaging add-on.
   Loaded by index.html after the main Kigazine app script.
*/
(() => {
  const MAX_MESSAGE_LENGTH = 1000;
  let messagesBooted = false;
  let activeConversationUid = "";
  let activeConversationUsername = "";
  let cachedMessages = [];

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function getDb() {
    return window.db || null;
  }

  function getAuth() {
    return window.auth || null;
  }

  function getFirebaseHelper(name) {
    return window[name];
  }

  function currentUser() {
    return getAuth()?.currentUser || null;
  }

  function currentUsername() {
    return window.currentProfile?.username
      || currentUser()?.displayName
      || currentUser()?.email?.split("@")[0]
      || "Kigazine user";
  }

  function showStatus(message, type = "") {
    const box = byId("messagesStatus");
    if (!box) return;
    box.textContent = message;
    box.className = `notice${type ? ` ${type}` : ""}`;
    box.classList.remove("hidden");
  }

  function clearStatus() {
    const box = byId("messagesStatus");
    if (!box) return;
    box.textContent = "";
    box.className = "notice hidden";
  }

  function ensureStyles() {
    if (byId("kigazineMessagesStyles")) return;
    const style = document.createElement("style");
    style.id = "kigazineMessagesStyles";
    style.textContent = `
      .messages-shell {
        display: grid;
        grid-template-columns: minmax(240px, 320px) 1fr;
        gap: 16px;
        align-items: stretch;
      }
      .conversation-sidebar,
      .conversation-panel,
      .message-compose-card {
        background: rgba(15, 23, 42, .92);
        border: 1px solid #26344d;
        border-radius: 24px;
        padding: 18px;
        box-shadow: 0 18px 45px rgba(0,0,0,.35);
      }
      .messages-top-grid {
        display: grid;
        grid-template-columns: minmax(260px, 420px) 1fr;
        gap: 16px;
        margin-bottom: 16px;
      }
      .message-compose-card h3,
      .conversation-sidebar h3,
      .conversation-panel h3 { margin-top: 0; }
      .message-form { display: grid; gap: 12px; }
      .message-form textarea { min-height: 110px; resize: vertical; }
      .message-counter { color: #94a3b8; font-size: 12px; text-align: right; }
      .conversation-list {
        display: grid;
        gap: 10px;
        margin-top: 14px;
      }
      .conversation-card {
        width: 100%;
        border: 1px solid rgba(148,163,184,.16);
        background: rgba(11,20,37,.84);
        border-radius: 18px;
        padding: 14px;
        text-align: left;
        color: inherit;
        cursor: pointer;
        transition: transform .16s ease, border-color .16s ease, background .16s ease;
      }
      .conversation-card:hover {
        transform: translateY(-1px);
        border-color: rgba(96,165,250,.34);
      }
      .conversation-card.active {
        border-color: rgba(96,165,250,.58);
        background: rgba(37,99,235,.18);
      }
      .conversation-name {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        font-weight: 900;
        color: #f8fbff;
        margin-bottom: 6px;
      }
      .conversation-preview {
        color: #bfd0f4;
        font-size: 13px;
        line-height: 1.45;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .conversation-time {
        color: #94a3b8;
        font-size: 11px;
        font-weight: 700;
        white-space: nowrap;
      }
      .thread-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
        padding-bottom: 14px;
        border-bottom: 1px solid rgba(148,163,184,.16);
        margin-bottom: 14px;
      }
      .thread-title {
        margin: 0;
        font-size: 22px;
      }
      .thread-subtitle {
        color: #94a3b8;
        margin-top: 4px;
        font-size: 13px;
      }
      .thread-messages {
        display: grid;
        gap: 12px;
        min-height: 320px;
        max-height: 560px;
        overflow-y: auto;
        padding-right: 4px;
      }
      .bubble-row {
        display: flex;
      }
      .bubble-row.mine {
        justify-content: flex-end;
      }
      .bubble-row.theirs {
        justify-content: flex-start;
      }
      .bubble {
        max-width: min(78%, 560px);
        padding: 12px 14px;
        border-radius: 18px;
        border: 1px solid rgba(148,163,184,.16);
        background: rgba(11,20,37,.84);
      }
      .bubble-row.mine .bubble {
        border-color: rgba(96,165,250,.35);
        background: rgba(37,99,235,.2);
      }
      .bubble-meta {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        color: #bfd0f4;
        font-size: 11px;
        font-weight: 800;
        margin-bottom: 6px;
      }
      .bubble-copy {
        margin: 0;
        color: #dbeafe;
        white-space: pre-wrap;
        line-height: 1.6;
      }
      .message-empty {
        color: #94a3b8;
        line-height: 1.6;
      }
      @media (max-width: 1000px) {
        .messages-top-grid,
        .messages-shell {
          grid-template-columns: 1fr;
        }
        .thread-messages { min-height: 240px; }
        .bubble { max-width: 92%; }
      }
    `;
    document.head.appendChild(style);
  }

  function mountMessagesSection() {
    if (byId("messagesSection")) return;

    const nav = document.querySelector(".nav");
    const main = document.querySelector(".main");
    if (!nav || !main) return;

    const navButton = document.createElement("button");
    navButton.className = "nav-btn";
    navButton.type = "button";
    navButton.dataset.section = "messagesSection";
    navButton.textContent = "💬 Messages";
    nav.appendChild(navButton);

    const section = document.createElement("section");
    section.id = "messagesSection";
    section.className = "section";
    section.innerHTML = `
      <div class="hero">
        <span class="section-kicker">Private inbox</span>
        <h2>Messages</h2>
        <p>Conversation-style private messages, similar to an inbox thread. Pick a person on the left to see the full conversation.</p>
      </div>

      <div class="messages-top-grid">
        <div class="message-compose-card">
          <h3>Start or send a message</h3>
          <form id="kigazineMessageForm" class="message-form">
            <div>
              <label class="label" for="messageRecipient">Username</label>
              <input id="messageRecipient" class="input" maxlength="80" placeholder="Type their username" autocomplete="off" required />
            </div>
            <div>
              <label class="label" for="messageText">Message</label>
              <textarea id="messageText" class="textarea" maxlength="${MAX_MESSAGE_LENGTH}" placeholder="Write something kind..." required></textarea>
              <div id="messageCounter" class="message-counter">0 / ${MAX_MESSAGE_LENGTH}</div>
            </div>
            <button class="btn btn-primary" type="submit">Send message</button>
          </form>
          <div id="messagesStatus" class="notice hidden"></div>
        </div>

        <div class="card">
          <h3>How it works</h3>
          <p class="muted">Your conversations group together messages between you and another Kigazine user. The newest conversation appears first.</p>
          <p class="muted">When you click a conversation, the right side shows both sent and received messages in order.</p>
        </div>
      </div>

      <div class="messages-shell">
        <aside class="conversation-sidebar">
          <div class="toolbar" style="margin-bottom:0;">
            <div>
              <h3 style="margin-bottom:4px;">Conversations</h3>
              <div class="muted">Newest first</div>
            </div>
            <button id="refreshMessagesBtn" class="btn btn-secondary" type="button">Refresh</button>
          </div>
          <div id="conversationList" class="conversation-list">
            <div class="message-empty">Sign in to load conversations.</div>
          </div>
        </aside>

        <section class="conversation-panel">
          <div id="threadHeader" class="thread-header">
            <div>
              <h3 class="thread-title">Choose a conversation</h3>
              <div class="thread-subtitle">Messages will appear here.</div>
            </div>
          </div>
          <div id="threadMessages" class="thread-messages">
            <div class="message-empty">No conversation selected.</div>
          </div>
        </section>
      </div>
    `;
    main.appendChild(section);

    navButton.addEventListener("click", () => {
      if (typeof window.showSection === "function") {
        window.showSection("messagesSection");
      }
      loadMessages();
    });
  }

  function getMessagingHelpers() {
    const helpers = {
      collection: getFirebaseHelper("collection"),
      addDoc: getFirebaseHelper("addDoc"),
      getDocs: getFirebaseHelper("getDocs"),
      query: getFirebaseHelper("query"),
      where: getFirebaseHelper("where"),
      serverTimestamp: getFirebaseHelper("serverTimestamp")
    };

    const missing = Object.entries(helpers)
      .filter(([, value]) => typeof value !== "function")
      .map(([name]) => name);

    if (missing.length) {
      throw new Error(`Messaging helpers are not ready: ${missing.join(", ")}. Refresh and try again.`);
    }

    return helpers;
  }

  async function findUserByUsername(username) {
    const db = getDb();
    if (!db) throw new Error("Firestore is not ready yet.");
    const { collection, getDocs, query, where } = getMessagingHelpers();
    const q = query(collection(db, "users"), where("username", "==", username));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const docSnap = snap.docs[0];
    return { id: docSnap.id, ...docSnap.data() };
  }

  async function sendMessage(event) {
    event?.preventDefault();
    clearStatus();

    const db = getDb();
    const user = currentUser();
    const recipientUsername = byId("messageRecipient")?.value.trim();
    const textInput = byId("messageText");
    const text = textInput?.value.trim();

    if (!db) return showStatus("Firestore is not ready yet. Refresh and try again.", "error");
    if (!user) return showStatus("Please sign in before sending messages.", "error");
    if (!recipientUsername || !text) return showStatus("Enter a username and a message first.", "error");
    if (text.length > MAX_MESSAGE_LENGTH) return showStatus(`Keep messages under ${MAX_MESSAGE_LENGTH} characters.`, "error");

    try {
      const { collection, addDoc, serverTimestamp } = getMessagingHelpers();
      const recipient = await findUserByUsername(recipientUsername);
      if (!recipient) return showStatus("No Kigazine user with that username was found.", "error");
      if (recipient.id === user.uid) return showStatus("You cannot message yourself here.", "error");

      await addDoc(collection(db, "messages"), {
        fromUid: user.uid,
        fromUsername: currentUsername(),
        toUid: recipient.id,
        toUsername: recipient.username || recipientUsername,
        text,
        participants: [user.uid, recipient.id],
        createdAt: serverTimestamp(),
        createdAtClient: Date.now()
      });

      textInput.value = "";
      updateCounter();
      showStatus("Message sent!", "success");
      activeConversationUid = recipient.id;
      activeConversationUsername = recipient.username || recipientUsername;
      await loadMessages();
    } catch (error) {
      console.error("Kigazine sendMessage error:", error);
      showStatus(error?.message || "Message failed to send.", "error");
    }
  }

  function readableDate(value, fallback) {
    const date = value?.toDate?.() || (fallback ? new Date(fallback) : null);
    if (!date || Number.isNaN(date.getTime())) return "Just now";
    return date.toLocaleString();
  }

  function timestampValue(message) {
    return message.createdAt?.toMillis?.() || message.createdAtClient || 0;
  }

  function getCounterpart(message, userUid) {
    if (message.fromUid === userUid) {
      return {
        uid: message.toUid,
        username: message.toUsername || "recipient"
      };
    }
    return {
      uid: message.fromUid,
      username: message.fromUsername || "sender"
    };
  }

  function groupConversations(messages, userUid) {
    const map = new Map();

    messages.forEach(message => {
      const counterpart = getCounterpart(message, userUid);
      if (!counterpart.uid) return;

      if (!map.has(counterpart.uid)) {
        map.set(counterpart.uid, {
          uid: counterpart.uid,
          username: counterpart.username,
          messages: []
        });
      }

      const conversation = map.get(counterpart.uid);
      if (counterpart.username && counterpart.username !== "recipient" && counterpart.username !== "sender") {
        conversation.username = counterpart.username;
      }
      conversation.messages.push(message);
    });

    return Array.from(map.values())
      .map(conversation => {
        conversation.messages.sort((a, b) => timestampValue(a) - timestampValue(b));
        conversation.latest = conversation.messages[conversation.messages.length - 1];
        return conversation;
      })
      .sort((a, b) => timestampValue(b.latest) - timestampValue(a.latest));
  }

  function renderConversationList(conversations) {
    const list = byId("conversationList");
    if (!list) return;

    if (!conversations.length) {
      list.innerHTML = `<div class="message-empty">No conversations yet. Send the first message above.</div>`;
      return;
    }

    if (!activeConversationUid || !conversations.some(item => item.uid === activeConversationUid)) {
      activeConversationUid = conversations[0].uid;
      activeConversationUsername = conversations[0].username;
    }

    list.innerHTML = conversations.map(conversation => {
      const latest = conversation.latest || {};
      const isActive = conversation.uid === activeConversationUid;
      const previewPrefix = latest.fromUid === currentUser()?.uid ? "You: " : "";
      return `
        <button class="conversation-card${isActive ? " active" : ""}" type="button" data-conversation-uid="${esc(conversation.uid)}" data-conversation-name="${esc(conversation.username || "Kigazine user")}">
          <div class="conversation-name">
            <span>${esc(conversation.username || "Kigazine user")}</span>
            <span class="conversation-time">${esc(readableDate(latest.createdAt, latest.createdAtClient))}</span>
          </div>
          <div class="conversation-preview">${esc(previewPrefix + (latest.text || "No message text"))}</div>
        </button>
      `;
    }).join("");

    list.querySelectorAll("[data-conversation-uid]").forEach(button => {
      button.addEventListener("click", () => {
        activeConversationUid = button.dataset.conversationUid || "";
        activeConversationUsername = button.dataset.conversationName || "Kigazine user";
        renderConversationsFromCache();
      });
    });
  }

  function renderThread(conversations) {
    const header = byId("threadHeader");
    const thread = byId("threadMessages");
    if (!header || !thread) return;

    const selected = conversations.find(item => item.uid === activeConversationUid);
    if (!selected) {
      header.innerHTML = `
        <div>
          <h3 class="thread-title">Choose a conversation</h3>
          <div class="thread-subtitle">Messages will appear here.</div>
        </div>
      `;
      thread.innerHTML = `<div class="message-empty">No conversation selected.</div>`;
      return;
    }

    header.innerHTML = `
      <div>
        <h3 class="thread-title">${esc(activeConversationUsername || selected.username || "Kigazine user")}</h3>
        <div class="thread-subtitle">Conversation history</div>
      </div>
    `;

    thread.innerHTML = selected.messages.map(message => {
      const mine = message.fromUid === currentUser()?.uid;
      return `
        <div class="bubble-row ${mine ? "mine" : "theirs"}">
          <article class="bubble">
            <div class="bubble-meta">
              <span>${mine ? "You" : esc(message.fromUsername || selected.username || "User")}</span>
              <span>${esc(readableDate(message.createdAt, message.createdAtClient))}</span>
            </div>
            <p class="bubble-copy">${esc(message.text || "")}</p>
          </article>
        </div>
      `;
    }).join("");

    thread.scrollTop = thread.scrollHeight;
  }

  function renderConversationsFromCache() {
    const user = currentUser();
    if (!user) return;
    const conversations = groupConversations(cachedMessages, user.uid);
    renderConversationList(conversations);
    renderThread(conversations);
  }

  async function loadMessages() {
    const db = getDb();
    const user = currentUser();
    const list = byId("conversationList");
    const thread = byId("threadMessages");
    if (!list || !thread) return;

    if (!db || !user) {
      list.innerHTML = `<div class="message-empty">Sign in to load conversations.</div>`;
      thread.innerHTML = `<div class="message-empty">No conversation selected.</div>`;
      return;
    }

    try {
      const { collection, getDocs, query, where } = getMessagingHelpers();
      list.innerHTML = `<div class="message-empty">Loading conversations...</div>`;
      thread.innerHTML = `<div class="message-empty">Loading thread...</div>`;

      const q = query(
        collection(db, "messages"),
        where("participants", "array-contains", user.uid)
      );
      const snap = await getDocs(q);
      cachedMessages = snap.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
        .sort((a, b) => timestampValue(a) - timestampValue(b));

      renderConversationsFromCache();
    } catch (error) {
      console.error("Kigazine loadMessages error:", error);
      list.innerHTML = `<div class="message-empty">${esc(error?.message || "Messages could not load. Check Firestore rules and refresh.")}</div>`;
      thread.innerHTML = `<div class="message-empty">Conversation could not load.</div>`;
    }
  }

  function updateCounter() {
    const text = byId("messageText")?.value || "";
    const counter = byId("messageCounter");
    if (counter) counter.textContent = `${text.length} / ${MAX_MESSAGE_LENGTH}`;
  }

  function bindForm() {
    byId("kigazineMessageForm")?.addEventListener("submit", sendMessage);
    byId("messageText")?.addEventListener("input", updateCounter);
    byId("refreshMessagesBtn")?.addEventListener("click", loadMessages);
    updateCounter();
  }

  function observeAuthIfAvailable() {
    const auth = getAuth();
    const onAuthStateChanged = getFirebaseHelper("onAuthStateChanged");
    if (!auth || typeof onAuthStateChanged !== "function") return;
    onAuthStateChanged(auth, () => loadMessages());
  }

  function bootMessages() {
    if (messagesBooted) return;
    const nav = document.querySelector(".nav");
    const main = document.querySelector(".main");
    if (!nav || !main) {
      window.setTimeout(bootMessages, 250);
      return;
    }

    messagesBooted = true;
    ensureStyles();
    mountMessagesSection();
    bindForm();
    observeAuthIfAvailable();
    window.kigazineLoadMessages = loadMessages;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootMessages);
  } else {
    bootMessages();
  }
})();
