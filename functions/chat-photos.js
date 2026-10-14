const admin = require("firebase-admin");
const sharp = require("sharp");
const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentDeleted } = require("firebase-functions/v2/firestore");
const {
  ChatPhotoError, MAX_USER_BYTES, PHOTO_BUCKET, ID_PATTERN, MESSAGE_ID_PATTERN, UPLOAD_ID_PATTERN,
  decodePhoto, sanitizePhoto, directParticipants, groupParticipant, canReadPhoto,
  photoPath, messageCollection, requireValue
} = require("./chat-photos-core");

const db = admin.firestore();
const bucket = admin.storage().bucket(PHOTO_BUCKET);

async function authenticatedUid(req) {
  const token = /^Bearer (.+)$/.exec(req.get("authorization") || "")?.[1];
  requireValue(token, 401, "Sign in before sending or viewing photos.");
  try {
    return (await admin.auth().verifyIdToken(token)).uid;
  } catch {
    throw new ChatPhotoError(401, "Your sign-in expired. Sign in again.");
  }
}

async function reserveUpload(uid, messageId, bytes) {
  const receiptRef = db.collection("chatPhotoUploads").doc(messageId);
  const usageRef = db.collection("chatPhotoUsage").doc(uid);
  return db.runTransaction(async transaction => {
    const [receipt, usage] = await Promise.all([
      transaction.get(receiptRef), transaction.get(usageRef)
    ]);
    if (receipt.exists) {
      const state = receipt.data().state;
      if (state === "complete") return "complete";
      throw new ChatPhotoError(409, "This upload is still finishing. Retry in a moment.");
    }
    const next = (usage.data()?.bytes || 0) + bytes;
    requireValue(next <= MAX_USER_BYTES, 413,
      "Your chat photos have reached the 50 MB storage limit.");
    transaction.set(usageRef, { bytes: next }, { merge: true });
    transaction.set(receiptRef, { uid, bytes, state: "pending", createdAt: Date.now() });
    return "reserved";
  });
}

async function releaseUpload(uid, messageId) {
  const receiptRef = db.collection("chatPhotoUploads").doc(messageId);
  const usageRef = db.collection("chatPhotoUsage").doc(uid);
  await db.runTransaction(async transaction => {
    const [receipt, usage] = await Promise.all([
      transaction.get(receiptRef), transaction.get(usageRef)
    ]);
    if (!receipt.exists || receipt.data().state !== "pending" || receipt.data().uid !== uid) return;
    transaction.set(usageRef, {
      bytes: Math.max(0, (usage.data()?.bytes || 0) - receipt.data().bytes)
    }, { merge: true });
    transaction.delete(receiptRef);
  });
}

async function sendChatPhoto(uid, body) {
  requireValue(ID_PATTERN.test(uid || ""), 400, "Invalid account identifier.");
  requireValue(body && typeof body === "object", 400, "Choose a photo to send.");
  const { mode, toUid, groupId, uploadId, contentType, dataUrl } = body;
  requireValue(mode === "direct" || mode === "group", 400, "Unknown conversation type.");
  requireValue(UPLOAD_ID_PATTERN.test(uploadId || ""), 400, "Retry this photo upload.");
  const text = typeof body.text === "string" ? body.text.trim() : "";
  requireValue(text.length <= 1000, 400, "Keep messages under 1000 characters.");
  const bytes = decodePhoto(dataUrl, contentType);
  const output = await sanitizePhoto(bytes, contentType, sharp);
  let names;
  if (mode === "direct") {
    names = await directParticipants(db, uid, toUid);
  } else {
    await groupParticipant(db, uid, groupId);
    const user = await db.collection("users").doc(uid).get();
    names = { fromUsername: user.data()?.username || "Kigazine Member" };
  }

  const messageId = `${uid}_${mode}_${uploadId}`;
  const messageRef = db.collection(messageCollection(mode)).doc(messageId);
  const existing = await messageRef.get();
  if (existing.exists) {
    const previous = existing.data();
    requireValue(previous.photo?.path === photoPath(mode, messageId) &&
      (mode === "direct" ? previous.fromUid === uid && previous.toUid === toUid
        : previous.uid === uid && previous.groupId === groupId),
    409, "This upload ID was already used. Choose the photo again.");
    return { messageId, alreadySent: true };
  }
  const state = await reserveUpload(uid, messageId, output.length);
  if (state === "complete") {
    throw new ChatPhotoError(409, "This photo was already sent or removed. Select it again to retry.");
  }

  const path = photoPath(mode, messageId);
  let saved = false;
  let messageCreated = false;
  try {
    await bucket.file(path).save(output, {
      resumable: false,
      metadata: { contentType: "image/jpeg", cacheControl: "private, no-store" }
    });
    saved = true;
    const base = {
      text,
      photo: { path, contentType: "image/jpeg", size: output.length },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtClient: Date.now()
    };
    const message = mode === "direct" ? {
      ...base, fromUid: uid, toUid, participants: [uid, toUid],
      fromUsername: names.fromUsername, toUsername: names.toUsername
    } : {
      ...base, groupId, uid, username: names.fromUsername
    };
    await messageRef.create(message);
    messageCreated = true;
    await db.collection("chatPhotoUploads").doc(messageId).update({ state: "complete" });
    if (mode === "group") {
      await db.collection("blogGroups").doc(groupId).update({
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }).catch(error => console.error("Could not update group activity:", error));
    }
    return { messageId };
  } catch (error) {
    // A network error after create() can hide a successful write. Keep its photo.
    if (!messageCreated && (await messageRef.get()).exists) messageCreated = true;
    if (!messageCreated) {
      if (saved) await bucket.file(path).delete({ ignoreNotFound: true });
      await releaseUpload(uid, messageId);
    }
    if (messageCreated) return { messageId, alreadySent: true };
    throw error;
  }
}

async function loadChatPhoto(uid, mode, messageId) {
  requireValue(ID_PATTERN.test(uid || ""), 400, "Invalid account identifier.");
  requireValue(mode === "direct" || mode === "group", 400, "Unknown conversation type.");
  requireValue(MESSAGE_ID_PATTERN.test(messageId || ""),
    400, "Invalid photo reference.");
  const message = await db.collection(messageCollection(mode)).doc(messageId).get();
  requireValue(message.exists, 404, "Photo not found.");
  const data = message.data();
  await canReadPhoto(db, uid, mode, data);
  const path = photoPath(mode, messageId);
  requireValue(data.photo?.path === path, 404, "Photo not found.");
  const [bytes] = await bucket.file(path).download();
  return bytes;
}

function sendError(res, error) {
  if (!(error instanceof ChatPhotoError)) console.error("Chat photo request failed:", error);
  res.status(error.status || 500).json({
    error: error instanceof ChatPhotoError ? error.message : "Photo service is unavailable. Please retry."
  });
}

exports.uploadChatPhoto = onRequest({ region: "us-central1", cors: true, memory: "512MiB" }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST required." });
  try {
    const uid = await authenticatedUid(req);
    res.status(200).json(await sendChatPhoto(uid, req.body));
  } catch (error) {
    sendError(res, error);
  }
});

exports.getChatPhoto = onRequest({ region: "us-central1", cors: true }, async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "GET required." });
  try {
    const uid = await authenticatedUid(req);
    const bytes = await loadChatPhoto(uid, req.query.mode, req.query.messageId);
    res.set("Cache-Control", "private, no-store").type("image/jpeg").send(bytes);
  } catch (error) {
    sendError(res, error);
  }
});

exports.deleteGroupChatPhoto = onDocumentDeleted({
  document: "blogGroupMessages/{messageId}", region: "us-central1"
}, async event => {
  const data = event.data?.data();
  const messageId = event.params.messageId;
  if (!data?.photo || data.photo.path !== photoPath("group", messageId)) return;
  const receiptRef = db.collection("chatPhotoUploads").doc(messageId);
  const usageRef = db.collection("chatPhotoUsage").doc(data.uid);
  await db.runTransaction(async transaction => {
    const [receipt, usage] = await Promise.all([
      transaction.get(receiptRef), transaction.get(usageRef)
    ]);
    if (!receipt.exists || receipt.data().state !== "complete") return;
    transaction.set(usageRef, {
      bytes: Math.max(0, (usage.data()?.bytes || 0) - receipt.data().bytes)
    }, { merge: true });
    transaction.update(receiptRef, { state: "deleted" });
  });
  await bucket.file(data.photo.path).delete({ ignoreNotFound: true });
});

exports._test = { sendChatPhoto, loadChatPhoto };
