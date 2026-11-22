// Monthly records: one tab per month ("Nov-2026") in the same Google Sheet, listing
// every member whose plan touches that month. Pure logic only (no network), so it
// is easy to test; api/_lib/sheets.js does the reading and writing.
//
// Rules (agreed with the gym):
//  - A member is in a month if their plan overlaps it (starts on/before its last day
//    and expires on/after its first day). A plan that ended in an earlier month is not listed.
//  - One row per member per month. Upgrades and renewals update that row in place.
//  - Tags: New, Existing, Renewed, Upgraded, Left (deleted by the manager).
//  - Months are created when the app is first opened in that month; if nobody opened it
//    for a while, the missed months are created too. Months before the very first tab are never created.

import { daysInMonth } from './members.js';

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const TAGS = { NEW: 'New', EXISTING: 'Existing', RENEWED: 'Renewed', UPGRADED: 'Upgraded', LEFT: 'Left' };

export const MONTH_HEADERS = [
  'Member ID', 'Name', 'Phone', 'Package', 'Duration', 'Start Date', 'Expiry Date',
  'Fee Paid This Month', 'Tag', 'Upgraded From', 'Status',
];

const pad = (n) => String(n).padStart(2, '0');

/* ------------------------------------------------------------ month names */

/** { year, month } (month 1-12) for an ISO date "2026-11-22". */
export function monthOf(iso) {
  const [year, month] = String(iso).split('-').map(Number);
  return { year, month };
}

/** "Nov-2026" */
export function monthTitle({ year, month }) {
  return `${MONTH_NAMES[month - 1]}-${year}`;
}

/** { year, month } from a tab title, or null when it is not a month tab. */
export function parseMonthTitle(title) {
  const m = /^([A-Z][a-z]{2})-(\d{4})$/.exec(String(title ?? '').trim());
  if (!m) return null;
  const month = MONTH_NAMES.indexOf(m[1]) + 1;
  return month ? { year: +m[2], month } : null;
}

const index = ({ year, month }) => year * 12 + (month - 1);
const fromIndex = (i) => ({ year: Math.floor(i / 12), month: (i % 12) + 1 });

export function compareMonths(a, b) {
  return index(a) - index(b);
}

/** First and last day of a month as ISO dates. */
export function monthBounds({ year, month }) {
  return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(daysInMonth(year, month))}` };
}

/**
 * Which month tabs to create. With none yet, only the current month (never earlier
 * ones). Otherwise every month after the newest tab, up to and including the current one.
 */
export function monthsToCreate(existing, current) {
  if (!existing.length) return [current];
  const newest = existing.reduce((a, b) => (compareMonths(a, b) >= 0 ? a : b));
  const out = [];
  for (let i = index(newest) + 1; i <= index(current); i += 1) out.push(fromIndex(i));
  return out;
}

/** Today's date in India (the gym's time zone), so the 1st starts at midnight there. */
export function todayInIndia(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now); // YYYY-MM-DD
}

/* ------------------------------------------------------------------- rows */
// A month row: { id, name, phone, gymPackage, plan, startDate, expiryDate, fee, tag, upgradedFrom, status }

const statusFor = (expiryDate, bounds) => (expiryDate && expiryDate < bounds.end ? 'Expired' : 'Active');
const overlaps = (m, bounds) => Boolean(m.startDate && m.expiryDate && m.startDate <= bounds.end && m.expiryDate >= bounds.start);
const startsIn = (m, bounds) => m.startDate >= bounds.start && m.startDate <= bounds.end;

export function rowToValues(r) {
  return [
    r.id, r.name, r.phone, r.gymPackage, r.plan, r.startDate, r.expiryDate,
    r.fee, r.tag, r.upgradedFrom || '', r.status,
  ];
}

export function valuesToRow(values) {
  const [id, name, phone, gymPackage, plan, startDate, expiryDate, fee, tag, upgradedFrom, status] =
    Array.from({ length: MONTH_HEADERS.length }, (_, i) => String(values?.[i] ?? '').trim());
  if (!id) return null;
  const feeNumber = Number(fee.replace(/[₹,\s]/g, ''));
  return {
    id, name, phone, gymPackage, plan, startDate, expiryDate,
    fee: Number.isFinite(feeNumber) ? feeNumber : 0,
    tag, upgradedFrom, status,
  };
}

function rowFromMember(m, bounds, tag, fee) {
  return {
    id: m.id,
    name: m.name,
    phone: m.phone,
    gymPackage: m.gymPackage || '',
    plan: m.plan,
    startDate: m.startDate,
    expiryDate: m.expiryDate,
    fee,
    tag,
    upgradedFrom: '',
    status: statusFor(m.expiryDate, bounds),
  };
}

/**
 * The rows of a brand-new month tab.
 *  - prevRows: the previous month's rows (or null when this is the very first tab).
 *    Members still running keep their row; those marked Left are not carried over.
 *  - members: the Members tab as it is now. A member whose current plan touches the month
 *    is listed with those details (they are the freshest).
 */
export function buildMonthRows(month, members, prevRows = null) {
  const bounds = monthBounds(month);
  const prevIds = new Set((prevRows || []).map((r) => r.id));
  const rows = new Map();

  for (const r of prevRows || []) {
    if (r.tag === TAGS.LEFT || !r.expiryDate || r.expiryDate < bounds.start) continue;
    rows.set(r.id, { ...r, fee: 0, tag: TAGS.EXISTING, upgradedFrom: '', status: statusFor(r.expiryDate, bounds) });
  }

  const key = (iso) => String(iso || '').slice(0, 7);
  for (const m of members) {
    if (!overlaps(m, bounds)) continue;
    const registeredNow = key(m.createdAt) === key(bounds.start);
    const firstSeen = prevRows !== null && !prevIds.has(m.id) && startsIn(m, bounds);
    let tag = TAGS.EXISTING;
    if (registeredNow || firstSeen) tag = TAGS.NEW;
    else if (startsIn(m, bounds)) tag = TAGS.RENEWED;
    rows.set(m.id, rowFromMember(m, bounds, tag, startsIn(m, bounds) ? m.fee : 0));
  }

  return [...rows.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** The row for a member added this month, or null when their plan doesn't touch the month. */
export function rowForNewMember(member, month) {
  const bounds = monthBounds(month);
  if (!overlaps(member, bounds)) return null;
  return rowFromMember(member, bounds, startsIn(member, bounds) ? TAGS.NEW : TAGS.EXISTING, startsIn(member, bounds) ? member.fee : 0);
}

/**
 * The row after a member is edited. `row` is their current row in this month (or null),
 * `before` and `after` are the member before and after the edit.
 *  - Package changed            -> Upgraded (keeps New if they joined this month), remembers the old package.
 *  - Dates/duration changed     -> Renewed
 *  - Only name/phone/fee fixed  -> details synced, tag unchanged
 * A new payment (package or dates changed) is added to "Fee Paid This Month".
 */
export function rowAfterUpdate(row, before, after, month) {
  const bounds = monthBounds(month);
  const packageChanged = Boolean(before.gymPackage) && before.gymPackage !== after.gymPackage;
  const datesChanged = before.startDate !== after.startDate || before.expiryDate !== after.expiryDate || before.plan !== after.plan;

  let base = row;
  if (!base) {
    if (!overlaps(after, bounds)) return null;
    base = rowFromMember(after, bounds, TAGS.EXISTING, 0);
  }

  const next = {
    ...base,
    name: after.name,
    phone: after.phone,
    gymPackage: after.gymPackage || '',
    plan: after.plan,
    startDate: after.startDate,
    expiryDate: after.expiryDate,
    status: statusFor(after.expiryDate, bounds),
  };

  if (packageChanged || datesChanged) {
    next.fee = (base.fee || 0) + after.fee;
    if (packageChanged) {
      next.tag = base.tag === TAGS.NEW ? TAGS.NEW : TAGS.UPGRADED;
      if (!next.upgradedFrom) next.upgradedFrom = before.gymPackage;
    } else if (base.tag === TAGS.EXISTING || !base.tag) {
      next.tag = TAGS.RENEWED;
    }
  } else {
    next.fee = Math.max(0, (base.fee || 0) + (after.fee - before.fee)); // a corrected fee, not a new payment
  }
  return next;
}

/** The row for a member who was deleted: kept in the month, tagged Left. */
export function rowForLeft(row, member, month) {
  const bounds = monthBounds(month);
  const base = row || rowFromMember(member, bounds, TAGS.LEFT, 0);
  return { ...base, tag: TAGS.LEFT, status: 'Left' };
}
