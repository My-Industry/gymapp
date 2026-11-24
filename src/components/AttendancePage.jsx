import {
  ATTENDANCE_INTRO, HOW_IT_WORKS, MACHINES, TIPS,
} from '../lib/attendance.js';

function MiniCards({ items }) {
  return (
    <div className="mini-grid">
      {items.map((c) => (
        <div className="mini-card" key={c.title}>
          <span className="mini-icon" aria-hidden>{c.icon}</span>
          <b>{c.title}</b>
          <p>{c.text}</p>
        </div>
      ))}
    </div>
  );
}

// Attendance (beta). Read-only: lists the fingerprint machines gyms use. Nothing connects yet.
export default function AttendancePage() {
  return (
    <div className="campaigns">
      <section className="card">
        <div className="card-title">
          <h2>{ATTENDANCE_INTRO.title}</h2>
          <span className="soon-badge beta-badge">{ATTENDANCE_INTRO.badge}</span>
        </div>
        <p className="campaign-lead">{ATTENDANCE_INTRO.lead}</p>
        <p className="muted small-text">{ATTENDANCE_INTRO.note}</p>
      </section>

      <section className="card">
        <h2>How it will work</h2>
        <MiniCards items={HOW_IT_WORKS} />
      </section>

      <section className="card">
        <h2>Fingerprint machines used in gyms</h2>
        <p className="muted small-text machine-note">
          These are the machines we plan to connect. The models are examples of each brand’s range, and none is connected yet.
        </p>
        <div className="mini-grid">
          {MACHINES.map((m) => (
            <div className="mini-card" key={m.brand}>
              <div className="machine-head">
                <b>{m.brand}</b>
                <span className="chip">{m.status}</span>
              </div>
              <span className="mono machine-models">{m.models}</span>
              <p>{m.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Before you buy a machine</h2>
        <MiniCards items={TIPS} />
      </section>
    </div>
  );
}
