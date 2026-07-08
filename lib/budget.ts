import { createAdminClient } from '@/lib/supabase/admin';

export type BudgetEntryType = 'income' | 'expense';
export type BudgetEntryCategory = 'sponsor' | 'merch' | 'other';

export interface BudgetEntry {
  id: string;
  created_at: string;
  updated_at: string;
  entry_type: BudgetEntryType;
  category: BudgetEntryCategory;
  description: string;
  amount_cents: number;
  entry_date: string;
}

export interface BudgetSummary {
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

function sumBy(entries: BudgetEntry[], entry_type: BudgetEntryType, category: BudgetEntryCategory): number {
  return entries
    .filter((e) => e.entry_type === entry_type && e.category === category)
    .reduce((sum, e) => sum + e.amount_cents, 0);
}

/**
 * Computes the full budget picture: live registration revenue (paid fees,
 * not projected) plus manually-entered income/expense rows, against the
 * admin-set fundraising goal. Shared by the admin dashboard API and the
 * public transparency page so both always agree on the numbers.
 */
export async function getBudgetSummary(entries: BudgetEntry[]): Promise<BudgetSummary> {
  const supabase = createAdminClient();

  const [{ data: goalRow }, { data: registrations, error: regError }] = await Promise.all([
    supabase.from('vsyc_budget_goal').select('goal_cents').eq('id', true).maybeSingle(),
    supabase.from('vsyc_registrations').select('fee_cents').eq('paid', true),
  ]);

  if (regError) throw new Error('Failed to load registration income');

  const registration_income_cents = (registrations ?? []).reduce((sum, r) => sum + Number(r.fee_cents ?? 0), 0);
  const sponsor_income_cents = sumBy(entries, 'income', 'sponsor');
  const merch_income_cents = sumBy(entries, 'income', 'merch');
  const other_income_cents = sumBy(entries, 'income', 'other');
  const merch_expense_cents = sumBy(entries, 'expense', 'merch');
  const other_expense_cents = sumBy(entries, 'expense', 'other') + sumBy(entries, 'expense', 'sponsor');

  const total_income_cents = registration_income_cents + sponsor_income_cents + merch_income_cents + other_income_cents;
  const total_expense_cents = merch_expense_cents + other_expense_cents;
  const goal_cents = goalRow?.goal_cents ?? 0;

  return {
    goal_cents,
    registration_income_cents,
    sponsor_income_cents,
    merch_income_cents,
    other_income_cents,
    total_income_cents,
    merch_expense_cents,
    other_expense_cents,
    total_expense_cents,
    net_cents: total_income_cents - total_expense_cents,
    progress_percent: goal_cents > 0 ? Math.min(100, Math.round((total_income_cents / goal_cents) * 1000) / 10) : 0,
  };
}

export async function getBudgetEntries(): Promise<BudgetEntry[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('vsyc_budget_entries')
    .select('id, created_at, updated_at, entry_type, category, description, amount_cents, entry_date')
    .order('entry_date', { ascending: false });

  if (error) throw new Error('Failed to load budget entries');
  return data ?? [];
}
