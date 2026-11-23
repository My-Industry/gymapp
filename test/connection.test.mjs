// Connecting a gym's own Google Sheet from Profile: validation, encrypted storage, per-user store choice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createAccountStore, setAccountStoreForTests, ACCOUNT_HEADERS } from '../api/_lib/accounts.js';
import { hashPassword, verifyPassword } from '../api/_lib/auth.js';
import { encryptSecret, decryptSecret } from '../api/_lib/secretBox.js';
import { storeFor } from '../api/_lib/userStore.js';
import { SheetsError } from '../api/_lib/sheets.js';
import connection, { hooks } from '../api/connection.js';
import signup from '../api/signup.js';
import login from '../api/login.js';
import { makeFakeGoogle } from './fakeGoogle.mjs';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const config = { ok: true, email: 'bot@project.iam.gserviceaccount.com', key: privateKey, sheetId: 'c'.repeat(30) };
const SECRET = 'x'.repeat(40);
const SA = 'gym-app@my-project.iam.gserviceaccount.com';
const SHEET_LINK = 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit';
const originalCheck = hooks.checkSheet;

function mockRes() {
  const res = { headers: {}, statusCode: 200, body: undefined };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
const send = async (handler, method, body, cookie = '') => {
  const res = mockRes();
  await handler({ method, headers: { cookie }, socket: { remoteAddress: '203.0.113.9' }, body }, res);
  return res;
};
const signIn = async (username, password) =>
  (await send(login, 'POST', { username, password })).headers['set-cookie'].split(';')[0];
const connectBody = (over = {}) => ({
  serviceEmail: SA,
  privateKey: privateKey.replaceAll('\n', '\\n'), // as copied out of the JSON key file
  sheetLink: SHEET_LINK,
  ...over,
});
const newAccount = (over = {}) => ({ username: 'owner', password: 'correct horse', email: 'owner@gmail.com', ...over });

async function withServerSheet(fn, { authUsers = '' } = {}) {
  const fake = makeFakeGoogle(config, { hasTab: false });
  setAccountStoreForTests(createAccountStore(config, fake.fetchImpl));
  const saved = { ...process.env };
  Object.assign(process.env, {
    AUTH_SECRET: SECRET,
    AUTH_USERS: authUsers,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: config.email,
    GOOGLE_PRIVATE_KEY: privateKey,
    GOOGLE_SHEET_ID_server: config.sheetId,
  });
  delete process.env.GOOGLE_SHEET_ID; // no default members sheet in these tests
  delete process.env.ENCRYPTION_KEY;
  try {
    await fn({ fake });
  } finally {
    hooks.checkSheet = originalCheck;
    setAccountStoreForTests(undefined);
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}

test('secrets are encrypted, and only the right secret opens them', () => {
  const box = encryptSecret('-----BEGIN PRIVATE KEY-----abc', 'a-long-enough-secret-value');
  assert.match(box, /^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
  assert.ok(!box.includes('PRIVATE'));
  assert.notEqual(box, encryptSecret('-----BEGIN PRIVATE KEY-----abc', 'a-long-enough-secret-value')); // random iv
  assert.equal(decryptSecret(box, 'a-long-enough-secret-value'), '-----BEGIN PRIVATE KEY-----abc');
  assert.equal(decryptSecret(box, 'some-other-secret-value!!'), null);
  assert.equal(decryptSecret(`${box.slice(0, -3)}AAA`, 'a-long-enough-secret-value'), null); // tampered
  assert.equal(decryptSecret('garbage', 'a-long-enough-secret-value'), null);
  assert.throws(() => encryptSecret('x', ''), /secret/);
});

test('Connect: validates, tests the sheet, saves the key encrypted; members then use that sheet', async () => {
  await withServerSheet(async ({ fake }) => {
    await send(signup, 'POST', newAccount());
    const cookie = await signIn('owner', 'correct horse');
    hooks.checkSheet = async () => 'My Gym Sheet';

    assert.deepEqual((await send(connection, 'GET', undefined, cookie)).body, { connected: false });

    // bad input is refused before anything is saved
    assert.equal((await send(connection, 'POST', connectBody({ serviceEmail: 'me@gmail.com' }), cookie)).statusCode, 400);
    assert.equal((await send(connection, 'POST', connectBody({ privateKey: 'not a key' }), cookie)).statusCode, 400);
    assert.equal((await send(connection, 'POST', connectBody({ sheetLink: 'hello' }), cookie)).statusCode, 400);
    assert.equal((await send(connection, 'POST', connectBody(), '')).statusCode, 401);

    // Google refuses: say why, save nothing
    hooks.checkSheet = async () => { throw new SheetsError('forbidden', `Google refused access. Share the sheet with ${SA}.`); };
    const refused = await send(connection, 'POST', connectBody(), cookie);
    assert.equal(refused.statusCode, 400);
    assert.match(refused.body.error, /Share the sheet/);
    assert.equal(fake.state.tabs.get('Accounts')[1][5], '');

    // success
    hooks.checkSheet = async () => 'My Gym Sheet';
    const ok = await send(connection, 'POST', connectBody(), cookie);
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.body.connected, true);
    assert.equal(ok.body.title, 'My Gym Sheet');
    assert.ok(!JSON.stringify(ok.body).includes('PRIVATE'));

    const [header, row] = fake.state.tabs.get('Accounts');
    assert.deepEqual(header.slice(5), ['Service Account Email', 'Private Key (encrypted)', 'Sheet Link']);
    assert.equal(row[5], SA);
    assert.equal(row[7], SHEET_LINK);
    assert.ok(!row[6].includes('PRIVATE') && !row[6].includes('BEGIN')); // encrypted, not plain text
    assert.equal(decryptSecret(row[6], SECRET), privateKey); // the server can read it back
    assert.equal(verifyPassword('correct horse', row[1]), true); // the password hash survived the update

    const got = await send(connection, 'GET', undefined, cookie);
    assert.equal(got.body.connected, true);
    assert.equal(got.body.serviceEmail, SA);
    assert.equal(got.body.sheetId, '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789');
    assert.ok(!JSON.stringify(got.body).includes('PRIVATE'));

    // members now come from their own sheet (with no default sheet configured, this would throw otherwise)
    const store = await storeFor({ user: 'owner', role: 'admin' });
    assert.equal(typeof store.list, 'function');
    assert.equal(store, await storeFor({ user: 'owner', role: 'admin' })); // reused between requests

    // disconnect: connection cleared, password kept, back to the default sheet (missing here)
    assert.deepEqual((await send(connection, 'DELETE', undefined, cookie)).body, { connected: false });
    assert.deepEqual(fake.state.tabs.get('Accounts')[1].slice(5), ['', '', '']);
    assert.equal(verifyPassword('correct horse', fake.state.tabs.get('Accounts')[1][1]), true);
    await assert.rejects(storeFor({ user: 'owner', role: 'admin' }), (e) => e.code === 'not-configured');
  });
});

test('a connection that can no longer be decrypted asks the user to connect again', async () => {
  await withServerSheet(async () => {
    await send(signup, 'POST', newAccount());
    const cookie = await signIn('owner', 'correct horse');
    hooks.checkSheet = async () => 'Sheet';
    await send(connection, 'POST', connectBody(), cookie);
    process.env.AUTH_SECRET = 'y'.repeat(40); // the server secret changed since the key was saved
    await assert.rejects(storeFor({ user: 'owner', role: 'admin' }), /connect your sheet again/i);
  });
});

test('Connect is for admins only', async () => {
  await withServerSheet(async ({ fake }) => {
    await send(signup, 'POST', newAccount());
    await send(signup, 'POST', newAccount({ username: 'desk', email: 'desk@gmail.com', password: 'front-desk-pw' }));
    fake.state.tabs.get('Accounts')[2][3] = 'staff'; // staff accounts are set by hand in the sheet for now
    const cookie = await signIn('desk', 'front-desk-pw');
    assert.equal((await send(connection, 'GET', undefined, cookie)).statusCode, 403);
    assert.equal((await send(connection, 'POST', connectBody(), cookie)).statusCode, 403);
  });
});

test('an account kept in AUTH_USERS can connect too (it gets a row with no password)', async () => {
  await withServerSheet(async ({ fake }) => {
    const cookie = await signIn('boss', 'env-password');
    hooks.checkSheet = async () => 'Sheet';
    assert.equal((await send(connection, 'POST', connectBody(), cookie)).statusCode, 200);
    const row = fake.state.tabs.get('Accounts').find((r) => r[0] === 'boss');
    assert.equal(row[1], ''); // no hash: it still signs in through AUTH_USERS only
    assert.equal(row[3], 'admin');
    assert.equal(row[5], SA);
    assert.equal((await send(login, 'POST', { username: 'boss', password: 'env-password' })).statusCode, 200);
    assert.equal((await send(login, 'POST', { username: 'boss', password: '' })).statusCode, 401);
  }, { authUsers: `boss:${hashPassword('env-password')}` });
});

test('an Accounts tab made with the older 5 columns gets the new headers', async () => {
  const fake = makeFakeGoogle(config, {
    hasTab: false,
    months: { Accounts: [ACCOUNT_HEADERS.slice(0, 5), ['owner', 'scrypt.a.b', 'o@gmail.com', 'admin', '2026-11-01T00:00:00.000Z']] },
  });
  const store = createAccountStore(config, fake.fetchImpl);
  const [owner] = await store.list();
  assert.equal(owner.username, 'owner');
  assert.equal(owner.keyEnc, '');
  assert.deepEqual(fake.state.tabs.get('Accounts')[0], ACCOUNT_HEADERS);
});
