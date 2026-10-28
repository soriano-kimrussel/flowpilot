import Link from 'next/link';

export function LogoMark({ className = 'h-7 w-7' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#4f46e5" />
      <path d="M9 10h14M9 16h9M9 22h5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="22" cy="21" r="3" fill="#a5b4fc" />
    </svg>
  );
}

export function Logo({ href = '/' }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 font-semibold tracking-tight text-ink"
    >
      <LogoMark />
      <span>
        FlowPilot <span className="text-brand-600">AI</span>
      </span>
    </Link>
  );
}
