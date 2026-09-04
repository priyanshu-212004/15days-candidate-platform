import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/state';
import { formatScore } from '@/lib/utils';
import { Users } from 'lucide-react';
import type { RankedCandidateRow } from '@/lib/queries/job-candidates';

export function CandidateRankingTable({ rows }: { rows: RankedCandidateRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-5 w-5" />}
        title="No candidates yet"
        description="Candidates will appear here once they start an interview for this job."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium text-muted-foreground">
            <th className="px-4 py-2.5">#</th>
            <th className="px-4 py-2.5">Candidate</th>
            <th className="px-4 py-2.5">Resume score</th>
            <th className="px-4 py-2.5">Interview score</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5">Stage</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, i) => (
            <tr key={row.applicationId} className="hover:bg-muted/30">
              <td className="px-4 py-3 tabular-nums text-muted-foreground">{i + 1}</td>
              <td className="px-4 py-3">
                <Link href={`/dashboard/candidates/${row.candidateId}`} className="font-medium hover:underline">
                  {row.candidateName}
                </Link>
              </td>
              <td className="px-4 py-3 tabular-nums">
                {row.resumeScore !== null ? formatScore(row.resumeScore) : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-4 py-3 tabular-nums">
                {row.interviewScore !== null ? (
                  <span className="font-semibold">{formatScore(row.interviewScore)}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Not yet evaluated</span>
                )}
              </td>
              <td className="px-4 py-3">
                <Badge variant="outline">{row.status.replace('_', ' ')}</Badge>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{row.stageName ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
