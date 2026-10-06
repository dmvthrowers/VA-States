'use client';

import { Children, cloneElement, isValidElement, useId } from 'react';
import type { ReactElement, ReactNode } from 'react';

const CONTROLS = new Set(['input', 'select', 'textarea']);

/** Classes shared by every text input, select and textarea. Keeps a visible focus outline. */
export function inputCls(hasError: boolean) {
  return `w-full bg-navy-deep border ${hasError ? 'border-red' : 'border-navy-border'} px-3 py-2.5 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold focus:border-gold transition-colors`;
}

/**
 * A labelled form field. The label is tied to the control, and the error text is linked with
 * aria-describedby / aria-invalid, so screen readers announce "Email, edit, invalid, Enter your email".
 * A label ending in " *" (or required={true}) marks the control aria-required.
 * Pass one <input>, <select> or <textarea> as the child and it is wired up automatically.
 * For radio groups or several controls, pass them as children and the field becomes a labelled group.
 */
export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  const uid = useId();
  // Labels end with " *" when required. Show the asterisk but hide it from screen readers,
  // which hear "required" from aria-required instead.
  const isRequired = required ?? /\*\s*$/.test(label);
  const labelText = label.replace(/\s*\*\s*$/, '');
  const errId = `${uid}-error`;
  const labelCls = 'block text-xs font-black tracking-caps text-gold mb-1.5';
  const hintEl = hint && (
    <span className="text-gold/60 font-normal normal-case tracking-normal ml-1">— {hint}</span>
  );
  const errorEl = error && (
    <p id={errId} role="alert" className="text-error text-xs mt-1">
      {error}
    </p>
  );

  const only = Children.count(children) === 1 ? Children.toArray(children)[0] : null;
  if (isValidElement(only) && typeof only.type === 'string' && CONTROLS.has(only.type)) {
    const el = only as ReactElement<Record<string, unknown>>;
    const id = (el.props.id as string | undefined) ?? `${uid}-control`;
    const control = cloneElement(el, {
      id,
      'aria-invalid': error ? true : undefined,
      'aria-describedby': error ? errId : (el.props['aria-describedby'] as string | undefined),
      'aria-required': isRequired ? true : (el.props['aria-required'] as boolean | undefined),
    });
    return (
      <div>
        <label htmlFor={id} className={labelCls}>
          {labelText}
          {isRequired && <span aria-hidden="true"> *</span>}
          {hintEl}
        </label>
        {control}
        {errorEl}
      </div>
    );
  }

  return (
    <div role="group" aria-labelledby={`${uid}-label`} aria-describedby={error ? errId : undefined}>
      <span id={`${uid}-label`} className={labelCls}>
        {labelText}
        {isRequired && <span aria-hidden="true"> *</span>}
        {hintEl}
      </span>
      {children}
      {errorEl}
    </div>
  );
}
