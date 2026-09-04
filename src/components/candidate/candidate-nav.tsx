'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const FUNCTIONAL_LINKS = [
  { href: '/candidate', label: 'Home' },
  { href: '/candidate/jobs', label: 'Find Jobs' },
  { href: '/candidate/applications', label: 'My Applications' },
  { href: '/candidate/profile', label: 'My Profile' },
];

// Placeholder only — not yet implemented (later phases per the Phase 5
// spec's explicit scope restriction). Shown so the intended navigation
// shape is visible, but not linked anywhere.
const PLACEHOLDER_LINKS = ['My Interviews', 'Mock Interview', 'Settings'];

export function CandidateNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      {FUNCTIONAL_LINKS.map((link) => {
        const active = link.href === '/candidate' ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn('hover:text-foreground', active ? 'font-medium text-foreground' : 'text-muted-foreground')}
          >
            {link.label}
          </Link>
        );
      })}
      {PLACEHOLDER_LINKS.map((label) => (
        <span key={label} className="cursor-not-allowed text-muted-foreground/50" title="Coming soon">
          {label}
        </span>
      ))}
    </nav>
  );
}
