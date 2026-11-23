// Sends the password-reset email. Email sending isn't set up yet: this is the one place
// to add it later, e.g. with nodemailer:
//
//   import nodemailer from 'nodemailer';
//   const transport = nodemailer.createTransport({ host, port, auth: { user, pass } });
//   await transport.sendMail({ from, to, subject: 'Reset your password', text: `Open ${link}` });
//   return { sent: true };
//
// Nothing else needs to change: /api/forgot-password already creates the one-time link
// and calls this. Files/folders starting with "_" inside /api are NOT exposed as endpoints.

/** Returns { sent: boolean }. */
export async function sendPasswordResetEmail({ to, username, link }) {
  // While there is no mailer, show the link in the server console - on your own machine only.
  // On a deployed site it is never logged, because anyone who can read the logs could take over the account.
  if (process.env.AUTH_ENV_FILE && link) {
    console.log(`[dev] Password reset link for ${username} <${to}>: ${link}`);
  }
  return { sent: false };
}
