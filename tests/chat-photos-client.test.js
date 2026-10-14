import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../chat-photos.js", import.meta.url), "utf8");

function client({ uploadReplies = [], photoReplies = [] } = {}) {
  const requests = [];
  const user = { uid: "alice", getIdToken: async () => "signed-token" };
  const window = { auth: { currentUser: user } };
  const objectUrls = [];
  class FileReader {
    readAsDataURL() {
      this.result = "data:image/jpeg;base64,YQ==";
      queueMicrotask(() => this.onload());
    }
  }
  class XMLHttpRequest {
    constructor() { this.upload = {}; this.headers = {}; }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(key, value) { this.headers[key] = value; }
    send(body) {
      requests.push({ method: this.method, url: this.url, headers: this.headers, body: JSON.parse(body) });
      this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 });
      const reply = uploadReplies.shift() || { status: 200, body: { messageId: "photo-1" } };
      this.status = reply.status;
      this.responseText = JSON.stringify(reply.body);
      queueMicrotask(() => this.onload());
    }
  }
  const context = {
    window, FileReader, XMLHttpRequest, URLSearchParams, crypto: { randomUUID: () => "id-1" },
    URL: {
      createObjectURL: blob => {
        const url = `blob:photo-${objectUrls.length + 1}`;
        objectUrls.push({ url, blob });
        return url;
      },
      revokeObjectURL: () => {}
    },
    fetch: async () => photoReplies.shift() || { ok: true, blob: async () => ({}) }
  };
  vm.runInNewContext(source, context);
  return { api: window.kigazineChatPhotos, requests, user, objectUrls };
}

test("upload progress is reported and failed sends remain retryable", async () => {
  const { api, requests } = client({ uploadReplies: [
    { status: 503, body: { error: "Storage is unavailable" } },
    { status: 200, body: { messageId: "photo-1" } }
  ] });
  const progress = [];
  const options = { mode: "direct", toUid: "bob", text: "hello",
    file: { type: "image/jpeg", size: 1 }, uploadId: "same-id",
    onProgress: message => progress.push(message) };
  await assert.rejects(api.upload(options), /Storage is unavailable/);
  assert.equal((await api.upload(options)).messageId, "photo-1");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body.uploadId, requests[1].body.uploadId);
  assert.equal(requests[0].headers.Authorization, "Bearer signed-token");
  assert.ok(progress.includes("Uploading photo: 50%"));
});

test("message photo loading shows a retry control after an access error", async () => {
  const { api } = client({ photoReplies: [
    { ok: false },
    { ok: true, blob: async () => ({ type: "image/jpeg" }) }
  ] });
  const retry = { hidden: true, addEventListener: (name, fn) => { retry.click = fn; } };
  const image = {
    dataset: { chatPhotoMode: "group", chatPhotoId: "message-1" },
    parentElement: { querySelector: () => retry }, hidden: true, alt: ""
  };
  api.hydrate({ querySelectorAll: () => [image] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(retry.hidden, false);
  await retry.click();
  assert.equal(retry.hidden, true);
  assert.equal(image.hidden, false);
  assert.equal(image.src, "blob:photo-1");
});
