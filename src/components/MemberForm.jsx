import { useMemo, useState } from 'react';
import BodyStatsFields from './BodyStatsFields.jsx';
import {
  PLAN_NAMES, PACKAGES, PACKAGE_NAMES, DEFAULT_PACKAGE, suggestedFee, planFromFee, createMember, normalizePhone,
  formatPhone, findByPhone, calculateExpiry, formatDate, isValidISODate, todayISO,
} from '../lib/members.js';

const emptyForm = () => ({
  name: '',
  phone: '',
  gymPackage: DEFAULT_PACKAGE,
  plan: 'Monthly',
  fee: String(suggestedFee(DEFAULT_PACKAGE, 'Monthly')),
  startDate: todayISO(),
  dateOfBirth: '',
  weightKg: '',
  heightCm: '',
  whatsappConsent: false,
});

const inr = new Intl.NumberFormat('en-IN');

export default function MemberForm({ members, onAdd }) {
  const [form, setForm] = useState(emptyForm);
  const [feeEdited, setFeeEdited] = useState(false); // once typed by hand, stop auto-filling
  const [errors, setErrors] = useState([]);
  const [saved, setSaved] = useState(null);

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (field === 'fee') setFeeEdited(true);
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (field === 'fee') {
        // The amount decides the duration: ₹1,000 on a ₹500/month package = 2 months.
        next.plan = planFromFee(next.gymPackage, value, f.plan);
      } else if (field === 'gymPackage' || field === 'plan') {
        if (!feeEdited) next.fee = String(suggestedFee(next.gymPackage, next.plan) ?? '');
        else if (field === 'gymPackage') next.plan = planFromFee(next.gymPackage, next.fee, next.plan);
      }
      return next;
    });
    setErrors([]);
    setSaved(null);
  };

  const standardFee = suggestedFee(form.gymPackage, form.plan);

  const cleanPhone = normalizePhone(form.phone);
  const duplicate = cleanPhone ? findByPhone(members, cleanPhone) : null;
  const expiry = useMemo(
    () => (isValidISODate(form.startDate) ? calculateExpiry(form.startDate, form.plan) : null),
    [form.startDate, form.plan],
  );

  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const result = createMember(form, members);
    if (result.errors.length) {
      setErrors(result.errors);
      return;
    }
    setBusy(true);
    try {
      // onAdd saves to the Google Sheet and returns the member as stored there.
      const stored = await onAdd(result.member);
      setSaved(stored || result.member);
      setForm(emptyForm());
      setFeeEdited(false);
    } catch (err) {
      setErrors([err.message || "Couldn't save the member. Please try again."]);
    } finally {
      setBusy(false);
    }
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
            Package
            <select value={form.gymPackage} onChange={set('gymPackage')}>
              {PACKAGE_NAMES.map((p) => (
                <option key={p} value={p}>{p} — ₹{inr.format(PACKAGES[p])}/month</option>
              ))}
            </select>
          </label>
          <label>
            Duration
            <select value={form.plan} onChange={set('plan')}>
              {(PLAN_NAMES.includes(form.plan) ? PLAN_NAMES : [...PLAN_NAMES, form.plan])
                .map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
        </div>

        <label>
          Fee (₹)
          <input value={form.fee} onChange={set('fee')} placeholder="500" inputMode="decimal" />
          {standardFee && (
            <small className="hint muted">
              {feeEdited && Number(form.fee) !== standardFee
                ? `Standard fee is ₹${inr.format(standardFee)}; you changed it.`
                : `₹${inr.format(PACKAGES[form.gymPackage])} × ${standardFee / PACKAGES[form.gymPackage]} month${standardFee / PACKAGES[form.gymPackage] === 1 ? '' : 's'} (you can edit it)`}
            </small>
          )}
        </label>

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

        <BodyStatsFields form={form} set={set} />

        <label className="check">
          <input type="checkbox" checked={form.whatsappConsent} onChange={set('whatsappConsent')} />
          Member agrees to receive WhatsApp messages (renewal reminders, updates)
        </label>

        <button type="submit" className="primary" disabled={Boolean(duplicate) || busy}>
          {busy ? 'Saving…' : 'Register member'}
        </button>
      </form>
    </section>
  );
}
