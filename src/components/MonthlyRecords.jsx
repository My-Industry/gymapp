import { useEffect, useMemo, useRef, useState } from 'react';
import { loadHistory } from '../lib/storage.js';
import HistoryTable, { inr } from './HistoryTable.jsx';

const TAG_ORDER = ['New', 'Renewed', 'Upgraded', 'Existing', 'Left'];

// One tab of the Google Sheet per month. Pick a month, or "All months" to follow a member through time.
export default function MonthlyRecords({ initialSearch = '', onUnauthorized }) {
  const [state, setState] = useState({ status: 'loading', months: [], error: '' });
  const [month, setMonth] = useState(initialSearch ? 'all' : '');
  const [query, setQuery] = useState(initialSearch);

  const unauthorized = useRef(onUnauthorized);
  unauthorized.current = onUnauthorized;

  useEffect(() => {
    let cancelled = false;
    loadHistory()
      .then(({ months }) => {
        if (!cancelled) setState({ status: 'ready', months, error: '' });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.unauthorized) { unauthorized.current?.(); return; }
        setState({ status: 'error', months: [], error: err.message });
      });
    return () => { cancelled = true; };
  }, []);

  const { months } = state;
  const selected = month || months[0]?.month || 'all'; // newest month until the user picks another
  const showAll = selected === 'all';

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const source = showAll ? months : months.filter((m) => m.month === selected);
    return source
      .flatMap((m) => m.rows.map((r) => ({ ...r, month: m.month })))
      .filter((r) =>
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        (digits.length >= 3 && r.phone.includes(digits)));
  }, [months, selected, showAll, query]);

  const summary = useMemo(() => {
    const counts = {};
    let fees = 0;
    for (const r of rows) {
      counts[r.tag] = (counts[r.tag] || 0) + 1;
      fees += r.fee;
    }
    return { counts, fees };
  }, [rows]);

  if (state.status === 'loading') return <p className="muted">Loading monthly records…</p>;
  if (state.status === 'error') {
    return <div className="alert error">Couldn't load the monthly records. {state.error}</div>;
  }
  if (months.length === 0) {
    return (
      <section className="card empty">
        <h2>No monthly records yet</h2>
        <p>This month's record is created automatically the first time the app is opened. Try reloading the page.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="list-head">
        <h2>Monthly records</h2>
        <div className="history-filters">
          <select value={selected} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
            {months.map((m) => <option key={m.month} value={m.month}>{m.month}</option>)}
            <option value="all">All months</option>
          </select>
          <input
            className="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, phone or ID"
          />
        </div>
      </div>

      <div className="summary">
        <div className="stat"><b>{rows.length}</b> record{rows.length === 1 ? '' : 's'}</div>
        {TAG_ORDER.filter((t) => summary.counts[t]).map((t) => (
          <div key={t} className={`stat tag-${t.toLowerCase()}`}><b>{summary.counts[t]}</b> {t}</div>
        ))}
        <div className="stat"><b>{inr.format(summary.fees)}</b> fees collected</div>
      </div>

      <HistoryTable rows={rows} showMonth={showAll} />
    </section>
  );
}
