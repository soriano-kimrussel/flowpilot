import Link from 'next/link';

export function LogoMark({ className = 'h-7 w-7' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="fp-logo" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c3aed" />
          <stop offset="0.6" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#fp-logo)" />
      <path d="M9 10h14M9 16h9M9 22h5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="22" cy="21" r="3" fill="#fdba74" />
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
        FlowPilot <span className="text-gradient">AI</span>
      </span>
    </Link>
  );
}
