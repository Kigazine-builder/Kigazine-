"use strict";

const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { magazineInput, commentInput, mayComment, publicMember, requiredText } = require("./kigazine-core");

const db = admin.firestore();
const stamp = () => admin.firestore.FieldValue.serverTimestamp();
const OPTIONS = { region: "us-central1", maxInstances: 10 };
const DIRECTORY_PAGE_SIZE = 200;
const MAX_FRIENDS = 100;

function clientError(error) {
  if (error instanceof TypeError) throw new HttpsError("invalid-argument", error.message);
  throw error;
}

async function account(request) {
  const uid = request.auth?.uid;
  const email = String(request.auth?.token?.email || "").trim().toLowerCase();
  if (!uid || !email) throw new HttpsError("unauthenticated", "Sign in to Kigazine first.");
  const [profile, banned, school] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("bannedEmails").doc(email).get(),
    db.collection("schoolParticipants").doc(uid).get()
  ]);
  if (banned.exists || school.data()?.active === true) {
    throw new HttpsError("permission-denied", "This account cannot use the regular Kigazine workspace.");
  }
  if (!profile.exists) throw new HttpsError("failed-precondition", "Finish setting up your account first.");
  return { uid, email, profile: profile.data() };
}

function isAdmin(user) {
  return user.email === "ethan02px2035@saschina.org" || user.profile.role === "admin";
}

function checkInterval(snapshot, milliseconds) {
  if (snapshot.exists && Date.now() - (snapshot.data().lastAt?.toMillis?.() || 0) < milliseconds) {
    throw new HttpsError("resource-exhausted", "Please wait a moment before sending another item.");
  }
}

exports.getMemberDirectory = onCall(OPTIONS, async request => {
  const user = await account(request);
  const cursor = request.data?.cursor || "";
  if (typeof cursor !== "string" || (cursor && !/^[A-Za-z0-9_-]{1,128}$/.test(cursor))) {
    throw new HttpsError("invalid-argument", "Invalid directory cursor.");
  }
  let query = db.collection("users")
    .select("email", "username", "role", "friendUids", "discoverableProfile", "magazineSeriesName", "commentsFriendsOnly")
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(DIRECTORY_PAGE_SIZE);
  if (cursor) query = query.startAfter(cursor);
  const snapshot = await query.get();
  const moderator = isAdmin(user);
  const members = [];
  const commentPermissions = Object.create(null);
  for (const doc of snapshot.docs) {
    const profile = doc.data();
    commentPermissions[doc.id] = mayComment(user.uid, user.profile, doc.id, profile);
    const publicData = publicMember(doc.id, profile, user.uid, user.profile);
    if (moderator) {
      members.push({
        id: doc.id,
        username: profile.username || "",
        email: profile.email || "",
        role: profile.role || "writer",
        discoverableProfile: profile.discoverableProfile === true,
        magazineSeriesName: profile.magazineSeriesName || ""
      });
    } else if (publicData) {
      members.push(publicData);
    }
  }
  return {
    members,
    commentPermissions,
    nextCursor: snapshot.size === DIRECTORY_PAGE_SIZE ? snapshot.docs.at(-1).id : null
  };
});

exports.lookupMember = onCall(OPTIONS, async request => {
  const user = await account(request);
  let username;
  try { username = requiredText(request.data?.username, 40, "Username"); }
  catch (error) { clientError(error); }
  const snapshot = await db.collection("users").where("username", "==", username).limit(3).get();
  const matches = snapshot.docs.map(doc => publicMember(doc.id, doc.data(), user.uid, user.profile)).filter(Boolean);
  if (matches.length > 1) throw new HttpsError("failed-precondition", "Several members use that name. Ask for a unique username.");
  return { member: matches[0] || null };
});

exports.changeFriend = onCall(OPTIONS, async request => {
  const user = await account(request);
  const targetUid = request.data?.targetUid;
  const action = request.data?.action;
  if (typeof targetUid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(targetUid) || targetUid === user.uid ||
      !["add", "remove"].includes(action)) {
    throw new HttpsError("invalid-argument", "Choose a valid member and action.");
  }
  const selfRef = db.collection("users").doc(user.uid);
  const targetRef = db.collection("users").doc(targetUid);
  return db.runTransaction(async transaction => {
    const [selfSnap, targetSnap] = await Promise.all([transaction.get(selfRef), transaction.get(targetRef)]);
    if (!selfSnap.exists) throw new HttpsError("failed-precondition", "Account not found.");
    if (!targetSnap.exists && action === "add") throw new HttpsError("not-found", "Member not found.");
    const self = selfSnap.data();
    const target = targetSnap.data() || {};
    if (action === "add" && target.discoverableProfile !== true) {
      throw new HttpsError("permission-denied", "That member is not available in nickname search.");
    }
    const selfFriends = new Set(Array.isArray(self.friendUids) ? self.friendUids : []);
    const targetFriends = new Set(Array.isArray(target.friendUids) ? target.friendUids : []);
    if (action === "add") {
      selfFriends.add(targetUid);
      targetFriends.add(user.uid);
      if (selfFriends.size > MAX_FRIENDS || targetFriends.size > MAX_FRIENDS) {
        throw new HttpsError("resource-exhausted", "A friend list is full.");
      }
    } else {
      selfFriends.delete(targetUid);
      targetFriends.delete(user.uid);
    }
    transaction.update(selfRef, { friendUids: [...selfFriends] });
    if (targetSnap.exists) transaction.update(targetRef, { friendUids: [...targetFriends] });
    return { friendUids: [...selfFriends] };
  });
});

exports.submitMagazine = onCall(OPTIONS, async request => {
  const user = await account(request);
  let content;
  try { content = magazineInput(request.data, user.profile); }
  catch (error) { clientError(error); }
  const rateRef = db.collection("submissionThrottle").doc(`${user.uid}_magazine`);
  const postRef = db.collection("magazines").doc();
  await db.runTransaction(async transaction => {
    const last = await transaction.get(rateRef);
    checkInterval(last, 30000);
    transaction.set(rateRef, { lastAt: admin.firestore.Timestamp.now() });
    transaction.create(postRef, {
      ...content,
      uid: user.uid,
      isPublic: false,
      status: "pending_review",
      createdAt: stamp()
    });
  });
  return { id: postRef.id };
});

exports.submitComment = onCall(OPTIONS, async request => {
  const user = await account(request);
  let comment;
  try { comment = commentInput(request.data); }
  catch (error) { clientError(error); }
  const postRef = db.collection("magazines").doc(comment.postId);
  const rateRef = db.collection("submissionThrottle").doc(`${user.uid}_comment`);
  const commentRef = db.collection("comments").doc();
  await db.runTransaction(async transaction => {
    const [postSnap, last] = await Promise.all([transaction.get(postRef), transaction.get(rateRef)]);
    const post = postSnap.data();
    if (post?.status !== "approved" || post.isPublic !== true || typeof post.uid !== "string") {
      throw new HttpsError("not-found", "That magazine is not available for comments.");
    }
    const authorSnap = await transaction.get(db.collection("users").doc(post.uid));
    if (!mayComment(user.uid, user.profile, post.uid, authorSnap.data())) {
      throw new HttpsError("permission-denied", "This writer accepts comments from friends only.");
    }
    checkInterval(last, 10000);
    transaction.set(rateRef, { lastAt: admin.firestore.Timestamp.now() });
    transaction.create(commentRef, {
      ...comment,
      postTitle: post.title,
      uid: user.uid,
      username: typeof user.profile.username === "string" ? user.profile.username : "Kigazine reader",
      status: "pending_review",
      createdAt: stamp()
    });
  });
  return { id: commentRef.id };
});
