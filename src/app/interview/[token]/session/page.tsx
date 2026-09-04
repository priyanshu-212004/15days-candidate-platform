import { redirect } from 'next/navigation';
import { resolveCandidateSession } from '@/lib/queries/candidate-session';
import { InterviewRunner } from '@/components/candidate/interview-runner';
import { VoiceInterviewRunner } from '@/components/candidate/voice/voice-interview-runner';

interface PageProps {
  params: { token: string };
}

export default async function InterviewSessionPage({ params }: PageProps) {
  const application = await resolveCandidateSession(params.token);

  if (!application) {
    redirect(`/interview/${params.token}`);
  }
  if (application.status === 'SUBMITTED' || application.status === 'EVALUATED') {
    redirect(`/interview/${params.token}/complete`);
  }

  if (application.interview.interviewType === 'ADAPTIVE_VOICE') {
    return (
      <div className="min-h-screen bg-surface-sunken px-4 py-10">
        <VoiceInterviewRunner token={params.token} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-sunken px-4 py-10">
      <InterviewRunner token={params.token} />
    </div>
  );
}
