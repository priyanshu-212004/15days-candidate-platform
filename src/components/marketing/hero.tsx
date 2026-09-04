import Link from 'next/link';
import { ArrowRight, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[600px] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgb(var(--primary)/0.12),transparent)]" />
      <div className="container flex flex-col items-center pb-20 pt-20 text-center lg:pt-28">
        <Badge variant="secondary" className="mb-6">
          Now supporting 60+ languages
        </Badge>
        <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight lg:text-6xl">
          AI-powered hiring, <br className="hidden sm:block" />
          without the hiring complexity.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Screen resumes, run asynchronous video interviews, and evaluate candidates with structured
          AI scoring — all in one platform your team can trust.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="gap-2">
            <Link href="/signup">
              Start hiring free <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="gap-2">
            <a href="#how-it-works">
              <PlayCircle className="h-4 w-4" />
              See how it works
            </a>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Free core recruiter tools · Unlimited interviews · No credit card</p>

        <ProductPreview />
      </div>
    </section>
  );
}

function ProductPreview() {
  return (
    <div className="relative mt-16 w-full max-w-5xl">
      <div className="rounded-xl border border-border bg-card shadow-overlay">
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/50" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/50" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/50" />
          <span className="ml-3 text-xs text-muted-foreground">15days.io/dashboard</span>
        </div>
        <div className="grid grid-cols-1 gap-4 p-6 text-left md:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface p-4 md:col-span-2">
            <p className="mb-3 text-xs font-medium text-muted-foreground">Recent candidates</p>
            <div className="space-y-3">
              {[
                { name: 'Amara Chen', role: 'Senior Software Engineer', score: '9.1' },
                { name: 'Rohan Mehta', role: 'Product Designer', score: '8.4' },
                { name: 'Elena Vasquez', role: 'Product Manager', score: '7.9' },
              ].map((c) => (
                <div key={c.name} className="flex items-center justify-between rounded-md bg-background px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-foreground">
                      {c.name.split(' ').map((n) => n[0]).join('')}
                    </span>
                    <div>
                      <p className="text-sm font-medium leading-tight">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.role}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-primary">{c.score}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="mb-3 text-xs font-medium text-muted-foreground">Hiring funnel</p>
            <div className="space-y-2">
              {[
                { label: 'Applied', value: 100 },
                { label: 'Screening', value: 68 },
                { label: 'Interview', value: 41 },
                { label: 'Shortlisted', value: 18 },
                { label: 'Offer', value: 6 },
              ].map((s) => (
                <div key={s.label}>
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                    <span>{s.label}</span>
                    <span>{s.value}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted">
                    <div className="h-1.5 rounded-full bg-primary" style={{ width: `${s.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
