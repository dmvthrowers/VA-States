'use client';

import { useSyncExternalStore } from 'react';
import { deadlineLabels } from '@/lib/contest-guide';

const noop = () => () => {};
const readerZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
};

/** A deadline in the venue's time zone, plus the reader's own when it differs (master plan T18). */
export default function LocalDeadline({ iso, venueZone }: { iso: string; venueZone: string }) {
  const zone = useSyncExternalStore(noop, readerZone, () => null);
  const { venue, reader } = deadlineLabels(iso, venueZone, zone);
  return (
    <>
      {venue}
      {reader && <span style={{ color: 'var(--text-muted)' }}> · {reader} where you are</span>}
    </>
  );
}
