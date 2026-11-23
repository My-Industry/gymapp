// The app's version and release notes. The developer edits this file by hand; nothing here is automatic.
//
// To ship a new version:
//   1. Change VERSION below.
//   2. Add a new entry at the TOP of RELEASES with the same version number, the date, and short notes.
//   (npm test checks that the two match.)
//
// Version numbers are MAJOR.MINOR.PATCH:
//   PATCH  small fixes             1.0.0 -> 1.0.1
//   MINOR  new features            1.0.1 -> 1.1.0
//   MAJOR  big or breaking change  1.1.0 -> 2.0.0

export const VERSION = '1.0.0';

// Newest first. Shown when someone clicks the version number in the profile menu.
export const RELEASES = [
  {
    version: '1.0.0',
    date: '2026-11-23',
    title: 'First release',
    notes: [
      'Members: searchable list with filters (active, expiring, expired), click a row for details, upgrade or edit a plan, delete.',
      'Packages: Basic Gym and Gym + Cardio. The fee you enter sets how many months the plan lasts.',
      'Monthly records: a tab for every month is created automatically, with New, Existing, Renewed, Upgraded and Left tags. Each member has a History page.',
      'Expired members: a green WhatsApp button opens a chat to remind them. Members whose plan ended in an earlier month leave the Members list.',
      'Accounts: sign up with an email, sign in, and reset a forgotten password. Accounts are stored in a Google Sheet.',
      'Google Sheets: connect your own sheet from Settings to keep your members there.',
      'Works on phones and desktops.',
      'Removed: the Import from Excel page.',
    ],
  },
];
