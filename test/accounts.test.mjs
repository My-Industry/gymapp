// Accounts stored in the separate "server" Google Sheet: sign up, log in, forgot / reset password.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createAccountStore, setAccountStoreForTests, ACCOUNT_HEADERS, RESET_HEADERS } from '../api/_lib/accounts.js';
import { verifyPassword, readConfig, COOKIE_NAME } from '../api/_lib/auth.js';
import { validateEmail } from '../api/_lib/signup.js';
import { resetLink } from '../api/_lib/resetToken.js';
import signup from '../api/signup.js';
import login from '../api/login.js';
import me from '../api/me.js';
import forgot from '../api/forgot-password.js';
import reset from '../api/reset-password.js';
import { makeFakeGoogle } from './fakeGoogle.mjs';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const config = { ok: true, email: 'bot@project.iam.gserviceaccount.com', key: privateKey, sheetId: 'b'.repeat(30) };
const SECRET = 'x'.repeat(40);

function mockRes() {
  const res = { headers: {}, statusCode: 200, body: undefined };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
const post = (handler, body, headers = {}) => {
  const res = mockRes();
  return handler({ method: 'POST', headers, socket: { remoteAddress: '203.0.113.9' }, body }, res).then(() => res);
};

// Sets up env + a fake "server" sheet for one test, and cleans up afterwards.
async function withServerSheet(fn, { authUsers = '' } = {}) {
  const fake = makeFakeGoogle(config, { hasTab: false });
  const clock = { now: Date.now() };
  const store = createAccountStore(config, fake.fetchImpl, { now: () => clock.now });
  setAccountStoreForTests(store);
  const saved = { ...process.env };
  Object.assign(process.env, {
    AUTH_SECRET: SECRET,
    AUTH_USERS: authUsers,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: config.email,
    GOOGLE_PRIVATE_KEY: privateKey,
    GOOGLE_SHEET_ID_server: config.sheetId,
  });
  try {
    await fn({ fake, store, clock });
  } finally {
    setAccountStoreForTests(undefined);
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}

const newAccount = (over = {}) => ({ username: 'Owner', password: 'correct horse', email: 'Owner@Gmail.com', ...over });

test('email validation', () => {
  assert.deepEqual(validateEmail(' Owner@Gmail.com '), { email: 'owner@gmail.com' });
  for (const bad of ['', 'owner', 'owner@', '@gmail.com', 'a b@gmail.com', 'a@b', 'a@@gmail.com', 'a@gmail.com,b@gmail.com']) {
    assert.ok(validateEmail(bad).error, bad);
  }
});

test('config works with only the accounts sheet (no AUTH_USERS)', () => {
  const env = {
    AUTH_SECRET: SECRET, GOOGLE_SERVICE_ACCOUNT_EMAIL: config.email, GOOGLE_PRIVATE_KEY: privateKey,
    GOOGLE_SHEET_ID_server: config.sheetId,
  };
  assert.equal(readConfig(env).ok, true);
  assert.equal(readConfig({ ...env, GOOGLE_SHEET_ID_server: '' }).ok, false);
});

test('sign up saves username, password hash and email in the Accounts tab', async () => {
  await withServerSheet(async ({ fake }) => {
    const res = await post(signup, newAccount());
    assert.equal(res.statusCode, 201);
    assert.deepEqual(res.body, { saved: true, storage: 'sheet', user: 'owner' });

    const [header, row] = fake.state.tabs.get('Accounts');
    assert.deepEqual(header, ACCOUNT_HEADERS);
    const [username, hash, email, role, createdAt] = row;
    assert.equal(username, 'owner');
    assert.equal(email, 'owner@gmail.com');
    assert.equal(role, 'admin'); // the very first account
    assert.ok(!JSON.stringify(row).includes('correct horse')); // never stored in plain text
    assert.equal(verifyPassword('correct horse', hash), true);
    assert.ok(!Number.isNaN(Date.parse(createdAt)));
  });
});

test('sign up: every new account is an admin; taken username/email and bad email are refused', async () => {
  await withServerSheet(async ({ fake }) => {
    await post(signup, newAccount());
    assert.equal((await post(signup, newAccount({ username: 'desk', email: 'desk@gmail.com' }))).statusCode, 201);
    assert.equal(fake.state.tabs.get('Accounts')[1][3], 'admin');
    assert.equal(fake.state.tabs.get('Accounts')[2][3], 'admin'); // not staff, even though it isn't the first

    const sameName = await post(signup, newAccount({ username: 'OWNER', email: 'other@gmail.com' }));
    assert.equal(sameName.statusCode, 409);
    assert.match(sameName.body.error, /username/);
    const sameMail = await post(signup, newAccount({ username: 'third', email: 'DESK@gmail.com' }));
    assert.equal(sameMail.statusCode, 409);
    assert.match(sameMail.body.error, /email/);
    assert.equal((await post(signup, newAccount({ username: 'fourth', email: 'nope' }))).statusCode, 400);
    assert.equal((await post(signup, newAccount({ username: 'fifth', email: '' }))).statusCode, 400);
    assert.equal(fake.state.tabs.get('Accounts').length, 3); // header + 2 accounts
  });
});

test('sign up needs AUTH_SECRET, otherwise nobody could sign in afterwards', async () => {
  await withServerSheet(async ({ fake }) => {
    process.env.AUTH_SECRET = '';
    const res = await post(signup, newAccount());
    assert.equal(res.statusCode, 500);
    assert.match(res.body.error, /AUTH_SECRET/);
    assert.equal(fake.state.tabs.get('Accounts'), undefined);
  });
});

test('a sheet account can log in, and /api/me reports the role written in the sheet', async () => {
  await withServerSheet(async ({ fake }) => {
    await post(signup, newAccount());
    await post(signup, newAccount({ username: 'desk', email: 'desk@gmail.com', password: 'front-desk-pw' }));
    fake.state.tabs.get('Accounts')[2][3] = 'staff'; // the owner edits the Role cell by hand

    const ok = await post(login, { username: 'Owner', password: 'correct horse' });
    assert.equal(ok.statusCode, 200);
    assert.deepEqual(ok.body, { user: 'owner', role: 'admin' });
    const cookie = ok.headers['set-cookie'].split(';')[0];
    assert.ok(cookie.startsWith(`${COOKIE_NAME}=`));

    const meRes = mockRes();
    await me({ method: 'GET', headers: { cookie } }, meRes);
    assert.deepEqual(meRes.body, { user: 'owner', role: 'admin' });

    assert.deepEqual((await post(login, { username: 'desk', password: 'front-desk-pw' })).body, { user: 'desk', role: 'staff' });
    assert.equal((await post(login, { username: 'owner', password: 'wrong' })).statusCode, 401);
    assert.equal((await post(login, { username: 'ghost', password: 'correct horse' })).statusCode, 401);
  });
});

test('accounts in AUTH_USERS still work next to the sheet, and win on a username clash', async () => {
  const { hashPassword } = await import('../api/_lib/auth.js');
  await withServerSheet(async () => {
    const res = await post(login, { username: 'boss', password: 'env-password' });
    assert.deepEqual(res.body, { user: 'boss', role: 'admin' });
    assert.equal((await post(signup, newAccount({ username: 'boss' }))).statusCode, 409);
    // a new sign-up is an admin even when an AUTH_USERS admin already exists
    await post(signup, newAccount());
    assert.equal((await post(login, { username: 'owner', password: 'correct horse' })).body.role, 'admin');
  }, { authUsers: `boss:${hashPassword('env-password')}` });
});

test('a removed account is signed out once the list refreshes', async () => {
  await withServerSheet(async ({ fake, store, clock }) => {
    await post(signup, newAccount());
    const cookie = (await post(login, { username: 'owner', password: 'correct horse' })).headers['set-cookie'].split(';')[0];
    fake.state.tabs.get('Accounts').splice(1, 1); // the owner deletes the row in Google Sheets
    clock.now += 60_000; // past the short cache
    const meRes = mockRes();
    await me({ method: 'GET', headers: { cookie } }, meRes);
    assert.equal(meRes.statusCode, 401);
    assert.deepEqual(await store.list(), []);
  });
});

test('forgot password: same answer for unknown emails, one-time link for real ones', async () => {
  await withServerSheet(async ({ fake }) => {
    await post(signup, newAccount());

    const unknown = await post(forgot, { email: 'nobody@gmail.com' });
    const known = await post(forgot, { email: 'OWNER@gmail.com' }, { host: 'localhost:5173' });
    assert.equal(unknown.statusCode, 200);
    assert.deepEqual(unknown.body, known.body); // can't tell who has an account
    assert.equal((await post(forgot, { email: 'not-an-email' })).statusCode, 400);

    const [header, ...rows] = fake.state.tabs.get('Password Resets');
    assert.deepEqual(header, RESET_HEADERS);
    assert.equal(rows.length, 1);
    assert.equal(rows[0][0], 'owner');

    // asking again straight away doesn't pile up more links
    await post(forgot, { email: 'owner@gmail.com' });
    assert.equal(fake.state.tabs.get('Password Resets').length, 2);
  });
});

test('reset link: sets a new password once, rejects reuse, expiry and junk', async () => {
  await withServerSheet(async ({ fake, clock }) => {
    await post(signup, newAccount());

    // capture the dev-console link the placeholder mailer prints
    process.env.AUTH_ENV_FILE = 'dev';
    const logged = [];
    const realLog = console.log;
    console.log = (...a) => logged.push(a.join(' '));
    try { await post(forgot, { email: 'owner@gmail.com' }, { host: 'localhost:5173' }); } finally { console.log = realLog; }
    const token = /\?reset=([\w-]+)/.exec(logged.join('\n'))[1];

    // only a hash of the token is in the sheet
    assert.ok(!JSON.stringify(fake.state.tabs.get('Password Resets')).includes(token));

    assert.equal((await post(reset, { token, password: 'short' })).statusCode, 400);
    assert.equal((await post(reset, { token: 'x'.repeat(43), password: 'a-new-password' })).statusCode, 400);

    const done = await post(reset, { token, password: 'a-new-password' });
    assert.equal(done.statusCode, 200);
    assert.equal((await post(login, { username: 'owner', password: 'a-new-password' })).statusCode, 200);
    assert.equal((await post(login, { username: 'owner', password: 'correct horse' })).statusCode, 401);
    assert.equal((await post(reset, { token, password: 'another-password' })).statusCode, 400); // used already

    // an old link stops working after an hour
    logged.length = 0;
    clock.now += 2 * 60_000;
    console.log = (...a) => logged.push(a.join(' '));
    try { await post(forgot, { email: 'owner@gmail.com' }, { host: 'localhost:5173' }); } finally { console.log = realLog; }
    const stale = /\?reset=([\w-]+)/.exec(logged.join('\n'))[1];
    clock.now += 2 * 60 * 60_000;
    assert.equal((await post(reset, { token: stale, password: 'yet-another-pw' })).statusCode, 400);
  });
});

test('reset links are built from APP_URL, not from the request Host header', () => {
  assert.equal(resetLink('tok', { APP_URL: 'https://gym.example.com/' }, { headers: { host: 'evil.test' } }), 'https://gym.example.com/?reset=tok');
  assert.equal(resetLink('tok', {}, { headers: { host: 'evil.test' } }), null); // deployed without APP_URL: no link
  assert.equal(resetLink('tok', { AUTH_ENV_FILE: 'x' }, { headers: { host: 'localhost:5173' } }), 'http://localhost:5173/?reset=tok');
});

test('forgot / reset say so when the accounts sheet is not set up', async () => {
  setAccountStoreForTests(null);
  try {
    assert.equal((await post(forgot, { email: 'a@gmail.com' })).statusCode, 503);
    assert.equal((await post(reset, { token: 'x'.repeat(43), password: 'a-new-password' })).statusCode, 503);
  } finally {
    setAccountStoreForTests(undefined);
  }
});
