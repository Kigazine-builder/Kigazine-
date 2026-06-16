// Kigazine Blog Module
// Adds a public/private blog section to the existing Firebase app.
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
  getDocs,
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

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getDisplayName(user) {
  return user?.displayName || user?.email?.split("@")[0] || "Kigazine Writer";
}

function installBlogUI() {
  if (document.getElementById(BLOG_SECTION_ID)) return;

  const nav = document.querySelector(".nav");
  if (nav && !document.getElementById(BLOG_NAV_ID)) {
    const blogBtn = document.createElement("button");
    blogBtn.id = BLOG_NAV_ID;
    blogBtn.className = "nav-btn";
    blogBtn.dataset.section = BLOG_SECTION_ID;
    blogBtn.textContent = "📝 Blog";
    blogBtn.addEventListener("click", () => {
      if (typeof window.showSection === "function") {
        window.showSection(BLOG_SECTION_ID);
      } else {
        document.querySelectorAll(".section").forEach(section => section.classList.remove("active"));
        document.getElementById(BLOG_SECTION_ID)?.classList.add("active");
        document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
        blogBtn.classList.add("active");
      }
      loadBlogs();
    });
    nav.insertBefore(blogBtn, nav.children[nav.children.length - 1] || null);
  }

  const main = document.querySelector(".main") || document.querySelector("main");
  if (!main) return;

  const section = document.createElement("section");
  section.id = BLOG_SECTION_ID;
  section.className = "section";
  section.innerHTML = `
    <div class="hero">
      <div class="section-kicker">Public + Private</div>
      <h2>Kigazine Blog 📝</h2>
      <p>Write blog posts. Choose <strong>Public</strong> for posts other users can read, or <strong>Private</strong> for posts only you can see.</p>
    </div>

    <div class="split">
      <div class="card">
        <h3>Create Blog Post</h3>
        <div class="form-grid">
          <div class="field">
            <label class="label" for="blogTitleInput">Title</label>
            <input id="blogTitleInput" class="input" maxlength="100" placeholder="Blog title" />
          </div>

          <div class="field">
            <label class="label" for="blogContentInput">Post</label>
            <textarea id="blogContentInput" class="textarea" maxlength="8000" placeholder="Write your blog post..."></textarea>
            <p class="field-help">Safety: do not include full names, addresses, phone numbers, school names, passwords, or private details.</p>
          </div>

          <div class="field">
            <label class="label" for="blogVisibilityInput">Visibility</label>
            <select id="blogVisibilityInput" class="input">
              <option value="public">Public - other users can read it</option>
              <option value="private">Private - only you can read it</option>
            </select>
          </div>

          <button id="publishBlogBtn" class="btn btn-primary">Publish Blog Post</button>
          <div id="blogMessage" class="notice hidden" role="status" aria-live="polite"></div>
        </div>
      </div>

      <div class="card">
        <h3>Blog Feed</h3>
        <div class="row" style="margin-bottom:12px;">
          <button id="showPublicBlogsBtn" class="btn btn-secondary">Public Blogs</button>
          <button id="showMyBlogsBtn" class="btn btn-secondary">My Blogs</button>
        </div>
        <div id="blogFeed" class="mag-grid">
          <p class="muted">Loading blogs...</p>
        </div>
      </div>
    </div>
  `;

  main.appendChild(section);

  document.getElementById("publishBlogBtn")?.addEventListener("click", createBlogPost);
  document.getElementById("showPublicBlogsBtn")?.addEventListener("click", () => loadBlogs("public"));
  document.getElementById("showMyBlogsBtn")?.addEventListener("click", () => loadBlogs("mine"));
}

function setBlogMessage(text, type = "success") {
  const box = document.getElementById("blogMessage");
  if (!box) return;
  box.textContent = text;
  box.className = `notice ${type}`;
}

async function createBlogPost() {
  const user = auth.currentUser;
  if (!user) {
    setBlogMessage("Log in before posting a blog.", "error");
    return;
  }

  const title = document.getElementById("blogTitleInput")?.value.trim();
  const content = document.getElementById("blogContentInput")?.value.trim();
  const visibility = document.getElementById("blogVisibilityInput")?.value;

  if (!title || !content) {
    setBlogMessage("Add a title and blog text first.", "error");
    return;
  }

  if (!["public", "private"].includes(visibility)) {
    setBlogMessage("Choose public or private.", "error");
    return;
  }

  await addDoc(collection(db, "blogs"), {
    uid: user.uid,
    username: getDisplayName(user),
    title,
    content,
    visibility,
    status: "published",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  document.getElementById("blogTitleInput").value = "";
  document.getElementById("blogContentInput").value = "";
  setBlogMessage(visibility === "private" ? "Private blog saved." : "Public blog published.");
  loadBlogs(visibility === "private" ? "mine" : "public");
}

async function loadBlogs(mode = "public") {
  const feed = document.getElementById("blogFeed");
  if (!feed) return;

  const user = auth.currentUser;
  feed.innerHTML = `<p class="muted">Loading blogs...</p>`;

  try {
    let q;
    if (mode === "mine") {
      if (!user) {
        feed.innerHTML = `<p class="muted">Log in to see your private blogs.</p>`;
        return;
      }
      q = query(collection(db, "blogs"), where("uid", "==", user.uid), orderBy("createdAt", "desc"));
    } else {
      q = query(collection(db, "blogs"), where("visibility", "==", "public"), orderBy("createdAt", "desc"));
    }

    const snap = await getDocs(q);
    const posts = [];
    snap.forEach(item => posts.push({ id: item.id, ...item.data() }));

    if (!posts.length) {
      feed.innerHTML = `<p class="muted">No blog posts yet.</p>`;
      return;
    }

    feed.innerHTML = posts.map(post => {
      const isOwner = user && post.uid === user.uid;
      return `
        <article class="mag-card">
          <div class="mag-cover">${post.visibility === "private" ? "🔒" : "🌎"} Blog</div>
          <div class="mag-body">
            <span class="tag">${escapeHTML(post.visibility || "public")}</span>
            <h3>${escapeHTML(post.title)}</h3>
            <div class="mag-meta">By ${escapeHTML(post.username || "Unknown")}</div>
            <p class="muted" style="white-space:pre-wrap;line-height:1.6;">${escapeHTML(post.content)}</p>
            ${isOwner ? `<button class="btn btn-secondary" data-delete-blog="${post.id}">Delete</button>` : ""}
          </div>
        </article>
      `;
    }).join("");

    feed.querySelectorAll("[data-delete-blog]").forEach(button => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-delete-blog");
        if (!id) return;
        await deleteDoc(doc(db, "blogs", id));
        loadBlogs(mode);
      });
    });
  } catch (error) {
    console.error("Could not load blogs:", error);
    feed.innerHTML = `<p class="notice error">Could not load blogs. Check Firestore rules and indexes.</p>`;
  }
}

onAuthStateChanged(auth, () => {
  installBlogUI();
  loadBlogs("public");
});

window.kigazineLoadBlogs = loadBlogs;
