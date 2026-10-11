/**
 * Forms on our own system (build plan 5.1). A form is a plain description in contest.config.ts
 * (`contest.forms`): a list of fields with a type, a label and whether it is required. This file turns that
 * description into validation and a database row. Pure: no database, no config import, so it is tested in
 * plain Node (lib/forms.test.mjs).
 *
 * The honeypot field `_hp` is part of every form and must stay empty; a filled one is flagged as a bot (`bot: true`).
 */
import { z } from 'zod';

export const FIELD_TYPES = ['text', 'longtext', 'email', 'phone', 'url', 'number', 'select', 'multiselect', 'checkbox'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface FieldDef {
  /** Lowercase letters, numbers and underscores. Stored as the key in the saved answers, so don't rename it later. */
  id: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** Choices for `select` and `multiselect` */
  options?: string[];
  /** A line of help under the field */
  help?: string;
  /** Most characters for text fields (defaults: 200 for text, 4000 for longtext) */
  max?: number;
}

export interface FormDef {
  /** Lowercase letters, numbers and dashes. The form lives at /forms/<id>. */
  id: string;
  title: string;
  intro?: string;
  enabled: boolean;
  fields: FieldDef[];
  submitLabel?: string;
  /** Shown after sending */
  doneMessage?: string;
}

export type Answer = string | number | boolean | string[];
export type Answers = Record<string, Answer>;

export const FORM_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const FIELD_ID_RE = /^[a-z][a-z0-9_]*$/;
export const MAX_FIELDS = 40;
const DEFAULT_MAX = { text: 200, longtext: 4000 } as const;

/** Problems with the forms in the config, as plain sentences (empty when fine). Run by a test and by the build. */
export function formIssues(forms: readonly FormDef[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const f of forms) {
    if (!FORM_ID_RE.test(f.id)) out.push(`Form "${f.id}": the id must be lowercase letters, numbers and dashes.`);
    if (seen.has(f.id)) out.push(`Form "${f.id}" appears twice.`);
    seen.add(f.id);
    if (!f.title.trim()) out.push(`Form "${f.id}" needs a title.`);
    if (f.fields.length === 0) out.push(`Form "${f.id}" has no fields.`);
    if (f.fields.length > MAX_FIELDS) out.push(`Form "${f.id}" has more than ${MAX_FIELDS} fields.`);
    const ids = new Set<string>();
    for (const fd of f.fields) {
      const where = `Form "${f.id}", field "${fd.id}"`;
      if (!FIELD_ID_RE.test(fd.id) || fd.id === '_hp') out.push(`${where}: the id must start with a letter and use lowercase letters, numbers and underscores.`);
      if (ids.has(fd.id)) out.push(`${where} appears twice.`);
      ids.add(fd.id);
      if (!fd.label.trim()) out.push(`${where} needs a label.`);
      if (!FIELD_TYPES.includes(fd.type)) out.push(`${where}: "${fd.type}" is not a field type.`);
      const choice = fd.type === 'select' || fd.type === 'multiselect';
      if (choice && (!fd.options || fd.options.length < 2)) out.push(`${where} needs at least two options.`);
      if (!choice && fd.options) out.push(`${where}: only select fields take options.`);
      if (choice && fd.options && new Set(fd.options).size !== fd.options.length) out.push(`${where} lists an option twice.`);
    }
  }
  return out;
}

function fieldSchema(fd: FieldDef): z.ZodTypeAny {
  const max = fd.max ?? (fd.type === 'longtext' ? DEFAULT_MAX.longtext : DEFAULT_MAX.text);
  const need = `Please fill in "${fd.label}".`;
  let base: z.ZodTypeAny;
  switch (fd.type) {
    case 'text':
    case 'longtext':
      base = z.string().trim().max(max, `"${fd.label}" can be up to ${max} characters.`);
      break;
    case 'phone':
      base = z.string().trim().max(40, `"${fd.label}" is too long.`).regex(/^[\d\s\-+().]*$/, `"${fd.label}" should be a phone number.`);
      break;
    case 'email':
      base = z.string().trim().toLowerCase().max(254).refine((v) => v === '' || z.string().email().safeParse(v).success, `"${fd.label}" should be an email address.`);
      break;
    case 'url':
      base = z.string().trim().max(500).refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), `"${fd.label}" should be a link starting with http:// or https://.`);
      break;
    case 'number':
      base = z.number({ invalid_type_error: `"${fd.label}" should be a number.` }).finite().min(-1_000_000_000).max(1_000_000_000);
      break;
    case 'select':
      base = z.string().refine((v) => v === '' || (fd.options ?? []).includes(v), `Pick one of the choices for "${fd.label}".`);
      break;
    case 'multiselect':
      base = z.array(z.string()).max(fd.options?.length ?? 0).refine((a) => a.every((v) => (fd.options ?? []).includes(v)) && new Set(a).size === a.length, `Pick from the choices for "${fd.label}".`);
      break;
    case 'checkbox':
      base = z.boolean();
      break;
  }
  if (!fd.required) return base.optional();
  // A missing required field gets the field's own message, not a generic "Required".
  const missing = fd.type === 'checkbox' ? false : fd.type === 'multiselect' ? [] : fd.type === 'number' ? undefined : '';
  const fill = (v: unknown) => (v === undefined ? missing : v);
  switch (fd.type) {
    case 'checkbox': return z.preprocess(fill, base.refine((v) => v === true, need));
    case 'multiselect': return z.preprocess(fill, base.refine((a: string[]) => a.length > 0, need));
    case 'number': return z.preprocess(fill, z.number({ required_error: need, invalid_type_error: `"${fd.label}" should be a number.` }).finite().min(-1_000_000_000).max(1_000_000_000));
    default: return z.preprocess(fill, base.refine((v: string) => v !== '', need));
  }
}

/** A zod schema for one form: its fields, the honeypot, and nothing else (unknown keys are refused). */
export function formSchema(form: FormDef) {
  const shape: Record<string, z.ZodTypeAny> = { _hp: z.string().max(200).optional() };
  for (const fd of form.fields) shape[fd.id] = fieldSchema(fd);
  return z.object(shape).strict();
}

/** Parse a submission. Returns the cleaned answers (no honeypot, no empty optional values), or the first problem in plain words. */
export function parseSubmission(form: FormDef, body: unknown): { ok: true; answers: Answers; bot: boolean } | { ok: false; message: string } {
  const r = formSchema(form).safeParse(body);
  if (!r.success) {
    const issue = r.error.issues[0];
    const unknown = issue?.code === 'unrecognized_keys';
    return { ok: false, message: unknown ? 'That form has changed. Reload the page and try again.' : (issue?.message ?? 'Check the form and try again.') };
  }
  const { _hp, ...rest } = r.data as Record<string, unknown>;
  const answers: Answers = {};
  for (const fd of form.fields) {
    const v = rest[fd.id];
    if (v === undefined || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    answers[fd.id] = v as Answer;
  }
  return { ok: true, answers, bot: typeof _hp === 'string' && _hp.length > 0 };
}

/** One line per answered field, labelled, for an email or a review list. */
export function answerLines(form: FormDef, answers: Answers): string[] {
  const lines: string[] = [];
  for (const fd of form.fields) {
    const v = answers[fd.id];
    if (v === undefined) continue;
    const text = Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v);
    lines.push(`${fd.label}: ${text}`);
  }
  return lines;
}

export const SUBMISSION_STATUSES = ['new', 'read', 'handled', 'dismissed'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** The row saved in vsyc_form_submissions. */
export function submissionRow(form: FormDef, answers: Answers) {
  return { form_id: form.id, answers };
}

/** The public form definition: what the page needs, nothing else. */
export function publicForm(form: FormDef) {
  return { id: form.id, title: form.title, intro: form.intro ?? '', fields: form.fields, submitLabel: form.submitLabel ?? 'Send', doneMessage: form.doneMessage ?? 'Thanks. We got it.' };
}
