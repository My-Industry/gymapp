// Pure member-management logic (no React, no browser APIs) so it is easy to test.

export const PLANS = {
  Monthly: 1,
  Quarterly: 3,
  'Half-yearly': 6,
  Yearly: 12,
};

export const PLAN_NAMES = Object.keys(PLANS);

/** Months covered by a plan: the four standard plans, or a custom "2 Months", "5 Months"… */
export function planMonths(plan) {
  if (PLANS[plan]) return PLANS[plan];
  const m = /^(\d{1,2})\s*months?$/i.exec(String(plan ?? '').trim());
  const n = m ? Number(m[1]) : 0;
  return n >= 1 && n <= 60 ? n : 0;
}

/** The plan name for a number of months: "Monthly", "Quarterly"… or "2 Months". */
export function planForMonths(n) {
  return PLAN_NAMES.find((name) => PLANS[name] === n) || `${n} Months`;
}

// What the member gets, priced per month in rupees. The Plan above is only how
// long they pay for. Change the prices here if the gym's rates change.
export const PACKAGES = {
  'Basic Gym': 500,
  'Gym + Cardio': 1000,
};

export const PACKAGE_NAMES = Object.keys(PACKAGES);
export const DEFAULT_PACKAGE = 'Basic Gym';

/** Suggested fee: monthly rate × number of months in the plan. */
export function suggestedFee(gymPackage, plan) {
  const rate = PACKAGES[gymPackage];
  const months = planMonths(plan);
  return rate && months ? rate * months : null;
}

/**
 * How many months a payment covers at the package's monthly rate, e.g. ₹1,000 on
 * Basic Gym (₹500/month) = 2. Returns null unless the amount is a whole number of months.
 */
export function planFromFee(gymPackage, fee, fallbackPlan) {
  const months = monthsFromFee(gymPackage, fee);
  return months ? planForMonths(months) : fallbackPlan;
}

export function monthsFromFee(gymPackage, fee) {
  const rate = PACKAGES[gymPackage];
  const amount = Number(String(fee ?? '').replace(/[₹,\s]/g, ''));
  if (!rate || !isFinite(amount) || amount <= 0) return null;
  const months = amount / rate;
  return Number.isInteger(months) && months >= 1 && months <= 36 ? months : null;
}

/* ---------------------------------------------------------------- Phone */

/**
 * Cleans an Indian mobile number and returns it as 12 digits with the 91
 * prefix (e.g. "919876543210"), or null if it is not a valid mobile number.
 * Accepts "98765 43210", "+91-98765-43210", "098765 43210", "0091...", etc.
 */
export function normalizePhone(input) {
  if (input === null || input === undefined) return null;
  let digits = String(input).replace(/\D/g, '');
  digits = digits.replace(/^0+/, ''); // 0 trunk prefix or 00 international prefix
  if (digits.length === 10) digits = '91' + digits;
  if (digits.length !== 12 || !digits.startsWith('91')) return null;
  if (!/[6-9]/.test(digits[2])) return null; // Indian mobiles start with 6-9
  return digits;
}

export function formatPhone(normalized) {
  if (!normalized || normalized.length !== 12) return normalized || '';
  return `+91 ${normalized.slice(2, 7)} ${normalized.slice(7)}`;
}

/* ---------------------------------------------------------------- Dates */
// Dates are kept as "YYYY-MM-DD" strings everywhere to avoid timezone shifts.

const pad = (n, len = 2) => String(n).padStart(len, '0');
const toISO = (y, m, d) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

export function daysInMonth(year, month /* 1-12 */) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidISODate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return false;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

/**
 * Adds whole months to an ISO date, clamping to the last day of the target
 * month: 2026-01-31 + 1 → 2026-02-28, 2028-01-31 + 1 → 2028-02-29.
 */
export function addMonths(iso, months) {
  if (!isValidISODate(iso)) throw new Error(`Invalid date: ${iso}`);
  const [y, m, d] = iso.split('-').map(Number);
  const total = (m - 1) + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12 + 1;
  return toISO(year, month, Math.min(d, daysInMonth(year, month)));
}

export function calculateExpiry(startDate, plan) {
  const months = planMonths(plan);
  if (!months) throw new Error(`Unknown plan: ${plan}`);
  return addMonths(startDate, months);
}

export function todayISO(now = new Date()) {
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function daysBetween(fromISO, toISODate) {
  const a = Date.UTC(...fromISO.split('-').map((v, i) => (i === 1 ? v - 1 : +v)));
  const b = Date.UTC(...toISODate.split('-').map((v, i) => (i === 1 ? v - 1 : +v)));
  return Math.round((b - a) / 86400000);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function formatDate(iso) {
  if (!isValidISODate(iso)) return iso || '';
  const [y, m, d] = iso.split('-').map(Number);
  const mon = MONTHS[m - 1];
  return `${d} ${mon[0].toUpperCase()}${mon.slice(1)} ${y}`;
}

/**
 * Turns whatever a spreadsheet cell holds into "YYYY-MM-DD", or null.
 * Handles Excel serial numbers, JS Dates, ISO strings, Indian-style
 * DD/MM/YYYY (also with - or .), and "15 Jan 2026".
 */
export function parseAnyDate(value) {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date && !isNaN(value)) {
    return toISO(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === 'number' && isFinite(value)) {
    // Excel serial: day 0 = 1899-12-30 (accounts for Excel's 1900 leap-year bug)
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  const s = String(value).trim();
  let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) {
    const iso = toISO(+m[1], +m[2], +m[3]);
    return isValidISODate(iso) ? iso : null;
  }
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s))) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const iso = toISO(year, +m[2], +m[1]); // day first
    return isValidISODate(iso) ? iso : null;
  }
  if ((m = /^(\d{1,2})[\s-]+([A-Za-z]{3,})[\s,-]+(\d{4})$/.exec(s))) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi === -1) return null;
    const iso = toISO(+m[3], mi + 1, +m[1]);
    return isValidISODate(iso) ? iso : null;
  }
  if (/^\d+(\.\d+)?$/.test(s)) return parseAnyDate(Number(s));
  return null;
}

/* ---------------------------------------------------------------- Plans */

export function parsePlan(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  const map = {
    monthly: 'Monthly', month: 'Monthly', '1': 'Monthly', '1month': 'Monthly', '1m': 'Monthly',
    quarterly: 'Quarterly', quarter: 'Quarterly', '3': 'Quarterly', '3months': 'Quarterly', '3m': 'Quarterly',
    halfyearly: 'Half-yearly', halfyear: 'Half-yearly', '6': 'Half-yearly', '6months': 'Half-yearly', '6m': 'Half-yearly',
    yearly: 'Yearly', year: 'Yearly', annual: 'Yearly', annually: 'Yearly', '12': 'Yearly', '12months': 'Yearly', '12m': 'Yearly', '1year': 'Yearly',
  };
  if (map[s]) return map[s];
  const custom = /^(\d{1,2})(months?|m)$/.exec(s); // "2 months", "5m"
  return custom && +custom[1] >= 1 && +custom[1] <= 60 ? planForMonths(+custom[1]) : null;
}

export function parsePackage(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  const map = {
    basic: 'Basic Gym', basicgym: 'Basic Gym', gym: 'Basic Gym', gymonly: 'Basic Gym',
    gymcardio: 'Gym + Cardio', gymandcardio: 'Gym + Cardio', gymwithcardio: 'Gym + Cardio', cardio: 'Gym + Cardio',
  };
  return map[s] || null;
}

/* ---------------------------------------------------------------- IDs */

export function nextMemberId(members, offset = 0) {
  const max = members.reduce((acc, mem) => {
    const n = parseInt(String(mem.id).replace(/^GYM-/, ''), 10);
    return isNaN(n) ? acc : Math.max(acc, n);
  }, 0);
  return `GYM-${pad(max + 1 + offset, 3)}`; // GYM-001 … GYM-999, then GYM-1000 and on
}

/** Sorts IDs by their number, so GYM-000009 / GYM-010 / GYM-1000 come out in order. */
export const compareIds = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

/* ---------------------------------------------------------------- Members page rules */

/**
 * The Members page lists current members only: someone whose plan ran out in an
 * earlier month is no longer shown (their history stays in the monthly records).
 * Plans that expired earlier this month are still listed, marked as expired.
 */
export function isListedMember(member, today = todayISO()) {
  return String(member.expiryDate).slice(0, 7) >= today.slice(0, 7);
}

export const STATUS_FILTERS = [
  { key: 'all', label: 'All members' },
  { key: 'active', label: 'Active (plan running)' },
  { key: 'expiring', label: 'Expiring within 7 days' },
  { key: 'expired', label: 'Expired this month' },
];

/**
 * Members-page filters. `status` is memberStatus(...).key; `filters` is
 * { status: 'all'|'active'|'expiring'|'expired', gymPackage: 'all'|name, plan: 'all'|name|'other' }.
 * "Active" means the plan has not run out (it includes plans about to expire).
 */
export function matchesFilters(member, status, filters) {
  const s = filters.status || 'all';
  if (s === 'active' && status === 'expired') return false;
  if ((s === 'expiring' || s === 'expired') && status !== s) return false;
  const pkg = filters.gymPackage || 'all';
  if (pkg !== 'all' && (member.gymPackage || DEFAULT_PACKAGE) !== pkg) return false;
  const plan = filters.plan || 'all';
  if (plan === 'other') return !PLAN_NAMES.includes(member.plan);
  return plan === 'all' || member.plan === plan;
}

/** wa.me chat link for a stored phone number ("919876543210"), or null. */
export function whatsappLink(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? `https://wa.me/${digits}` : null;
}

/* ---------------------------------------------------------------- Members */

export function findByPhone(members, normalizedPhone) {
  return members.find((m) => m.phone === normalizedPhone) || null;
}

/**
 * Validates raw form/import input. Returns { errors: string[], member }.
 * `member` is only set when there are no errors; it has no id yet.
 */
export function validateMember(input, existing = []) {
  const errors = [];
  const name = String(input.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) errors.push('Name is required');

  const phone = normalizePhone(input.phone);
  if (!String(input.phone ?? '').trim()) errors.push('Phone is required');
  else if (!phone) errors.push('Phone is not a valid 10-digit Indian mobile number');
  else {
    const dup = findByPhone(existing, phone);
    if (dup) errors.push(`Phone already registered to ${dup.name} (${dup.id})`);
  }

  const plan = planMonths(input.plan) ? planForMonths(planMonths(input.plan)) : parsePlan(input.plan);
  if (!plan) errors.push('Plan must be Monthly, Quarterly, Half-yearly, Yearly or a number of months (e.g. 2 Months)');

  // Older imports and sheet rows have no package: treat blank as the basic one.
  const gymPackage = String(input.gymPackage ?? '').trim() === ''
    ? DEFAULT_PACKAGE
    : (PACKAGES[input.gymPackage] ? input.gymPackage : parsePackage(input.gymPackage));
  if (!gymPackage) errors.push('Package must be Basic Gym or Gym + Cardio');

  const feeRaw = String(input.fee ?? '').replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');
  const fee = Number(feeRaw);
  if (feeRaw === '' || !isFinite(fee)) errors.push('Fee must be a number');
  else if (fee < 0) errors.push('Fee cannot be negative');

  const startDate = isValidISODate(input.startDate) ? input.startDate : parseAnyDate(input.startDate);
  if (!startDate) errors.push('Start date is missing or not a valid date');

  if (errors.length) return { errors, member: null };

  return {
    errors,
    member: {
      name,
      phone,
      plan,
      gymPackage,
      fee: Math.round(fee * 100) / 100,
      startDate,
      expiryDate: calculateExpiry(startDate, plan),
      whatsappConsent: Boolean(input.whatsappConsent),
    },
  };
}

export function createMember(input, existing, now = new Date()) {
  const { errors, member } = validateMember(input, existing);
  if (errors.length) return { errors, member: null };
  return {
    errors,
    member: { id: nextMemberId(existing), ...member, createdAt: now.toISOString() },
  };
}

export function memberStatus(member, today = todayISO()) {
  const left = daysBetween(today, member.expiryDate);
  if (left < 0) return { key: 'expired', label: `Expired ${-left}d ago`, daysLeft: left };
  if (left <= 7) return { key: 'expiring', label: left === 0 ? 'Expires today' : `${left}d left`, daysLeft: left };
  return { key: 'active', label: 'Active', daysLeft: left };
}

/* ---------------------------------------------------------------- Import */

const HEADER_ALIASES = {
  name: ['name', 'membername', 'fullname', 'member'],
  phone: ['phone', 'phoneno', 'phonenumber', 'mobile', 'mobileno', 'mobilenumber', 'contact', 'contactnumber', 'whatsappnumber', 'number'],
  plan: ['plan', 'membership', 'membershipplan', 'duration'],
  gymPackage: ['package', 'packagetype', 'gymtype', 'type', 'category'],
  fee: ['fee', 'fees', 'amount', 'price', 'paid', 'amountpaid'],
  startDate: ['startdate', 'start', 'joiningdate', 'joindate', 'dateofjoining', 'doj', 'date'],
  whatsappConsent: ['whatsappconsent', 'whatsapp', 'consent', 'optin', 'whatsappoptin'],
};

const headerKey = (h) => String(h).toLowerCase().replace(/[^a-z]/g, '');

export function mapRow(row) {
  const out = {};
  for (const [rawKey, value] of Object.entries(row)) {
    const k = headerKey(rawKey);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (out[field] === undefined && aliases.includes(k)) out[field] = value;
    }
  }
  return out;
}

export function parseConsent(value) {
  if (typeof value === 'boolean') return value;
  return ['yes', 'y', 'true', '1', 'agreed', 'ok', '✓', '✔'].includes(String(value ?? '').trim().toLowerCase());
}

/**
 * Takes rows from a spreadsheet (array of { header: value } objects) and
 * returns which rows can be imported, which are duplicates, and which have errors.
 * Row numbers match the spreadsheet (header is row 1).
 */
export function prepareImport(rows, existing, now = new Date()) {
  const ready = [];
  const duplicates = [];
  const invalid = [];
  const seen = [...existing];

  rows.forEach((row, i) => {
    const rowNumber = i + 2;
    const mapped = mapRow(row);
    if (Object.values(mapped).every((v) => v === undefined || String(v).trim() === '')) return; // blank row

    const input = { ...mapped, whatsappConsent: parseConsent(mapped.whatsappConsent) };
    // Older files used a "Package" column for the duration (Monthly, Yearly…).
    if (String(input.plan ?? '').trim() === '' && parsePlan(input.gymPackage) && !parsePackage(input.gymPackage)) {
      input.plan = input.gymPackage;
      input.gymPackage = '';
    }
    const phone = normalizePhone(input.phone);
    const dup = phone && findByPhone(seen, phone);
    if (dup) {
      duplicates.push({ rowNumber, name: String(input.name ?? ''), phone, matches: `${dup.name} (${dup.id})` });
      return;
    }

    const { errors, member } = validateMember(input, seen);
    if (errors.length) {
      invalid.push({ rowNumber, name: String(input.name ?? ''), errors });
      return;
    }
    const full = { id: nextMemberId(seen), ...member, createdAt: now.toISOString() };
    ready.push(full);
    seen.push(full);
  });

  return { ready, duplicates, invalid };
}

export const TEMPLATE_ROWS = [
  { Name: 'Ravi Kumar', Phone: '98765 43210', Package: 'Basic Gym', Plan: 'Monthly', Fee: 500, 'Start Date': '15/01/2026', 'WhatsApp Consent': 'Yes' },
  { Name: 'Priya Sharma', Phone: '+91 91234 56789', Package: 'Gym + Cardio', Plan: 'Quarterly', Fee: 3000, 'Start Date': '31/01/2026', 'WhatsApp Consent': 'No' },
];
