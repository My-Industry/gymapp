// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { membersToRows, HEADERS, SHEET_NAME } from '../src/lib/backup/rows.js';
import { loadBackupSettings, saveBackupSettings, EMPTY_SETTINGS } from '../src/lib/backup/settings.js';
import {
  parseSpreadsheetId, createSpreadsheet, inspectSpreadsheet, addMembersTab, writeRows,
} from '../src/lib/backup/googleApi.js';
import {
  normalizeOneDrivePath, itemUrl, getFile, uploadMembers, buildWorkbookBytes, DEFAULT_PATH,
} from '../src/lib/backup/microsoftApi.js';
import { BackupError } from '../src/lib/backup/errors.js';
import { prepareImport, createMember } from '../src/lib/members.js';

const members = [
  { id: 'GYM-000001', name: 'Ravi Kumar', phone: '919876543210', plan: 'Monthly', gymPackage: 'Basic Gym', fee: 1500,
    startDate: '2026-01-15', expiryDate: '2026-02-15', whatsappConsent: true, createdAt: '2026-01-15T10:20:30.000Z' },
  { id: 'GYM-000002', name: 'Priya Sharma', phone: '919123456789', plan: 'Quarterly', gymPackage: 'Gym + Cardio', fee: 4000,
    startDate: '2026-01-31', expiryDate: '2026-04-30', whatsappConsent: false, createdAt: '2026-01-31T08:00:00.000Z' },
];

/** A fake fetch that records calls and replies from a queue. */
function fakeFetch(...replies) {
  const calls = [];
  const fn = async (url, options = {}) => {
    calls.push({ url, ...options });
    const r = replies.shift() ?? { status: 200, body: {} };
    if (r.throws) throw new TypeError('network down');
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  fn.calls = calls;
  return fn;
}

/* ------------------------------------------------------------------ rows */

test('members become a header row plus one row each', () => {
  const rows = membersToRows(members);
  assert.deepEqual(rows[0], HEADERS);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], ['GYM-000001', 'Ravi Kumar', '919876543210', 'Monthly', 1500, '2026-01-15', '2026-02-15', 'Yes', '2026-01-15', 'Basic Gym']);
  assert.equal(rows[2][7], 'No');
  assert.deepEqual(membersToRows([]), [HEADERS]);
});

/* -------------------------------------------------------------- settings */

function fakeStorage(initial) {
  const data = new Map(initial === undefined ? [] : [['gym-manager.backup.v1', initial]]);
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), data };
}

test('settings round-trip and survive garbage', () => {
  const s = fakeStorage();
  assert.deepEqual(loadBackupSettings(s), EMPTY_SETTINGS);

  const saved = { provider: 'google', google: { spreadsheetId: 'abc', url: 'u', title: 't' }, microsoft: null, lastBackupAt: '2026-01-01T00:00:00.000Z' };
  assert.equal(saveBackupSettings(saved, s), true);
  assert.deepEqual(loadBackupSettings(s), saved);

  assert.deepEqual(loadBackupSettings(fakeStorage('{not json')), EMPTY_SETTINGS);
  assert.deepEqual(loadBackupSettings(fakeStorage('"a string"')), EMPTY_SETTINGS);
  // a provider with no target is treated as not connected
  assert.equal(loadBackupSettings(fakeStorage(JSON.stringify({ provider: 'microsoft', microsoft: null }))).provider, null);
  assert.equal(loadBackupSettings(fakeStorage(JSON.stringify({ provider: 'dropbox' }))).provider, null);
});

test('settings do not crash when storage is blocked', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(loadBackupSettings(broken), EMPTY_SETTINGS);
  assert.equal(saveBackupSettings(EMPTY_SETTINGS, broken), false);
});

/* ---------------------------------------------------------------- Google */

test('spreadsheet id is read from links and bare ids', () => {
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz_0123456789-aBcDeF';
  assert.equal(parseSpreadsheetId(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`), id);
  assert.equal(parseSpreadsheetId(`  https://docs.google.com/spreadsheets/d/${id}  `), id);
  assert.equal(parseSpreadsheetId(id), id);
  assert.equal(parseSpreadsheetId('https://example.com/nope'), null);
  assert.equal(parseSpreadsheetId('short'), null);
  assert.equal(parseSpreadsheetId(''), null);
  assert.equal(parseSpreadsheetId(undefined), null);
});

test('createSpreadsheet posts a Members tab with the bearer token', async () => {
  const f = fakeFetch({ status: 200, body: { spreadsheetId: 'NEW', spreadsheetUrl: 'https://docs.google.com/x', properties: { title: 'Gym' } } });
  const out = await createSpreadsheet('tok', 'Gym', f);
  assert.deepEqual(out, { spreadsheetId: 'NEW', url: 'https://docs.google.com/x', title: 'Gym' });
  const [c] = f.calls;
  assert.equal(c.method, 'POST');
  assert.equal(c.headers.Authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(c.body).sheets[0].properties.title, SHEET_NAME);
});

test('inspectSpreadsheet reports whether a Members tab already exists', async () => {
  const body = (tabs) => ({ spreadsheetId: 'S', spreadsheetUrl: 'U', properties: { title: 'T' }, sheets: tabs.map((title) => ({ properties: { title } })) });
  const yes = await inspectSpreadsheet('tok', 'S', fakeFetch({ status: 200, body: body(['Sheet1', 'Members']) }));
  assert.equal(yes.tabExists, true);
  const no = await inspectSpreadsheet('tok', 'S', fakeFetch({ status: 200, body: body(['Sheet1']) }));
  assert.equal(no.tabExists, false);
});

test('addMembersTab sends an addSheet request', async () => {
  const f = fakeFetch({ status: 200 });
  await addMembersTab('tok', 'S', f);
  assert.match(f.calls[0].url, /S:batchUpdate$/);
  assert.equal(JSON.parse(f.calls[0].body).requests[0].addSheet.properties.title, 'Members');
});

test('writeRows clears the tab, then writes all rows as RAW text', async () => {
  const f = fakeFetch({ status: 200 }, { status: 200 });
  const rows = membersToRows(members);
  await writeRows('tok', 'SHEET1', rows, f);
  assert.equal(f.calls.length, 2);
  assert.match(f.calls[0].url, /SHEET1\/values\/Members:clear$/);
  assert.equal(f.calls[0].method, 'POST');
  assert.match(f.calls[1].url, /SHEET1\/values\/Members!A1\?valueInputOption=RAW$|Members%21A1\?valueInputOption=RAW$/);
  assert.equal(f.calls[1].method, 'PUT');
  const sent = JSON.parse(f.calls[1].body);
  assert.deepEqual(sent.values, rows);
  assert.equal(sent.values[1][2], '919876543210'); // phone stays a string
});

test('Google errors map to reconnect / access / failed', async () => {
  const code = async (reply) => {
    try { await writeRows('tok', 'S', [], fakeFetch(reply)); } catch (e) { assert.ok(e instanceof BackupError); return e.code; }
    return 'no error';
  };
  assert.equal(await code({ status: 401, body: {} }), 'reconnect');
  assert.equal(await code({ status: 403, body: {} }), 'access');
  assert.equal(await code({ status: 404, body: {} }), 'access');
  assert.equal(await code({ status: 500, body: { error: { message: 'boom' } } }), 'failed');
  assert.equal(await code({ throws: true }), 'failed');
});

/* ------------------------------------------------------------- Microsoft */

test('OneDrive paths are cleaned and validated', () => {
  assert.deepEqual(normalizeOneDrivePath('Gym Manager/Members.xlsx'), { path: 'Gym Manager/Members.xlsx' });
  assert.deepEqual(normalizeOneDrivePath('  /Gym\\Backups\\members '), { path: 'Gym/Backups/members.xlsx' });
  assert.deepEqual(normalizeOneDrivePath(DEFAULT_PATH), { path: DEFAULT_PATH });
  for (const bad of ['', '   ', '../secret.xlsx', 'a//b.xlsx', 'bad:name.xlsx', 'what?.xlsx', 'folder./x.xlsx']) {
    assert.ok(normalizeOneDrivePath(bad).error, `should reject "${bad}"`);
  }
});

test('Graph URLs encode each path segment', () => {
  assert.equal(
    itemUrl('Gym Manager/Members #1.xlsx', ':/content'),
    'https://graph.microsoft.com/v1.0/me/drive/root:/Gym%20Manager/Members%20%231.xlsx:/content',
  );
});

test('getFile returns null for a missing file and the link for an existing one', async () => {
  assert.equal(await getFile('tok', 'a.xlsx', fakeFetch({ status: 404, body: {} })), null);
  assert.deepEqual(await getFile('tok', 'a.xlsx', fakeFetch({ status: 200, body: { webUrl: 'https://1drv.ms/x' } })), { webUrl: 'https://1drv.ms/x' });
  await assert.rejects(getFile('tok', 'a.xlsx', fakeFetch({ status: 401, body: {} })), (e) => e.code === 'reconnect');
});

test('uploadMembers PUTs a real .xlsx that the app can import again', async () => {
  const f = fakeFetch({ status: 201, body: { webUrl: 'https://1drv.ms/file' } });
  const out = await uploadMembers('tok', 'Gym Manager/Members.xlsx', members, f);
  assert.deepEqual(out, { webUrl: 'https://1drv.ms/file' });

  const [c] = f.calls;
  assert.equal(c.method, 'PUT');
  assert.match(c.url, /root:\/Gym%20Manager\/Members\.xlsx:\/content$/);
  assert.equal(c.headers.Authorization, 'Bearer tok');
  assert.match(c.headers['Content-Type'], /spreadsheetml\.sheet$/);

  // Read the uploaded bytes back with SheetJS, like the Import tab does.
  const XLSX = await import('xlsx');
  const wb = XLSX.read(c.body);
  assert.deepEqual(wb.SheetNames, ['Members']);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets.Members, { defval: '', raw: true });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].Phone, '919876543210'); // text, not a number
  assert.equal(rows[0]['WhatsApp Consent'], 'Yes');

  // ...and a backup is a valid import into an empty app
  const result = prepareImport(rows, []);
  assert.equal(result.invalid.length, 0, JSON.stringify(result.invalid));
  assert.equal(result.ready.length, 2);
  assert.equal(result.ready[0].phone, '919876543210');
  assert.equal(result.ready[1].plan, 'Quarterly');
  assert.equal(result.ready[1].whatsappConsent, false);
});

test('an empty member list still produces a valid workbook with headers', async () => {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await buildWorkbookBytes([]));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets.Members, { header: 1 });
  assert.deepEqual(rows, [HEADERS]);
});

test('a newly created member is backed up without errors', () => {
  const { member } = createMember({ name: 'Asha', phone: '98765 43210', plan: 'Yearly', fee: 9000, startDate: '2026-03-01', whatsappConsent: true }, []);
  const rows = membersToRows([member]);
  assert.equal(rows[1][1], 'Asha');
  assert.equal(rows[1][3], 'Yearly');
});
