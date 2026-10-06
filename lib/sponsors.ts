/**
 * Sponsor pipeline helpers (pure, tested). Money is whole cents; a sponsor counts toward "raised" only once
 * it is committed or paid, so a hopeful prospect never inflates the number.
 */
export const SPONSOR_STATUSES = ['prospect', 'contacted', 'committed', 'paid', 'declined'] as const;
export type SponsorStatus = (typeof SPONSOR_STATUSES)[number];

export interface Deliverable {
  label: string;
  done: boolean;
}

export interface SponsorLike {
  status: string;
  amount_cents: number;
  deliverables?: Deliverable[] | null;
}

export interface SponsorSummary {
  counts: Record<SponsorStatus, number>;
  /** committed + paid */
  pledgedCents: number;
  paidCents: number;
  /** committed but not yet paid */
  outstandingCents: number;
  deliverablesDone: number;
  deliverablesTotal: number;
}

export function summarizeSponsors(rows: readonly SponsorLike[]): SponsorSummary {
  const counts = Object.fromEntries(SPONSOR_STATUSES.map((s) => [s, 0])) as Record<SponsorStatus, number>;
  let paid = 0;
  let committed = 0;
  let done = 0;
  let total = 0;
  for (const r of rows) {
    if ((SPONSOR_STATUSES as readonly string[]).includes(r.status)) counts[r.status as SponsorStatus] += 1;
    if (r.status === 'paid') paid += r.amount_cents;
    if (r.status === 'committed') committed += r.amount_cents;
    if (r.status === 'committed' || r.status === 'paid') {
      for (const d of r.deliverables ?? []) {
        total += 1;
        if (d.done) done += 1;
      }
    }
  }
  return { counts, pledgedCents: paid + committed, paidCents: paid, outstandingCents: committed, deliverablesDone: done, deliverablesTotal: total };
}

/** Clean a deliverables list from user input: trimmed, non-empty labels, at most 20. */
export function cleanDeliverables(input: unknown): Deliverable[] {
  if (!Array.isArray(input)) return [];
  const out: Deliverable[] = [];
  for (const d of input) {
    const label = typeof d?.label === 'string' ? d.label.trim().slice(0, 120) : '';
    if (label) out.push({ label, done: d.done === true });
    if (out.length === 20) break;
  }
  return out;
}
