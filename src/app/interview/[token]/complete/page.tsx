import { redirect } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { resolveCandidateSession } from '@/lib/queries/candidate-session';
import { Card, CardContent } from '@/components/ui/card';

interface PageProps {
  params: { token: string };
}

export default async function InterviewCompletePage({ params }: PageProps) {
  const application = await resolveCandidateSession(params.token);

  if (!application) {
    redirect(`/interview/${params.token}`);
  }
  if (application.status !== 'SUBMITTED' && application.status !== 'EVALUATED') {
    // Not actually submitted yet — send them back into the flow rather than
    // showing a false completion state.
    redirect(`/interview/${params.token}/session`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken px-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold">Thank you, {application.candidate.name.split(' ')[0]}.</h1>
          <p className="text-sm text-muted-foreground">
            Your interview has been submitted successfully. The hiring team will follow up with you if there&apos;s
            a match.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
