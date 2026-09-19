"use strict";

const admin = require("firebase-admin");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const OpenAI = require("openai");
const { DAY, dueCollection, publicationSlot, subjectKey, wordCount } = require("./apple-times-core");

const db = admin.firestore();
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const ADMIN_EMAIL = "ethan02px2035@saschina.org";

function dataOf(snapshot) { return { id: snapshot.id, ...snapshot.data() }; }
function stamp() { return admin.firestore.FieldValue.serverTimestamp(); }
function nowMs() { return Date.now(); }
function requireAdmin(request) {
  const email = request.auth?.token?.email?.toLowerCase();
  if (email !== ADMIN_EMAIL) throw new HttpsError("permission-denied", "Only the Apple Times editor can do that.");
}
function mergedCustomSubject(subject, config) {
  const merged = config.subjectMerges?.[subjectKey(subject)];
  return typeof merged === "string" && merged.trim() ? merged.trim() : subject;
}

function issueNumberAt(config, now) {
  const first = publicationSlot(config, 1);
  if (now < first.at) return null;
  let number = 1;
  for (; number < 100; number += 1) {
    const next = publicationSlot(config, number + 1);
    if (next.at > now) break;
  }
  return number;
}
function snapshotSection(section) {
  return {
    sectionId: section.id,
    title: section.title || "Untitled section",
    subject: section.subject || "Other",
    writerDisplayName: section.writerDisplayName || "Kigazine writer",
    content: section.content || "",
    completedContent: section.completedContent || section.content || "",
    aiCompleted: section.aiCompleted === true
  };
}
async function completeWithAI(section) {
  const client = new OpenAI({ apiKey: OPENAI_API_KEY.value() });
  const response = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: "You are the completion editor for Apple Times, a kid-friendly magazine made by Kigazine writers. Continue an unfinished section in a clear, age-appropriate style. Do not add personal information, contact details, invented quotes, or claims about real people. Keep the writer's subject and tone. Return only the new continuation, without a heading or preface. Aim for 180 to 350 words and end with a complete thought."
      },
      {
        role: "user",
        content: `Subject: ${section.subject}\nTitle: ${section.title}\nWriter's draft:\n${section.content}`
      }
    ],
    temperature: 0.65,
    max_tokens: 700
  });
  return String(response.choices?.[0]?.message?.content || "").trim();
}
async function collectDueSections() {
  const configSnap = await db.doc("appleTimesConfig/global").get();
  if (!configSnap.exists || configSnap.data().enabled === false) return { collected: 0, skipped: "disabled" };
  const config = configSnap.data();
  const due = dueCollection(config, nowMs());
  if (!due) return { collected: 0, skipped: "before-first-collection" };
  const sectionsSnap = await db.collection("appleTimesSections").where("cycleDate", "==", due.date).get();
  let collected = 0;
  for (const sectionSnap of sectionsSnap.docs) {
    const section = sectionSnap.data();
    if (!["draft", "submitted"].includes(section.status)) continue;
    const base = {
      status: "collected",
      collectedAt: stamp(),
      collectedCycle: due.cycleNumber,
      completedContent: section.content || "",
      aiCompleted: false,
      progressAtCollection: Math.min(100, Math.round(wordCount(section.content || "") / (Number(section.targetWords) || 600) * 100)),
      updatedAt: stamp()
    };
    if (section.status === "draft" && (section.content || "").trim().length >= 20) {
      try {
        const continuation = await completeWithAI({ ...section, content: section.content.trim() });
        if (continuation) {
          base.completedContent = `${section.content.trim()}\n\n${continuation}`;
          base.aiCompletion = continuation;
          base.aiCompleted = true;
          base.collectionNote = "AI completion added after the hand-in deadline; editor review required.";
        } else {
          base.collectionNote = "The draft was collected, but the AI completion was empty; editor review required.";
        }
      } catch (error) {
        console.error("Apple Times AI completion failed", sectionSnap.id, error);
        base.aiError = "AI completion could not run; editor review required.";
        base.collectionNote = "Collected without an AI completion because the completion service was unavailable.";
      }
    } else if (section.status === "draft") {
      base.collectionNote = "The draft was too short for automatic completion; editor review required.";
    }
    await sectionSnap.ref.update(base);
    collected += 1;
  }
  return { collected, cycleDate: due.date, cycleNumber: due.cycleNumber };
}
async function prepareIssueDraft() {
  const configSnap = await db.doc("appleTimesConfig/global").get();
  if (!configSnap.exists || configSnap.data().enabled === false) return { prepared: false, skipped: "disabled" };
  const config = configSnap.data();
  const issueNumber = issueNumberAt(config, nowMs());
  if (!issueNumber) return { prepared: false, skipped: "before-first-publication" };
  const issueRef = db.doc(`appleTimesIssues/issue-${issueNumber}`);
  if ((await issueRef.get()).exists) return { prepared: false, skipped: "already-exists", issueNumber };
  const publication = publicationSlot(config, issueNumber);
  const sectionSnap = await db.collection("appleTimesSections").get();
  const sections = sectionSnap.docs.map(dataOf).filter(section => section.status === "collected" && section.collectedAt?.toMillis?.() <= publication.at).sort((a, b) => String(a.cycleDate).localeCompare(String(b.cycleDate)) || String(a.subject).localeCompare(String(b.subject)));
  const writerSnap = await db.collection("appleTimesWriters").where("status", "==", "approved").get();
  const counts = new Map();
  const addInterest = subject => {
    const key = subjectKey(subject);
    const current = counts.get(key);
    counts.set(key, { subject, count: (current?.count || 0) + 1 });
  };
  writerSnap.docs.forEach(docSnap => {
    const writer = docSnap.data();
    (writer.subjects || []).forEach(addInterest);
    if (writer.customSubject) addInterest(mergedCustomSubject(writer.customSubject, config));
  });
  const extensionSubjects = [...counts.values()].filter(item => item.count >= Number(config.extensionThreshold || 5)).map(item => item.subject);
  await issueRef.create({ issueNumber, title: `Apple Times Issue ${issueNumber}`, publicationDate: publication.date, status: "draft", sectionSnapshots: sections.map(snapshotSection), extensionSubjects, generatedBy: "Apple Times scheduler", createdAt: stamp(), updatedAt: stamp() });
  return { prepared: true, issueNumber, sections: sections.length };
}

exports.appleTimesAutoCollect = onSchedule({ schedule: "0 * * * *", timeZone: "UTC", retryCount: 3, secrets: [OPENAI_API_KEY] }, async () => {
  const collection = await collectDueSections();
  const issue = await prepareIssueDraft();
  console.log("Apple Times scheduler", { collection, issue });
});

exports.appleTimesRunCollection = onCall({ region: "us-central1", secrets: [OPENAI_API_KEY] }, async request => {
  requireAdmin(request);
  return collectDueSections();
});

exports.appleTimesRunIssuePrep = onCall({ region: "us-central1", secrets: [OPENAI_API_KEY] }, async request => {
  requireAdmin(request);
  return prepareIssueDraft();
});
