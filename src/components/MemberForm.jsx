import { useMemo, useState } from 'react';
import {
  PLAN_NAMES, createMember, normalizePhone, formatPhone, findByPhone,
  calculateExpiry, formatDate, isValidISODate, todayISO,
} from '../lib/members.js';

const emptyForm = () => ({
  name: '',
  phone: '',
  plan: 'Monthly',
  fee: '',
  startDate: todayISO(),
  whatsappConsent: false,
});

export default function MemberForm({ members, onAdd }) {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState([]);
  const [saved, setSaved] = useState(null);

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: value }));
    setErrors([]);
    setSaved(null);
  };

  const cleanPhone = normalizePhone(form.phone);
  const duplicate = cleanPhone ? findByPhone(members, cleanPhone) : null;
  const expiry = useMemo(
    () => (isValidISODate(form.startDate) ? calculateExpiry(form.startDate, form.plan) : null),
    [form.startDate, form.plan],
  );

  const submit = (e) => {
    e.preventDefault();
    const result = createMember(form, members);
    if (result.errors.length) {
      setErrors(result.errors);
      return;
    }
    onAdd(result.member);
    setSaved(result.member);
    setForm(emptyForm());
  };

  return (
    <section className="card narrow">
      <h2>Register a member</h2>

      {saved && (
        <div className="alert success">
          <strong>{saved.name}</strong> registered as <strong>{saved.id}</strong>. Membership runs until{' '}
          {formatDate(saved.expiryDate)}.
        </div>
      )}
      {errors.length > 0 && (
        <div className="alert error">
          <ul>{errors.map((err) => <li key={err}>{err}</li>)}</ul>
        </div>
      )}

      <form onSubmit={submit} className="form" noValidate>
        <label>
          Name
          <input value={form.name} onChange={set('name')} placeholder="Full name" autoFocus />
        </label>

        <label>
          Phone
          <input value={form.phone} onChange={set('phone')} placeholder="98765 43210" inputMode="tel" />
          {form.phone && (
            <small className={duplicate ? 'hint bad' : cleanPhone ? 'hint good' : 'hint bad'}>
              {duplicate
                ? `Already registered to ${duplicate.name} (${duplicate.id})`
                : cleanPhone
                  ? `Will be saved as ${formatPhone(cleanPhone)}`
                  : 'Enter a 10-digit mobile number'}
            </small>
          )}
        </label>

        <div className="row">
          <label>
            Plan
            <select value={form.plan} onChange={set('plan')}>
              {PLAN_NAMES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label>
            Fee (₹)
            <input value={form.fee} onChange={set('fee')} placeholder="1500" inputMode="decimal" />
          </label>
        </div>

        <div className="row">
          <label>
            Start date
            <input type="date" value={form.startDate} onChange={set('startDate')} />
          </label>
          <label>
            Expiry date
            <input value={expiry ? formatDate(expiry) : '—'} readOnly className="readonly" tabIndex={-1} />
          </label>
        </div>

        <label className="check">
          <input type="checkbox" checked={form.whatsappConsent} onChange={set('whatsappConsent')} />
          Member agrees to receive WhatsApp messages (renewal reminders, updates)
        </label>

        <button type="submit" className="primary" disabled={Boolean(duplicate)}>Register member</button>
      </form>
    </section>
  );
}
