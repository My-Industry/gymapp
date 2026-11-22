// Accounts live in a separate "server" Google Sheet (GOOGLE_SHEET_ID_server), apart from
// any gym's member data. Same service account as the members sheet, so share that sheet
// with the service account's email too (Editor).
//
//   Accounts tab         Username | Password Hash | Email | Role | Created At |
//                        Service Account Email | Private Key (encrypted) | Sheet Link
//   Password Resets tab  Username | Token Hash | Expires At | Created At | Used
//
// The last three Accounts columns are a gym's own Google connection (see api/connection.js).
// Only password HASHES are stored, reset tokens are stored as hashes too, and the private key is
// encrypted (see secretBox.js), so reading the sheet never reveals a password, reset link or key.
//
// Files/folders starting with "_" inside /api are NOT exposed as endpoints by Vercel.

import { createGoogleClient, readAccountsConfig, SheetsError } from './sheets.js';

export const ACCOUNT_HEADERS = [
  'Username', 'Password Hash', 'Email', 'Role', 'Created At',
  'Service Account Email', 'Private Key (encrypted)', 'Sheet Link',
];
export const RESET_HEADERS = ['Username', 'Token Hash', 'Expires At', 'Created At', 'Used'];
const ACCOUNTS_TAB = 'Accounts';
const RESETS_TAB = 'Password Resets';
const lastColumn = (headers) => String.fromCharCode(64 + headers.length); // 5 -> "E", 8 -> "H"

const CACHE_MS = 30_000; // how long the account list is reused between requests
const REFRESH_MS = 5_000; // a miss refreshes the list, but not more often than this

const clean = (v) => String(v ?? '').trim();

export function createAccountStore(config, fetchImpl = fetch, { now = () => Date.now() } = {}) {
  const { call } = createGoogleClient(config, fetchImpl);
  const checked = new Set(); // tabs this server instance already made sure exist
  let cache = null; // { accounts, at }

  const rangeOf = (tab, cells) => `'${tab}'!${cells}`;
  const valuesUrl = (tab, cells, suffix = '') => `/values/${encodeURIComponent(rangeOf(tab, cells))}${suffix}`;

  const writeRow = (tab, headers, rowNumber, values) =>
    call(`${valuesUrl(tab, `A${rowNumber}:${lastColumn(headers)}${rowNumber}`)}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ values: [values] }),
    });

  /** Creates the tab (with its header row) on first use. */
  async function ensureTab(tab, headers) {
    if (checked.has(tab)) return;
    const meta = await call('?fields=sheets.properties(sheetId,title)');
    if (!(meta.sheets || []).some((s) => s.properties?.title === tab)) {
      try {
        await call(':batchUpdate', {
          method: 'POST',
          body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }),
        });
      } catch (err) {
        if (!/already exists/i.test(err.message)) throw err; // another request made it a moment ago
      }
    }
    checked.add(tab);
  }

  /** Data rows of a tab as { values, row } (row = its line number in the sheet). Writes the header if the tab is empty. */
  async function readRows(tab, headers) {
    await ensureTab(tab, headers);
    const body = await call(`${valuesUrl(tab, `A:${lastColumn(headers)}`)}?valueRenderOption=FORMATTED_VALUE`);
    const raw = body.values || [];
    if (raw.length === 0) {
      await writeRow(tab, headers, 1, headers);
      return [];
    }
    const hasHeader = clean(raw[0][0]) === headers[0];
    if (hasHeader && raw[0].length < headers.length) await writeRow(tab, headers, 1, headers); // a tab made before newer columns existed
    const start = hasHeader ? 1 : 0;
    return raw.map((values, i) => ({ values, row: i + 1 })).slice(start).filter((r) => clean(r.values[0]));
  }

  const toAccount = ({ values, row }) => ({
    username: clean(values[0]).toLowerCase(),
    hash: clean(values[1]),
    email: clean(values[2]).toLowerCase(),
    role: clean(values[3]) === 'admin' ? 'admin' : 'staff',
    createdAt: clean(values[4]),
    serviceEmail: clean(values[5]),
    keyEnc: clean(values[6]),
    sheetLink: clean(values[7]),
    row,
  });

  const accountValues = (a) => [
    a.username, a.hash, a.email, a.role, a.createdAt, a.serviceEmail || '', a.keyEnc || '', a.sheetLink || '',
  ];

  async function list() {
    return (await readRows(ACCOUNTS_TAB, ACCOUNT_HEADERS)).map(toAccount);
  }

  /** The account list, reused for a short while so every request doesn't hit Google.
   *  If Google is unreachable the last good list keeps people signed in. */
  async function listCached(maxAgeMs = CACHE_MS) {
    if (cache && now() - cache.at < maxAgeMs) return cache.accounts;
    try {
      const accounts = await list();
      cache = { accounts, at: now() };
      return accounts;
    } catch (err) {
      if (cache) return cache.accounts;
      throw err;
    }
  }

  /** One account by username. A miss re-reads the sheet once (another server instance may have just created it). */
  async function findByUsername(username) {
    const name = clean(username).toLowerCase();
    const find = (accounts) => accounts.find((a) => a.username === name) || null;
    return find(await listCached()) || find(await listCached(REFRESH_MS));
  }

  /** Always reads the sheet (no cache): used by sign-up and password reset. */
  async function findByEmail(email) {
    const mail = clean(email).toLowerCase();
    return (await list()).find((a) => a.email === mail) || null;
  }

  /** Adds an account. Throws SheetsError('conflict') with `.field` = 'username' | 'email' when taken. */
  async function add({ username, hash, email, role }) {
    const name = clean(username).toLowerCase();
    const mail = clean(email).toLowerCase();
    const accounts = await list();
    const taken = (field) => Object.assign(new SheetsError('conflict', `That ${field} is already taken.`, 409), { field });
    if (accounts.some((a) => a.username === name)) throw taken('username');
    if (mail && accounts.some((a) => a.email === mail)) throw taken('email');
    await appendRow(ACCOUNTS_TAB, ACCOUNT_HEADERS, [name, hash, mail, role === 'admin' ? 'admin' : 'staff', new Date(now()).toISOString(), '', '', '']);
    cache = null;
  }

  const appendRow = (tab, headers, values) =>
    call(`${valuesUrl(tab, `A:${lastColumn(headers)}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      body: JSON.stringify({ values: [values] }),
    });

  /** True when no account exists yet (the very first account becomes the admin). */
  async function isEmpty() {
    return (await list()).length === 0;
  }

  async function setPassword(username, hash) {
    const account = (await list()).find((a) => a.username === clean(username).toLowerCase());
    if (!account) throw new SheetsError('not-found-account', 'Account not found.', 404);
    await writeRow(ACCOUNTS_TAB, ACCOUNT_HEADERS, account.row, accountValues({ ...account, hash }));
    cache = null;
  }

  /**
   * Saves (or, with null, removes) this account's own Google connection: { serviceEmail, keyEnc, sheetLink }.
   * An account that lives in AUTH_USERS has no row yet; it gets one with no password hash (it can't sign in
   * through the sheet, only through AUTH_USERS as before).
   */
  async function setConnection(username, connection, { role = 'staff' } = {}) {
    const name = clean(username).toLowerCase();
    const c = connection || { serviceEmail: '', keyEnc: '', sheetLink: '' };
    const account = (await list()).find((a) => a.username === name);
    if (account) {
      await writeRow(ACCOUNTS_TAB, ACCOUNT_HEADERS, account.row, accountValues({ ...account, ...c }));
    } else if (connection) {
      await appendRow(ACCOUNTS_TAB, ACCOUNT_HEADERS, [
        name, '', '', role === 'admin' ? 'admin' : 'staff', new Date(now()).toISOString(), c.serviceEmail, c.keyEnc, c.sheetLink,
      ]);
    }
    cache = null;
  }

  // ---- password reset tokens ----------------------------------------------

  const toReset = ({ values, row }) => ({
    username: clean(values[0]).toLowerCase(),
    tokenHash: clean(values[1]),
    expiresAt: Number(values[2]) || 0,
    createdAt: Number(values[3]) || 0,
    used: clean(values[4]) === 'Yes',
    row,
  });

  async function resets() {
    return (await readRows(RESETS_TAB, RESET_HEADERS)).map(toReset);
  }

  /** True if this person already asked for a reset within the last `withinMs`. Used to ignore rapid repeat requests. */
  async function hasRecentReset(username, withinMs) {
    const name = clean(username).toLowerCase();
    const t = now();
    return (await resets()).some((r) => r.username === name && t - r.createdAt < withinMs);
  }

  async function createReset({ username, tokenHash, expiresAt }) {
    await readRows(RESETS_TAB, RESET_HEADERS); // makes the tab and its header on first use
    await appendRow(RESETS_TAB, RESET_HEADERS, [clean(username).toLowerCase(), tokenHash, expiresAt, now(), '']);
  }

  /** The unused, unexpired reset for this token hash, or null. */
  async function findReset(tokenHash) {
    const t = now();
    return (await resets()).find((r) => r.tokenHash === tokenHash && !r.used && r.expiresAt > t) || null;
  }

  async function markResetUsed(reset) {
    await writeRow(RESETS_TAB, RESET_HEADERS, reset.row, [reset.username, reset.tokenHash, reset.expiresAt, reset.createdAt, 'Yes']);
  }

  return {
    list, listCached, findByUsername, findByEmail, add, isEmpty, setPassword, setConnection,
    hasRecentReset, createReset, findReset, markResetUsed,
  };
}

let shared = null;
let override; // tests only: a store backed by a fake Google (null = "not configured")
export function setAccountStoreForTests(store) { override = store; }

/** The accounts store, or null when GOOGLE_SHEET_ID_server isn't set (accounts then stay in AUTH_USERS). */
export function getAccountStore(env = process.env) {
  if (override !== undefined) return override;
  const config = readAccountsConfig(env);
  if (!config.ok) return null;
  const fingerprint = `${config.email}|${config.sheetId}|${config.key.length}`;
  if (!shared || shared.fingerprint !== fingerprint) shared = { fingerprint, store: createAccountStore(config) };
  return shared.store;
}
