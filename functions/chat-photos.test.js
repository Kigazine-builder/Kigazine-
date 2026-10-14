const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const admin = require("firebase-admin");
const { decodePhoto, sanitizePhoto, MAX_USER_BYTES } = require("./chat-photos-core");
admin.initializeApp({ projectId: "chat-photo-tests", storageBucket: "chat-photo-tests.appspot.com" });

function memoryServices() {
  const documents = new Map();
  const files = new Map();
  let failSave = false;
  const snap = path => ({ exists: documents.has(path), data: () => documents.get(path) });
  const ref = path => ({
    id: path.split("/").at(-1),
    get: async () => snap(path),
    create: async data => {
      if (documents.has(path)) throw new Error("already-exists");
      documents.set(path, data);
    },
    update: async data => documents.set(path, { ...documents.get(path), ...data })
  });
  const db = {
    collection: name => ({ doc: id => ref(`${name}/${id}`) }),
    runTransaction: async callback => callback({
      get: async document => document.get(),
      set: (document, data) => documents.set(`${documentPath(document)}`, {
        ...documents.get(documentPath(document)), ...data
      }),
      update: (document, data) => documents.set(documentPath(document), {
        ...documents.get(documentPath(document)), ...data
      }),
      delete: document => documents.delete(documentPath(document))
    })
  };
  function documentPath(document) {
    // The reference only exposes its id, so find its collection by identity.
    return document._path;
  }
  // Give refs their path for the transaction mock.
  db.collection = name => ({ doc: id => ({ ...ref(`${name}/${id}`), _path: `${name}/${id}` }) });
  const bucket = { file: path => ({
    save: async bytes => {
      if (failSave) throw new Error("storage offline");
      files.set(path, bytes);
    },
    download: async () => {
      if (!files.has(path)) throw new Error("not found");
      return [files.get(path)];
    },
    delete: async () => files.delete(path)
  }) };
  return { db, bucket, documents, files, setFailSave: value => { failSave = value; } };
}

async function photoBody(uploadId = "11111111-1111-4111-8111-111111111111") {
  const photo = await sharp({ create: { width: 20, height: 20, channels: 3,
    background: { r: 120, g: 80, b: 50 } } }).jpeg().toBuffer();
  return { mode: "direct", toUid: "bob", text: "hello", uploadId,
    contentType: "image/jpeg", dataUrl: `data:image/jpeg;base64,${photo.toString("base64")}` };
}

function loadService(services) {
  const firestore = admin.firestore();
  firestore.collection = services.db.collection;
  firestore.runTransaction = services.db.runTransaction;
  admin.storage().bucket = () => services.bucket;
  delete require.cache[require.resolve("./chat-photos")];
  return require("./chat-photos")._test;
}

function seedDirect(services) {
  services.documents.set("users/alice", { username: "Alice", friendUids: ["bob"] });
  services.documents.set("users/bob", { username: "Bob", friendUids: ["alice"], discoverableProfile: false });
}

test("server rejects spoofed photo types and strips EXIF when re-encoding", async () => {
  const bytes = await sharp({ create: { width: 10, height: 10, channels: 3,
    background: "red" } }).jpeg().withExif({ IFD0: { Artist: "private metadata" } }).toBuffer();
  const dataUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;
  assert.throws(() => decodePhoto(dataUrl, "image/png"), /JPEG, PNG, or WebP/);
  const cleaned = await sanitizePhoto(decodePhoto(dataUrl, "image/jpeg"), "image/jpeg", sharp);
  assert.equal((await sharp(cleaned).metadata()).exif, undefined);
});

test("sending saves one photo message and authorized participants can load it", async () => {
  const services = memoryServices();
  seedDirect(services);
  const { sendChatPhoto, loadChatPhoto } = loadService(services);
  const result = await sendChatPhoto("alice", await photoBody());
  const stored = services.documents.get(`messages/${result.messageId}`);
  assert.deepEqual(stored.participants, ["alice", "bob"]);
  assert.equal(stored.photo.contentType, "image/jpeg");
  assert.ok(services.files.has(stored.photo.path));
  assert.deepEqual(await loadChatPhoto("bob", "direct", result.messageId), services.files.get(stored.photo.path));
  assert.deepEqual(await sendChatPhoto("alice", await photoBody()), { messageId: result.messageId, alreadySent: true });
  assert.equal(services.documents.get("chatPhotoUsage/alice").bytes, stored.photo.size);
});

test("failed storage upload releases quota and can be retried", async () => {
  const services = memoryServices();
  seedDirect(services);
  const { sendChatPhoto } = loadService(services);
  const body = await photoBody();
  services.setFailSave(true);
  await assert.rejects(sendChatPhoto("alice", body), /storage offline/);
  assert.equal(services.documents.get("chatPhotoUsage/alice").bytes, 0);
  assert.equal(services.documents.has(`chatPhotoUploads/alice_direct_${body.uploadId}`), false);
  services.setFailSave(false);
  assert.ok((await sendChatPhoto("alice", body)).messageId);
});

test("photo reads require a direct participant or current group membership", async () => {
  const services = memoryServices();
  seedDirect(services);
  services.documents.set("users/stranger", { username: "Stranger" });
  services.documents.set("blogGroups/club", { ownerUid: "alice" });
  services.documents.set("blogGroupMembers/club_bob", { uid: "bob", groupId: "club" });
  const { sendChatPhoto, loadChatPhoto } = loadService(services);
  const direct = await sendChatPhoto("alice", await photoBody());
  await assert.rejects(loadChatPhoto("stranger", "direct", direct.messageId), /cannot view/);
  const group = await sendChatPhoto("alice", {
    ...await photoBody("22222222-2222-4222-8222-222222222222"), mode: "group", groupId: "club"
  });
  assert.ok((await loadChatPhoto("bob", "group", group.messageId)).length);
  services.documents.delete("blogGroupMembers/club_bob");
  await assert.rejects(loadChatPhoto("bob", "group", group.messageId), /Join this group/);
});

test("quota rejects another photo once the 50 MB limit is reached", async () => {
  const services = memoryServices();
  seedDirect(services);
  services.documents.set("chatPhotoUsage/alice", { bytes: MAX_USER_BYTES });
  const { sendChatPhoto } = loadService(services);
  await assert.rejects(sendChatPhoto("alice", await photoBody()), /50 MB storage limit/);
});
