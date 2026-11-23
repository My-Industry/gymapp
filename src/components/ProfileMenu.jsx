import { useEffect, useRef, useState } from 'react';
import { VERSION } from '../lib/version.js';
import UserIcon from './UserIcon.jsx';

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

// Desktop: the person icon in the top bar opens a small card with who is signed in,
// links to Settings and About us, the app version (opens the release notes) and Sign out.
export default function ProfileMenu({ user, isAdmin, active, onSettings, onAbout, onShowVersion, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on an outside click or Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const role = isAdmin ? 'Admin' : 'Staff';
  const pick = (fn) => () => { setOpen(false); fn(); };

  return (
    <div className="profile-menu-wrap" ref={ref}>
      <button
        className={active || open ? 'user-icon active' : 'user-icon'}
        title={`${user} (${role})`}
        aria-label={`Account menu for ${user}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <UserIcon />
      </button>

      {open && (
        <div className="profile-menu" role="menu">
          <div className="profile-menu-head">
            <span className="profile-avatar"><UserIcon size={30} /></span>
            <div className="profile-menu-who">
              <b>{user}</b>
              <span className="role-badge">{role}</span>
            </div>
          </div>

          <button className="profile-menu-item" role="menuitem" onClick={pick(onSettings)}>
            <GearIcon /> Settings
          </button>
          <button className="profile-menu-item" role="menuitem" onClick={pick(onAbout)}>
            <InfoIcon /> About us
          </button>

          <div className="profile-menu-foot">
            <button className="link version-btn" onClick={pick(onShowVersion)} title="See release notes">
              v{VERSION}
            </button>
            <button className="secondary small" onClick={pick(onLogout)}>Sign out</button>
          </div>
        </div>
      )}
    </div>
  );
}
