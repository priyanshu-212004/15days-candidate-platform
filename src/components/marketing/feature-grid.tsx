import { ScanSearch, ListOrdered, KanbanSquare, Globe2 } from 'lucide-react';
import { SectionHeading } from './section-heading';

const features = [
  {
    icon: ScanSearch,
    title: 'Automated CV screening',
    description:
      'CVs are parsed and matched against job requirements automatically, so recruiters see relevant experience at a glance instead of opening every attachment.',
  },
  {
    icon: ListOrdered,
    title: 'Deterministic candidate ranking',
    description:
      'Candidates are ranked from stored evaluation data — overall score, technical score, or role fit — so the order never shifts unexpectedly between visits.',
  },
  {
    icon: KanbanSquare,
    title: 'Built-in ATS pipeline',
    description:
      'Move candidates through Applied, Screening, Interview, Shortlisted, Offer, and Hired with a drag-and-drop board. Every stage change is recorded in the candidate\u2019s history.',
  },
  {
    icon: Globe2,
    title: 'Global, multilingual hiring',
    description:
      'Candidates choose their interview language independently of your dashboard language, with support for 60+ languages — so you can hire anywhere.',
  },
];

export function FeatureGrid() {
  return (
    <section className="bg-surface-sunken py-24">
      <div className="container">
        <SectionHeading title="Everything a modern hiring team needs" description="One platform, from job post to hiring decision." />
        <div className="mt-16 grid gap-6 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-6">
              <f.icon className="mb-4 h-6 w-6 text-primary" />
              <h3 className="text-base font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
