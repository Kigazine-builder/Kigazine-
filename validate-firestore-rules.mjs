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
requireText("value.matches('^[0-6]+$')", "Arcade tile regular expression is damaged");
requireText("request.resource.data.status == 'pending_review'", "Regular submissions must start pending review");
requireText("request.resource.data.status == 'pending_review'\n            && request.resource.data.isPublic == false", "Authors must keep edited regular posts pending and private");
requireText("request.resource.data.status in ['changes_requested', 'approved', 'rejected']", "School review states are missing");
requireText("request.resource.data.reviewedBy == request.auth.uid", "School reviews must identify the adult reviewer");
requireText("!isActiveSchoolParticipant(request.resource.data.toUid)", "School participants are not protected from private messages");

console.log("Firestore rules structural and moderation checks passed.");
