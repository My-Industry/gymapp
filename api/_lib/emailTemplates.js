// HTML + plain-text bodies for the emails the app sends. Files/folders starting with "_" inside /api
// are NOT exposed as endpoints. Email clients ignore most CSS, so this is table-based with inline styles.

export const APP_NAME = 'Gym Application';
export const COMPANY = 'My Industry';

const ACCENT = '#e8542c';
const ACCENT_DARK = '#c9431f';
const INK = '#1c1f24';
const MUTED = '#6b7280';
const PAGE_BG = '#f5f6f8';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Only http(s) links go into an email button. */
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');

const FEATURES = [
  ['Members &amp; monthly records', 'Keep every member, their plan and monthly payments in one place.'],
  ['Attendance', 'Mark who came in today and see attendance at a glance.'],
  ['Campaigns', 'Reach your members with offers and reminders.'],
  ['Your data, your Google Sheet', 'Connect your own sheet from Profile and your records stay with you.'],
];

/** Shared card: header band, white body, footer. `body` is trusted, already-escaped HTML. */
function shell({ preheader, body }) {
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(APP_NAME)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE_BG}" style="background:${PAGE_BG};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
      <tr><td bgcolor="${ACCENT}" style="background:${ACCENT};padding:28px 32px;font-family:${FONT};">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="44" height="44" align="center" valign="middle" bgcolor="#ffffff" style="width:44px;height:44px;background:#ffffff;border-radius:10px;font-family:${FONT};font-size:22px;font-weight:800;color:${ACCENT};line-height:44px;">G</td>
          <td style="padding-left:14px;font-family:${FONT};">
            <div style="font-size:20px;font-weight:700;color:#ffffff;line-height:1.2;">${escapeHtml(APP_NAME)}</div>
            <div style="font-size:12px;color:#ffe4dc;letter-spacing:.4px;margin-top:2px;">Powered by ${escapeHtml(COMPANY)}</div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:36px 32px 12px;font-family:${FONT};color:${INK};font-size:15px;line-height:1.6;">
        ${body}
      </td></tr>
      <tr><td style="padding:0 32px;"><div style="border-top:1px solid #eceef1;height:1px;line-height:1px;font-size:1px;">&nbsp;</div></td></tr>
      <tr><td align="center" style="padding:22px 32px 30px;font-family:${FONT};font-size:12px;line-height:1.7;color:${MUTED};">
        <div style="font-weight:600;color:${INK};">${escapeHtml(APP_NAME)}</div>
        <div>Powered by ${escapeHtml(COMPANY)}</div>
        <div style="margin-top:6px;">&copy; ${year} ${escapeHtml(COMPANY)}. All rights reserved.</div>
      </td></tr>
    </table>
    <div style="max-width:600px;font-family:${FONT};font-size:11px;line-height:1.6;color:#9ca3af;padding:14px 12px 0;">
      You received this email because an account was created on ${escapeHtml(APP_NAME)} with this address.
    </div>
  </td></tr>
</table>
</body>
</html>`;
}

/** Welcome email sent right after sign up. */
export function welcomeEmail({ username, appUrl }) {
  const name = escapeHtml(username);
  const url = safeUrl(appUrl);

  const features = FEATURES.map(([title, text]) => `
        <tr>
          <td width="28" valign="top" style="padding:10px 0;"><div style="width:22px;height:22px;border-radius:11px;background:#fdece6;color:${ACCENT};text-align:center;font-size:13px;font-weight:700;line-height:22px;">&#10003;</div></td>
          <td valign="top" style="padding:10px 0 10px 8px;font-family:${FONT};">
            <div style="font-size:14px;font-weight:600;color:${INK};">${title}</div>
            <div style="font-size:13px;color:${MUTED};">${text}</div>
          </td>
        </tr>`).join('');

  const button = url ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 8px;"><tr>
          <td bgcolor="${ACCENT}" style="background:${ACCENT};border-radius:8px;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;border-bottom:2px solid ${ACCENT_DARK};">Open ${escapeHtml(APP_NAME)}</a></td>
        </tr></table>` : '';

  const body = `
        <h1 style="margin:0 0 6px;font-size:24px;line-height:1.3;color:${INK};">Welcome, ${name}!</h1>
        <p style="margin:0 0 18px;color:${MUTED};">Your account is ready.</p>
        <p style="margin:0 0 20px;">Thanks for joining <strong>${escapeHtml(APP_NAME)}</strong>. It's a simple way to run your gym: members, attendance and monthly records, all in one place.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafafa;border:1px solid #eceef1;border-radius:10px;"><tr><td style="padding:10px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${features}
          </table>
        </td></tr></table>
        ${button}
        <p style="margin:18px 0 24px;font-size:13px;color:${MUTED};">Your username is <strong style="color:${INK};">${name}</strong>. If you ever forget your password, use <em>Forgot password?</em> on the sign-in page.</p>`;

  const year = new Date().getFullYear();
  const text = [
    `Welcome, ${username}!`,
    '',
    `Thanks for joining ${APP_NAME}. Your account is ready.`,
    '',
    ...FEATURES.map(([t, d]) => `- ${t.replace(/&amp;/g, '&')}: ${d}`),
    '',
    url ? `Open the app: ${url}` : '',
    `Your username is ${username}. If you forget your password, use "Forgot password?" on the sign-in page.`,
    '',
    `${APP_NAME} - Powered by ${COMPANY}`,
    `(c) ${year} ${COMPANY}. All rights reserved.`,
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');

  return {
    subject: `Welcome to ${APP_NAME}`,
    text,
    html: shell({ preheader: `Your ${APP_NAME} account is ready.`, body }),
  };
}
