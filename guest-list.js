// =============================================================
//  GUEST LIST  —  Catherine & Charlie, this is the only file
//  you need to edit to control the RSVP name lookup.
//
//  One entry per invitation (a household = everyone on one card).
//    id       a short unique tag, no spaces (used behind the scenes)
//    label    how the household shows in the suggestions
//    members  every named person on that invitation
//    invited  "day"  = whole day   |   "evening" = evening only
//
//  When a guest starts typing their name on the RSVP page, we match
//  against these and pre-fill their party, size and which part of
//  the day they're invited to. If a name isn't found, they can still
//  fill the form in by hand — nothing breaks.
//
//  These are sample rows — replace them with your real guest list.
// =============================================================
window.GUEST_LIST = [
  { id: "okafor", label: "Priya & Sam Okafor",   members: ["Priya Okafor", "Sam Okafor"],                 invited: "day" },
  { id: "walsh",  label: "The Walsh family",      members: ["Aoife Walsh", "Declan Walsh", "Niamh Walsh"], invited: "day" },
  { id: "hughes", label: "Tom & Steph Hughes",    members: ["Tom Hughes", "Steph Hughes"],                 invited: "evening" },
  { id: "patel",  label: "Anita Patel & guest",   members: ["Anita Patel", "Guest"],                       invited: "day" },
  { id: "reid",   label: "Grandma Reid",          members: ["Margaret Reid"],                              invited: "day" }
];
