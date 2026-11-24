// Sends one test email to check the MAIL_* settings in .env.local.
//   npm run test-mail                 -> sends to MAIL_USER itself
//   npm run test-mail -- you@x.com    -> sends to that address
//   npm run test-mail -- --welcome    -> sends the welcome card instead (add an address after it if you like)
import { sendMail, sendWelcomeEmail, mailConfigured } from '../api/_lib/mailer.js';

if (!mailConfigured()) {
  console.error('MAIL_USER / MAIL_APP_PASSWORD are not set. Fill them in .env.local first.');
  process.exit(1);
}
const args = process.argv.slice(2);
const welcome = args.includes('--welcome');
const to = args.find((a) => !a.startsWith('--')) || process.env.MAIL_USER;
try {
  const r = welcome
    ? await sendWelcomeEmail({ to, username: 'preview', appUrl: process.env.APP_URL })
    : await sendMail({ to, subject: 'Gym app: test email', text: 'If you can read this, outgoing email works.' });
  console.log(r.sent ? `Sent a test email to ${to}. Check the inbox (and spam).` : 'Not sent.');
} catch (err) {
  console.error(`Failed: ${err.message}`);
  process.exit(1);
}
