"use strict";

const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { METRICS, dayKey, recentAuthTime, becameApproved } = require("./analytics-core");

const db = admin.firestore();
const REGION = "us-central1";
const OWNER_EMAIL = "ethan02px2035@saschina.org";

async function countOnce(receiptId, metric, at = Date.now()) {
  const receiptRef = db.collection("analyticsReceipts").doc(receiptId);
  const dayRef = db.collection("analyticsDaily").doc(dayKey(at));
  await db.runTransaction(async transaction => {
    const receipt = await transaction.get(receiptRef);
    if (receipt.exists) return;
    transaction.create(receiptRef, { day: dayRef.id });
    transaction.set(dayRef, {
      [metric]: admin.firestore.FieldValue.increment(1)
    }, { merge: true });
  });
}

exports.countNewAccount = onDocumentCreated({ document: "users/{uid}", region: REGION }, async event => {
  if (event.data) await countOnce(`account_${event.params.uid}`, "accountsCreated");
});

exports.countNewMagazine = onDocumentCreated({ document: "magazines/{magazineId}", region: REGION }, async event => {
  if (event.data) await countOnce(`magazine_${event.params.magazineId}`, "magazinesSubmitted");
});

exports.countApprovedMagazine = onDocumentUpdated({ document: "magazines/{magazineId}", region: REGION }, async event => {
  if (event.data && becameApproved(event.data.before.data(), event.data.after.data()) &&
      event.data.after.data().isPublic === true) {
    await countOnce(`magazineApproved_${event.params.magazineId}`, "magazinesApproved");
  }
});

exports.countNewComment = onDocumentCreated({ document: "comments/{commentId}", region: REGION }, async event => {
  if (event.data) await countOnce(`comment_${event.params.commentId}`, "commentsSubmitted");
});

exports.countApprovedComment = onDocumentUpdated({ document: "comments/{commentId}", region: REGION }, async event => {
  if (event.data && becameApproved(event.data.before.data(), event.data.after.data())) {
    await countOnce(`commentApproved_${event.params.commentId}`, "commentsApproved");
  }
});

exports.recordSignIn = onCall({ region: REGION, maxInstances: 10 }, async request => {
  const uid = request.auth?.uid;
  const authTime = request.auth?.token?.auth_time;
  if (!uid || !recentAuthTime(authTime)) {
    throw new HttpsError("unauthenticated", "A recent Kigazine sign-in is required.");
  }

  const receiptRef = db.collection("analyticsSignIns").doc(uid);
  const dayRef = db.collection("analyticsDaily").doc(dayKey(Date.now()));
  await db.runTransaction(async transaction => {
    const receipt = await transaction.get(receiptRef);
    if ((receipt.data()?.lastAuthTime || 0) >= authTime) return;
    transaction.set(receiptRef, { lastAuthTime: authTime });
    transaction.set(dayRef, { signIns: admin.firestore.FieldValue.increment(1) }, { merge: true });
  });
  return { recorded: true };
});

exports.getAnalytics = onCall({ region: REGION, maxInstances: 10 }, async request => {
  if (!request.auth?.uid || String(request.auth.token?.email || "").trim().toLowerCase() !== OWNER_EMAIL) {
    throw new HttpsError("permission-denied", "Only the Kigazine owner can view analytics.");
  }
  const days = request.data?.days ?? 30;
  if (![7, 30, 90].includes(days)) {
    throw new HttpsError("invalid-argument", "Choose 7, 30, or 90 days.");
  }

  const today = dayKey(Date.now());
  const first = dayKey(Date.now() - (days - 1) * 86400000);
  const dailyQuery = db.collection("analyticsDaily")
    .orderBy(admin.firestore.FieldPath.documentId()).startAt(first).endAt(today);
  const [dailySnap, firstSnap, users, magazines, approved, comments] = await Promise.all([
    dailyQuery.get(),
    db.collection("analyticsDaily").orderBy(admin.firestore.FieldPath.documentId()).limit(1).get(),
    db.collection("users").count().get(),
    db.collection("magazines").count().get(),
    db.collection("magazines").where("status", "==", "approved").count().get(),
    db.collection("comments").count().get()
  ]);
  const byDay = new Map(dailySnap.docs.map(doc => [doc.id, doc.data()]));
  const rows = Array.from({ length: days }, (_, index) => {
    const date = dayKey(Date.parse(`${first}T00:00:00Z`) + index * 86400000);
    const values = byDay.get(date) || {};
    return {
      date,
      ...Object.fromEntries(METRICS.map(metric => [metric, values[metric] || 0]))
    };
  });
  return {
    timezone: "UTC",
    trackingSince: firstSnap.docs[0]?.id || null,
    rows,
    totals: {
      accounts: users.data().count,
      magazines: magazines.data().count,
      approvedMagazines: approved.data().count,
      comments: comments.data().count
    }
  };
});
