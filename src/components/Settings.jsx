import { useState } from 'react';
import GoogleConnect from './GoogleConnect.jsx';

const PROVIDER_NAMES = { google: 'Google Sheets', microsoft: 'OneDrive (Excel)' };

export function formatBackupTime(iso) {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (isNaN(d)) return 'never';
  const today = new Date().toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return today ? time : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}

function ProfileCard({ user, isAdmin }) {
  return (
    <div className="card narrow">
      <h2>Profile</h2>
      <dl className="facts">
        <dt>Username</dt><dd>{user}</dd>
        <dt>Role</dt><dd>{isAdmin ? 'Admin' : 'Staff'}</dd>
      </dl>
    </div>
  );
}

// The Profile page. Everyone sees their account; admins also manage the Google Sheet here.
export default function Settings({ user, isAdmin, backup, memberCount, connectOpen = false, onConnectionChange, onUnauthorized, onHelp }) {
  const { settings, status, error: backupError } = backup;
  const [busy, setBusy] = useState(null); // 'backup' | null

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

  /* ------------------------------------------------------------ staff */
  if (!isAdmin) {
    return (
      <div className="settings">
        <ProfileCard user={user} isAdmin={false} />
        <div className="card narrow">
          <p className="muted small-text">Only an admin can connect a Google Sheet or change these settings.</p>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------ connected */
  if (settings.provider) {
    const link = settings.provider === 'google' ? settings.google.url : settings.microsoft.webUrl;
    const place = settings.provider === 'google'
      ? settings.google.title
      : `OneDrive › ${settings.microsoft.path}${settings.microsoft.account ? ` (${settings.microsoft.account})` : ''}`;
    return (
      <div className="settings">
      <ProfileCard user={user} isAdmin />
      <div className="card narrow">
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
      </div>
    );
  }

  /* ---------------------------------------------------------- not connected */
  return (
    <div className="settings">
      <ProfileCard user={user} isAdmin />
      <div className="card narrow">
        <h2>Google Sheets</h2>
        <p className="muted small-text">
          Connect your Google Sheet to store your members, monthly records and history there. You need a Google
          service account (a robot user) and a sheet shared with it. See <b>Storing members in Google Sheets</b> in the README.
        </p>
      </div>

      <GoogleConnect startOpen={connectOpen} onChange={onConnectionChange} onUnauthorized={onUnauthorized} onHelp={onHelp} />

      <div className="card narrow coming-soon" aria-disabled="true">
        <div className="card-title">
          <h2>OneDrive (Excel)</h2>
          <span className="soon-badge">Coming soon</span>
        </div>
        <p className="muted small-text">Back up your members to an Excel file in OneDrive. This isn't available yet.</p>
        <button className="primary" type="button" disabled>Coming soon</button>
      </div>
    </div>
  );
}
