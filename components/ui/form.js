import { forwardRef } from 'react';
import { cn } from '@/lib/utils/format';

const control =
  'block w-full rounded-lg border border-line-strong bg-surface-2/70 px-3 text-sm text-ink placeholder:text-ink-subtle ' +
  'focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/25 disabled:bg-gray-50 disabled:text-ink-subtle ' +
  'aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-red-500/20';

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(control, 'h-9', className)} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ className, rows = 4, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(control, 'py-2', className)} {...props} />;
});

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(control, 'h-9 pr-8', className)} {...props}>
      {children}
    </select>
  );
});

export function Label({ htmlFor, children, className, optional }) {
  return (
    <label htmlFor={htmlFor} className={cn('block text-sm font-medium text-ink', className)}>
      {children}
      {optional && <span className="ml-1 font-normal text-ink-subtle">(optional)</span>}
    </label>
  );
}

export function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-red-600">
      {message}
    </p>
  );
}

/** Label + control + help/error wiring with correct aria attributes. */
export function Field({ id, label, help, error, optional, children, className }) {
  const errorId = error ? `${id}-error` : undefined;
  const helpId = help ? `${id}-help` : undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <Label htmlFor={id} optional={optional}>
          {label}
        </Label>
      )}
      {typeof children === 'function'
        ? children({
            id,
            'aria-invalid': Boolean(error),
            'aria-describedby': [errorId, helpId].filter(Boolean).join(' ') || undefined,
          })
        : children}
      {help && !error && (
        <p id={helpId} className="text-xs text-ink-subtle">
          {help}
        </p>
      )}
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export function Checkbox({ id, label, description, className, ...props }) {
  return (
    <label htmlFor={id} className={cn('flex items-start gap-2.5 text-sm', className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
        {...props}
      />
      <span>
        <span className="font-medium text-ink">{label}</span>
        {description && <span className="block text-xs text-ink-subtle">{description}</span>}
      </span>
    </label>
  );
}
