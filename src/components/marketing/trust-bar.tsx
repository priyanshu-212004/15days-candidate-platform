export function TrustBar() {
  const stats = [
    { value: '60+', label: 'Languages supported' },
    { value: '<15 min', label: 'Avg. time to first interview' },
    { value: '24/7', label: 'Candidates can interview anytime' },
    { value: '100%', label: 'AI evaluations reviewed by you' },
  ];

  return (
    <section className="border-y border-border bg-surface-sunken py-10">
      <div className="container grid grid-cols-2 gap-6 text-center lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-2xl font-semibold tracking-tight lg:text-3xl">{s.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
