'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

type EntryType = 'income' | 'expense';
type EntryCategory = 'sponsor' | 'merch' | 'other';

interface BudgetEntry {
  id: string;
  entry_type: EntryType;
  category: EntryCategory;
  description: string;
  amount_cents: number;
  entry_date: string;
}

interface BudgetSummary {
  goal_cents: number;
  registration_income_cents: number;
  sponsor_income_cents: number;
  merch_income_cents: number;
  other_income_cents: number;
  total_income_cents: number;
  merch_expense_cents: number;
  other_expense_cents: number;
  total_expense_cents: number;
  net_cents: number;
  progress_percent: number;
}

const CATEGORY_LABELS: Record<EntryCategory, string> = {
  sponsor: 'Sponsor / Donation',
  merch: 'Merch',
  other: 'Other',
};

function formatMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function BudgetManager({ token }: { token: string }) {
  const [entries, setEntries] = useState<BudgetEntry[]>([]);
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const [goalInput, setGoalInput] = useState('');

  const [entryType, setEntryType] = useState<EntryType>('income');
  const [category, setCategory] = useState<EntryCategory>('sponsor');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/budget', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json() as { entries: BudgetEntry[]; summary: BudgetSummary };
        setEntries(json.entries);
        setSummary(json.summary);
        setGoalInput((json.summary.goal_cents / 100).toFixed(2));
      }
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveGoal = async (e: FormEvent) => {
    e.preventDefault();
    const dollars = parseFloat(goalInput);
    if (!Number.isFinite(dollars) || dollars < 0) {
      setStatusMsg('Enter a valid goal amount.');
      return;
    }

    setSaving('goal');
    setStatusMsg(null);
    try {
      const res = await fetch('/api/admin/budget/goal', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ goal_cents: Math.round(dollars * 100) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to update goal.');
      setStatusMsg('Fundraising goal updated.');
      await fetchData();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to update goal.');
    }
    setSaving(null);
  };

  const createEntry = async (e: FormEvent) => {
    e.preventDefault();
    const dollars = parseFloat(amount);
    if (!description.trim() || !Number.isFinite(dollars) || dollars < 0) {
      setStatusMsg('Enter a description and a valid amount.');
      return;
    }

    setSaving('create');
    setStatusMsg(null);
    try {
      const res = await fetch('/api/admin/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          entry_type: entryType,
          category,
          description: description.trim(),
          amount_cents: Math.round(dollars * 100),
          entry_date: entryDate,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to add entry.');
      setDescription('');
      setAmount('');
      setStatusMsg('Entry added.');
      await fetchData();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to add entry.');
    }
    setSaving(null);
  };

  const deleteEntry = async (id: string) => {
    if (!window.confirm('Delete this budget entry? This cannot be undone.')) return;
    setSaving(`delete:${id}`);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/admin/budget/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to delete entry.');
      setStatusMsg('Entry deleted.');
      await fetchData();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to delete entry.');
    }
    setSaving(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h2 className="font-display text-2xl text-gold font-bold m-0">Budget</h2>
        <button type="button" onClick={fetchData} className="border border-navy-border px-3 py-1.5 text-xs text-text-body hover:text-white">
          Refresh
        </button>
      </div>

      {statusMsg && <div className="mb-4 border border-navy-border bg-navy-deep p-3 text-sm text-white">{statusMsg}</div>}

      {loading || !summary ? (
        <p className="text-text-muted">Loading…</p>
      ) : (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <SummaryCard label="Registration Income" value={formatMoney(summary.registration_income_cents)} />
            <SummaryCard label="Sponsor / Donation Income" value={formatMoney(summary.sponsor_income_cents)} />
            <SummaryCard label="Merch Income" value={formatMoney(summary.merch_income_cents)} />
            <SummaryCard label="Other Income" value={formatMoney(summary.other_income_cents)} />
            <SummaryCard label="Total Income" value={formatMoney(summary.total_income_cents)} highlight />
            <SummaryCard label="Merch Expense" value={formatMoney(summary.merch_expense_cents)} />
            <SummaryCard label="Other Expense" value={formatMoney(summary.other_expense_cents)} />
            <SummaryCard label="Total Expense" value={formatMoney(summary.total_expense_cents)} highlight />
            <SummaryCard
              label="Net"
              value={formatMoney(summary.net_cents)}
              highlight
              tone={summary.net_cents >= 0 ? 'good' : 'bad'}
            />
          </section>

          <section className="border border-navy-border bg-navy-deep p-4 mb-8">
            <div className="text-xs text-gold font-black tracking-caps mb-3">Fundraising Goal</div>
            <div className="mb-3">
              <div className="flex justify-between text-xs text-text-body mb-1">
                <span>{formatMoney(summary.total_income_cents)} raised</span>
                <span>{summary.progress_percent}% of {formatMoney(summary.goal_cents)} goal</span>
              </div>
              <div className="w-full h-3 bg-navy border border-navy-border">
                <div
                  className="h-full bg-gold"
                  style={{ width: `${Math.min(100, summary.progress_percent)}%` }}
                />
              </div>
            </div>
            <form onSubmit={saveGoal} className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="block text-xs uppercase tracking-wide text-text-muted mb-1">Goal ($)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  className="w-40 bg-navy border border-navy-border px-3 py-2 text-sm text-white focus:outline-none focus:border-gold"
                />
              </label>
              <button
                type="submit"
                disabled={saving === 'goal'}
                className="bg-gold text-navy-deep font-black tracking-caps px-4 py-2 text-xs disabled:opacity-60"
              >
                {saving === 'goal' ? 'Saving...' : 'Update Goal'}
              </button>
            </form>
          </section>

          <section className="border border-navy-border bg-navy p-4 mb-8">
            <div className="text-xs text-gold font-black tracking-caps mb-3">Add Income / Expense Entry</div>
            <form onSubmit={createEntry} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <label className="block">
                <span className="block text-xs uppercase tracking-wide text-text-muted mb-1">Type</span>
                <select
                  value={entryType}
                  onChange={(e) => setEntryType(e.target.value as EntryType)}
                  className="w-full bg-navy-deep border border-navy-border px-3 py-2.5 text-sm text-white focus:outline-none focus:border-gold"
                >
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </label>

              <label className="block">
                <span className="block text-xs uppercase tracking-wide text-text-muted mb-1">Category</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as EntryCategory)}
                  className="w-full bg-navy-deep border border-navy-border px-3 py-2.5 text-sm text-white focus:outline-none focus:border-gold"
                >
                  <option value="sponsor">Sponsor / Donation</option>
                  <option value="merch">Merch</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label className="block md:col-span-2">
                <span className="block text-xs uppercase tracking-wide text-text-muted mb-1">Description</span>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Acme Corp sponsorship"
                  className="w-full bg-navy-deep border border-navy-border px-3 py-2.5 text-sm text-white focus:outline-none focus:border-gold"
                  required
                />
              </label>

              <label className="block">
                <span className="block text-xs uppercase tracking-wide text-text-muted mb-1">Amount ($)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-navy-deep border border-navy-border px-3 py-2.5 text-sm text-white focus:outline-none focus:border-gold"
                  required
                />
              </label>

              <label className="block">
                <span className="block text-xs uppercase tracking-wide text-text-muted mb-1">Date</span>
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full bg-navy-deep border border-navy-border px-3 py-2.5 text-sm text-white focus:outline-none focus:border-gold"
                  required
                />
              </label>

              <div className="md:col-span-5">
                <button
                  type="submit"
                  disabled={saving === 'create'}
                  className="bg-gold text-navy-deep font-black tracking-caps px-4 py-2.5 text-xs disabled:opacity-60"
                >
                  {saving === 'create' ? 'Adding...' : 'Add Entry'}
                </button>
              </div>
            </form>
          </section>

          <section className="border border-navy-border bg-navy p-4">
            <div className="text-xs text-gold font-black tracking-caps mb-3">Entries</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-navy-border text-left text-xs uppercase tracking-wide text-text-muted">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Category</th>
                    <th className="py-2 pr-3">Description</th>
                    <th className="py-2 pr-3">Amount</th>
                    <th className="py-2 pr-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className="border-b border-navy-border align-top">
                      <td className="py-2 pr-3 text-text-body whitespace-nowrap">{new Date(entry.entry_date).toLocaleDateString()}</td>
                      <td className="py-2 pr-3">
                        <span className={entry.entry_type === 'income' ? 'text-[#7fff7f]' : 'text-[#ff6b6b]'}>
                          {entry.entry_type === 'income' ? 'Income' : 'Expense'}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-text-body">{CATEGORY_LABELS[entry.category]}</td>
                      <td className="py-2 pr-3 text-white">{entry.description}</td>
                      <td className="py-2 pr-3 text-white whitespace-nowrap">{formatMoney(entry.amount_cents)}</td>
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          onClick={() => deleteEntry(entry.id)}
                          disabled={saving === `delete:${entry.id}`}
                          className="border border-red/40 px-3 py-2 text-xs text-red hover:bg-red/10 disabled:opacity-30"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {entries.length === 0 && (
                    <tr>
                      <td className="py-3 text-text-muted" colSpan={6}>No budget entries yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
  tone,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  tone?: 'good' | 'bad';
}) {
  const color = tone === 'bad' ? '#ff6b6b' : tone === 'good' ? '#7fff7f' : highlight ? 'var(--gold)' : '#fff';
  return (
    <div className="border border-navy-border bg-navy-deep p-3">
      <div className="text-xs uppercase tracking-wide text-text-muted mb-1">{label}</div>
      <div className="font-display text-xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
