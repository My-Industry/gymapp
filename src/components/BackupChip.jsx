import { formatBackupTime } from './Settings.jsx';

// Small status indicator in the top bar. Shows nothing until a backup is connected.
export default function BackupChip({ backup }) {
  const { status, settings, error, backupNow } = backup;
  if (status === 'off') return null;

  if (status === 'reconnect') {
    return (
      <button className="chip bad" onClick={() => backupNow({ interactive: true })} title={error}>
        ☁ Reconnect backup
      </button>
    );
  }
  if (status === 'error') {
    return (
      <button className="chip bad" onClick={() => backupNow({ interactive: true })} title={error}>
        ⚠ Backup failed · Retry
      </button>
    );
  }
  if (status === 'syncing') return <span className="chip">☁ Backing up…</span>;
  return (
    <span className="chip good" title="Backed up to Google Sheets or OneDrive">
      ☁ Backed up {settings.lastBackupAt ? formatBackupTime(settings.lastBackupAt) : ''}
    </span>
  );
}
