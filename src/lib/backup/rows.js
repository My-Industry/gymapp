// What a backup looks like in the sheet. The columns line up with the Excel
// import template (Name, Phone, Plan, Fee, Start Date, WhatsApp Consent), so
// a backup can be re-imported with the "Import from Excel" tab.

import { planMonths, calculateExpiry, normalizePhone, parseAnyDate, parseConsent, parsePackage, parsePlan } from '../members.js';

export const SHEET_NAME = 'Members';

export const HEADERS = [
  'Member ID', 'Name', 'Phone', 'Plan', 'Fee',
  'Start Date', 'Expiry Date', 'WhatsApp Consent', 'Registered On', 'Package',
  'Date of Birth', 'Weight (kg)', 'Height (cm)',
]; // New columns are only ever added at the end, so existing sheets keep their column positions.

const positiveNumber = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); // "72,5" means 72.5
  return String(v ?? '').trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
};

/** One member as a sheet row (same column order as HEADERS). */
export function memberToRow(m) {
  return [
    m.id,
    m.name,
    m.phone, // string of digits, e.g. "919876543210"
    m.plan,
    m.fee,
    m.startDate,
    m.expiryDate,
    m.whatsappConsent ? 'Yes' : 'No',
    m.createdAt ? String(m.createdAt).slice(0, 10) : '',
    m.gymPackage || '',
    m.dateOfBirth || '',
    m.weightKg ?? '',
    m.heightCm ?? '',
  ];
}

/** Header row + one row per member, as plain strings/numbers. */
export function membersToRows(members) {
  return [HEADERS, ...members.map(memberToRow)];
}

/**
 * The reverse of memberToRow: reads one sheet row back into a member.
 * Forgiving, because the sheet can be edited by hand (dates re-formatted,
 * phone typed with spaces, ...). Returns null for rows without an id or name.
 */
export function rowToMember(row) {
  const [id, name, phone, plan, fee, startDate, expiryDate, consent, createdOn, gymPackage, dob, weight, height] =
    Array.from({ length: HEADERS.length }, (_, i) => row?.[i] ?? '');
  const memberId = String(id).trim();
  const memberName = String(name).trim();
  if (!memberId || !memberName) return null;

  const start = parseAnyDate(startDate) || '';
  const memberPlan = parsePlan(plan) || String(plan).trim();
  let expiry = parseAnyDate(expiryDate) || '';
  if (!expiry && start && planMonths(memberPlan)) expiry = calculateExpiry(start, memberPlan);

  const feeNumber = Number(String(fee).replace(/[₹,\s]/g, ''));
  return {
    id: memberId,
    name: memberName,
    phone: normalizePhone(phone) || String(phone).replace(/\D/g, ''),
    plan: memberPlan,
    gymPackage: parsePackage(gymPackage) || String(gymPackage).trim(), // '' for members added before packages existed
    fee: Number.isFinite(feeNumber) ? feeNumber : 0,
    startDate: start,
    expiryDate: expiry,
    whatsappConsent: parseConsent(consent),
    createdAt: String(createdOn).trim(),
    dateOfBirth: parseAnyDate(dob) || '',
    weightKg: positiveNumber(weight),
    heightCm: positiveNumber(height),
  };
}
