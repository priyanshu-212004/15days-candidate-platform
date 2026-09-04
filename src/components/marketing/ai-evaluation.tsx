import { SectionHeading } from './section-heading';
import { Badge } from '@/components/ui/badge';

const scores = [
  { label: 'Technical', value: 8.4 },
  { label: 'Communication', value: 7.8 },
  { label: 'Role fit', value: 9.1 },
  { label: 'Confidence', value: 7.4 },
];

export function AiEvaluation() {
  return (
    <section id="ai-evaluation" className="py-24">
      <div className="container grid items-center gap-12 lg:grid-cols-2">
        <div>
          <SectionHeading
            eyebrow="AI evaluation"
            title="Structured scoring you can actually audit"
            align="left"
            description="Every answer is evaluated against technical knowledge, communication, confidence, and role fit — with a written rationale, not just a number."
          />
          <div className="mt-6 flex items-center gap-2">
            <Badge variant="secondary">AI-generated evaluation — recruiter review required</Badge>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-elevated">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-medium">Amara Chen — Senior Software Engineer</p>
            <span className="text-2xl font-semibold text-primary">9.1</span>
          </div>
          <div className="space-y-3">
            {scores.map((s) => (
              <div key={s.label}>
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>{s.label}</span>
                  <span>{s.value.toFixed(1)}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted">
                  <div className="h-1.5 rounded-full bg-primary" style={{ width: `${s.value * 10}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-md bg-secondary p-3 text-xs text-muted-foreground">
            &ldquo;Strong systems-design reasoning with clear trade-off discussion. Communication was concise
            and structured. Recommend advancing to onsite.&rdquo;
          </p>
        </div>
      </div>
    </section>
  );
}
