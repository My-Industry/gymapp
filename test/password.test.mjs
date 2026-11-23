// Strong-password rules and the strength meter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPassword, passwordBars, passwordProblem, PASSWORD_RULES } from '../src/lib/password.js';
import { validateNewUser } from '../api/_lib/signup.js';
import signup from '../api/signup.js';
import reset from '../api/reset-password.js';
import { setAccountStoreForTests } from '../api/_lib/accounts.js';

const ok = (p) => assert.equal(passwordProblem(p), '', p);
const bad = (p, pattern) => assert.match(passwordProblem(p), pattern, p);

test('accepted: 8+ characters with upper case, lower case and a special character', () => {
  ok('Abcdef1!');
  ok('Abcdefg!');       // a number is not required
  ok('Gym#Owner');
  ok('Ünicode-Pass');   // non-English letters count as letters
  ok('correct Horse!'); // spaces are fine
});

test('refused: too short, missing upper case, lower case or special character', () => {
  bad('Ab1!', /at least 8/);
  bad('Abc!', /at least 8/);
  bad('', /at least 8/);
  bad(undefined, /at least 8/);
  bad('abcdefg!', /uppercase/);
  bad('ABCDEFG!', /lowercase/);
  bad('Abcdefg1', /special character/); // digits are not special characters
  bad('Abcdefgh', /special character/);
  bad('abcdefgh', /uppercase letter, a lowercase|uppercase letter and a special/); // names everything missing
  bad('x'.repeat(201) + 'A!', /too long/);
});

test('the message lists everything that is missing', () => {
  assert.match(passwordProblem('12345678'), /uppercase letter, a lowercase letter and a special character/);
  assert.match(passwordProblem('abcdefgh'), /uppercase letter and a special character/);
});

test('checklist marks each rule', () => {
  const r = checkPassword('Abc').rules;
  assert.deepEqual(r.map((x) => [x.id, x.ok]), [['length', false], ['upper', true], ['lower', true], ['special', false]]);
  assert.equal(PASSWORD_RULES.length, 4);
  assert.equal(checkPassword('Abcdef1!').ok, true);
  assert.equal(checkPassword('abcdef1!').ok, false);
});

test('four bars: grey at first, red for 1-2 rules, yellow for 3, all green for 4', () => {
  const bars = (p) => passwordBars(p);
  assert.deepEqual(bars(''), { met: 0, color: '' });
  assert.deepEqual(bars(undefined), { met: 0, color: '' });
  assert.deepEqual(bars('   '), { met: 0, color: '' }); // nothing useful typed
  assert.deepEqual(bars('a'), { met: 1, color: 'red' });
  assert.deepEqual(bars('A'), { met: 1, color: 'red' });
  assert.deepEqual(bars('abcdefgh'), { met: 2, color: 'red' }); // long + lower case
  assert.deepEqual(bars('Ab'), { met: 2, color: 'red' });
  assert.deepEqual(bars('Abcdefgh'), { met: 3, color: 'yellow' }); // long + upper + lower
  assert.deepEqual(bars('Ab!'), { met: 3, color: 'yellow' });
  assert.deepEqual(bars('Abcdefg!'), { met: 4, color: 'green' });
  assert.deepEqual(bars('Blue#Moon'), { met: 4, color: 'green' });
});

test('the bars only turn fully green when the server would accept the password', () => {
  for (const p of ['', 'a', 'Abcdefgh', 'abcdefg!', 'ABCDEFG!', 'Abcdefg1', 'Abcdefg!', 'Gym#Owner', 'Ab1!']) {
    assert.equal(passwordBars(p).color === 'green', passwordProblem(p) === '', p);
  }
});

test('sign up details are validated with the same rules', () => {
  assert.equal(validateNewUser('owner', 'Abcdef1!'), '');
  assert.match(validateNewUser('owner', 'abcdefgh'), /uppercase/);
  assert.match(validateNewUser('owner', 'Abcdefgh'), /special character/);
});

function mockRes() {
  const res = { headers: {}, statusCode: 200, body: undefined };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

test('the server refuses weak passwords on sign up and on reset', async () => {
  setAccountStoreForTests(null);
  delete process.env.AUTH_ENV_FILE;
  try {
    const weak = mockRes();
    await signup({
      method: 'POST', headers: {}, socket: { remoteAddress: '203.0.113.9' },
      body: { username: 'newowner', password: 'weakpassword', email: 'a@gmail.com', acceptedTerms: true },
    }, weak);
    assert.equal(weak.statusCode, 400);
    assert.match(weak.body.error, /uppercase/);
    assert.equal(weak.body.entry, undefined); // nothing was prepared

    const strong = mockRes();
    await signup({
      method: 'POST', headers: {}, socket: { remoteAddress: '203.0.113.9' },
      body: { username: 'newowner', password: 'Strong-Pass1!', email: 'a@gmail.com', acceptedTerms: true },
    }, strong);
    assert.equal(strong.statusCode, 200);
  } finally {
    setAccountStoreForTests(undefined);
  }

  // reset-password checks the rules before it looks at the token (the accounts sheet being absent gives 503 first,
  // so give it a stub store that has no matching reset)
  setAccountStoreForTests({ findReset: async () => null });
  try {
    const res = mockRes();
    await reset({ method: 'POST', headers: {}, body: { token: 'x'.repeat(43), password: 'alllowercase1' } }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /uppercase/);
  } finally {
    setAccountStoreForTests(undefined);
  }
});
