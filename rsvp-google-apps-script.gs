/* ============================================================
   RSVP REPLIES + GUEST LIST  —  Google Sheet backend (Apps Script)

   The Sheet has two tabs:
     Guests   one row per invitation. The RSVP page checks a guest's
              name against this list, so the list itself never has
              to be on the public website. Edit names here any time.
     Replies  every reply sent from rsvp.html, one row each.

   Highlighting:
     Guests   green row = coming, grey row = not coming,
              no colour = no reply yet.
     Replies  green "Yes" = matched an invitation on the guest list.
              amber row  = name wasn't on the list; worth a look.

   Do this from Catherine's or Charlie's Google account, so the
   replies belong to them.

   ── FIRST-TIME SETUP (about 5 minutes) ──────────────────────
   1. Go to  https://sheets.new  to make a new blank Google Sheet.
   2. In that Sheet, menu:  Extensions ▸ Apps Script.
   3. Delete whatever code is there, paste THIS WHOLE FILE in,
      then click the Save (disk) icon.
   4. In the toolbar, pick  setupSheets  from the function list and
      click Run (approve the permissions it asks for). This makes the
      Guests and Replies tabs.
   5. Paste the guest list into the Guests tab, starting at cell A2.
   6. Click  Deploy ▸ New deployment ▸ gear ▸ Web app.
        • Execute as: Me    • Who has access: Anyone
        • Deploy, approve the permissions. If Google warns "app isn't
          verified", click Advanced ▸ Go to (project name).
   7. Copy the Web app URL into  var RSVP_API = "..."  in rsvp.html.

   ── UPGRADING FROM THE FIRST VERSION ────────────────────────
   1. Extensions ▸ Apps Script, replace all the code with this file,
      Save.
   2. Run  setupSheets  once (step 4 above). It adds the Guests tab.
      The old Replies tab is renamed "Replies (old version ...)" and
      a fresh one is made with the new columns.
   3. Paste the guest list into the Guests tab at cell A2.
   4. Deploy ▸ Manage deployments ▸ pencil icon ▸ Version: New version
      ▸ Deploy. The URL stays the same, so rsvp.html needs no change.

   ── GUESTS TAB ──────────────────────────────────────────────
   Invitation ID    a short unique code, e.g. d20-example. Leave it
                    alone once set; new rows get one automatically.
   Name on invitation  how the invitation is shown to the guest.
   Guests           everyone on the invitation, comma separated, e.g.
                    "Jane Example, John Example". A nickname can go
                    in brackets: "Bob (Robert) Example" matches both.
   Invited          Day or Evening.
   Status, Coming, Replied on   filled in by the website. Don't edit.

   Guests are found by first name + surname (either part of a
   double-barrelled surname works, accents and one-letter typos are
   forgiven). Someone listed by first name only is found by their
   first name alone, so add surnames where you can.

   Opening the URL in a browser just shows {"ok":true,...}. It never
   shows the guest list or anyone's replies.
   ============================================================ */

// Email a copy of each reply? Leave NOTIFY_EMAIL blank to send it to
// the Google account that owns this script. Several addresses can be
// comma-separated, e.g. "cath@example.com, charlie@example.com".
var NOTIFY = true;
var NOTIFY_EMAIL = "";

var GUESTS = "Guests";
var REPLIES = "Replies";
var GUEST_HEADERS = ["Invitation ID", "Name on invitation", "Guests", "Invited", "Status", "Coming", "Replied on"];
var REPLY_HEADERS = [
  "Received", "Name", "Email", "Attending", "On guest list", "Invitation",
  "Coming", "Number coming", "Not coming", "Joining for",
  "Dietary needs", "Song request", "Message", "Earlier reply"
];
var G = { id: 0, label: 1, members: 2, invited: 3, status: 4, coming: 5, replied: 6 };   // Guests columns (0-based)
var R = { email: 2, onList: 4, invitation: 5 };                                           // Replies columns (0-based)
var GREEN = "#d9ead3", GREY = "#eeeeee", AMBER = "#fce5cd";

function doGet() {
  return json({ ok: true, service: "rsvp" });
}

function doPost(e) {
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: "Couldn't read the request." });
  }
  if (data.action === "lookup") return json(lookup_(data.name));
  return json(saveReply_(data));
}

// ---------- Finding a guest's invitation ----------

// Returns only the invitation(s) whose guests match the typed name,
// never the whole list.
function lookup_(typed) {
  var q = nameKey_(typed);
  if (q.length < 2) return { ok: true, matches: [] };
  var matches = readGuests_()
    .filter(function (g) { return g.members.some(function (m) { return nameMatches_(q, m); }); })
    .slice(0, 3)
    .map(function (g) { return { id: g.id, label: g.label, members: g.members, invited: g.invited }; });
  return { ok: true, matches: matches };
}

function nameMatches_(q, member) {
  var typed = q.split(" ");
  var v = variants_(member);
  if (!v.toks.length) return false;
  if (!v.firsts.some(function (f) { return near_(typed[0], f); })) return false;
  if (v.toks.length === 1) return true;          // listed by first name only
  if (typed.length < 2) return false;            // otherwise a surname is needed too
  var last = typed[typed.length - 1];
  return v.toks.slice(1).some(function (t) { return near_(last, t); });
}

// "Bob (Robert) Example" -> toks [bob, example], firsts [bob, robert]
function variants_(member) {
  var m = String(member);
  var alt = (m.match(/\(([^)]*)\)/) || [])[1] || "";
  var toks = nameKey_(m.replace(/\([^)]*\)/g, " ")).split(" ").filter(Boolean);
  var firsts = toks.slice(0, 1).concat(nameKey_(alt).split(" ").filter(Boolean));
  return { toks: toks, firsts: firsts };
}

// lower case, no accents, apostrophes dropped, hyphens/punctuation -> spaces
function nameKey_(s) {
  return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/['’`.]/g, "").replace(/[^a-z]+/g, " ").trim();
}

// Same word, or (for words of 5+ letters) one letter added, missing,
// changed, or two neighbouring letters swapped.
function near_(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  var i = 0;
  if (a.length === b.length) {
    while (a[i] === b[i]) i++;
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  var s = a.length > b.length ? a : b, t = a.length > b.length ? b : a;
  while (i < t.length && s[i] === t[i]) i++;
  return s.slice(i + 1) === t.slice(i);
}

function readGuests_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(GUESTS);
  if (!sh || sh.getLastRow() < 2) return [];
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, GUEST_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var members = String(r[G.members] || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    if (!members.length) continue;
    var id = String(r[G.id] || "").trim();
    if (!id) {                                    // a row added by hand: give it an ID
      id = "g" + new Date().getTime().toString(36) + i;
      sh.getRange(i + 2, G.id + 1).setValue(id);
    }
    out.push({
      row: i + 2, id: id, members: members,
      label: String(r[G.label] || "").trim() || members.join(" & "),
      invited: /^\s*e/i.test(String(r[G.invited])) ? "evening" : "day"
    });
  }
  return out;
}

// ---------- Saving a reply ----------

function saveReply_(data) {
  // Spam trap: real guests never see the "website" field, bots fill it in.
  // Pretend it worked so the bot moves on, but save nothing.
  if (data.website) return { ok: true };

  var reply = {
    name: clean(data.name, 200),
    email: clean(data.email, 200),
    attend: data.attend === "yes" ? "Yes" : data.attend === "no" ? "No" : "",
    parts: clean(data.parts, 100),
    guests: clean(data.guests, 10),
    names: clean(data.names, 500),
    notComing: clean(data.notComing, 500),
    diet: clean(data.diet, 500),
    song: clean(data.song, 300),
    message: clean(data.message, 2000),
    invitationId: String(data.householdId || "").trim().slice(0, 100)
  };
  if (!reply.name || !reply.attend) {
    return { ok: false, error: "Name and attendance are required." };
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return { ok: false, error: "Busy, please try again." };
  }
  var inv = null, earlier = "";
  try {
    if (reply.invitationId) {
      inv = readGuests_().filter(function (g) { return g.id === reply.invitationId; })[0] || null;
    }
    var sh = getRepliesSheet_();
    earlier = findEarlierReply_(sh, inv ? inv.label : "", reply.email);
    sh.appendRow([
      new Date(), reply.name, reply.email, reply.attend,
      inv ? "Yes" : "No - please check", inv ? inv.label : "",
      reply.names, reply.guests, reply.notComing, reply.parts,
      reply.diet, reply.song, reply.message,
      earlier ? "Yes, replaces the reply from " + earlier : ""
    ]);
    if (inv) updateGuestRow_(inv, reply);
  } finally {
    lock.releaseLock();
  }

  if (NOTIFY) {
    try { notify_(reply, inv, earlier); } catch (err) { /* the reply is saved; email is a bonus */ }
  }
  return { ok: true };
}

// Fill in Status / Coming / Replied on for the invitation (latest reply wins).
function updateGuestRow_(inv, reply) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(GUESTS);
  var coming = reply.attend === "Yes" ? (Number(reply.guests) || 0) : 0;
  var status = reply.attend === "Yes" ? "Coming (" + coming + " of " + inv.members.length + ")" : "Not coming";
  sh.getRange(inv.row, G.status + 1, 1, 3).setValues([[status, reply.attend === "Yes" ? reply.names : "", new Date()]]);
}

// If the same invitation (or the same email) has replied before, returns
// when the most recent earlier reply arrived, e.g. "8 Nov 2026 14:02".
function findEarlierReply_(sh, invitation, email) {
  var last = sh.getLastRow();
  if (last < 2) return "";
  var rows = sh.getRange(2, 1, last - 1, REPLY_HEADERS.length).getValues();
  var wantEmail = String(email || "").toLowerCase();
  for (var i = rows.length - 1; i >= 0; i--) {
    var sameInvitation = invitation && rows[i][R.invitation] === invitation;
    var sameEmail = wantEmail && String(rows[i][R.email]).toLowerCase() === wantEmail;
    if (sameInvitation || sameEmail) {
      var when = rows[i][0];
      return when instanceof Date
        ? Utilities.formatDate(when, sh.getParent().getSpreadsheetTimeZone(), "d MMM yyyy HH:mm")
        : String(when);
    }
  }
  return "";
}

function notify_(r, inv, earlier) {
  var to = NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
  if (!to) return;
  var subject = "RSVP: " + r.name + (r.attend === "Yes" ? " is coming" : " can't make it");
  var lines = [
    "Name: " + r.name,
    "Email: " + r.email,
    "Attending: " + r.attend,
    "On guest list: " + (inv ? "Yes (" + inv.label + ")" : "No - please check this one")
  ];
  if (r.attend === "Yes") {
    lines.push(
      "Coming: " + r.names + (r.guests ? " (" + r.guests + ")" : ""),
      "Joining for: " + r.parts,
      "Dietary needs: " + (r.diet || "none given"),
      "Song: " + (r.song || "none given")
    );
  }
  if (r.notComing) lines.push("Not coming: " + r.notComing);
  if (r.message) lines.push("", "Message:", r.message);
  if (earlier) lines.push("", "Note: this replaces their earlier reply from " + earlier + ".");
  lines.push("", "All replies: " + SpreadsheetApp.getActiveSpreadsheet().getUrl());
  MailApp.sendEmail({ to: to, subject: subject, body: lines.join("\n"), replyTo: r.email || undefined });
}

// ---------- Tabs, headers and highlighting ----------

// Run once from the Apps Script editor (see SETUP above). Safe to re-run.
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(GUESTS)) {
    var g = ss.insertSheet(GUESTS, 0);
    g.appendRow(GUEST_HEADERS);
    styleHeader_(g, GUEST_HEADERS.length);
    var rows = g.getMaxRows() - 1, all = g.getRange(2, 1, rows, GUEST_HEADERS.length);
    g.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=LEFT($E2,6)="Coming"').setBackground(GREEN).setRanges([all]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$E2="Not coming"').setBackground(GREY).setRanges([all]).build()
    ]);
    g.getRange(2, G.invited + 1, rows, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(["Day", "Evening"], true).setAllowInvalid(false).build());
    [130, 280, 440, 90, 140, 320, 150].forEach(function (w, i) { g.setColumnWidth(i + 1, w); });
    g.getRange(1, G.status + 1, 1, 3).setNote("Filled in automatically when a guest replies on the website. No need to edit.");
  }
  getRepliesSheet_();
}

// The Replies tab, with the current columns. An older Replies tab with
// different columns is renamed (kept, not deleted) and a fresh one made.
function getRepliesSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(REPLIES);
  if (sh) {
    var head = sh.getRange(1, 1, 1, REPLY_HEADERS.length).getValues()[0];
    if (head.join("|") === REPLY_HEADERS.join("|")) return sh;
    sh.setName(REPLIES + " (old version " + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "d MMM HH:mm") + ")");
  }
  sh = ss.insertSheet(REPLIES);
  sh.appendRow(REPLY_HEADERS);
  styleHeader_(sh, REPLY_HEADERS.length);
  var rows = sh.getMaxRows() - 1;
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=AND($B2<>"",$E2<>"Yes")').setBackground(AMBER)
      .setRanges([sh.getRange(2, 1, rows, REPLY_HEADERS.length)]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Yes").setBackground(GREEN)
      .setRanges([sh.getRange(2, R.onList + 1, rows, 1)]).build()
  ]);
  return sh;
}

function styleHeader_(sh, n) {
  sh.getRange(1, 1, 1, n).setFontWeight("bold");
  sh.setFrozenRows(1);
}

// Trim, cap the length, and stop text that starts with = + - @ from being
// treated as a spreadsheet formula.
function clean(value, max) {
  var s = String(value == null ? "" : value).trim().slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
