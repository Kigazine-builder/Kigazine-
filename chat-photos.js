/* Shared photo controls for private and group chats. */
(() => {
  const MAX_FILE_BYTES = 2 * 1024 * 1024;
  const BASE_URL = "https://us-central1-kigazine-302ac.cloudfunctions.net";
  const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const cache = new Map();
  let cachedUid = "";

  function validateFile(file) {
    if (!file || !ALLOWED_TYPES.has(file.type)) {
      throw new Error("Choose a JPEG, PNG, or WebP photo.");
    }
    if (!file.size || file.size > MAX_FILE_BYTES) {
      throw new Error("Choose a photo under 2 MB.");
    }
  }

  function readPhoto(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read this photo. Try again."));
      reader.readAsDataURL(file);
    });
  }

  function bindPicker({ input, dropZone, preview, removeButton, onError }) {
    let selected = null;
    let previewUrl = "";
    let uploadId = "";

    function clear() {
      selected = null;
      uploadId = "";
      input.value = "";
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = "";
      preview.removeAttribute("src");
      preview.hidden = true;
      removeButton.hidden = true;
    }

    function select(file) {
      if (input.disabled) return;
      try {
        validateFile(file);
        clear();
        selected = file;
        uploadId = crypto.randomUUID();
        previewUrl = URL.createObjectURL(file);
        preview.src = previewUrl;
        preview.hidden = false;
        removeButton.hidden = false;
        onError("");
      } catch (error) {
        clear();
        onError(error.message);
      }
    }

    input.addEventListener("change", () => input.files?.[0] && select(input.files[0]));
    removeButton.addEventListener("click", () => { if (!input.disabled) clear(); });
    dropZone.addEventListener("dragover", event => {
      event.preventDefault();
      dropZone.classList.add("drag-active");
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-active"));
    dropZone.addEventListener("drop", event => {
      event.preventDefault();
      dropZone.classList.remove("drag-active");
      if (event.dataTransfer?.files?.[0]) select(event.dataTransfer.files[0]);
    });
    return { file: () => selected, uploadId: () => uploadId, clear };
  }

  async function upload({ mode, toUid, groupId, text, file, uploadId, onProgress, user = window.auth?.currentUser }) {
    validateFile(file);
    if (!user) throw new Error("Sign in before sending photos.");
    onProgress("Preparing photo…");
    const [dataUrl, token] = await Promise.all([readPhoto(file), user.getIdToken()]);
    const body = JSON.stringify({ mode, toUid, groupId, text, uploadId,
      contentType: file.type, dataUrl });
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", `${BASE_URL}/uploadChatPhoto`);
      request.setRequestHeader("Authorization", `Bearer ${token}`);
      request.setRequestHeader("Content-Type", "application/json");
      request.upload.onprogress = event => {
        if (event.lengthComputable) onProgress(`Uploading photo: ${Math.round(event.loaded / event.total * 100)}%`);
      };
      request.onload = () => {
        let response = {};
        try { response = JSON.parse(request.responseText); } catch { /* show generic error */ }
        if (request.status >= 200 && request.status < 300) resolve(response);
        else reject(new Error(response.error || "Photo upload failed. Retry sending."));
      };
      request.onerror = () => reject(new Error("Photo upload failed. Check your connection and retry."));
      request.send(body);
    });
  }

  function clearCache() {
    for (const url of cache.values()) URL.revokeObjectURL(url);
    cache.clear();
  }

  async function photoUrl(mode, messageId, user) {
    if (!user) throw new Error("Sign in to view this photo.");
    if (cachedUid !== user.uid) {
      clearCache();
      cachedUid = user.uid;
    }
    const key = `${mode}:${messageId}`;
    if (cache.has(key)) return cache.get(key);
    const token = await user.getIdToken();
    const params = new URLSearchParams({ mode, messageId });
    const response = await fetch(`${BASE_URL}/getChatPhoto?${params}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store"
    });
    if (!response.ok) throw new Error("Photo unavailable. Retry loading it.");
    const url = URL.createObjectURL(await response.blob());
    cache.set(key, url);
    return url;
  }

  function hydrate(container, user = window.auth?.currentUser) {
    container.querySelectorAll("[data-chat-photo-id]").forEach(image => {
      const retry = image.parentElement.querySelector("[data-chat-photo-retry]");
      const load = async () => {
        retry.hidden = true;
        image.alt = "Loading chat photo";
        try {
          image.src = await photoUrl(image.dataset.chatPhotoMode, image.dataset.chatPhotoId, user);
          image.hidden = false;
          image.alt = "Photo attached to chat message";
        } catch {
          image.hidden = true;
          retry.hidden = false;
        }
      };
      retry.addEventListener("click", load);
      load();
    });
  }

  window.kigazineChatPhotos = { bindPicker, upload, hydrate, clearCache, validateFile };
})();
