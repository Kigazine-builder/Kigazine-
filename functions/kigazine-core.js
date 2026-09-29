"use strict";

const COVER_THEMES = new Set(["navy", "coral", "teal", "purple", "gold"]);
const PRIVATE_INFO = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/,
  /\b\d{1,6}\s+[A-Za-z0-9.'-]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way)\b/i,
  /\b(?:my|our|the)\s+school\s+(?:is|called|name is)\b/i,
  /\b(?:password|passcode|my login|my address|my school|phone number)\b/i
];
const CONTACT_CUE = /\b(?:text|call|email|dm|direct message|message me|contact me|meet me|meet up|come find me|let'?s meet|on snapchat|on instagram|on discord|on whatsapp|on tiktok|in private chat)\b/i;

function requiredText(value, max, label) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new TypeError(`${label} must contain 1–${max} characters.`);
  }
  return value.trim();
}

function rejectPrivateInfo(value) {
  if (PRIVATE_INFO.some(pattern => pattern.test(value)) || CONTACT_CUE.test(value)) {
    throw new TypeError("Remove contact requests and private information before submitting.");
  }
}

function magazineInput(input, profile) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("A magazine is required.");
  }
  const title = requiredText(input.title, 120, "Title");
  const description = requiredText(input.description, 500, "Description");
  if (!Array.isArray(input.pages) || input.pages.length < 1 || input.pages.length > 6) {
    throw new TypeError("Use 1–6 issue pages.");
  }
  const pages = input.pages.map((page, index) => {
    if (!page || typeof page !== "object") throw new TypeError(`Page ${index + 1} is invalid.`);
    const text = requiredText(page.text, 5200, `Page ${index + 1}`);
    const imageDataUrl = page.imageDataUrl ?? "";
    if (typeof imageDataUrl !== "string" || imageDataUrl.length > 110000 ||
        (imageDataUrl && !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(imageDataUrl))) {
      throw new TypeError(`Page ${index + 1} image must be a supported image under 80 KB.`);
    }
    return { text, imageDataUrl };
  });
  const content = pages.map(page => page.text).join("\n\n");
  if (pages.reduce((total, page) => total + page.text.length, 0) > 5200) {
    throw new TypeError("Issue pages must contain at most 5200 characters total.");
  }
  const seriesName = requiredText(profile.magazineSeriesName, 50, "Magazine series name");
  const username = requiredText(profile.username, 40, "Username");
  rejectPrivateInfo([title, description, content, seriesName, username].join("\n"));
  if (!COVER_THEMES.has(input.coverTheme)) throw new TypeError("Choose a valid cover theme.");

  const photoDataUrl = input.photoDataUrl ?? "";
  if (typeof photoDataUrl !== "string" || photoDataUrl.length > 650000 ||
      (photoDataUrl && !/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(photoDataUrl))) {
    throw new TypeError("Choose a supported image under 650 KB.");
  }
  if (photoDataUrl.length + pages.reduce((total, page) => total + page.imageDataUrl.length, 0) > 850000) {
    throw new TypeError("This issue has too many large images. Use smaller illustrations.");
  }
  // Only these properties reach Firestore. Caller-provided uid, status, and role are ignored.
  return { title, description, content, pages, seriesName, username, coverTheme: input.coverTheme, photoDataUrl };
}

function commentInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("A comment is required.");
  }
  const postId = requiredText(input.postId, 200, "Post ID");
  if (!/^[A-Za-z0-9_-]+$/.test(postId)) throw new TypeError("Invalid post ID.");
  const content = requiredText(input.content, 240, "Comment");
  rejectPrivateInfo(content);
  return { postId, content };
}

function mayComment(callerUid, callerProfile, authorUid, authorProfile) {
  if (callerUid === authorUid) return true;
  if (authorProfile?.commentsFriendsOnly === false) return true;
  return Array.isArray(callerProfile?.friendUids) &&
    Array.isArray(authorProfile?.friendUids) &&
    callerProfile.friendUids.includes(authorUid) &&
    authorProfile.friendUids.includes(callerUid);
}

function publicMember(id, profile, callerUid, callerProfile) {
  const visible = id === callerUid || profile.discoverableProfile === true ||
    (Array.isArray(callerProfile.friendUids) && callerProfile.friendUids.includes(id) &&
      Array.isArray(profile.friendUids) && profile.friendUids.includes(callerUid));
  if (!visible || typeof profile.username !== "string" || !profile.username.trim()) return null;
  return {
    id,
    username: profile.username,
    magazineSeriesName: profile.magazineSeriesName || "",
    role: profile.role === "admin" ? "admin" : "writer",
    discoverableProfile: profile.discoverableProfile === true
  };
}

module.exports = { requiredText, magazineInput, commentInput, mayComment, publicMember };
