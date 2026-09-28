"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { magazineInput, commentInput, mayComment, publicMember } = require("./kigazine-core");

const profile = { username: "Reader", magazineSeriesName: "Science Weekly" };

test("magazine submissions use a strict server-side field allowlist", () => {
  const result = magazineInput({
    title: "Issue 1", description: "The stars", content: "A story about planets.",
    coverTheme: "navy", uid: "someone-else", status: "approved", isPublic: true
  }, profile);
  assert.deepEqual(Object.keys(result).sort(),
    ["title", "description", "content", "seriesName", "username", "coverTheme", "photoDataUrl"].sort());
  assert.equal(result.username, "Reader");
  assert.equal(result.seriesName, "Science Weekly");
});

test("private information and invalid media are rejected on the server", () => {
  assert.throws(() => magazineInput({ title: "Issue", description: "Email me at a@b.com", content: "Safe", coverTheme: "navy" }, profile), /private information/);
  assert.throws(() => magazineInput({ title: "Issue", description: "Safe", content: "Safe", coverTheme: "navy", photoDataUrl: "data:image/svg+xml;base64,PHN2Zz4=" }, profile), /supported image/);
  assert.throws(() => commentInput({ postId: "post1", content: "Meet me on Discord" }), /contact requests/);
});

test("friends-only comments require a reciprocal relationship", () => {
  const caller = { friendUids: ["author"] };
  const author = { friendUids: [] };
  assert.equal(mayComment("caller", caller, "author", author), false);
  author.friendUids.push("caller");
  assert.equal(mayComment("caller", caller, "author", author), true);
  assert.equal(mayComment("stranger", {}, "author", { commentsFriendsOnly: false }), true);
});

test("private member fields never enter a normal directory response", () => {
  const member = { username: "Robin", email: "secret@example.com", role: "writer", friendUids: ["caller"], discoverableProfile: true, photoDataUrl: "private-picture" };
  const result = publicMember("robin", member, "caller", { friendUids: [] });
  assert.equal(result.username, "Robin");
  assert.equal("email" in result, false);
  assert.equal("friendUids" in result, false);
  assert.equal("photoDataUrl" in result, false);
  assert.equal(publicMember("robin", { ...member, discoverableProfile: false }, "caller", { friendUids: [] }), null);
});
