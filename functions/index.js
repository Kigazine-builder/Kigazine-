const admin = require("firebase-admin");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const OpenAI = require("openai");

admin.initializeApp();

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const db = admin.firestore();

const MAX_TEXT_CHARS = 6000;

function privateInfoReason(text = "") {
  const checks = [
    {
      label: "email address",
      pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
    },
    {
      label: "phone number",
      pattern: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/
    },
    {
      label: "street address",
      pattern: /\b\d{1,6}\s+[A-Za-z0-9.'-]+\s+(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way)\b/i
    },
    {
      label: "school name",
      pattern: /\b[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,3}\s+(Elementary|Middle|High|Primary|Secondary|International)?\s*School\b/
    },
    {
      label: "private school detail",
      pattern: /\b(my|our|the)\s+school\s+(is|called|name is)\b/i
    },
    {
      label: "password or login detail",
      pattern: /\b(password|passcode|my login|my address|my school|phone number)\b/i
    }
  ];

  const hit = checks.find(item => item.pattern.test(text));
  return hit ? hit.label : "";
}

function getFlaggedCategories(result) {
  const categories = result?.categories || {};
  return Object.entries(categories)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);
}

async function checkWithOpenAI(text) {
  const client = new OpenAI({ apiKey: OPENAI_API_KEY.value() });
  const response = await client.moderations.create({
    model: "omni-moderation-latest",
    input: text
  });

  const result = response.results?.[0] || {};
  return {
    flagged: Boolean(result.flagged),
    categories: getFlaggedCategories(result)
  };
}

async function moderateText(text) {
  const trimmed = String(text || "").trim();

  if (!trimmed) {
    return {
      decision: "blocked",
      reason: "empty content",
      categories: []
    };
  }

  if (trimmed.length > MAX_TEXT_CHARS) {
    return {
      decision: "needs_review",
      reason: "too long for automatic approval",
      categories: ["length"]
    };
  }

  const privateHit = privateInfoReason(trimmed);
  if (privateHit) {
    return {
      decision: "blocked",
      reason: `possible ${privateHit}`,
      categories: ["private-info"]
    };
  }

  const ai = await checkWithOpenAI(trimmed);
  if (ai.flagged) {
    return {
      decision: "blocked",
      reason: "AI safety check flagged the content",
      categories: ai.categories
    };
  }

  return {
    decision: "approved",
    reason: "AI safety check passed",
    categories: []
  };
}

async function updateMagazineAfterModeration(ref, decision) {
  if (decision.decision === "approved") {
    await ref.update({
      isPublic: true,
      status: "approved",
      moderationStatus: "ai_approved",
      moderationReason: decision.reason,
      moderationCategories: decision.categories,
      approvedBy: "Kigazine AI",
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      moderatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return;
  }

  if (decision.decision === "needs_review") {
    await ref.update({
      isPublic: false,
      status: "needs_review",
      moderationStatus: "needs_review",
      moderationReason: decision.reason,
      moderationCategories: decision.categories,
      moderatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return;
  }

  await ref.update({
    isPublic: false,
    status: "blocked",
    moderationStatus: "ai_blocked",
    moderationReason: decision.reason,
    moderationCategories: decision.categories,
    moderatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function updateCommentAfterModeration(ref, decision) {
  if (decision.decision === "approved") {
    await ref.update({
      status: "approved",
      moderationStatus: "ai_approved",
      moderationReason: decision.reason,
      moderationCategories: decision.categories,
      approvedBy: "Kigazine AI",
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      moderatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return;
  }

  if (decision.decision === "needs_review") {
    await ref.update({
      status: "needs_review",
      moderationStatus: "needs_review",
      moderationReason: decision.reason,
      moderationCategories: decision.categories,
      moderatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return;
  }

  await ref.update({
    status: "blocked",
    moderationStatus: "ai_blocked",
    moderationReason: decision.reason,
    moderationCategories: decision.categories,
    moderatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

exports.moderateMagazine = onDocumentCreated(
  {
    document: "magazines/{magazineId}",
    region: "us-central1",
    secrets: [OPENAI_API_KEY]
  },
  async event => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data() || {};
    if (!["pending_review", "pending_ai_review"].includes(data.status)) return;

    const text = [data.title, data.description, data.content]
      .filter(Boolean)
      .join("\n\n");

    const decision = await moderateText(text);
    await updateMagazineAfterModeration(snap.ref, decision);
  }
);

exports.moderateComment = onDocumentCreated(
  {
    document: "comments/{commentId}",
    region: "us-central1",
    secrets: [OPENAI_API_KEY]
  },
  async event => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data() || {};
    if (!["pending_review", "pending_ai_review"].includes(data.status)) return;

    const decision = await moderateText(data.content || "");
    await updateCommentAfterModeration(snap.ref, decision);
  }
);

exports.recheckPendingContent = async function recheckPendingContent() {
  const magazines = await db.collection("magazines")
    .where("status", "in", ["pending_review", "pending_ai_review"])
    .limit(20)
    .get();

  for (const docSnap of magazines.docs) {
    const data = docSnap.data() || {};
    const text = [data.title, data.description, data.content]
      .filter(Boolean)
      .join("\n\n");
    const decision = await moderateText(text);
    await updateMagazineAfterModeration(docSnap.ref, decision);
  }
};
