import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import {
  requireOrgMember,
  assertOwnership,
  writeAuditLog,
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/authz';
import { generateQuestionsRequestSchema } from '@/lib/validations/interview';
import { generateInterviewQuestions, AiConfigError, AiGenerationError } from '@/lib/ai';

interface Params {
  params: { interviewId: string };
}

export async function POST(req: Request, { params }: Params) {
  try {
    const { orgId, session } = await requireOrgMember('RECRUITER');

    const interview = await db.interview.findUnique({
      where: { id: params.interviewId },
      include: { job: true },
    });
    if (!interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
    assertOwnership(interview.orgId, orgId);

    if (interview.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'Questions can only be regenerated while the interview is still a draft' },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = generateQuestionsRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }
    const { questionCount, focusAreas } = parsed.data;

    let questions;
    try {
      questions = await generateInterviewQuestions({
        jobTitle: interview.job.title,
        jobDescription: interview.job.description,
        requirements: interview.job.requirements,
        skills: interview.job.skills,
        experienceLevel: interview.job.experienceLevel,
        questionCount,
        focusAreas,
      });
    } catch (err) {
      if (err instanceof AiConfigError) {
        return NextResponse.json(
          { error: 'AI question generation is not configured yet. Set AI_PROVIDER and the matching API key to enable it.' },
          { status: 503 }
        );
      }
      if (err instanceof AiGenerationError) {
        console.error('[generate-questions] AI generation failed:', err.message);
        return NextResponse.json(
          { error: 'The AI provider returned an unusable response. Please try again.' },
          { status: 502 }
        );
      }
      throw err;
    }

    // Replace any previously generated questions atomically — a partial
    // write here would leave the interview with a mismatched question set.
    const created = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.interviewQuestion.deleteMany({ where: { interviewId: interview.id } });
      await tx.interviewQuestion.createMany({
        data: questions.map((q, index) => ({
          interviewId: interview.id,
          text: q.text,
          type: q.type,
          category: q.category || null,
          difficulty: q.difficulty,
          expectedDurationSec: q.expectedDurationSec,
          evaluationCriteria: q.evaluationCriteria,
          order: index,
          aiGenerated: true,
        })),
      });
      return tx.interviewQuestion.findMany({
        where: { interviewId: interview.id },
        orderBy: { order: 'asc' },
      });
    });

    await writeAuditLog({
      orgId,
      userId: session.user.id,
      action: 'QUESTIONS_GENERATED',
      resourceType: 'Interview',
      resourceId: interview.id,
      metadata: { count: created.length },
    });

    return NextResponse.json({ questions: created });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/interviews/:id/generate-questions POST]', err);
    return NextResponse.json({ error: 'Failed to generate questions' }, { status: 500 });
  }
}
