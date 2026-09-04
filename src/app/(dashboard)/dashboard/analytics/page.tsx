import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getOrgAnalytics } from '@/lib/queries/analytics';
import { listJobs } from '@/lib/queries/jobs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiCard } from '@/components/dashboard/analytics/kpi-card';
import { AnalyticsToolbar } from '@/components/dashboard/analytics/analytics-toolbar';
import { AnalyticsExportButton } from '@/components/dashboard/analytics/export-button';
import { TrendChart } from '@/components/dashboard/analytics/trend-chart';
import { JobBarChart } from '@/components/dashboard/analytics/job-bar-chart';
import { OutcomeDonutChart } from '@/components/dashboard/analytics/outcome-donut-chart';
import { ScoreDistributionChart } from '@/components/dashboard/score-distribution-chart';
import { formatScore } from '@/lib/utils';
import { Users, Video, CheckCircle2, Star, XCircle, Gauge, Trophy, TrendingUp } from 'lucide-react';

interface PageProps {
  searchParams: { range?: string; jobId?: string };
}

function rangeToDateFrom(range: string): Date | undefined {
  if (range === 'all') return undefined;
  const days = Number(range);
  if (!Number.isFinite(days)) return undefined;
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

export default async function AnalyticsPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user.orgId) redirect('/login');

  const range = ['7', '30', '90', 'all'].includes(searchParams.range ?? '') ? searchParams.range! : '30';
  const jobId = searchParams.jobId || undefined;
  const dateFrom = rangeToDateFrom(range);

  const [analytics, jobs] = await Promise.all([
    getOrgAnalytics(session.user.orgId, { jobId, dateFrom }),
    listJobs({ orgId: session.user.orgId }),
  ]);

  const { kpis } = analytics;

  return (
    <div className="mx-auto max-w-[100rem] space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">A live view of your recruitment funnel.</p>
        </div>
        <AnalyticsExportButton analytics={analytics} />
      </div>

      <AnalyticsToolbar
        initialRange={range}
        initialJobId={jobId ?? ''}
        jobs={jobs.map((job: (typeof jobs)[number]) => ({ id: job.id, title: job.title }))}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <KpiCard label="Total candidates" value={kpis.totalCandidates} icon={Users} tone="primary" />
        <KpiCard label="Active interviews" value={kpis.activeInterviews} icon={Video} tone="warning" />
        <KpiCard label="Completed interviews" value={kpis.completedInterviews} icon={CheckCircle2} tone="success" />
        <KpiCard label="Shortlisted" value={kpis.shortlisted} icon={Star} tone="primary" />
        <KpiCard label="Rejected" value={kpis.rejected} icon={XCircle} tone="destructive" />
        <KpiCard
          label="Avg. evaluation score"
          value={kpis.averageEvaluationScore !== null ? formatScore(kpis.averageEvaluationScore) : '—'}
          icon={Gauge}
          tone="primary"
        />
        <KpiCard label="Selection rate" value={`${kpis.selectionRate.toFixed(0)}%`} icon={Trophy} tone="success" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-muted-foreground" /> Candidates over time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={analytics.candidatesOverTime.map((d) => ({ date: d.date, value: d.count }))}
              label="Candidates"
              emptyDescription="Candidates will appear here as they apply."
              color="rgb(var(--chart-1))"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Shortlisted vs rejected</CardTitle>
          </CardHeader>
          <CardContent>
            <OutcomeDonutChart data={analytics.shortlistedVsRejected} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Applications by job</CardTitle>
          </CardHeader>
          <CardContent>
            <JobBarChart data={analytics.applicationsByJob} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evaluation score distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreDistributionChart data={analytics.evaluationScoreDistribution} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Interview score trend</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={analytics.scoreTrend.map((d) => ({ date: d.date, value: d.averageScore }))}
              label="Avg score"
              emptyDescription="Score trends will appear once interviews are evaluated."
              color="rgb(var(--chart-3))"
              format="score"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Candidates by pipeline stage</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.candidatesByStage.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No candidates yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {analytics.candidatesByStage
                  .sort((a, b) => b.count - a.count)
                  .map((s) => {
                    const max = Math.max(...analytics.candidatesByStage.map((x) => x.count), 1);
                    return (
                      <li key={s.stageName} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{s.stageName}</span>
                          <span className="font-medium tabular-nums">{s.count}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${(s.count / max) * 100}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Job-wise performance</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {analytics.jobWisePerformance.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No job performance data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Job</th>
                    <th className="px-4 py-3 font-medium">Candidates</th>
                    <th className="px-4 py-3 font-medium">Avg. score</th>
                    <th className="px-4 py-3 font-medium">Completion rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {analytics.jobWisePerformance.map((j) => (
                    <tr key={j.jobId} className="hover:bg-secondary/40">
                      <td className="px-4 py-3 font-medium">{j.jobTitle}</td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{j.candidates}</td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {j.averageScore !== null ? formatScore(j.averageScore) : '—'}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{j.completionRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
