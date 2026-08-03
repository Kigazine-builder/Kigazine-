import fs from "node:fs";

const html = fs.readFileSync("school-edition.html", "utf8");
const script = fs.readFileSync("school-edition.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const rules = fs.readFileSync("firestore.rules", "utf8");

const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function expectIncludes(source, value, message) {
  expect(source.includes(value), message || `Missing required text: ${value}`);
}

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
expect(duplicateIds.length === 0, `Duplicate HTML IDs: ${duplicateIds.join(", ")}`);

const scriptIds = [...script.matchAll(/byId\("([^"]+)"\)/g)].map(match => match[1]);
const missingIds = [...new Set(scriptIds.filter(id => !ids.includes(id)))];
expect(missingIds.length === 0, `JavaScript references missing HTML IDs: ${missingIds.join(", ")}`);

[
  "schoolParticipants",
  "schoolClasses",
  "schoolClassMembers",
  "schoolMagazines",
  "schoolReports",
  "schoolAuditLogs"
].forEach(collectionName => {
  expectIncludes(script, `"${collectionName}"`, `School Edition does not use ${collectionName}.`);
  expectIncludes(rules, `match /${collectionName}/`, `Firestore rules do not protect ${collectionName}.`);
});

expectIncludes(script, 'saveMagazine("draft")', "Student draft action is missing.");
expectIncludes(script, 'saveMagazine("submitted")', "Student submission action is missing.");
expectIncludes(script, 'data-review-action="approved"', "Moderator approval action is missing.");
expectIncludes(script, 'data-review-action="changes_requested"', "Moderator changes-request action is missing.");
expectIncludes(script, 'data-review-action="rejected"', "Moderator rejection action is missing.");
expectIncludes(script, 'where("status", "==", "approved")', "The class feed is not restricted to approved work.");
expectIncludes(script, 'where("status", "==", "submitted")', "The review queue is not restricted to submitted work.");
expectIncludes(script, 'privacyWarnings(', "The private-information preflight check is missing.");
expectIncludes(script, 'data-review-check=', "The moderator safety confirmation is missing.");

expectIncludes(html, '<meta name="robots" content="noindex,nofollow"', "The pilot page should not be indexed.");
expectIncludes(html, "No private messages, profile photos, public comments, or public publication", "The disabled communication features are not explained.");
expectIncludes(index, "school-edition.html", "Regular Kigazine does not link to School Edition.");
expectIncludes(index, 'doc(db, "schoolParticipants", user.uid)', "Regular Kigazine does not check School Edition enrollment.");
expectIncludes(index, 'window.location.replace("school-edition.html")', "School participants are not redirected to their protected portal.");

const forbiddenCollectionWrites = ["messages", "comments", "privateMessages"];
forbiddenCollectionWrites.forEach(collectionName => {
  const pattern = new RegExp(`(?:addDoc|setDoc|updateDoc)\\([^\\n]*collection\\(db, ["']${collectionName}["']`);
  expect(!pattern.test(script), `School Edition writes to forbidden ${collectionName} data.`);
});

const participantWrite = script.match(/await setDoc\(doc\(db, "schoolParticipants", createdUser\.uid\), \{([\s\S]*?)\n\s*\}\);/);
expect(Boolean(participantWrite), "Could not find the school participant provisioning write.");
if (participantWrite) {
  expect(!/\bemail\s*:/.test(participantWrite[1]), "A school participant profile stores an email address.");
  expect(!/photo|displayName/i.test(participantWrite[1]), "A school participant profile stores an identity/photo field.");
}

if (failures.length) {
  console.error("School Edition validation failed:\n");
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`School Edition validation passed (${ids.length} unique HTML IDs, ${new Set(scriptIds).size} bound elements).`);
