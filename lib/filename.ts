/**
 * Enforces the required music filename format: DIVISION_LastName_FirstName.ext
 * Normalizes Unicode (strips diacritics), replaces spaces/hyphens with underscores,
 * and rejects path traversal characters.
 */

const ALLOWED_EXTS = ['mp3', 'wav', 'm4a'] as const;
type AllowedExt = typeof ALLOWED_EXTS[number];

function normalize(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-zA-Z0-9_\-]/g, '_') // replace unsafe chars with _
    .replace(/_+/g, '_') // collapse consecutive underscores
    .replace(/^_|_$/g, ''); // trim leading/trailing underscores
}

function getExt(originalName: string): AllowedExt | null {
  const parts = originalName.toLowerCase().split('.');
  const ext = parts[parts.length - 1] as AllowedExt;
  return ALLOWED_EXTS.includes(ext) ? ext : null;
}

export interface FilenameResult {
  filename: string;
  error?: string;
}

export function buildMusicFilename(
  division: string,
  lastName: string,
  firstName: string,
  originalFilename: string,
): FilenameResult {
  const ext = getExt(originalFilename);
  if (!ext) {
    return { filename: '', error: `File must be .mp3, .wav, or .m4a. Got: ${originalFilename}` };
  }

  const divPart   = normalize(division).toUpperCase();
  const lastPart  = normalize(lastName);
  const firstPart = normalize(firstName);

  if (!divPart || !lastPart || !firstPart) {
    return { filename: '', error: 'Division, last name, and first name are required for filename.' };
  }

  return { filename: `${divPart}_${lastPart}_${firstPart}.${ext}` };
}

/** Returns true if a filename is safe (no path traversal). */
export function isSafeFilename(name: string): boolean {
  return !name.includes('/') && !name.includes('\\') && !name.includes('..');
}
