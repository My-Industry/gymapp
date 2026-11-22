import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  parseSheetId, normalizePrivateKey, readSheetConfig, createSheetStore, cleanIncoming, SheetsError,
} from '../api/_lib/sheets.js';
import { HEADERS, memberToRow, rowToMember } from '../src/lib/backup/rows.js';
import { makeFakeGoogle } from './fakeGoogle.mjs';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const SHEET_ID = 'a'.repeat(30);
const config = { ok: true, email: 'bot@project.iam.gserviceaccount.com', key: privateKey, sheetId: SHEET_ID };

const member = (n, extra = {}) => ({
  id: `GYM-${String(n).padStart(6, '0')}`,
  name: `Member ${n}`,
  phone: `9198765${String(10000 + n)}`,
  plan: 'Monthly',
  gymPackage: 'Basic Gym',
  fee: 1500,
  startDate: '2026-01-15',
  expiryDate: '2026-02-15',
  whatsappConsent: true,
  createdAt: '2026-01-15T10:00:00.000Z',
  ...extra,
});

const fakeGoogle = (options) => makeFakeGoogle(config, options);

test('parseSheetId accepts links and bare ids', () => {
  assert.equal(parseSheetId(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=0`), SHEET_ID);
  assert.equal(parseSheetId(SHEET_ID), SHEET_ID);
  assert.equal(parseSheetId('nope'), '');
});

test('normalizePrivateKey restores line breaks and strips quotes', () => {
  assert.equal(normalizePrivateKey('"-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n"'),
    '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n');
});

test('readSheetConfig needs all three values', () => {
  assert.equal(readSheetConfig({}).ok, false);
  const env = { GOOGLE_SERVICE_ACCOUNT_EMAIL: 'a@b.c', GOOGLE_PRIVATE_KEY: privateKey, GOOGLE_SHEET_ID: SHEET_ID };
  assert.equal(readSheetConfig(env).ok, true);
  assert.equal(readSheetConfig({ ...env, GOOGLE_SHEET_ID: '' }).ok, false);
});

test('a member survives a trip to the sheet and back', () => {
  const m = member(1);
  const back = rowToMember(memberToRow(m));
  assert.deepEqual(back, { ...m, createdAt: '2026-01-15' });
});

test('rowToMember tolerates hand-edited cells', () => {
  const m = rowToMember(['GYM-000009', ' Asha ', '98765 43210', 'monthly', '₹1,500', '15/01/2026', '', 'yes', '']);
  assert.equal(m.phone, '919876543210');
  assert.equal(m.plan, 'Monthly');
  assert.equal(m.fee, 1500);
  assert.equal(m.startDate, '2026-01-15');
  assert.equal(m.expiryDate, '2026-02-15'); // worked out when the cell is blank
  assert.equal(m.whatsappConsent, true);
  assert.equal(rowToMember(['', 'No id']), null);
});

test('list reads members and skips the header', async () => {
  const { store } = fakeGoogle({ rows: [HEADERS, memberToRow(member(1)), memberToRow(member(2))] });
  const list = await store.list();
  assert.deepEqual(list.map((m) => m.id), ['GYM-000001', 'GYM-000002']);
});

test('list creates a missing Members tab and returns nothing', async () => {
  const { store, state } = fakeGoogle({ hasTab: false });
  assert.deepEqual(await store.list(), []);
  assert.equal(state.hasTab, true);
});

test('add writes the header first when the tab is empty', async () => {
  const { store, state } = fakeGoogle();
  const { members } = await store.add([member(1)]);
  assert.equal(members.length, 1);
  assert.deepEqual(state.rows[0], HEADERS);
  assert.equal(state.rows[1][0], 'GYM-000001');
});

test('a sheet from before packages existed gets the Package header and still lists old members', async () => {
  const oldHeader = HEADERS.slice(0, -1);
  const oldRow = memberToRow(member(1)).slice(0, -1);
  const { store, state } = fakeGoogle({ rows: [oldHeader, oldRow] });
  assert.equal((await store.list())[0].gymPackage, ''); // blank, not guessed
  await store.add([member(2, { gymPackage: 'Gym + Cardio' })]);
  assert.deepEqual(state.rows[0], HEADERS);
  assert.equal(state.rows[2][9], 'Gym + Cardio');
});

test('add skips a phone that is already registered', async () => {
  const { store, state } = fakeGoogle({ rows: [HEADERS, memberToRow(member(1))] });
  const { members, skipped } = await store.add([member(2, { phone: member(1).phone })]);
  assert.equal(members.length, 1);
  assert.equal(skipped[0].reason, 'Phone already registered');
  assert.equal(state.rows.length, 2);
});

test('add gives a fresh id when another device took the same one', async () => {
  const { store } = fakeGoogle({ rows: [HEADERS, memberToRow(member(1))] });
  const { members } = await store.add([member(1, { phone: '919876500002', name: 'Second' })]);
  assert.deepEqual(members.map((m) => m.id), ['GYM-000001', 'GYM-000002']);
});

test('update upgrades one member in place and keeps the rest', async () => {
  const { store, state } = fakeGoogle({ rows: [HEADERS, memberToRow(member(1)), memberToRow(member(2))] });
  const { members } = await store.update(member(2, {
    gymPackage: 'Gym + Cardio', plan: 'Yearly', fee: 12000, expiryDate: '2027-01-15', createdAt: 'ignored',
  }));
  assert.equal(members.length, 2);
  assert.equal(members[1].gymPackage, 'Gym + Cardio');
  assert.equal(members[1].plan, 'Yearly');
  assert.equal(members[1].createdAt, '2026-01-15'); // registration date is kept
  assert.deepEqual(members[0], rowToMember(memberToRow(member(1)))); // other rows untouched
  assert.equal(state.rows.length, 3);
});

test('update refuses a phone that belongs to someone else, and an unknown member', async () => {
  const { store } = fakeGoogle({ rows: [HEADERS, memberToRow(member(1)), memberToRow(member(2))] });
  await assert.rejects(store.update(member(2, { phone: member(1).phone })), { code: 'conflict' });
  await assert.rejects(store.update(member(9)), { code: 'not-found-member' });
});

test('remove deletes only that member row', async () => {
  const { store, state } = fakeGoogle({ rows: [HEADERS, memberToRow(member(1)), memberToRow(member(2))] });
  const { members } = await store.remove('GYM-000001');
  assert.deepEqual(members.map((m) => m.id), ['GYM-000002']);
  assert.equal(state.rows.length, 2);
  assert.equal((await store.remove('GYM-999999')).members.length, 1); // unknown id: nothing happens
});

test('the Google token is requested once and reused', async () => {
  const { store, state } = fakeGoogle({ rows: [HEADERS] });
  await store.list();
  await store.list();
  assert.equal(state.calls.filter((c) => c.includes('oauth2.googleapis.com')).length, 1);
});

test('a 403 from Google explains how to share the sheet', async () => {
  const store = createSheetStore(config, async (url) => (
    String(url).includes('oauth2')
      ? { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 3600 }) }
      : { ok: false, status: 403, json: async () => ({ error: { message: 'denied' } }) }
  ));
  await assert.rejects(store.list(), (err) => err instanceof SheetsError && /Share the sheet with bot@/.test(err.message));
});

test('cleanIncoming re-validates what the browser sent', () => {
  const ok = cleanIncoming([{ ...member(1), phone: '98765 10001', name: '  Ravi   Kumar ' }]);
  assert.equal(ok.members[0].phone, '919876510001');
  assert.equal(ok.members[0].name, 'Ravi Kumar');
  assert.ok(cleanIncoming([{ ...member(1), phone: '123' }]).error);
  assert.ok(cleanIncoming([{ ...member(1), id: 'DROP TABLE' }]).error);
  assert.ok(cleanIncoming([]).error);
});
