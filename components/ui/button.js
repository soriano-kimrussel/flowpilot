import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/format';

const VARIANTS = {
  primary:
    'text-white bg-linear-to-r from-[#7c3aed] via-[#8b5cf6] to-[#06b6d4] bg-[length:200%_100%] bg-left ' +
    'shadow-[0_8px_24px_-8px_rgb(124_58_237/0.7)] hover:bg-right hover:shadow-[0_10px_30px_-8px_rgb(124_58_237/0.85)] ' +
    'transition-[background-position,box-shadow] duration-300',
  secondary:
    'bg-surface/70 text-ink border border-line-strong hover:bg-gray-100 hover:border-brand-500/40 backdrop-blur',
  ghost: 'text-ink-muted hover:bg-gray-100 hover:text-ink',
  danger: 'bg-[#e11d48] text-white hover:bg-[#be123c] shadow-[0_8px_24px_-10px_rgb(225_29_72/0.7)]',
  link: 'text-brand-700 hover:text-brand-800 underline-offset-4 hover:underline px-0',
};

const SIZES = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-base gap-2',
  icon: 'h-9 w-9 justify-center',
};

export function buttonClasses({ variant = 'primary', size = 'md', className } = {}) {
  return cn(
    'inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-70',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export function Button({
  variant,
  size,
  className,
  loading = false,
  disabled,
  children,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant, size, className, children, ...props }) {
  return (
    <Link href={href} className={buttonClasses({ variant, size, className })} {...props}>
      {children}
    </Link>
  );
}
