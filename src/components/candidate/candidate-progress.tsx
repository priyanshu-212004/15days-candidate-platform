interface Props {
  current: number;
  total: number;
}

export function CandidateProgress({ current, total }: Props) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Question {Math.min(current + 1, total)} of {total}
        </span>
        <span>{pct}% complete</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
