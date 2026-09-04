import { FileText, Video, BarChart3 } from 'lucide-react';
import { SectionHeading } from './section-heading';

const steps = [
  {
    icon: FileText,
    title: 'Create a job, get AI-generated questions',
    description:
      'Describe the role and 15days.io drafts structured interview questions — technical, behavioral, and role-specific — that you can edit, reorder, or replace before publishing.',
  },
  {
    icon: Video,
    title: 'Candidates interview on their own time',
    description:
      'Share one secure link. Candidates record video answers from any device, in their preferred language, with clear instructions and no scheduling back-and-forth.',
  },
  {
    icon: BarChart3,
    title: 'Review AI-scored, ranked candidates',
    description:
      'Every response is transcribed and evaluated against your criteria. Candidates are ranked by score so your team can focus review time where it matters.',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24">
      <div className="container">
        <SectionHeading
          eyebrow="How it works"
          title="From job post to ranked shortlist in three steps"
          description="No scheduling, no spreadsheets, no manual screening backlog."
        />
        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {steps.map((step, i) => (
            <div key={step.title} className="relative rounded-xl border border-border bg-card p-6">
              <span className="absolute -top-3 left-6 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <step.icon className="mb-4 h-6 w-6 text-primary" />
              <h3 className="text-base font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
