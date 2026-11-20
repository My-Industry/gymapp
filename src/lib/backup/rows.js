// What a backup looks like in the sheet. The columns line up with the Excel
// import template (Name, Phone, Plan, Fee, Start Date, WhatsApp Consent), so
// a backup can be re-imported with the "Import from Excel" tab.

export const SHEET_NAME = 'Members';

export const HEADERS = [
  'Member ID', 'Name', 'Phone', 'Plan', 'Fee',
  'Start Date', 'Expiry Date', 'WhatsApp Consent', 'Registered On',
];

/** Header row + one row per member, as plain strings/numbers. */
export function membersToRows(members) {
  return [
    HEADERS,
    ...members.map((m) => [
      m.id,
      m.name,
      m.phone, // string of digits, e.g. "919876543210"
      m.plan,
      m.fee,
      m.startDate,
      m.expiryDate,
      m.whatsappConsent ? 'Yes' : 'No',
      m.createdAt ? String(m.createdAt).slice(0, 10) : '',
    ]),
  ];
}
