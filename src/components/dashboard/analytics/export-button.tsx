'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { OrgAnalytics } from '@/lib/queries/analytics';

function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

export function AnalyticsExportButton({ analytics }: { analytics: OrgAnalytics }) {
  function handleExport() {
    const rows: (string | number)[][] = [
      ['Metric', 'Value'],
      ['Total candidates', analytics.kpis.totalCandidates],
      ['Active interviews', analytics.kpis.activeInterviews],
      ['Completed interviews', analytics.kpis.completedInterviews],
      ['Shortlisted', analytics.kpis.shortlisted],
      ['Rejected', analytics.kpis.rejected],
      ['Hired', analytics.kpis.hired],
      ['Average evaluation score', analytics.kpis.averageEvaluationScore ?? 'N/A'],
      ['Selection rate (%)', analytics.kpis.selectionRate.toFixed(1)],
      ['Interview completion rate (%)', analytics.kpis.interviewCompletionRate.toFixed(1)],
      [],
      ['Job', 'Candidates', 'Average score', 'Completion rate (%)'],
      ...analytics.jobWisePerformance.map((j) => [j.jobTitle, j.candidates, j.averageScore ?? 'N/A', j.completionRate]),
    ];

    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recruitment-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
      <Download className="h-3.5 w-3.5" />
      Export report
    </Button>
  );
}
