const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_STORED_BYTES = 1024 * 1024;
const MAX_USER_BYTES = 50 * 1024 * 1024;
const PHOTO_BUCKET = "kigazine-302ac.firebasestorage.app";
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MESSAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;
const UPLOAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

class ChatPhotoError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requireValue(ok, status, message) {
  if (!ok) throw new ChatPhotoError(status, message);
}

function decodePhoto(dataUrl, contentType) {
  requireValue(typeof dataUrl === "string" && dataUrl.length <= Math.ceil(MAX_INPUT_BYTES * 4 / 3) + 100,
    413, "Choose a photo under 2 MB.");
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  requireValue(match && match[1] === contentType, 400, "Choose a JPEG, PNG, or WebP photo.");
  const bytes = Buffer.from(match[2], "base64");
  requireValue(bytes.length > 0 && bytes.length <= MAX_INPUT_BYTES &&
    bytes.toString("base64") === match[2], 413, "Choose a photo under 2 MB.");
  return bytes;
}

async function sanitizePhoto(bytes, contentType, sharp) {
  let metadata;
  try {
    metadata = await sharp(bytes, { limitInputPixels: 20_000_000, failOn: "error" }).metadata();
  } catch {
    throw new ChatPhotoError(400, "This photo could not be read.");
  }
  requireValue(TYPES[metadata.format] === contentType, 400, "The photo type does not match its contents.");
  requireValue(metadata.width > 0 && metadata.height > 0 &&
    metadata.width * metadata.height <= 20_000_000, 400, "This photo is too large in dimensions.");
  try {
    const output = await sharp(bytes, { limitInputPixels: 20_000_000, failOn: "error" })
      .rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }).jpeg({ quality: 78 }).toBuffer();
    requireValue(output.length <= MAX_STORED_BYTES, 413, "This photo is too detailed. Choose a smaller photo.");
    return output;
  } catch (error) {
    if (error instanceof ChatPhotoError) throw error;
    throw new ChatPhotoError(400, "This photo could not be processed.");
  }
}

function isActiveSchoolParticipant(snapshot) {
  return snapshot.exists && snapshot.data()?.active === true;
}

async function directParticipants(db, uid, toUid) {
  requireValue(ID_PATTERN.test(toUid) && toUid !== uid, 400, "Choose another Kigazine user.");
  const [sender, recipient, senderSchool, recipientSchool] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("users").doc(toUid).get(),
    db.collection("schoolParticipants").doc(uid).get(),
    db.collection("schoolParticipants").doc(toUid).get()
  ]);
  requireValue(sender.exists && recipient.exists, 404, "That Kigazine user was not found.");
  requireValue(!isActiveSchoolParticipant(senderSchool) && !isActiveSchoolParticipant(recipientSchool),
    403, "Private messages are unavailable for school accounts.");
  const a = sender.data();
  const b = recipient.data();
  requireValue(b.discoverableProfile === true ||
    (Array.isArray(a.friendUids) && a.friendUids.includes(toUid) &&
      Array.isArray(b.friendUids) && b.friendUids.includes(uid)),
    403, "You cannot message this user.");
  return { fromUsername: a.username || "Kigazine user", toUsername: b.username || "Kigazine user" };
}

async function groupParticipant(db, uid, groupId) {
  requireValue(ID_PATTERN.test(groupId), 400, "Choose a group.");
  const [group, member, school] = await Promise.all([
    db.collection("blogGroups").doc(groupId).get(),
    db.collection("blogGroupMembers").doc(`${groupId}_${uid}`).get(),
    db.collection("schoolParticipants").doc(uid).get()
  ]);
  requireValue(group.exists, 404, "That group was not found.");
  requireValue(!isActiveSchoolParticipant(school), 403, "Group chats are unavailable for school accounts.");
  requireValue(member.exists || group.data().ownerUid === uid, 403, "Join this group before sending a photo.");
}

async function canReadPhoto(db, uid, mode, message) {
  if (mode === "direct") {
    requireValue(Array.isArray(message.participants) && message.participants.includes(uid),
      403, "You cannot view this photo.");
    const school = await db.collection("schoolParticipants").doc(uid).get();
    requireValue(!isActiveSchoolParticipant(school), 403, "You cannot view this photo.");
  } else if (mode === "group") {
    await groupParticipant(db, uid, message.groupId);
  } else {
    throw new ChatPhotoError(400, "Unknown conversation type.");
  }
}

function photoPath(mode, messageId) {
  return `chatPhotos/${mode}/${messageId}.jpg`;
}

function messageCollection(mode) {
  return mode === "direct" ? "messages" : "blogGroupMessages";
}

module.exports = {
  ChatPhotoError, MAX_INPUT_BYTES, MAX_STORED_BYTES, MAX_USER_BYTES, PHOTO_BUCKET,
  ID_PATTERN, MESSAGE_ID_PATTERN, UPLOAD_ID_PATTERN, decodePhoto, sanitizePhoto, directParticipants,
  groupParticipant, canReadPhoto, photoPath, messageCollection, requireValue
};
