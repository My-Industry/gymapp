import { useEffect, useRef } from 'react';
import { RELEASES, VERSION } from '../lib/version.js';
import { formatDate } from '../lib/members.js';

// "What's new": the release notes kept in src/lib/version.js.
export default function ReleaseNotes({ onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="release-title">
        <div className="modal-head">
          <h2 id="release-title">Release notes</h2>
          <button ref={closeRef} className="secondary small" onClick={onClose}>Close</button>
        </div>
        <p className="muted small-text">You're using version <b>{VERSION}</b>.</p>
        <div className="modal-body">
          {RELEASES.map((r) => (
            <section key={r.version} className="release">
              <h3>
                v{r.version}
                {r.version === VERSION && <span className="chip good">Current</span>}
              </h3>
              <p className="muted small-text">{formatDate(r.date)}{r.title ? ` · ${r.title}` : ''}</p>
              <ul>{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
