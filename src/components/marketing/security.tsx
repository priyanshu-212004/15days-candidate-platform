import { ShieldCheck, Lock, Eye, KeyRound } from 'lucide-react';
import { SectionHeading } from './section-heading';

const points = [
  { icon: ShieldCheck, title: 'Tenant isolation', description: 'Every query is scoped to your organization. No cross-tenant data access, ever.' },
  { icon: Lock, title: 'Encrypted storage', description: 'Video, CVs, and personal data are encrypted at rest with signed, time-limited access URLs.' },
  { icon: Eye, title: 'Full audit trail', description: 'Every stage change, evaluation, and access event is logged for compliance and review.' },
  { icon: KeyRound, title: 'RBAC by default', description: 'Owner, admin, recruiter, and viewer roles control exactly what each teammate can do.' },
];

export function Security() {
  return (
    <section id="security" className="py-24">
      <div className="container grid gap-12 lg:grid-cols-2 lg:items-center">
        <SectionHeading
          eyebrow="Security"
          align="left"
          title="Enterprise-grade security, from day one"
          description="Built for recruiting teams that handle sensitive candidate data at scale."
        />
        <div className="grid gap-5 sm:grid-cols-2">
          {points.map((p) => (
            <div key={p.title} className="flex gap-3">
              <p.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <h3 className="text-sm font-semibold">{p.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
