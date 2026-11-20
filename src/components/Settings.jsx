import { useEffect, useState } from 'react';
import { DEFAULT_PATH } from '../lib/backup/microsoftApi.js';
import { preloadGoogle } from '../lib/backup/googleAuth.js';
import { preloadMicrosoft } from '../lib/backup/microsoftAuth.js';

const PROVIDER_NAMES = { google: 'Google Sheets', microsoft: 'OneDrive (Excel)' };

export function formatBackupTime(iso) {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (isNaN(d)) return 'never';
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return today ? time : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}

export default function Settings({ backup, memberCount }) {
  const { settings, status, error: backupError, clientIds } = backup;
  const [googleInput, setGoogleInput] = useState('');
  const [msPath, setMsPath] = useState(DEFAULT_PATH);
  const [busy, setBusy] = useState(null); // 'google' | 'microsoft' | 'backup' | null
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null); // { provider, message } waiting for "replace it" confirmation

  // Load the sign-in scripts early so the popup opens right after the click.
  useEffect(() => {
    if (!settings.provider && clientIds.google) preloadGoogle();
    if (!settings.provider && clientIds.microsoft) preloadMicrosoft(clientIds.microsoft);
  }, [settings.provider, clientIds.google, clientIds.microsoft]);

  async function connect(provider, confirmed = false) {
    setBusy(provider);
    setError('');
    const result = await backup.connect(provider, {
      input: provider === 'google' ? googleInput : msPath,
      confirmed,
    });
    setBusy(null);
    if (result.needsConfirm) setPending({ provider, message: result.message });
    else if (result.error) { setError(result.error); setPending(null); }
    else setPending(null);
  }

  async function backupNow() {
    setBusy('backup');
    await backup.backupNow({ interactive: true });
    setBusy(null);
  }

  async function disconnect() {
    setBusy('backup');
    await backup.disconnect();
    setBusy(null);
  }

  /* ------------------------------------------------------------ connected */
  if (settings.provider) {
    const link = settings.provider === 'google' ? settings.google.url : settings.microsoft.webUrl;
    const place = settings.provider === 'google'
      ? settings.google.title
      : `OneDrive › ${settings.microsoft.path}${settings.microsoft.account ? ` (${settings.microsoft.account})` : ''}`;
    return (
      <div className="card narrow settings">
        <h2>Backup</h2>
        <div className="alert success">
          Connected to <b>{PROVIDER_NAMES[settings.provider]}</b>: {place}
        </div>

        {status === 'reconnect' && (
          <div className="alert error" role="alert">
            {backupError} <button className="link danger" onClick={backupNow}>Reconnect now</button>
          </div>
        )}
        {status === 'error' && <div className="alert error" role="alert">{backupError}</div>}

        <dl className="facts">
          <dt>Last backup</dt>
          <dd>{status === 'syncing' ? 'Backing up…' : formatBackupTime(settings.lastBackupAt)}</dd>
          <dt>Members</dt>
          <dd>{memberCount}</dd>
          {link && (<><dt>Open</dt><dd><a href={link} target="_blank" rel="noreferrer">View the backup ↗</a></dd></>)}
        </dl>

        <p className="muted small-text">
          Every time you add, import or delete members, a fresh copy replaces the {settings.provider === 'google' ? '“Members” tab' : 'file'}.
          Changes made inside the {settings.provider === 'google' ? 'sheet' : 'file'} are not read back into the app.
          This connection is saved in this browser only.
        </p>

        <div className="import-actions">
          <button className="primary" onClick={backupNow} disabled={busy === 'backup' || status === 'syncing'}>
            {status === 'syncing' ? 'Backing up…' : 'Back up now'}
          </button>
          <button className="secondary" onClick={disconnect} disabled={busy === 'backup'}>Disconnect</button>
        </div>
        <p className="muted small-text">
          Disconnecting stops backups and signs this app out of {PROVIDER_NAMES[settings.provider]}. Your backup is not deleted.
        </p>
      </div>
    );
  }

  /* ---------------------------------------------------------- not connected */
  return (
    <div className="settings">
      <div className="card narrow">
        <h2>Backup</h2>
        <p className="muted small-text">
          Connect Google Sheets or OneDrive and the app will keep a copy of your members there, updated
          automatically after every change. It's a one-way backup: the app writes to the sheet, and edits made in the
          sheet are not read back. Connect one service at a time.
        </p>
        {error && <div className="alert error" role="alert">{error}</div>}
      </div>

      <div className="card narrow">
        <h2>Google Sheets</h2>
        {!clientIds.google ? (
          <div className="alert error">
            Google isn't set up yet. Add <code>VITE_GOOGLE_CLIENT_ID</code> to <code>.env.local</code> (and to Vercel),
            then restart. See <b>Backup setup</b> in the README.
          </div>
        ) : (
          <form className="form" onSubmit={(e) => { e.preventDefault(); connect('google'); }}>
            <label>
              Sheet link <span className="hint muted">(optional)</span>
              <input
                type="text"
                value={googleInput}
                onChange={(e) => { setGoogleInput(e.target.value); setPending(null); }}
                placeholder="Leave empty to create a new sheet for me"
                autoComplete="off"
              />
              <span className="hint muted">Or paste the link of a Google Sheet you own.</span>
            </label>
            {pending?.provider === 'google' && (
              <div className="alert error" role="alert">
                {pending.message}{' '}
                <button type="button" className="link danger" onClick={() => connect('google', true)}>Replace it and connect</button>
              </div>
            )}
            <button className="primary" type="submit" disabled={busy !== null}>
              {busy === 'google' ? 'Connecting…' : 'Connect Google'}
            </button>
          </form>
        )}
      </div>

      <div className="card narrow">
        <h2>OneDrive (Excel)</h2>
        {!clientIds.microsoft ? (
          <div className="alert error">
            Microsoft isn't set up yet. Add <code>VITE_MICROSOFT_CLIENT_ID</code> to <code>.env.local</code> (and to Vercel),
            then restart. See <b>Backup setup</b> in the README.
          </div>
        ) : (
          <form className="form" onSubmit={(e) => { e.preventDefault(); connect('microsoft'); }}>
            <label>
              File location in your OneDrive
              <input
                type="text"
                value={msPath}
                onChange={(e) => { setMsPath(e.target.value); setPending(null); }}
                autoComplete="off"
              />
              <span className="hint muted">Folders are created if they don't exist. The file is an .xlsx workbook.</span>
            </label>
            {pending?.provider === 'microsoft' && (
              <div className="alert error" role="alert">
                {pending.message}{' '}
                <button type="button" className="link danger" onClick={() => connect('microsoft', true)}>Replace it and connect</button>
              </div>
            )}
            <button className="primary" type="submit" disabled={busy !== null}>
              {busy === 'microsoft' ? 'Connecting…' : 'Connect Microsoft'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
