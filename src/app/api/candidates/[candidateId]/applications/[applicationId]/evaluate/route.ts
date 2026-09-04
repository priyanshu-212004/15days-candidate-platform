import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  requireOrgMember,
  assertOwnership,
  writeAuditLog,
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/authz';
import { evaluateApplication } from '@/lib/ai-evaluation';
import { AiConfigError, AiGenerationError } from '@/lib/ai';

interface Params {
  params: { candidateId: string; applicationId: string };
}

export async function POST(_req: Request, { params }: Params) {
  try {
    const { orgId, session } = await requireOrgMember('RECRUITER');

    const application = await db.application.findUnique({
      where: { id: params.applicationId },
      include: {
        candidate: { select: { id: true, name: true } },
        job: { select: { title: true } },
        interview: { select: { questions: { orderBy: { order: 'asc' } } } },
        videoResponses: true,
        evaluation: true,
      },
    });
    if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    assertOwnership(application.orgId, orgId);
    if (application.candidateId !== params.candidateId) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    if (application.status !== 'SUBMITTED' && application.status !== 'EVALUATED') {
      return NextResponse.json({ error: 'This interview has not been submitted yet.' }, { status: 409 });
    }

    const responseByQuestion = new Map(application.videoResponses.map((r) => [r.questionId, r]));

    let result;
    try {
      result = await evaluateApplication({
        jobTitle: application.job.title,
        candidateName: application.candidate.name,
        answers: application.interview.questions.map((q) => {
          const r = responseByQuestion.get(q.id);
          return {
            questionText: q.text,
            answerText: r?.answerText ?? r?.transcript ?? null,
            hasRecordingWithoutTranscript: !!r?.storageKey && !r?.transcript,
          };
        }),
      });
    } catch (err) {
      if (err instanceof AiConfigError) {
        return NextResponse.json({ error: 'AI evaluation is not configured for this environment.' }, { status: 503 });
      }
      if (err instanceof AiGenerationError) {
        console.error('[api/candidates evaluate]', err.message);
        return NextResponse.json({ error: 'AI evaluation failed. Please try again.' }, { status: 502 });
      }
      throw err;
    }

    const evaluation = await db.evaluation.upsert({
      where: { applicationId: application.id },
      update: {
        overallScore: result.overallScore,
        summary: result.summary,
        strengths: result.strengths,
        concerns: result.concerns,
        modelName: process.env.AI_PROVIDER ?? 'unknown',
        modelVersion: process.env.AI_MODEL ?? 'default',
        promptVersion: '1.0.0',
        status: 'COMPLETED',
        scores: { deleteMany: {}, create: result.scores.map((s) => ({ category: s.category, score: s.score, rationale: s.rationale })) },
      },
      create: {
        applicationId: application.id,
        overallScore: result.overallScore,
        summary: result.summary,
        strengths: result.strengths,
        concerns: result.concerns,
        modelName: process.env.AI_PROVIDER ?? 'unknown',
        modelVersion: process.env.AI_MODEL ?? 'default',
        promptVersion: '1.0.0',
        status: 'COMPLETED',
        scores: { create: result.scores.map((s) => ({ category: s.category, score: s.score, rationale: s.rationale })) },
      },
      include: { scores: true },
    });

    if (application.status === 'SUBMITTED') {
      await db.application.update({ where: { id: application.id }, data: { status: 'EVALUATED' } });
    }

    await writeAuditLog({
      orgId,
      userId: session.user.id,
      action: 'APPLICATION_EVALUATED',
      resourceType: 'Application',
      resourceId: application.id,
    });

    return NextResponse.json({ evaluation });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidates evaluate POST]', err);
    return NextResponse.json({ error: 'Failed to run evaluation' }, { status: 500 });
  }
}
