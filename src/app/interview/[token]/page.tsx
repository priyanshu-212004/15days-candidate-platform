import Link from 'next/link';
import { AlertCircle, Clock3, Globe2, ListChecks, ShieldAlert, TimerOff } from 'lucide-react';
import { getPublicInterviewByToken } from '@/lib/queries/interviews';
import { evaluateInterviewAvailability } from '@/lib/interview-availability';
import { Card, CardContent } from '@/components/ui/card';
import { CandidateEntryForm } from '@/components/candidate/candidate-entry-form';

interface PageProps {
  params: { token: string };
}

function UnavailableState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken px-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            {icon}
          </div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
          <Link href="/" className="mt-2 text-xs font-medium text-primary hover:underline">
            Go to 15days.io
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

const UNAVAILABLE_COPY = {
  NOT_FOUND: {
    icon: <AlertCircle className="h-6 w-6" />,
    title: 'Interview unavailable',
    description: "We couldn't find an interview at this link. Double-check the URL your recruiter shared with you.",
  },
  EXPIRED: {
    icon: <TimerOff className="h-6 w-6" />,
    title: 'Interview expired',
    description: 'This interview link is no longer active. Please reach out to the recruiter who sent it to you for next steps.',
  },
  INACTIVE: {
    icon: <ShieldAlert className="h-6 w-6" />,
    title: 'Interview no longer accepting responses',
    description: 'This interview has been paused by the hiring team. Please reach out to them if you believe this is a mistake.',
  },
  NO_QUESTIONS: {
    icon: <ListChecks className="h-6 w-6" />,
    title: "Interview isn't ready yet",
    description: "The hiring team hasn't finished setting up this interview. Please check back soon.",
  },
  NO_BLUEPRINT: {
    icon: <ListChecks className="h-6 w-6" />,
    title: "Interview isn't ready yet",
    description: "The hiring team hasn't finished setting up this interview. Please check back soon.",
  },
} as const;

export default async function PublicInterviewPage({ params }: PageProps) {
  const interview = await getPublicInterviewByToken(params.token);
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

  if (!availability.available) {
    const copy = UNAVAILABLE_COPY[availability.reason];
    return <UnavailableState icon={copy.icon} title={copy.title} description={copy.description} />;
  }

  const safeInterview = interview!;
  const isAdaptive = safeInterview.interviewType === 'ADAPTIVE_VOICE';
  const totalMinutes = isAdaptive
    ? null
    : Math.max(
        1,
        Math.round(
          safeInterview.questions.reduce(
            (sum: number, q: (typeof safeInterview.questions)[number]) => sum + q.expectedDurationSec,
            0
          ) / 60
        )
      );

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken px-4 py-12">
      <Card className="w-full max-w-lg">
        <CardContent className="space-y-6 p-8">
          <div className="space-y-1 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{safeInterview.job.title}</p>
            <h1 className="text-xl font-semibold">{safeInterview.title}</h1>
            {safeInterview.job.location && (
              <p className="text-sm text-muted-foreground">
                {safeInterview.job.location}
                {safeInterview.job.remote && ' · Remote'}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
            {isAdaptive ? (
              <div className="col-span-2 flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-muted-foreground" />
                A live, voice-based AI interview — about 20 minutes
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-muted-foreground" />
                  {safeInterview.questions.length} questions
                </div>
                <div className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-muted-foreground" />
                  ~{totalMinutes} min
                </div>
              </>
            )}
            <div className="col-span-2 flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-muted-foreground" />
              {safeInterview.languages.map((l: string) => l.toUpperCase()).join(', ')}
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <CandidateEntryForm token={params.token} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
