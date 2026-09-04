'use client';

import * as React from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';

const links = [
  { label: 'Product', href: '#how-it-works' },
  { label: 'AI Evaluation', href: '#ai-evaluation' },
  { label: 'Security', href: '#security' },
  { label: 'Pricing', href: '#pricing' },
];

export function Navbar() {
  const [open, setOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            15
          </span>
          15days.io
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="text-sm text-muted-foreground hover:text-foreground">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Start hiring free</Link>
          </Button>
        </div>

        <button
          className="p-2 md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-background px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-3">
            {links.map((link) => (
              <a key={link.href} href={link.href} className="text-sm text-muted-foreground" onClick={() => setOpen(false)}>
                {link.label}
              </a>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-border pt-3">
              <ThemeToggle />
              <div className="flex gap-2">
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/signup">Start free</Link>
                </Button>
              </div>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
