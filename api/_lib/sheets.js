// Members live in a private Google Sheet. The server signs in to Google as a
// "service account" (a robot user that only sees sheets you share with it),
// so no member data ever touches the browser's storage or a public service.
//
// Config (environment variables):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL   client_email from the service account's JSON key
//   GOOGLE_PRIVATE_KEY             private_key from the same JSON key (keep the \n escapes)
//   GOOGLE_SHEET_ID                the spreadsheet's id, or its full link
//
// Files/folders starting with "_" inside /api are NOT exposed as endpoints by Vercel.

import { createSign } from 'node:crypto';
import { HEADERS, SHEET_NAME, memberToRow, rowToMember } from '../../src/lib/backup/rows.js';
import { nextMemberId, normalizePhone, validateMember } from '../../src/lib/members.js';
import {
  MONTH_HEADERS, buildMonthRows, compareMonths, monthOf, monthTitle, monthsToCreate, parseMonthTitle,
  rowAfterUpdate, rowForLeft, rowForNewMember, rowToValues, todayInIndia, valuesToRow,
} from '../../src/lib/monthly.js';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const LAST_COLUMN = String.fromCharCode(64 + HEADERS.length); // "J"
const RANGE = `${SHEET_NAME}!A:${LAST_COLUMN}`;
const MONTH_LAST_COLUMN = String.fromCharCode(64 + MONTH_HEADERS.length); // "K"
const monthRange = (title, cells = `A:${MONTH_LAST_COLUMN}`) => `'${title}'!${cells}`;
const MAX_HISTORY_MONTHS = 24;

export class SheetsError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code; // 'not-configured' | 'forbidden' | 'not-found' | 'not-found-member' | 'conflict' | 'busy' | 'failed'
    this.status = status;
  }
}

// ---- config --------------------------------------------------------------

/** Accepts a bare id or a docs.google.com/spreadsheets/d/<id>/... link. */
export function parseSheetId(input) {
  const s = String(input || '').trim();
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(s);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : '';
}

/** Env vars often hold the key wrapped in quotes with literal "\n" in place of line breaks. */
export function normalizePrivateKey(raw) {
  return String(raw || '').trim().replace(/^(['"])([\s\S]*)\1$/, '$2').replace(/\\n/g, '\n');
}

export function readSheetConfig(env = process.env) {
  const email = String(env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
  const key = normalizePrivateKey(env.GOOGLE_PRIVATE_KEY);
  const sheetId = parseSheetId(env.GOOGLE_SHEET_ID);
  if (!email || !key.includes('PRIVATE KEY') || !sheetId) return { ok: false };
  return { ok: true, email, key, sheetId };
}

// ---- Google sign-in (service account JWT) --------------------------------

const b64 = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

export function signJwt({ email, key }, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key, 'base64url');
  return `${unsigned}.${signature}`;
}

// ---- the store -----------------------------------------------------------

function friendlyError(status, body, config) {
  const detail = body?.error?.message || '';
  if (status === 403) {
    return new SheetsError('forbidden',
      `Google refused access. Share the sheet with ${config.email} and give it Editor access.`, 502);
  }
  if (status === 404) {
    return new SheetsError('not-found', 'Google Sheet not found. Check GOOGLE_SHEET_ID.', 502);
  }
  if (status === 429) {
    return new SheetsError('busy', 'Google is rate-limiting requests. Wait a few seconds and try again.', 503);
  }
  return new SheetsError('failed', `Google Sheets error (${status})${detail ? `: ${detail}` : ''}`, 502);
}

/** `fetchImpl` is injectable so the logic can be tested without the network. */
export function createSheetStore(config, fetchImpl = fetch, { today = () => todayInIndia() } = {}) {
  let token = null; // { value, expiresAt }
  let checkedMonth = null; // "Nov-2026": this server already made sure that tab exists

  async function getToken() {
    if (token && token.expiresAt - 60_000 > Date.now()) return token.value;
    const res = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: signJwt(config),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      throw new SheetsError('failed',
        `Could not sign in to Google (${body.error_description || body.error || res.status}). Check the service account email and key.`);
    }
    token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in || 3600) * 1000 };
    return token.value;
  }

  async function call(path, init = {}) {
    const res = await fetchImpl(`${API}/${config.sheetId}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': 'application/json' },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw friendlyError(res.status, body, config);
    return body;
  }

  /** The tab's numeric id, creating the tab if it doesn't exist yet. */
  async function tabId() {
    const meta = await call('?fields=sheets.properties(sheetId,title)');
    const found = (meta.sheets || []).find((s) => s.properties?.title === SHEET_NAME);
    if (found) return found.properties.sheetId;
    const made = await call(':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] }),
    });
    return made.replies[0].addSheet.properties.sheetId;
  }

  /** Every non-empty row of the tab; row 1 is the header when it looks like one. */
  async function readRows() {
    let body;
    try {
      body = await call(`/values/${encodeURIComponent(RANGE)}?valueRenderOption=FORMATTED_VALUE`);
    } catch (err) {
      // 400 "Unable to parse range" = the Members tab doesn't exist yet.
      if (err.code === 'failed' && /parse range/i.test(err.message)) {
        await tabId();
        return { rows: [], hasHeader: false };
      }
      throw err;
    }
    const rows = body.values || [];
    return { rows, hasHeader: String(rows[0]?.[0] ?? '').trim() === HEADERS[0] };
  }

  function parseMembers({ rows, hasHeader }) {
    return rows.slice(hasHeader ? 1 : 0).map(rowToMember).filter(Boolean);
  }

  /** A sheet made before the Package column existed: add its header so new values are labelled. */
  async function ensureHeader(state) {
    if (state.hasHeader && state.rows[0].length < HEADERS.length) {
      await call(`/values/${encodeURIComponent(`${SHEET_NAME}!A1:${LAST_COLUMN}1`)}?valueInputOption=RAW`, {
        method: 'PUT',
        body: JSON.stringify({ values: [HEADERS] }),
      });
      state.rows[0] = [...HEADERS];
    }
  }

  // ---- monthly records ------------------------------------------------------

  async function listTabs() {
    const meta = await call('?fields=sheets.properties(sheetId,title)');
    return (meta.sheets || []).map((s) => s.properties).filter(Boolean);
  }

  /** Rows of one month tab (header skipped), or null when the tab doesn't exist. */
  async function readMonth(title) {
    let body;
    try {
      body = await call(`/values/${encodeURIComponent(monthRange(title))}?valueRenderOption=FORMATTED_VALUE`);
    } catch (err) {
      if (err.code === 'failed' && /parse range/i.test(err.message)) return null;
      throw err;
    }
    const raw = body.values || [];
    const start = String(raw[0]?.[0] ?? '').trim() === MONTH_HEADERS[0] ? 1 : 0;
    return { start, rows: raw.slice(start).map(valuesToRow).filter(Boolean) };
  }

  const currentMonth = () => monthOf(today());

  /**
   * Makes sure this month's tab exists (and any months missed since the newest tab,
   * e.g. when nobody opened the app for a while). With no month tab at all, only the
   * current month is created, never earlier ones. Safe to call on every request.
   */
  async function ensureMonths(members) {
    const current = currentMonth();
    const currentTitle = monthTitle(current);
    if (checkedMonth === currentTitle) return [];

    const tabs = await listTabs();
    const existing = tabs.map((t) => parseMonthTitle(t.title)).filter(Boolean);
    const toCreate = monthsToCreate(existing, current);
    const created = [];

    if (toCreate.length) {
      let prev = null;
      if (existing.length) {
        const newest = existing.reduce((a, b) => (compareMonths(a, b) >= 0 ? a : b));
        prev = (await readMonth(monthTitle(newest)))?.rows ?? null;
      }
      for (const month of toCreate) {
        const title = monthTitle(month);
        try {
          await call(':batchUpdate', {
            method: 'POST',
            body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
          });
        } catch (err) {
          // Another request created it a moment ago: use theirs.
          if (/already exists/i.test(err.message)) { prev = (await readMonth(title))?.rows ?? prev; continue; }
          throw err;
        }
        const rows = buildMonthRows(month, members, prev);
        await call(`/values/${encodeURIComponent(monthRange(title))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
          method: 'POST',
          body: JSON.stringify({ values: [MONTH_HEADERS, ...rows.map(rowToValues)] }),
        });
        prev = rows;
        created.push(title);
      }
    }
    checkedMonth = currentTitle;
    return created;
  }

  /**
   * Changes rows of the current month's tab. Each change is { id, apply(existingRow|null) -> row|null }.
   * Existing rows are rewritten in place, new ones appended.
   */
  async function writeMonth(members, changes) {
    await ensureMonths(members);
    const title = monthTitle(currentMonth());
    const tab = await readMonth(title);
    if (!tab) throw new SheetsError('failed', `The ${title} tab is missing.`);

    const updates = [];
    const appends = [];
    for (const { id, apply } of changes) {
      const at = tab.rows.findIndex((r) => r.id === id);
      const row = apply(at === -1 ? null : tab.rows[at]);
      if (!row) continue;
      if (at === -1) { appends.push(rowToValues(row)); tab.rows.push(row); continue; }
      const sheetRow = tab.start + at + 1;
      updates.push({ range: monthRange(title, `A${sheetRow}:${MONTH_LAST_COLUMN}${sheetRow}`), values: [rowToValues(row)] });
      tab.rows[at] = row;
    }
    if (updates.length) {
      await call('/values:batchUpdate', {
        method: 'POST',
        body: JSON.stringify({ valueInputOption: 'RAW', data: updates }),
      });
    }
    if (appends.length) {
      await call(`/values/${encodeURIComponent(monthRange(title))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
        method: 'POST',
        body: JSON.stringify({ values: appends }),
      });
    }
  }

  /** The member list was saved; if the monthly record fails, say so instead of failing the whole request. */
  async function recordMonthly(task) {
    try {
      await task();
      return undefined;
    } catch (err) {
      console.error(`Monthly record failed: ${err.message}`);
      return `Saved, but the monthly record could not be updated: ${err.message}`;
    }
  }

  return {
    ensureMonths,

    /** All month tabs (newest first, up to 2 years) with their rows. */
    async history() {
      const tabs = (await listTabs())
        .map((t) => ({ title: t.title, month: parseMonthTitle(t.title) }))
        .filter((t) => t.month)
        .sort((a, b) => compareMonths(b.month, a.month))
        .slice(0, MAX_HISTORY_MONTHS);
      if (!tabs.length) return { months: [] };

      const query = tabs.map((t) => `ranges=${encodeURIComponent(monthRange(t.title))}`).join('&');
      const body = await call(`/values:batchGet?${query}&valueRenderOption=FORMATTED_VALUE`);
      return {
        months: tabs.map((t, i) => {
          const raw = body.valueRanges?.[i]?.values || [];
          const start = String(raw[0]?.[0] ?? '').trim() === MONTH_HEADERS[0] ? 1 : 0;
          return { month: t.title, rows: raw.slice(start).map(valuesToRow).filter(Boolean) };
        }),
      };
    },

    async list() {
      return parseMembers(await readRows());
    },

    /**
     * Adds members that were already validated. Phones that are already in the
     * sheet are skipped; an id that is already taken is replaced with a fresh one
     * (another device may have added a member in the meantime).
     * Returns { members: <whole list>, skipped: [{ name, phone, reason }] }.
     */
    async add(incoming) {
      const state = await readRows();
      const existing = parseMembers(state);
      const phones = new Set(existing.map((m) => m.phone));
      const ids = new Set(existing.map((m) => m.id));
      const written = [];
      const skipped = [];

      for (const m of incoming) {
        if (phones.has(m.phone)) {
          skipped.push({ name: m.name, phone: m.phone, reason: 'Phone already registered' });
          continue;
        }
        const member = ids.has(m.id) ? { ...m, id: nextMemberId([...existing, ...written]) } : m;
        written.push(member);
        phones.add(member.phone);
        ids.add(member.id);
      }

      if (written.length) {
        await ensureHeader(state);
        const values = written.map(memberToRow);
        await call(`/values/${encodeURIComponent(RANGE)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
          method: 'POST',
          body: JSON.stringify({ values: state.rows.length ? values : [HEADERS, ...values] }),
        });
      }
      const all = [...existing, ...written];
      const warning = written.length
        ? await recordMonthly(() => writeMonth(all, written.map((m) => ({
          id: m.id,
          apply: () => rowForNewMember(m, currentMonth()),
        }))))
        : undefined;
      return { members: all, skipped, ...(warning && { warning }) };
    },

    /**
     * Replaces one member's details (already validated), keeping their id and
     * registration date. Returns { members: <whole list> }.
     */
    async update(member) {
      const state = await readRows();
      const start = state.hasHeader ? 1 : 0;
      const at = state.rows.findIndex((row, i) => i >= start && String(row[0] ?? '').trim() === member.id);
      if (at === -1) throw new SheetsError('not-found-member', 'That member no longer exists. Refresh the page.', 404);

      const others = parseMembers({ rows: state.rows.filter((_, i) => i !== at), hasHeader: state.hasHeader });
      const clash = others.find((m) => m.phone === member.phone);
      if (clash) throw new SheetsError('conflict', `Phone already registered to ${clash.name} (${clash.id})`, 409);

      const current = rowToMember(state.rows[at]);
      const row = memberToRow({ ...member, createdAt: current?.createdAt || member.createdAt });
      await ensureHeader(state);
      await call(`/values/${encodeURIComponent(`${SHEET_NAME}!A${at + 1}:${LAST_COLUMN}${at + 1}`)}?valueInputOption=RAW`, {
        method: 'PUT',
        body: JSON.stringify({ values: [row] }),
      });
      const before = rowToMember(state.rows[at]);
      state.rows[at] = row;
      const list = parseMembers(state);
      const after = { ...member, createdAt: current?.createdAt || member.createdAt };
      const warning = await recordMonthly(() => writeMonth(list, [{
        id: member.id,
        apply: (existingRow) => rowAfterUpdate(existingRow, before, after, currentMonth()),
      }]));
      return { members: list, ...(warning && { warning }) };
    },

    /** Deletes the member's row. Returns { members: <remaining list> }. */
    async remove(id) {
      const state = await readRows();
      const start = state.hasHeader ? 1 : 0;
      const at = state.rows.findIndex((row, i) => i >= start && String(row[0] ?? '').trim() === id);
      let warning;
      if (at !== -1) {
        const gone = rowToMember(state.rows[at]);
        await call(':batchUpdate', {
          method: 'POST',
          body: JSON.stringify({
            requests: [{
              deleteDimension: {
                range: { sheetId: await tabId(), dimension: 'ROWS', startIndex: at, endIndex: at + 1 },
              },
            }],
          }),
        });
        state.rows.splice(at, 1);
        // The monthly records keep them, tagged "Left", so past months stay as they were.
        if (gone) {
          warning = await recordMonthly(() => writeMonth(parseMembers(state), [{
            id,
            apply: (existingRow) => rowForLeft(existingRow, gone, currentMonth()),
          }]));
        }
      }
      return { members: parseMembers(state), ...(warning && { warning }) };
    },
  };
}

let shared = null;
/** One store per server instance so the Google token is reused between requests. */
export function getStore(env = process.env) {
  const config = readSheetConfig(env);
  if (!config.ok) {
    throw new SheetsError('not-configured',
      'Google Sheet storage is not set up. Add GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY and GOOGLE_SHEET_ID (see README).', 503);
  }
  const fingerprint = `${config.email}|${config.sheetId}|${config.key.length}`;
  if (!shared || shared.fingerprint !== fingerprint) shared = { fingerprint, store: createSheetStore(config) };
  return shared.store;
}

// ---- request validation --------------------------------------------------

export const MAX_BATCH = 1000;
const ID_RULE = /^GYM-\d{1,9}$/;

/**
 * Re-checks members sent by the browser (never trust the client). Returns
 * { members } with cleaned values, or { error }.
 */
export function cleanIncoming(list) {
  if (!Array.isArray(list) || list.length === 0) return { error: 'No members to save.' };
  if (list.length > MAX_BATCH) return { error: `Too many members at once (max ${MAX_BATCH}).` };
  const members = [];
  for (const raw of list) {
    const { errors, member } = validateMember(raw || {}, []);
    if (errors.length) return { error: `${String(raw?.name || 'A member')}: ${errors[0]}` };
    if (!ID_RULE.test(String(raw.id))) return { error: 'A member has an invalid id.' };
    const createdAt = String(raw.createdAt || new Date().toISOString());
    members.push({ ...member, phone: normalizePhone(member.phone), id: String(raw.id), createdAt });
  }
  return { members };
}

/** Re-checks one edited member sent by the browser. Returns { member } or { error }. */
export function cleanUpdate(raw) {
  const { errors, member } = validateMember(raw || {}, []);
  if (errors.length) return { error: errors[0] };
  if (!ID_RULE.test(String(raw.id))) return { error: 'A member has an invalid id.' };
  return { member: { ...member, phone: normalizePhone(member.phone), id: String(raw.id) } };
}
