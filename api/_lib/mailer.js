// Sends email through Gmail SMTP with an App Password (MAIL_USER, MAIL_APP_PASSWORD, MAIL_FROM).
// Files/folders starting with "_" inside /api are NOT exposed as endpoints.
import nodemailer from 'nodemailer';
import { welcomeEmail } from './emailTemplates.js';

/** True when the three MAIL_* variables are set. */
export function mailConfigured(env = process.env) {
  return Boolean(env.MAIL_USER && env.MAIL_APP_PASSWORD);
}

let cached = null;
function getTransport(env = process.env) {
  if (!mailConfigured(env)) return null;
  const key = `${env.MAIL_USER}|${env.MAIL_APP_PASSWORD}`;
  if (cached?.key !== key) {
    cached = {
      key,
      transport: nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        // Google shows the App Password in groups of four with spaces; the spaces aren't part of it.
        auth: { user: env.MAIL_USER, pass: String(env.MAIL_APP_PASSWORD).replace(/\s+/g, '') },
      }),
    };
  }
  return cached.transport;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Sends one email. Returns { sent: boolean }. Throws if the mail server rejects it. */
export async function sendMail({ to, subject, text, html }, env = process.env) {
  const transport = getTransport(env);
  if (!transport) return { sent: false };
  await transport.sendMail({ from: env.MAIL_FROM || env.MAIL_USER, to, subject, text, html });
  return { sent: true };
}

/** Returns { sent: boolean }. */
export async function sendPasswordResetEmail({ to, username, link }) {
  // On your own machine (dev server only) also print the link, handy when mail isn't set up.
  // On a deployed site it is never logged, because anyone who can read the logs could take over the account.
  if (process.env.AUTH_ENV_FILE && link) {
    console.log(`[dev] Password reset link for ${username} <${to}>: ${link}`);
  }
  if (!link) return { sent: false };
  const name = escapeHtml(username);
  return sendMail({
    to,
    subject: 'Reset your password',
    text: `Hi ${username},\n\nSomeone asked to reset the password for your account. Open this link within 1 hour to choose a new one:\n\n${link}\n\nIf this wasn't you, ignore this email. Your password stays the same.`,
    html: `<p>Hi ${name},</p><p>Someone asked to reset the password for your account. Use the button below within 1 hour to choose a new one.</p><p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none">Reset password</a></p><p>If this wasn't you, ignore this email. Your password stays the same.</p>`,
  });
}

/** Welcome card sent after sign up. Returns { sent: boolean }; never needs to block the sign up. */
export async function sendWelcomeEmail({ to, username, appUrl }) {
  if (!to) return { sent: false };
  const { subject, text, html } = welcomeEmail({ username, appUrl });
  return sendMail({ to, subject, text, html });
}
