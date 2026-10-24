import { z } from 'zod';

/**
 * zod, with zod 3's default error messages. Import `z` from here, not from 'zod'.
 *
 * Routes answer a bad request with the first issue's message, and the forms show it to the person filling
 * them in. zod 4 rewrote every default message ("Required" became "Invalid input: expected string, received
 * undefined"), so this puts the zod 3 wording back. Messages a schema sets itself are not touched.
 * Pure, so lib files tested in plain Node can use it (lib/zod.test.mjs).
 */

const quote = (v: unknown) => (typeof v === 'string' ? `'${v}'` : String(v));
const join = (values: readonly unknown[], sep = ' | ') => values.map(quote).join(sep);

/** zod 3's name for a value's type, as used in "Expected string, received number". */
function typeName(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (v instanceof Date) return 'date';
  if (v instanceof Map) return 'map';
  if (v instanceof Set) return 'set';
  if (typeof v === 'number') return Number.isNaN(v) ? 'nan' : 'number';
  if (typeof v === 'object' && typeof (v as { then?: unknown }).then === 'function') return 'promise';
  return typeof v;
}

const EXPECTED: Record<string, string> = { int: 'integer', record: 'object' };

const SIZE: Record<string, { small: [string, string, string]; big: [string, string, string]; say: (n: string) => string }> = {
  string: { small: ['exactly', 'at least', 'over'], big: ['exactly', 'at most', 'under'], say: (n) => `String must contain ${n} character(s)` },
  array:  { small: ['exactly', 'at least', 'more than'], big: ['exactly', 'at most', 'less than'], say: (n) => `Array must contain ${n} element(s)` },
  number: { small: ['exactly equal to', 'greater than or equal to', 'greater than'], big: ['exactly', 'less than or equal to', 'less than'], say: (n) => `Number must be ${n}` },
};

type Issue = z.core.$ZodRawIssue & {
  inst?: { _zod?: { def?: { type?: string; entries?: Record<string, unknown> } } };
  errors?: { code: string; message: string }[][];
};

/** The zod 3 message for a zod 4 issue, or undefined to keep zod 4's own. */
export function zod3Message(issue: z.core.$ZodRawIssue): string | undefined {
  const iss = issue as Issue;
  const input = iss.input;
  switch (iss.code) {
    case 'invalid_type': {
      if (iss.expected === 'date' && input instanceof Date) return 'Invalid date';
      if (input === undefined) return 'Required';
      if (iss.expected === 'int') return `Expected integer, received ${typeof input === 'number' ? 'float' : typeName(input)}`;
      return `Expected ${EXPECTED[iss.expected] ?? iss.expected}, received ${typeName(input)}`;
    }
    case 'invalid_value': {
      if (iss.inst?._zod?.def?.type === 'enum') {
        if (typeof input !== 'string') return input === undefined ? 'Required' : `Expected ${join(iss.values)}, received ${typeName(input)}`;
        return `Invalid enum value. Expected ${join(iss.values)}, received '${input}'`;
      }
      return `Invalid literal value, expected ${JSON.stringify(iss.values[0])}`;
    }
    case 'too_small':
    case 'too_big': {
      const size = SIZE[iss.origin ?? ''];
      if (!size) return undefined;
      const words = iss.code === 'too_small' ? size.small : size.big;
      const limit = iss.code === 'too_small' ? iss.minimum : iss.maximum;
      return size.say(`${iss.exact ? words[0] : iss.inclusive ? words[1] : words[2]} ${String(limit)}`);
    }
    case 'invalid_format':
      if (iss.format === 'regex') return 'Invalid';
      if (iss.format === 'starts_with') return `Invalid input: must start with "${(iss as { prefix?: string }).prefix}"`;
      if (iss.format === 'ends_with') return `Invalid input: must end with "${(iss as { suffix?: string }).suffix}"`;
      if (iss.format === 'includes') return `Invalid input: must include "${(iss as { includes?: string }).includes}"`;
      // .guid() is zod 3's lenient .uuid(); zod 4's .uuid() also checks the version and variant digits.
      return `Invalid ${iss.format === 'guid' ? 'uuid' : iss.format}`;
    case 'unrecognized_keys':
      return `Unrecognized key(s) in object: ${join(iss.keys, ', ')}`;
    case 'invalid_union': {
      // zod 3 reported the first option that had the right type but failed a check ("Invalid email" for
      // `z.string().email().or(z.literal(''))`), and "Invalid input" only when no option had the right type.
      const typeFail = new Set(['invalid_type', 'invalid_value', 'invalid_union']);
      const near = iss.errors?.find((option) => option.length > 0 && !option.some((i) => typeFail.has(i.code)));
      return near ? near[0].message : 'Invalid input';
    }
    case 'not_multiple_of':
      return `Number must be a multiple of ${String(iss.divisor)}`;
    case 'custom':
      return 'Invalid input';
    default:
      return undefined;
  }
}

z.config({ customError: zod3Message });

export { z };
export { ZodError } from 'zod';
