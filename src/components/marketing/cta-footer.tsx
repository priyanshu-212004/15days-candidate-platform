import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function FinalCta() {
  return (
    <section className="py-24">
      <div className="container">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-primary px-8 py-16 text-center">
          <h2 className="mx-auto max-w-xl text-3xl font-semibold tracking-tight text-primary-foreground lg:text-4xl">
            Hire faster, with structure your team can trust.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-primary-foreground/80">
            Set up your first AI-generated interview in minutes. Free to start, no credit card required.
          </p>
          <Button asChild size="lg" variant="secondary" className="mt-8 gap-2">
            <Link href="/signup">
              Start hiring free <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  const columns = [
    {
      title: 'Product',
      links: ['How it works', 'AI evaluation', 'Security', 'Pricing'],
    },
    {
      title: 'Company',
      links: ['About', 'Careers', 'Blog', 'Contact'],
    },
    {
      title: 'Legal',
      links: ['Privacy policy', 'Terms of service', 'Data processing'],
    },
  ];

  return (
    <footer className="border-t border-border py-12">
      <div className="container grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Link href="/" className="flex w-fit items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              15
            </span>
            15days.io
          </Link>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            AI-powered recruitment and asynchronous video interviews for modern hiring teams.
          </p>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{col.title}</h4>
            <ul className="mt-3 space-y-2">
              {col.links.map((link) => (
                <li key={link}>
                  <a href="#" className="text-sm text-muted-foreground hover:text-foreground">
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="container mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
        © {new Date().getFullYear()} 15days.io. All rights reserved.
      </div>
    </footer>
  );
}
