// Referral code dictionary for ReBe ReFresh.
// Loaded on refresh-groups.html, refresh-education.html, and refresh-faith.html only.
// Corporate AND private 1:1 pages intentionally do NOT use this — they're flat-priced.
//
// To add a code, paste a new entry inside REBE_CODES below.
// The key is the code (UPPERCASE — input is uppercased on validation).
// type: 'percent'  → value is 1–100 (percent off the base price)
// type: 'fixed'    → value is a dollar amount off the base price
//
// Example:
//   'CHURCH50': { type: 'fixed',   value: 50 },   // $50 off
//   'FRIEND10': { type: 'percent', value: 10 },   // 10% off
//
// Codes are case-insensitive (whatever the visitor types is uppercased before lookup).

window.REBE_CODES = {
  // Founding-cohort code — 50% off the cohort price.
  // Applies to groups / education / faith cohorts ($497 → $248.50). Not for 1:1 or corporate.
  'FOUNDING50': { type: 'percent', value: 50 },
};
