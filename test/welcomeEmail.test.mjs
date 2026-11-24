import test from 'node:test';
import assert from 'node:assert/strict';
import { welcomeEmail } from '../api/_lib/emailTemplates.js';
import { sendWelcomeEmail } from '../api/_lib/mailer.js';
import { appBaseUrl } from '../api/_lib/resetToken.js';

test('welcome email is branded and carries the footer', () => {
  const { subject, html, text } = welcomeEmail({ username: 'owner', appUrl: 'https://gym.example.com' });
  assert.equal(subject, 'Welcome to Gym Application');
  for (const body of [html, text]) {
    assert.match(body, /Gym Application/);
    assert.match(body, /Powered by My Industry/);
    assert.match(body, /All rights reserved/);
  }
  assert.match(html, new RegExp(`&copy; ${new Date().getFullYear()} My Industry`));
  assert.match(html, /href="https:\/\/gym\.example\.com"/);
  assert.match(text, /Welcome, owner!/);
});

test('welcome email escapes the username and ignores non-http links', () => {
  const { html } = welcomeEmail({ username: '<script>alert(1)</script>', appUrl: 'javascript:alert(1)' });
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
  assert.ok(!html.includes('javascript:'));
  assert.ok(!/Open Gym Application/.test(html)); // no button without a safe link
});

test('sendWelcomeEmail does nothing (and does not throw) when mail is not configured', async () => {
  const saved = { u: process.env.MAIL_USER, p: process.env.MAIL_APP_PASSWORD };
  delete process.env.MAIL_USER;
  delete process.env.MAIL_APP_PASSWORD;
  try {
    assert.deepEqual(await sendWelcomeEmail({ to: 'a@b.com', username: 'x' }), { sent: false });
    assert.deepEqual(await sendWelcomeEmail({ to: '', username: 'x' }), { sent: false });
  } finally {
    if (saved.u !== undefined) process.env.MAIL_USER = saved.u;
    if (saved.p !== undefined) process.env.MAIL_APP_PASSWORD = saved.p;
  }
});

test('appBaseUrl uses APP_URL, and only falls back to the request host on a dev machine', () => {
  assert.equal(appBaseUrl({ APP_URL: 'https://gym.example.com/' }, {}), 'https://gym.example.com');
  assert.equal(appBaseUrl({}, { headers: { host: 'evil.test' } }), '');
  assert.equal(appBaseUrl({ AUTH_ENV_FILE: 'x' }, { headers: { host: 'localhost:5173' } }), 'http://localhost:5173');
});
