"use strict";

const DAY = 86400000;
const SUBJECTS = ["Science", "Math", "Technology", "Robotics", "Nature", "Stories", "Art", "World & culture"];
class EditorialError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function check(ok, message, code = "invalid-argument") {
  if (!ok) throw new EditorialError(code, message);
}
function text(value, max, label, required = true) {
  check(typeof value === "string", `${label} must be text.`);
  const result = value.trim();
  check((!required || result.length > 0) && result.length <= max, `${label} must contain ${required ? "1" : "0"}–${max} characters.`);
  return result;
}
function id(value) { check(typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value), "Invalid record ID."); return value; }
function dateParts(date) {
  check(typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date), "Choose a valid date.");
  const d = new Date(`${date}T12:00:00Z`);
  check(Number.isFinite(+d) && d.toISOString().slice(0, 10) === date, "Choose a valid date.");
  return d;
}
function addDays(date, days) { return new Date(+dateParts(date) + days * DAY).toISOString().slice(0, 10); }
function addMonths(date, months) {
  const d = dateParts(date), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}
function zonedTime(date, time, timeZone) {
  dateParts(date);
  check(/^([01]\d|2[0-3]):[0-5]\d$/.test(time), "Choose a valid deadline time.");
  let format;
  try { format = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); }
  catch { throw new EditorialError("invalid-argument", "Enter a valid IANA time zone, such as Asia/Shanghai."); }
  const target = Date.parse(`${date}T${time}:00Z`);
  let guess = target;
  const local = timestamp => Object.fromEntries(format.formatToParts(timestamp).map(p => [p.type, p.value]));
  for (let i = 0; i < 4; i++) {
    const p = local(guess);
    const seen = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
    if (seen === target) return guess;
    guess += target - seen;
  }
  throw new EditorialError("invalid-argument", "This local time does not exist because of daylight saving. Choose another time.");
}
function validateSettings(input, now) {
  const c = {
    firstCollection: text(input.firstCollection, 10, "First collection"),
    firstPublication: text(input.firstPublication, 10, "First publication"),
    deadlineTime: text(input.deadlineTime, 5, "Deadline time"),
    timeZone: text(input.timeZone, 80, "Time zone"),
    extensionThreshold: Number(input.extensionThreshold),
    enabled: input.enabled === true
  };
  check(dateParts(c.firstCollection).getUTCDay() === 3, "The first collection must be a Wednesday.");
  check(Number.isInteger(c.extensionThreshold) && c.extensionThreshold >= 2 && c.extensionThreshold <= 100, "Extension interest must be 2–100 approved writers.");
  const first = zonedTime(c.firstCollection, c.deadlineTime, c.timeZone);
  const release = zonedTime(c.firstPublication, c.deadlineTime, c.timeZone);
  check(release > first, "The first issue date must be after the first collection.");
  check(first >= now - 366 * DAY && release <= now + 3 * 366 * DAY, "Choose dates within the editorial planning window.");
  return c;
}
function dueCollection(config, now) {
  if (!config) return null;
  const first = zonedTime(config.firstCollection, config.deadlineTime, config.timeZone);
  if (now < first) return null;
  let n = Math.floor((now - first) / (14 * DAY));
  let date = addDays(config.firstCollection, n * 14);
  let at = zonedTime(date, config.deadlineTime, config.timeZone);
  if (at > now) { n -= 1; date = addDays(config.firstCollection, n * 14); at = zonedTime(date, config.deadlineTime, config.timeZone); }
  return { date, at, cycleNumber: n + 1 };
}
function nextCollection(config, now) {
  if (!config) return null;
  const due = dueCollection(config, now);
  if (!due) return { date: config.firstCollection, at: zonedTime(config.firstCollection, config.deadlineTime, config.timeZone), cycleNumber: 1 };
  const cycleNumber = due.cycleNumber + 1;
  const date = addDays(config.firstCollection, (cycleNumber - 1) * 14);
  return { date, at: zonedTime(date, config.deadlineTime, config.timeZone), cycleNumber };
}
function publicationSlot(config, number) {
  check(config && Number.isInteger(number) && number >= 1 && number <= 100, "Choose issue number 1–100 after setting the schedule.");
  const date = addMonths(config.firstPublication, (number - 1) * 2);
  return { date, at: zonedTime(date, config.deadlineTime, config.timeZone) };
}
function wordCount(value = "") { return value.trim().split(/\s+/u).filter(Boolean).length; }
function subjectKey(value) { return text(value, 60, "Subject").normalize("NFKC").replace(/\s+/g, " ").toLocaleLowerCase("en"); }
function progress(section) { return Math.min(100, Math.round(wordCount(section.content) / section.targetWords * 100)); }
module.exports = { DAY, SUBJECTS, EditorialError, check, text, id, addDays, addMonths, zonedTime, validateSettings, dueCollection, nextCollection, publicationSlot, wordCount, subjectKey, progress };
