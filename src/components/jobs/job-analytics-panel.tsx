import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScoreDistributionChart } from '@/components/dashboard/score-distribution-chart';
import { formatScore } from '@/lib/utils';
import type { JobAnalytics } from '@/lib/queries/job-candidates';

export function JobAnalyticsPanel({ analytics }: { analytics: JobAnalytics }) {
  const summary = [
    { label: 'Total candidates', value: analytics.totalCandidates },
    { label: 'Interviewed', value: analytics.interviewedCandidates },
    { label: 'Evaluated', value: analytics.evaluatedCandidates },
    { label: 'Shortlisted', value: analytics.shortlisted },
    { label: 'Offers', value: analytics.offers },
    { label: 'Resumes uploaded', value: analytics.resumesUploaded },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {summary.map((s) => (
          <Card key={s.label}>
            <CardContent className="space-y-1 p-4">
              <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Average interview score</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.averageInterviewScore === null ? (
              <p className="text-sm text-muted-foreground">No evaluations yet.</p>
            ) : (
              <p className="text-3xl font-semibold tabular-nums">{formatScore(analytics.averageInterviewScore)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Average resume score</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.averageResumeScore === null ? (
              <p className="text-sm text-muted-foreground">No resume evaluations yet.</p>
            ) : (
              <p className="text-3xl font-semibold tabular-nums">{formatScore(analytics.averageResumeScore)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Candidates by stage</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.stageCounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No candidates yet.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {analytics.stageCounts.map((s) => (
                  <li key={s.stageName} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{s.stageName}</span>
                    <span className="font-medium tabular-nums">{s.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Interview score distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ScoreDistributionChart data={analytics.scoreDistribution} />
        </CardContent>
      </Card>
    </div>
  );
}
