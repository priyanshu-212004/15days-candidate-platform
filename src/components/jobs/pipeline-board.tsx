import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/state';
import { StageSelector } from '@/components/candidates/stage-selector';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatScore } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { KanbanSquare, Briefcase } from 'lucide-react';
import type { JobApplicationForReview } from '@/lib/queries/job-candidates';

interface StageOption {
  id: string;
  name: string;
}

type BoardApplication = JobApplicationForReview & {
  job?: { title: string };
  updatedAt?: Date | string;
};

/**
 * A column per pipeline stage, plus one "No stage" column for applications
 * that haven't been moved yet. Moving a candidate reuses the existing
 * StageSelector/PATCH .../stage endpoint — the same mutation the candidate
 * profile page already uses — rather than a second stage-change system.
 * Reused for both the per-job pipeline tab (no `job` field needed on each
 * application) and the org-wide /dashboard/pipeline page (which passes
 * `job` so each card shows which role it's for).
 *
 * This is a simple grouped-columns view, not full drag-and-drop: dnd-kit
 * would add real interaction complexity (sensors, collision detection,
 * optimistic reordering) for a workflow the existing dropdown already
 * covers, so it's left for a later pass if recruiters actually want it.
 */
export function PipelineBoard({
  applications,
  stages,
}: {
  applications: BoardApplication[];
  stages: StageOption[];
}) {
  if (applications.length === 0) {
    return (
      <EmptyState
        icon={<KanbanSquare className="h-5 w-5" />}
        title="No candidates yet"
        description="Candidates will appear here once they start an interview for this job."
      />
    );
  }

  const columns: { id: string | null; name: string; apps: BoardApplication[] }[] = [
    { id: null, name: 'No stage', apps: [] },
    ...stages.map((s) => ({ id: s.id, name: s.name, apps: [] as BoardApplication[] })),
  ];
  const columnById = new Map(columns.map((c) => [c.id, c]));
  for (const app of applications) {
    const col = columnById.get(app.currentStage?.id ?? null) ?? columns[0]!;
    col.apps.push(app);
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {columns.map((col) => {
        const isRejected = col.name.toLowerCase() === 'rejected';
        return (
          <div key={col.id ?? 'none'} className="w-72 shrink-0 space-y-2">
            <div
              className={`flex items-center justify-between rounded-md px-2.5 py-1.5 ${
                isRejected ? 'bg-destructive/5' : 'bg-secondary/50'
              }`}
            >
              <h3 className={`text-sm font-semibold ${isRejected ? 'text-destructive' : ''}`}>{col.name}</h3>
              <span className="rounded-full bg-background px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                {col.apps.length}
              </span>
            </div>
            <div className="space-y-2">
              {col.apps.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                  No candidates
                </p>
              ) : (
                col.apps.map((app) => (
                  <Card key={app.id} className="transition-shadow hover:shadow-md">
                    <CardContent className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/dashboard/candidates/${app.candidate.id}`}
                          className="block truncate text-sm font-medium hover:underline"
                        >
                          {app.candidate.name}
                        </Link>
                        <StatusBadge status={app.status} />
                      </div>
                      {app.job?.title && (
                        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                          <Briefcase className="h-3 w-3 shrink-0" /> {app.job.title}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {app.evaluation ? (
                          <span className="font-semibold text-foreground">
                            Interview {formatScore(app.evaluation.overallScore)}
                          </span>
                        ) : (
                          <span>Not evaluated</span>
                        )}
                        {app.resume?.resumeEvaluation && (
                          <span>· Resume {formatScore(app.resume.resumeEvaluation.overallScore)}</span>
                        )}
                      </div>
                      {app.updatedAt && (
                        <p className="text-[11px] text-muted-foreground">
                          Updated {formatDistanceToNow(new Date(app.updatedAt), { addSuffix: true })}
                        </p>
                      )}
                      <StageSelector
                        candidateId={app.candidate.id}
                        applicationId={app.id}
                        currentStageId={app.currentStage?.id ?? null}
                        stages={stages}
                      />
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
