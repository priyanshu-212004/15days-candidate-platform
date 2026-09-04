import { SectionHeading } from './section-heading';

const faqs = [
  {
    q: 'Is 15days.io really free for recruiters?',
    a: 'Yes. Core recruiter functionality — job creation, AI question generation, unlimited interviews, candidate evaluation, and the ATS pipeline — is free with unlimited users and interviews.',
  },
  {
    q: 'How does the AI evaluation work?',
    a: 'Each recorded answer is transcribed and scored against structured criteria such as technical knowledge, communication, and role fit. Scores come with a written rationale and are always labeled as decision support, not a final verdict — a recruiter reviews every hire.',
  },
  {
    q: 'What languages are supported?',
    a: 'The candidate interview experience supports 60+ languages, selected independently by each candidate. Your recruiter dashboard language is separate and configurable per organization.',
  },
  {
    q: 'How do you prevent cheating without falsely accusing candidates?',
    a: 'The system surfaces review flags — such as multiple faces detected or unusual audio — for a recruiter to check manually. Flags are never treated as automatic proof of wrongdoing or used to auto-reject a candidate.',
  },
  {
    q: 'Can I integrate 15days.io with our existing ATS?',
    a: 'Yes. 15days.io is built with an integration layer for tools like Slack, Greenhouse, Lever, and custom webhooks, so it can slot into an existing hiring stack rather than replace it outright.',
  },
];

export function Faq() {
  return (
    <section className="py-24">
      <div className="container max-w-3xl">
        <SectionHeading title="Frequently asked questions" />
        <div className="mt-12 divide-y divide-border rounded-xl border border-border">
          {faqs.map((item) => (
            <details key={item.q} className="group p-5 open:bg-secondary/40">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
                {item.q}
                <span className="ml-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
