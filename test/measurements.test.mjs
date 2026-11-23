// Weight and height in the monthly records: updated in this month only, carried forward, tracked over time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { HEADERS, memberToRow } from '../src/lib/backup/rows.js';
import { MONTH_HEADERS, memberHistory, measurementProgress, valuesToRow } from '../src/lib/monthly.js';
import { calculateBmi } from '../src/lib/members.js';
import { createSheetStore } from '../api/_lib/sheets.js';
import { makeFakeGoogle } from './fakeGoogle.mjs';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const config = { ok: true, email: 'bot@project.iam.gserviceaccount.com', key: privateKey, sheetId: 'd'.repeat(30) };

const member = (extra = {}) => ({
  id: 'GYM-001',
  name: 'Asha',
  phone: '919876510001',
  plan: 'Monthly',
  gymPackage: 'Basic Gym',
  fee: 500,
  startDate: '2026-11-03',
  expiryDate: '2026-12-03',
  whatsappConsent: true,
  dateOfBirth: '1998-03-12',
  weightKg: 72,
  heightCm: 170,
  createdAt: '2026-08-01T10:00:00.000Z',
  ...extra,
});

const google = (members, options = {}) =>
  makeFakeGoogle(config, { rows: [HEADERS, ...members.map(memberToRow)], ...options });
const monthRows = (state, title) =>
  Object.fromEntries(state.month(title).slice(1).map(valuesToRow).map((r) => [r.id, r]));

test('a new month tab starts with the weight and height the member has', async () => {
  const { store, state } = google([member()]);
  await store.ensureMonths(await store.list());
  assert.deepEqual(state.month('Nov-2026')[0], MONTH_HEADERS);
  assert.deepEqual(MONTH_HEADERS.slice(-2), ['Weight (kg)', 'Height (cm)']);
  const row = monthRows(state, 'Nov-2026')['GYM-001'];
  assert.deepEqual([row.weightKg, row.heightCm], [72, 170]);
});

test('updating weight and height changes this month only, not the tag or the fee', async () => {
  const m = member();
  const { store, state } = google([m]);
  await store.ensureMonths(await store.list());
  const before = monthRows(state, 'Nov-2026')['GYM-001'];

  const { members } = await store.update({ ...m, weightKg: 70.5, heightCm: 171 });
  assert.deepEqual([members[0].weightKg, members[0].heightCm], [70.5, 171]); // the Members tab too
  const after = monthRows(state, 'Nov-2026')['GYM-001'];
  assert.deepEqual([after.weightKg, after.heightCm], [70.5, 171]);
  assert.equal(after.tag, before.tag);
  assert.equal(after.fee, before.fee);
  assert.equal(after.expiryDate, before.expiryDate);

  // a second update in the same month replaces that month's value (one row per member per month)
  await store.update({ ...m, weightKg: 70, heightCm: 171 });
  assert.equal(monthRows(state, 'Nov-2026')['GYM-001'].weightKg, 70);
  assert.equal(state.month('Nov-2026').length, 2); // header + one row
});

test('next month carries the weight forward, and later updates never rewrite past months', async () => {
  const m = member();
  const nov = google([m]);
  await nov.store.ensureMonths(await nov.store.list());
  await nov.store.update({ ...m, weightKg: 71, heightCm: 170 });

  // the app is opened in December
  const dec = createSheetStore(config, nov.fetchImpl, { today: () => '2026-12-02' });
  const current = await dec.list();
  await dec.ensureMonths(current);
  assert.equal(monthRows(nov.state, 'Dec-2026')['GYM-001'].weightKg, 71); // carried forward
  assert.equal(monthRows(nov.state, 'Dec-2026')['GYM-001'].tag, 'Existing');

  await dec.update({ ...current[0], weightKg: 69, heightCm: 170 });
  assert.equal(monthRows(nov.state, 'Dec-2026')['GYM-001'].weightKg, 69);
  assert.equal(monthRows(nov.state, 'Nov-2026')['GYM-001'].weightKg, 71); // November stays as it was

  // the history shows both months, newest first
  const { months } = await dec.history();
  const h = memberHistory(months, 'GYM-001');
  assert.deepEqual(h.rows.map((r) => [r.month, r.weightKg]), [['Dec-2026', 69], ['Nov-2026', 71]]);
});

test('a month tab made before the weight and height columns existed gets its header extended', async () => {
  const m = member();
  const oldHeader = MONTH_HEADERS.slice(0, 11);
  const oldRow = ['GYM-001', 'Asha', '919876510001', 'Basic Gym', 'Monthly', '2026-11-03', '2026-12-03', 500, 'Existing', '', 'Active'];
  const { store, state } = google([m], { months: { 'Nov-2026': [oldHeader, oldRow] } });
  const { months } = await store.history();
  assert.equal(months[0].rows[0].weightKg, null); // old rows simply have no measurements

  await store.update({ ...m, weightKg: 68, heightCm: 170 });
  assert.deepEqual(state.month('Nov-2026')[0], MONTH_HEADERS);
  assert.deepEqual([monthRows(state, 'Nov-2026')['GYM-001'].weightKg, monthRows(state, 'Nov-2026')['GYM-001'].heightCm], [68, 170]);
});

test('progress over the months: first and latest reading and the change', () => {
  const rows = [ // newest first
    { month: 'Jan-2027', weightKg: 68, heightCm: 171 },
    { month: 'Dec-2026', weightKg: null, heightCm: 170 }, // no weight that month
    { month: 'Nov-2026', weightKg: 71.5, heightCm: 170 },
  ];
  const p = measurementProgress(rows, calculateBmi);
  assert.deepEqual(p.weight, { latest: 68, first: 71.5, change: -3.5, since: 'Nov-2026' });
  assert.deepEqual(p.height, { latest: 171, first: 170, change: 1, since: 'Nov-2026' });
  assert.equal(p.bmi.latest, 23.3);
  assert.equal(p.bmi.first, 24.7);
  assert.equal(p.bmi.change, -1.4);

  const one = measurementProgress([{ month: 'Nov-2026', weightKg: 70, heightCm: null }], calculateBmi);
  assert.deepEqual(one.weight, { latest: 70, first: 70, change: null, since: null }); // one reading: no change yet
  assert.equal(one.height, null);
  assert.equal(one.bmi, null);
  assert.deepEqual(measurementProgress([], calculateBmi), { weight: null, height: null, bmi: null });
});
