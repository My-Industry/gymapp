// Google sign-in in the browser (Google Identity Services, "token" flow).
// The access token lasts about an hour. It is kept in sessionStorage so a
// page refresh doesn't force a new sign-in, and is gone when the tab closes.
import { BackupError } from './errors.js';

// Lets the app read and write spreadsheets (needed to open a sheet you pick).
export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

const TOKEN_KEY = 'gym-manager.google-token';
let gisPromise;

function loadGIS() {
  gisPromise ??= new Promise((resolve, reject) => {
    if (globalThis.google?.accounts?.oauth2) return resolve(globalThis.google);
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve(globalThis.google);
    script.onerror = () => {
      gisPromise = undefined;
      reject(new BackupError('failed', "Couldn't load Google sign-in. Check your internet connection."));
    };
    document.head.appendChild(script);
  });
  return gisPromise;
}

/** Load Google's script ahead of time so the sign-in popup opens right after a click. */
export const preloadGoogle = () => loadGIS().catch(() => {});

export function getStoredGoogleToken(now = Date.now()) {
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY));
    return t && t.expiresAt - 60_000 > now ? t.token : null;
  } catch {
    return null;
  }
}

export function clearStoredGoogleToken() {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

function storeToken(token, expiresInSeconds) {
  try {
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiresAt: Date.now() + expiresInSeconds * 1000 }));
  } catch { /* ignore */ }
}

function requestToken(gis, clientId, prompt) {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new BackupError('reconnect', 'Google sign-in is needed. Please reconnect.'));
    const timer = prompt === 'none' ? setTimeout(fail, 15_000) : null;
    const client = gis.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPE,
      callback: (resp) => {
        clearTimeout(timer);
        if (resp.error || !resp.access_token) return fail();
        storeToken(resp.access_token, Number(resp.expires_in) || 3600);
        resolve(resp.access_token);
      },
      error_callback: () => { clearTimeout(timer); fail(); },
    });
    client.requestAccessToken({ prompt });
  });
}

/**
 * Returns a valid access token. With interactive=true (call it from a button
 * click) it may open Google's sign-in popup; otherwise it only tries a silent
 * refresh and throws a 'reconnect' error if that isn't possible.
 */
export async function getGoogleToken(clientId, { interactive = false } = {}) {
  const stored = getStoredGoogleToken();
  if (stored) return stored;
  const gis = await loadGIS();
  return requestToken(gis, clientId, interactive ? '' : 'none');
}

export async function revokeGoogle() {
  const token = getStoredGoogleToken();
  clearStoredGoogleToken();
  if (!token) return;
  try { (await loadGIS()).accounts.oauth2.revoke(token, () => {}); } catch { /* best effort */ }
}
