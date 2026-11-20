import { useEffect, useState } from 'react';
import MemberForm from './components/MemberForm.jsx';
import MemberList from './components/MemberList.jsx';
import BulkImport from './components/BulkImport.jsx';
import Settings from './components/Settings.jsx';
import BackupChip from './components/BackupChip.jsx';
import useBackup from './lib/useBackup.js';
import { loadMembers, saveMembers } from './lib/storage.js';

const TABS = [
  { key: 'members', label: 'Members' },
  { key: 'add', label: 'Add member' },
  { key: 'import', label: 'Import from Excel' },
];
const SETTINGS_TAB = { key: 'settings', label: 'Settings' };

export default function GymApp({ user, role, onLogout }) {
  const [members, setMembers] = useState(loadMembers);
  const [tab, setTab] = useState('members');
  const [saveFailed, setSaveFailed] = useState(false);
  const backup = useBackup(members);
  const isAdmin = role === 'admin';
  const tabs = isAdmin ? [...TABS, SETTINGS_TAB] : TABS;

  useEffect(() => {
    setSaveFailed(!saveMembers(members));
  }, [members]);

  const addMember = (member) => setMembers((prev) => [...prev, member]);
  const addMany = (list) => setMembers((prev) => [...prev, ...list]);
  const removeMember = (id) => setMembers((prev) => prev.filter((m) => m.id !== id));

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>🏋️</span>
          <div>
            <h1>Gym Manager</h1>
            <p>{members.length} member{members.length === 1 ? '' : 's'}</p>
          </div>
        </div>
        <nav className="tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? 'tab active' : 'tab'}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="userbox">
          <BackupChip backup={backup} />
          <span className="muted">Signed in as <b>{user}</b>{isAdmin ? ' (admin)' : ''}</span>
          <button className="secondary small" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      {saveFailed && (
        <div className="alert error">Couldn't save to this browser's storage. Changes may be lost on refresh.</div>
      )}

      <main>
        {tab === 'members' && (
          <MemberList members={members} onDelete={removeMember} onAddClick={() => setTab('add')} />
        )}
        {tab === 'add' && <MemberForm members={members} onAdd={addMember} />}
        {tab === 'import' && <BulkImport members={members} onImport={addMany} onDone={() => setTab('members')} />}
        {tab === 'settings' && isAdmin && <Settings backup={backup} memberCount={members.length} />}
      </main>
    </div>
  );
}
