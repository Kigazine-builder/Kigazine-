/* Kigazine private messaging add-on.
   Loaded by index.html after the main Kigazine app script.
*/

(() => {
  const MAX_MESSAGE_LENGTH = 1000;
  let messagesBooted = false;
  let messagesUnsubscribe = null;

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
    return window.db || window.firestoreDb || null;
  }

  function getAuth() {
    return window.auth || null;
  }

  function currentUser() {
    const auth = getAuth();
    return auth?.currentUser || window.currentUser || null;
  }

  function currentUsername() {
    return window.currentUsername
      || window.currentUserProfile?.username
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
      .messages-layout {
        display: grid;
        grid-template-columns: minmax(260px, 360px) 1fr;
        gap: 16px;
        align-items: start;
      }
      .message-compose,
      .message-inbox {
        background: rgba(15, 23, 42, .92);
        border: 1px solid #26344d;
        border-radius: 24px;
        padding: 18px;
        box-shadow: 0 18px 45px rgba(0,0,0,.35);
      }
      .message-compose h3,
      .message-inbox h3 {
        margin-top: 0;
      }
      .message-form {
        display: grid;
        gap: 12px;
      }
      .message-form textarea {
        min-height: 130px;
        resize: vertical;
      }
      .message-help {
        margin: 0;
        color: #94a3b8;
        line-height: 1.55;
        font-size: 13px;
      }
      .message-list {
        display: grid;
        gap: 12px;
      }
      .message-item {
        padding: 14px;
        border-radius: 18px;
        border: 1px solid rgba(148,163,184,.16);
        background: rgba(11,20,37,.84);
      }
      .message-item.mine {
        border-color: rgba(96,165,250,.26);
        background: rgba(37,99,235,.12);
      }
      .message-meta {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        color: #bfd0f4;
        font-size: 12px;
        font-weight: 800;
        margin-bottom: 8px;
      }
      .message-copy {
        color: #dbeafe;
        white-space: pre-wrap;
        line-height: 1.6;
        margin: 0;
      }
      .message-empty {
        color: #94a3b8;
        line-height: 1.6;
      }
      .message-counter {
        color: #94a3b8;
        font-size: 12px;
        text-align: right;
      }
      @media (max-width: 900px) {
        .messages-layout {
          grid-template-columns: 1fr;
        }
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
    navButton.dataset.section = "messages";
    navButton.textContent = "💬 Messages";
    nav.appendChild(navButton);

    const section = document.createElement("section");
    section.id = "messagesSection";
    section.className = "section";
    section.dataset.sectionPanel = "messages";
    section.innerHTML = `
      <div class="hero">
        <span class="section-kicker">Private inbox</span>
        <h2>Messages</h2>
        <p>Send a private message to another Kigazine user by username. Only the people in the message can read it.</p>
      </div>

      <div class="messages-layout">
        <div class="message-compose">
          <h3>Send a message</h3>
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
            <p class="message-help">Messages are private in Firestore: the sender and recipient can read them.</p>
          </form>
          <div id="messagesStatus" class="notice hidden"></div>
        </div>

        <div class="message-inbox">
          <div class="toolbar">
            <div>
              <h3 style="margin-bottom:4px;">Inbox</h3>
              <div class="muted">Newest messages first</div>
            </div>
            <button id="refreshMessagesBtn" class="btn btn-secondary" type="button">Refresh</button>
          </div>
          <div id="messageList" class="message-list">
            <div class="message-empty">Sign in to load messages.</div>
          </div>
        </div>
      </div>
    `;
    main.appendChild(section);

    bindSectionButton(navButton);
  }

  function sectionButtons() {
    return Array.from(document.querySelectorAll(".nav-btn"));
  }

  function sectionPanels() {
    return Array.from(document.querySelectorAll(".section"));
  }

  function normalizeSectionNameFromButton(button) {
    return button.dataset.section
      || button.getAttribute("data-target")
      || button.textContent?.trim()?.toLowerCase().replace(/[^a-z]+/g, "")
      || "";
  }

  function normalizeSectionNameFromPanel(panel) {
    return panel.dataset.sectionPanel
      || panel.dataset.section
      || panel.id?.replace(/Section$/i, "").replace(/^section[-_]?/i, "")
      || "";
  }

  function activateMessagesSection() {
    sectionButtons().forEach((button) => {
      const isMessages = normalizeSectionNameFromButton(button) === "messages";
      button.classList.toggle("active", isMessages);
    });

    sectionPanels().forEach((panel) => {
      const isMessages = normalizeSectionNameFromPanel(panel) === "messages" || panel.id === "messagesSection";
      panel.classList.toggle("active", isMessages);
    });

    loadMessages();
  }

  function bindSectionButton(button) {
    button.addEventListener("click", () => {
      activateMessagesSection();
    });
  }

  async function findUserByUsername(username) {
    const db = getDb();
    if (!db) throw new Error("Firestore is not ready yet.");

    if (typeof db.collection === "function") {
      const snap = await db.collection("users")
        .where("username", "==", username)
        .limit(1)
        .get();
      if (snap.empty) return null;
      const doc = snap.docs[0];
      return { id: doc.id, ...doc.data() };
    }

    throw new Error("This messaging add-on expects the current Firestore compat setup.");
  }

  async function sendMessage(event) {
    event?.preventDefault();
    clearStatus();

    const db = getDb();
    const user = currentUser();
    const recipientInput = byId("messageRecipient");
    const textInput = byId("messageText");
    const recipientUsername = recipientInput?.value.trim();
    const text = textInput?.value.trim();

    if (!db) {
      showStatus("Firestore is not ready yet. Refresh and try again.", "error");
      return;
    }
    if (!user) {
      showStatus("Please sign in before sending messages.", "error");
      return;
    }
    if (!recipientUsername || !text) {
      showStatus("Enter a username and a message first.", "error");
      return;
    }
    if (text.length > MAX_MESSAGE_LENGTH) {
      showStatus(`Keep messages under ${MAX_MESSAGE_LENGTH} characters.`, "error");
      return;
    }

    try {
      const recipient = await findUserByUsername(recipientUsername);
      if (!recipient) {
        showStatus("No Kigazine user with that username was found.", "error");
        return;
      }
      if (recipient.id === user.uid) {
        showStatus("You cannot message yourself here. Try another username.", "error");
        return;
      }

      await db.collection("messages").add({
        fromUid: user.uid,
        fromUsername: currentUsername(),
        toUid: recipient.id,
        toUsername: recipient.username || recipientUsername,
        text,
        participants: [user.uid, recipient.id],
        createdAt: window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date(),
        createdAtClient: Date.now()
      });

      textInput.value = "";
      updateCounter();
      showStatus("Message sent!", "success");
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

  function renderMessages(docs) {
    const list = byId("messageList");
    const user = currentUser();
    if (!list) return;

    if (!docs.length) {
      list.innerHTML = `<div class="message-empty">No messages yet. Send the first one.</div>`;
      return;
    }

    list.innerHTML = docs.map((doc) => {
      const data = typeof doc.data === "function" ? doc.data() : doc;
      const mine = data.fromUid === user?.uid;
      const counterpart = mine ? (data.toUsername || "recipient") : (data.fromUsername || "sender");
      const label = mine ? `To ${counterpart}` : `From ${counterpart}`;
      return `
        <article class="message-item${mine ? " mine" : ""}">
          <div class="message-meta">
            <span>${esc(label)}</span>
            <span>${esc(readableDate(data.createdAt, data.createdAtClient))}</span>
          </div>
          <p class="message-copy">${esc(data.text)}</p>
        </article>
      `;
    }).join("");
  }

  async function loadMessages() {
    const db = getDb();
    const user = currentUser();
    const list = byId("messageList");
    if (!list) return;

    if (!db || !user) {
      list.innerHTML = `<div class="message-empty">Sign in to load messages.</div>`;
      return;
    }

    try {
      list.innerHTML = `<div class="message-empty">Loading messages...</div>`;
      const snap = await db.collection("messages")
        .where("participants", "array-contains", user.uid)
        .get();

      const docs = snap.docs.slice().sort((a, b) => {
        const ad = a.data();
        const bd = b.data();
        const at = ad.createdAt?.toMillis?.() || ad.createdAtClient || 0;
        const bt = bd.createdAt?.toMillis?.() || bd.createdAtClient || 0;
        return bt - at;
      });
      renderMessages(docs);
    } catch (error) {
      console.error("Kigazine loadMessages error:", error);
      list.innerHTML = `<div class="message-empty">Messages could not load. Check Firestore rules and refresh.</div>`;
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
    if (!auth?.onAuthStateChanged) return;
    auth.onAuthStateChanged(() => {
      loadMessages();
    });
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
    window.kigazineSendMessage = sendMessage;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootMessages);
  } else {
    bootMessages();
  }
})();
