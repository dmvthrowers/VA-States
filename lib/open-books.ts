/**
 * Open books (master plan O4): income and costs by category, planned next to actual. Pure and import-free,
 * so the public budget page, the admin screen and the tests all use it.
 * Planned numbers go up before the event, actuals after. `registration` is for planned income only:
 * actual registration income is read live from paid fees.
 */
export const BUDGET_CATEGORIES = [
  'registration', 'sponsor', 'merch', 'spectator', 'venue', 'prizes', 'equipment', 'printing', 'food', 'insurance', 'other',
] as const;
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

export const BUDGET_CATEGORY_LABELS: Record<BudgetCategory, string> = {
  registration: 'Registration fees',
  sponsor: 'Sponsorships & donations',
  merch: 'Merchandise',
  spectator: 'Spectator income',
  venue: 'Venue',
  prizes: 'Prizes & awards',
  equipment: 'Equipment',
  printing: 'Printing & signs',
  food: 'Food & drink',
  insurance: 'Insurance',
  other: 'Other',
};

/** The two shapes a manual entry can take */
export type BudgetEntryType = 'income' | 'expense';

/** Why an entry can't be saved as given, or null. */
export function entryIssue(entry: { entry_type: BudgetEntryType; category: BudgetCategory; planned?: boolean }): string | null {
  if (entry.category === 'registration' && entry.entry_type !== 'income') return 'Registration is an income category.';
  if (entry.category === 'registration' && !entry.planned) {
    return 'Actual registration income comes from paid registrations. Use Registration only for a planned figure.';
  }
  return null;
}


export interface BookEntry {
  entry_type: BudgetEntryType;
  category: BudgetCategory;
  amount_cents: number;
  planned?: boolean | null;
}

export interface BookLine { category: BudgetCategory; label: string; planned_cents: number; actual_cents: number }

export interface Books {
  income: BookLine[];
  expense: BookLine[];
  totals: {
    planned_income_cents: number; actual_income_cents: number;
    planned_expense_cents: number; actual_expense_cents: number;
    planned_net_cents: number; actual_net_cents: number;
  };
  /** At least one planned figure exists, so a Planned column is worth showing */
  has_planned: boolean;
}

/**
 * `registrationActualCents` is the live total of paid registration fees. Lines with nothing planned and
 * nothing actual are left out.
 */
export function buildBooks(entries: BookEntry[], registrationActualCents: number): Books {
  const make = (type: BudgetEntryType): BookLine[] => BUDGET_CATEGORIES.map((category) => {
    const mine = entries.filter((e) => e.entry_type === type && e.category === category);
    const planned = mine.filter((e) => e.planned).reduce((n, e) => n + e.amount_cents, 0);
    let actual = mine.filter((e) => !e.planned).reduce((n, e) => n + e.amount_cents, 0);
    if (type === 'income' && category === 'registration') actual = registrationActualCents;
    return { category, label: BUDGET_CATEGORY_LABELS[category], planned_cents: planned, actual_cents: actual };
  }).filter((l) => l.planned_cents !== 0 || l.actual_cents !== 0);

  const income = make('income');
  const expense = make('expense');
  const sum = (lines: BookLine[], k: 'planned_cents' | 'actual_cents') => lines.reduce((n, l) => n + l[k], 0);
  const pi = sum(income, 'planned_cents'), ai = sum(income, 'actual_cents');
  const pe = sum(expense, 'planned_cents'), ae = sum(expense, 'actual_cents');
  return {
    income, expense,
    totals: { planned_income_cents: pi, actual_income_cents: ai, planned_expense_cents: pe, actual_expense_cents: ae, planned_net_cents: pi - pe, actual_net_cents: ai - ae },
    has_planned: entries.some((e) => e.planned),
  };
}
