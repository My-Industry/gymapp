import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { HEADERS, memberToRow } from '../src/lib/backup/rows.js';
import { MONTH_HEADERS, monthsToCreate, parseMonthTitle, monthTitle, valuesToRow, memberHistory } from '../src/lib/monthly.js';
import { createMember, monthsFromFee, planFromFee, planMonths, calculateExpiry, parsePlan } from '../src/lib/members.js';
import { makeFakeGoogle } from './fakeGoogle.mjs';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const config = { ok: true, email: 'bot@project.iam.gserviceaccount.com', key: privateKey, sheetId: 'a'.repeat(30) };

const member = (n, extra = {}) => ({
  id: `GYM-${String(n).padStart(6, '0')}`,
  name: `Member ${n}`,
  phone: `9198765${String(10000 + n)}`,
  plan: 'Monthly',
  gymPackage: 'Basic Gym',
  fee: 500,
  startDate: '2026-11-03',
  expiryDate: '2026-12-03',
  whatsappConsent: true,
  createdAt: '2026-08-01T10:00:00.000Z',
  ...extra,
});

const google = (members, options = {}) =>
  makeFakeGoogle(config, { rows: [HEADERS, ...members.map(memberToRow)], ...options });

/** Rows of a month tab as objects keyed by member id. */
const monthRows = (state, title) =>
  Object.fromEntries(state.month(title).slice(1).map(valuesToRow).map((r) => [r.id, r]));

/* ------------------------------------------------------------- pure helpers */

test('month tab names round-trip', () => {
  assert.equal(monthTitle({ year: 2026, month: 11 }), 'Nov-2026');
  assert.deepEqual(parseMonthTitle('Nov-2026'), { year: 2026, month: 11 });
  assert.equal(parseMonthTitle('Members'), null);
  assert.equal(parseMonthTitle('Foo-2026'), null);
});

test('which month tabs get created', () => {
  const nov = { year: 2026, month: 11 };
  assert.deepEqual(monthsToCreate([], nov), [nov]); // first ever: only this month, never earlier ones
  assert.deepEqual(monthsToCreate([nov], nov), []);
  assert.deepEqual(monthsToCreate([nov], { year: 2027, month: 1 }), [{ year: 2026, month: 12 }, { year: 2027, month: 1 }]);
});

test('a payment decides the duration: ₹1,000 on Basic Gym is 2 months', () => {
  assert.equal(monthsFromFee('Basic Gym', 1000), 2);
  assert.equal(monthsFromFee('Basic Gym', '500'), 1);
  assert.equal(monthsFromFee('Gym + Cardio', 3000), 3);
  assert.equal(monthsFromFee('Basic Gym', 750), null); // not a whole number of months: leave the duration alone
  assert.equal(planFromFee('Basic Gym', 6000, 'Monthly'), 'Yearly');
  assert.equal(planFromFee('Basic Gym', 1000, 'Monthly'), '2 Months');
  assert.equal(planFromFee('Basic Gym', 750, 'Quarterly'), 'Quarterly');

  assert.equal(planMonths('2 Months'), 2);
  assert.equal(parsePlan('2 months'), '2 Months');
  assert.equal(calculateExpiry('2026-11-29', '2 Months'), '2027-01-29'); // paid 29 Nov -> expires 29 Jan
  const { member: m } = createMember({ name: 'Asha', phone: '98765 43210', gymPackage: 'Basic Gym', plan: '2 Months', fee: 1000, startDate: '2026-11-29' }, []);
  assert.equal(m.expiryDate, '2027-01-29');
});

/* --------------------------------------------------------- creating the tabs */

test('the first open creates only this month, from the members whose plan touches it', async () => {
  const stillRunning = member(1, { startDate: '2026-10-20', expiryDate: '2026-11-20', createdAt: '2026-10-20T00:00:00Z' });
  const longGone = member(2, { startDate: '2026-09-01', expiryDate: '2026-10-01' });
  const joined = member(3, { startDate: '2026-11-05', expiryDate: '2026-12-05', createdAt: '2026-11-05T09:00:00Z' });
  const renewed = member(4, { startDate: '2026-11-03', expiryDate: '2026-12-03' });
  const { store, state } = google([stillRunning, longGone, joined, renewed]);

  const created = await store.ensureMonths(await store.list());
  assert.deepEqual(created, ['Nov-2026']); // no Oct-2026
  assert.deepEqual([...state.tabs.keys()].sort(), ['Members', 'Nov-2026']);
  assert.deepEqual(state.month('Nov-2026')[0], MONTH_HEADERS);

  const rows = monthRows(state, 'Nov-2026');
  assert.deepEqual(Object.keys(rows).sort(), ['GYM-000001', 'GYM-000003', 'GYM-000004']); // the expired-in-October member is left out
  assert.equal(rows['GYM-000001'].tag, 'Existing');
  assert.equal(rows['GYM-000001'].status, 'Expired'); // ran out on 20 Nov, still listed this month
  assert.equal(rows['GYM-000001'].fee, 0);
  assert.equal(rows['GYM-000003'].tag, 'New');
  assert.equal(rows['GYM-000003'].fee, 500);
  assert.equal(rows['GYM-000004'].tag, 'Renewed');
});

test('opening the app again the same month does not touch the sheet', async () => {
  const { store, state } = google([member(1)]);
  await store.ensureMonths(await store.list());
  const calls = state.calls.length;
  assert.deepEqual(await store.ensureMonths(await store.list()), []);
  assert.equal(state.calls.length, calls + 1); // only the members read above; no new tab check or write
});

test('nobody opened the app for weeks: every missed month is created, in order', async () => {
  const members = [
    member(1, { startDate: '2026-11-03', expiryDate: '2026-12-10' }), // expires mid-December
    member(2, { startDate: '2026-11-03', expiryDate: '2027-03-03' }), // still running in January
  ];
  const nov = [MONTH_HEADERS, ['GYM-000001', 'Member 1', '919876510001', 'Basic Gym', 'Monthly', '2026-11-03', '2026-12-10', 500, 'Renewed', '', 'Active'],
    ['GYM-000002', 'Member 2', '919876510002', 'Basic Gym', 'Quarterly', '2026-11-03', '2027-03-03', 1500, 'New', '', 'Active'],
    ['GYM-000009', 'Gone Guy', '919876510009', 'Basic Gym', 'Yearly', '2026-01-03', '2027-01-03', 0, 'Left', '', 'Left']];
  const { store, state } = google(members, { months: { 'Nov-2026': nov }, today: '2027-01-15' });

  const created = await store.ensureMonths(await store.list());
  assert.deepEqual(created, ['Dec-2026', 'Jan-2027']);

  const dec = monthRows(state, 'Dec-2026');
  assert.deepEqual(Object.keys(dec).sort(), ['GYM-000001', 'GYM-000002']); // the Left member is not carried over
  assert.equal(dec['GYM-000001'].status, 'Expired'); // expired 10 Dec
  assert.equal(dec['GYM-000001'].tag, 'Existing');

  const jan = monthRows(state, 'Jan-2027');
  assert.deepEqual(Object.keys(jan), ['GYM-000002']); // expired in December: not in January
});

test('a month another request created a moment ago is left alone', async () => {
  const { store, state } = google([member(1)], { months: { 'Nov-2026': [MONTH_HEADERS] } });
  assert.deepEqual(await store.ensureMonths(await store.list()), []);
  assert.equal(state.month('Nov-2026').length, 1);
});

/* ------------------------------------------------------ changes during a month */

test('a new member is recorded as New with their fee; an old member imported is Existing', async () => {
  const { store, state } = google([]);
  await store.add([
    member(1, { startDate: '2026-11-22', expiryDate: '2026-12-22', createdAt: '2026-11-22T08:00:00Z' }),
    member(2, { startDate: '2026-09-01', expiryDate: '2027-09-01', plan: 'Yearly', fee: 6000 }),
    member(3, { startDate: '2026-01-01', expiryDate: '2026-02-01' }), // expired long ago: no row
  ]);
  const rows = monthRows(state, 'Nov-2026');
  assert.deepEqual(Object.keys(rows).sort(), ['GYM-000001', 'GYM-000002']);
  assert.equal(rows['GYM-000001'].tag, 'New');
  assert.equal(rows['GYM-000001'].fee, 500);
  assert.equal(rows['GYM-000002'].tag, 'Existing');
  assert.equal(rows['GYM-000002'].fee, 0);
});

test('upgrading marks the row Upgraded, keeps the old package and adds the payment', async () => {
  const m = member(1, { startDate: '2026-10-25', expiryDate: '2026-11-25', createdAt: '2026-05-01T00:00:00Z' });
  const { store, state } = google([m]);
  await store.ensureMonths(await store.list());

  await store.update({ ...m, gymPackage: 'Gym + Cardio', startDate: '2026-11-22', expiryDate: '2026-12-22', fee: 1000 });
  const row = monthRows(state, 'Nov-2026')['GYM-000001'];
  assert.equal(row.tag, 'Upgraded');
  assert.equal(row.upgradedFrom, 'Basic Gym');
  assert.equal(row.gymPackage, 'Gym + Cardio');
  assert.equal(row.startDate, '2026-11-22');
  assert.equal(row.fee, 1000);
  assert.equal(state.month('Nov-2026').length, 2); // header + one row: updated in place, not duplicated
});

test('paying twice in a month adds the payments up', async () => {
  const m = member(1, { startDate: '2026-10-25', expiryDate: '2026-11-25', createdAt: '2026-05-01T00:00:00Z' });
  const { store, state } = google([m]);
  await store.ensureMonths(await store.list());

  const renewed = { ...m, startDate: '2026-11-22', expiryDate: '2026-12-22', fee: 500 };
  await store.update(renewed); // same package, new dates: a renewal
  assert.equal(monthRows(state, 'Nov-2026')['GYM-000001'].tag, 'Renewed');

  await store.update({ ...renewed, plan: '2 Months', expiryDate: '2027-01-22', fee: 1000 }); // pays again for 2 months
  const row = monthRows(state, 'Nov-2026')['GYM-000001'];
  assert.equal(row.fee, 1500);
  assert.equal(row.tag, 'Renewed');
  assert.equal(row.expiryDate, '2027-01-22');
});

test('a new member who upgrades in their first month stays New', async () => {
  const m = member(1, { startDate: '2026-11-05', expiryDate: '2026-12-05', createdAt: '2026-11-05T00:00:00Z' });
  const { store, state } = google([m]);
  await store.ensureMonths(await store.list());
  await store.update({ ...m, gymPackage: 'Gym + Cardio', fee: 1000 });
  const row = monthRows(state, 'Nov-2026')['GYM-000001'];
  assert.equal(row.tag, 'New');
  assert.equal(row.upgradedFrom, 'Basic Gym');
});

test('fixing a name or phone only syncs the row; the tag and fee stay', async () => {
  const m = member(1);
  const { store, state } = google([m]);
  await store.ensureMonths(await store.list());
  const before = monthRows(state, 'Nov-2026')['GYM-000001'];

  await store.update({ ...m, name: 'Corrected Name' });
  const after = monthRows(state, 'Nov-2026')['GYM-000001'];
  assert.equal(after.name, 'Corrected Name');
  assert.equal(after.tag, before.tag);
  assert.equal(after.fee, before.fee);
});

test('deleting a member keeps them in the month, tagged Left, and they do not carry into the next month', async () => {
  const stays = member(1, { expiryDate: '2027-02-03', plan: 'Quarterly' });
  const leaves = member(2, { expiryDate: '2027-02-03', plan: 'Quarterly' });
  const { store, state } = google([stays, leaves]);
  await store.ensureMonths(await store.list());

  const { members } = await store.remove('GYM-000002');
  assert.deepEqual(members.map((x) => x.id), ['GYM-000001']);
  const nov = monthRows(state, 'Nov-2026');
  assert.equal(nov['GYM-000002'].tag, 'Left');
  assert.equal(nov['GYM-000002'].status, 'Left');
  assert.equal(nov['GYM-000001'].tag, 'Renewed'); // untouched

  // a month later they are gone from the new tab, but November still has them
  const later = makeFakeGoogle(config, {
    rows: [HEADERS, memberToRow(stays)], months: { 'Nov-2026': state.month('Nov-2026') }, today: '2026-12-01',
  });
  await later.store.ensureMonths(await later.store.list());
  assert.deepEqual(Object.keys(monthRows(later.state, 'Dec-2026')), ['GYM-000001']);
});

test('if the monthly record fails, the member change is still saved and a warning comes back', async () => {
  const m = member(1);
  const { store, state } = google([m]);
  await store.ensureMonths(await store.list());
  state.tabs.delete('Nov-2026'); // someone removed the tab by hand

  const result = await store.update({ ...m, name: 'Still Saved' });
  assert.equal(result.members[0].name, 'Still Saved');
  assert.match(result.warning, /monthly record could not be updated/);
});

test('history lists month tabs newest first', async () => {
  const { store } = google([member(1)], {
    months: { 'Oct-2026': [MONTH_HEADERS], 'Dec-2026': [MONTH_HEADERS], 'Nov-2026': [MONTH_HEADERS] },
    today: '2026-12-05',
  });
  const { months } = await store.history();
  assert.deepEqual(months.map((x) => x.month), ['Dec-2026', 'Nov-2026', 'Oct-2026']);
});

test('one member\'s history: their rows across months, count, fees, name and first start', () => {
  const row = (id, name, startDate, fee, tag) => ({ id, name, phone: '919876510001', gymPackage: 'Basic Gym', plan: 'Monthly', startDate, expiryDate: '2027-01-01', fee, tag, upgradedFrom: '', status: 'Active' });
  const months = [ // newest first, as the API sends them
    { month: 'Dec-2026', rows: [row('GYM-001', 'Asha K', '2026-12-02', 500, 'Renewed'), row('GYM-002', 'Other', '2026-12-05', 500, 'New')] },
    { month: 'Nov-2026', rows: [row('GYM-001', 'Asha', '2026-11-02', 1000, 'New')] },
  ];
  const h = memberHistory(months, 'GYM-001');
  assert.equal(h.count, 2);
  assert.equal(h.fees, 1500);
  assert.equal(h.name, 'Asha K'); // the newest record's name
  assert.equal(h.firstStart, '2026-11-02');
  assert.deepEqual(h.rows.map((r) => r.month), ['Dec-2026', 'Nov-2026']);
  assert.deepEqual(memberHistory(months, 'GYM-404'), { rows: [], count: 0, fees: 0, name: '', firstStart: '' });
});
