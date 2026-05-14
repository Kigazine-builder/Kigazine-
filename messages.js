/* Kigazine private messaging add-on.
   Loaded by index.html after the main Kigazine app script.
*/
const {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  onAuthStateChanged
} = window;

(() => {
  const MAX_MESSAGE_LENGTH = 1000;
  let messagesBooted = false;

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
        <p>Send a private message to another Kigazine user by username. Only the sender and recipient can read it.</p>
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

    navButton.addEventListener("click", () => {
      if (typeof window.showSection === "function") {
        window.showSection("messagesSection");
      }
      loadMessages();
    });
  }

  async function findUserByUsername(username) {
    const db = getDb();
    if (!db) throw new Error("Firestore is not ready yet.");
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

    list.innerHTML = docs.map(docSnap => {
      const data = docSnap.data();
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
      const q = query(collection(db, "messages"), where("participants", "array-contains", user.uid));
      const snap = await getDocs(q);
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
