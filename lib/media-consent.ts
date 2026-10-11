/**
 * "Do not photograph" list (master plan R11): everyone who left the photo and video release empty, in a
 * shape the media team can read at a glance. Pure; /api/staff/media-consent feeds it.
 */

export interface ConsentRow {
  name: string;
  /** Where the name comes from: an entrant, or a volunteer */
  kind: 'competitor' | 'volunteer';
  is_minor: boolean;
  /** Divisions for a competitor, so a photographer can spot them on stage */
  divisions: string[];
  photo_video_consent: boolean;
}

export interface DoNotPhotograph {
  name: string;
  kind: ConsentRow['kind'];
  is_minor: boolean;
  divisions: string[];
}

export function doNotPhotograph(rows: ConsentRow[]): DoNotPhotograph[] {
  return rows
    .filter((r) => !r.photo_video_consent)
    .map(({ name, kind, is_minor, divisions }) => ({ name, kind, is_minor, divisions }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
