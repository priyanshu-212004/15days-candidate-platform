import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveCandidateSession } from '@/lib/queries/candidate-session';
import { getPublicInterviewForSession } from '@/lib/queries/interviews';
import { computeProgress } from '@/lib/candidate-session';
import { isStorageConfigured } from '@/lib/storage';

interface Params {
  params: { token: string };
}

export async function GET(_req: Request, { params }: Params) {
  const application = await resolveCandidateSession(params.token);
  if (!application) {
    return NextResponse.json({ error: 'No active session. Please start the interview again.' }, { status: 401 });
  }

  const interview = await getPublicInterviewForSession(params.token);
  if (!interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });

  const responses = await db.videoResponse.findMany({
    where: { applicationId: application.id },
    select: { questionId: true, answerType: true, answerText: true, storageKey: true },
  });
  const answeredMap = new Map(responses.map((r) => [r.questionId, r]));

  const resume = await db.resume.findUnique({
    where: { applicationId: application.id },
    select: { fileName: true, parseStatus: true, parseError: true },
  });

  const questionIds = interview.questions.map((q) => q.id);
  const progress = computeProgress(
    questionIds,
    questionIds.map((id) => ({ questionId: id, answered: answeredMap.has(id) }))
  );

  return NextResponse.json({
    status: application.status,
    candidateName: application.candidate.name,
    interviewTitle: interview.title,
    jobTitle: interview.job.title,
    recordingEnabled: isStorageConfigured(),
    requireCv: interview.requireCv,
    resume: resume
      ? { fileName: resume.fileName, parseStatus: resume.parseStatus, parseError: resume.parseError }
      : null,
    progress,
    questions: interview.questions.map((q) => {
      const existing = answeredMap.get(q.id);
      return {
        id: q.id,
        text: q.text,
        type: q.type,
        order: q.order,
        expectedDurationSec: q.expectedDurationSec,
        // Recruiter-chosen requirement — fixed, never candidate-selectable.
        requiredAnswerType: q.answerType,
        answered: !!existing,
        answerType: existing?.answerType ?? null,
        answerText: existing?.answerText ?? null,
        hasRecording: !!existing?.storageKey,
      };
    }),
  });
}
