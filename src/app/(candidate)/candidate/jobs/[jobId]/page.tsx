import { redirect, notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { getMarketplaceJobById, findEligibleInterviewForJob } from '@/lib/queries/candidate-jobs';
import { evaluateInterviewAvailability } from '@/lib/interview-availability';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ApplyButton } from '@/components/candidate/apply-button';
import { MapPin, Briefcase, Building2 } from 'lucide-react';

const EMPLOYMENT_LABELS: Record<string, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  INTERNSHIP: 'Internship',
};

export default async function CandidateJobDetailPage({ params }: { params: { jobId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.userType !== 'CANDIDATE') redirect('/login');

  const job = await getMarketplaceJobById(params.jobId);
  if (!job) notFound();

  const interview = await findEligibleInterviewForJob(job.id);
  const availability = evaluateInterviewAvailability(
    interview
      ? {
          status: interview.status,
          expiresAt: interview.expiresAt,
          questionCount: interview.questions.length,
          interviewType: interview.interviewType,
          hasBlueprint: !!interview.blueprint,
        }
      : null
  );

  const candidate = await db.candidate.findFirst({
    where: { orgId: job.orgId, userId: session.user.id },
    select: { id: true },
  });
  const existingApplication = candidate
    ? await db.application.findFirst({
        where: { orgId: job.orgId, jobId: job.id, candidateId: candidate.id },
        select: { id: true },
      })
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Building2 className="h-4 w-4" /> {job.org.name}
          </p>
        </div>
        <ApplyButton
          jobId={job.id}
          canApply={availability.available && !existingApplication}
          alreadyApplied={!!existingApplication}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{EMPLOYMENT_LABELS[job.employmentType] ?? job.employmentType}</Badge>
        {job.location && (
          <Badge variant="outline" className="gap-1">
            <MapPin className="h-3 w-3" /> {job.location}
            {job.remote && ' · Remote'}
          </Badge>
        )}
        {job.experienceLevel && (
          <Badge variant="outline" className="gap-1">
            <Briefcase className="h-3 w-3" /> {job.experienceLevel}
          </Badge>
        )}
      </div>

      <Card>
        <CardContent className="prose prose-sm max-w-none space-y-4 p-5 dark:prose-invert">
          <div>
            <h2 className="mb-1 text-base font-semibold">About this role</h2>
            <p className="whitespace-pre-wrap text-sm">{job.description}</p>
          </div>
          {job.requirements.length > 0 && (
            <div>
              <h2 className="mb-1 text-base font-semibold">Requirements</h2>
              <ul className="list-inside list-disc text-sm">
                {job.requirements.map((r: string) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {job.skills.length > 0 && (
            <div>
              <h2 className="mb-1 text-base font-semibold">Skills</h2>
              <div className="flex flex-wrap gap-1.5">
                {job.skills.map((s: string) => (
                  <span key={s} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
