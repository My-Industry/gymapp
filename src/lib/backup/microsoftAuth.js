// Microsoft sign-in in the browser (MSAL.js). MSAL keeps the session and
// renews tokens quietly, so Microsoft rarely needs a reconnect.
import { BackupError } from './errors.js';

export const MICROSOFT_SCOPES = ['Files.ReadWrite', 'User.Read'];

let appPromise;
let appClientId;

async function getApp(clientId) {
  if (!appPromise || appClientId !== clientId) {
    appClientId = clientId;
    appPromise = (async () => {
      const { PublicClientApplication } = await import('@azure/msal-browser');
      const app = new PublicClientApplication({
        auth: {
          clientId,
          authority: 'https://login.microsoftonline.com/common', // work, school and personal accounts
          redirectUri: window.location.origin,
        },
        cache: { cacheLocation: 'localStorage' },
      });
      await app.initialize();
      return app;
    })();
    appPromise.catch(() => { appPromise = undefined; });
  }
  return appPromise;
}

/** Load MSAL ahead of time so the sign-in popup opens right after a click. */
export const preloadMicrosoft = (clientId) => getApp(clientId).catch(() => {});

function wrap(err) {
  const code = err?.errorCode || '';
  if (code === 'user_cancelled') return new BackupError('failed', 'Sign-in was cancelled.');
  if (code === 'popup_window_error' || code === 'empty_window_error') {
    return new BackupError('failed', 'The sign-in popup was blocked. Allow popups for this site and try again.');
  }
  return new BackupError('failed', err?.message || 'Microsoft sign-in failed.');
}

/** Opens the Microsoft sign-in popup (call from a button click). */
export async function signInMicrosoft(clientId) {
  const app = await getApp(clientId);
  try {
    const result = await app.loginPopup({ scopes: MICROSOFT_SCOPES, prompt: 'select_account' });
    app.setActiveAccount(result.account);
    return { token: result.accessToken, account: result.account.username };
  } catch (err) {
    throw wrap(err);
  }
}

/** A valid access token; quiet when possible. With interactive=true it may show a popup. */
export async function getMicrosoftToken(clientId, { interactive = false } = {}) {
  const app = await getApp(clientId);
  const account = app.getActiveAccount() || app.getAllAccounts()[0];
  if (!account) throw new BackupError('reconnect', 'Microsoft sign-in is needed. Please reconnect.');
  try {
    return (await app.acquireTokenSilent({ scopes: MICROSOFT_SCOPES, account })).accessToken;
  } catch (err) {
    if (!interactive) throw new BackupError('reconnect', 'Microsoft sign-in is needed. Please reconnect.');
    try {
      return (await app.acquireTokenPopup({ scopes: MICROSOFT_SCOPES, account })).accessToken;
    } catch (err2) {
      throw wrap(err2);
    }
  }
}

export async function signOutMicrosoft(clientId) {
  try {
    const app = await getApp(clientId);
    const account = app.getActiveAccount() || app.getAllAccounts()[0];
    // Clears this app's cached tokens without signing the person out of Microsoft.
    if (account) await app.clearCache({ account });
  } catch { /* best effort */ }
}
