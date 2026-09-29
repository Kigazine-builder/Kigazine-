import { readFileSync } from "node:fs";

const rules = readFileSync(new URL("./firestore.rules", import.meta.url), "utf8");

function requireText(text, message) {
  if (!rules.includes(text)) throw new Error(message);
}

function requireCount(pattern, expected, message) {
  const actual = (rules.match(pattern) || []).length;
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, found ${actual}`);
  }
}

for (const [open, close] of [["{", "}"], ["(", ")"], ["[", "]"]]) {
  let depth = 0;
  for (const character of rules) {
    if (character === open) depth += 1;
    if (character === close) depth -= 1;
    if (depth < 0) throw new Error(`Unexpected ${close}`);
  }
  if (depth !== 0) throw new Error(`Unbalanced ${open}${close}: ${depth}`);
}

requireCount(/service cloud\.firestore/g, 1, "Duplicate Firestore service block");
requireCount(/match \/magazines\/\{magazineId\}/g, 1, "Duplicate magazine rules");
requireCount(/match \/schoolMagazines\/\{magazineId\}/g, 1, "School magazine rules missing or duplicated");
requireText("allow read: if signedIn();", "Spark member lookup requires signed-in profile reads");
requireText("request.resource.data.friendUids == []", "New users must begin with an empty friends list");
requireText("!(request.auth.uid in request.resource.data.friendUids)", "A user cannot add themself as a friend");
const magazines = rules.split("match /magazines/{magazineId}")[1]?.split("match /comments/{commentId}")[0] || "";
const comments = rules.split("match /comments/{commentId}")[1]?.split("match /reports/{reportId}")[0] || "";
if (!magazines.includes("allow create: if false;") || !magazines.includes("resource.data.uid == request.auth.uid")) throw new Error("Magazine creation must use the callable submission path, with private owner reads");
if (!comments.includes("canCommentOnPost(request.resource.data.postId)") || !comments.includes("request.resource.data.status == 'pending_review'")) throw new Error("Client comments must respect post permissions and moderation");
requireText("request.resource.data.createdAt == request.time", "Server timestamps must be used for submissions");
requireText("request.resource.data.status in ['changes_requested', 'approved', 'rejected']", "School review states are missing");
requireText("request.resource.data.reviewedBy == request.auth.uid", "School reviews must identify the adult reviewer");
requireText("!isActiveSchoolParticipant(request.resource.data.toUid)", "School participants are not protected from private messages");

console.log("Firestore rules structural and moderation checks passed.");
