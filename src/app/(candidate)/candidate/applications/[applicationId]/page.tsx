import { redirect, notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { FileText } from 'lucide-react';

export default async function CandidateApplicationDetailPage({
  params,
}: {
  params: { applicationId: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.userType !== 'CANDIDATE') redirect('/login');

  const application = await db.application.findUnique({
    where: { id: params.applicationId },
    select: {
      id: true,
      status: true,
      createdAt: true,
      submittedAt: true,
      candidate: { select: { userId: true } },
      job: {
        select: {
          id: true,
          title: true,
          location: true,
          remote: true,
          employmentType: true,
          org: { select: { name: true } },
        },
      },
      currentStage: { select: { name: true } },
      interview: { select: { interviewType: true } },
      resume: { select: { fileName: true, parseStatus: true } },
      stageHistory: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, createdAt: true, stage: { select: { name: true } } },
      },
    },
  });

  // Ownership check — a mismatched or nonexistent id both 404 the same way.
  if (!application || application.candidate.userId !== session.user.id) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-16">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{application.job.title}</h1>
          <p className="text-sm text-muted-foreground">{application.job.org.name}</p>
        </div>
        <StatusBadge status={application.currentStage?.name ?? application.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Application</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Applied</p>
            <p>{application.createdAt.toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Location</p>
            <p>
              {application.job.location ?? '—'}
              {application.job.remote ? ' · Remote' : ''}
            </p>
          </div>
          {application.interview && (
            <div>
              <p className="text-xs text-muted-foreground">Interview type</p>
              <p>{application.interview.interviewType === 'ADAPTIVE_VOICE' ? 'Voice interview' : 'Standard interview'}</p>
            </div>
          )}
          {application.resume && (
            <div>
              <p className="text-xs text-muted-foreground">Resume</p>
              <p className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> {application.resume.fileName}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {application.stageHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {application.stageHistory.map((h: { id: string; createdAt: Date; stage: { name: string } }) => (
              <div key={h.id} className="flex items-center justify-between text-sm">
                <span>{h.stage.name}</span>
                <span className="text-xs text-muted-foreground">{h.createdAt.toLocaleDateString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
