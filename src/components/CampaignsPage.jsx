import {
  CAMPAIGNS_INTRO, HOW_IT_WORKS, HARD_75, IDEAS, BENEFITS,
} from '../lib/campaigns.js';

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

// Campaigns (challenges like 75 Hard) for gym owners. A read-only preview: nothing can be created yet.
export default function CampaignsPage() {
  return (
    <div className="campaigns">
      <section className="card">
        <div className="card-title">
          <h2>{CAMPAIGNS_INTRO.title}</h2>
          <span className="soon-badge">{CAMPAIGNS_INTRO.badge}</span>
        </div>
        <p className="campaign-lead">{CAMPAIGNS_INTRO.lead}</p>
        <p className="muted small-text">{CAMPAIGNS_INTRO.note}</p>
      </section>

      <section className="card">
        <h2>How it will work</h2>
        <MiniCards items={HOW_IT_WORKS} />
      </section>

      <section className="card">
        <div className="card-title">
          <h2>{HARD_75.title}</h2>
          <span className="soon-badge">{CAMPAIGNS_INTRO.badge}</span>
        </div>
        <p className="campaign-lead">{HARD_75.summary}</p>
        <MiniCards items={HARD_75.tasks} />
      </section>

      <section className="card">
        <h2>More campaign ideas</h2>
        <MiniCards items={IDEAS} />
      </section>

      <section className="card">
        <h2>Why run a campaign</h2>
        <MiniCards items={BENEFITS} />
      </section>
    </div>
  );
}
