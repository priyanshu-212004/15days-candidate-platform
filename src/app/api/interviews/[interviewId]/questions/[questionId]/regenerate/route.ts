import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireOrgMember, assertOwnership, writeAuditLog, UnauthorizedError, ForbiddenError } from '@/lib/authz';
import { generateInterviewQuestions, AiConfigError, AiGenerationError } from '@/lib/ai';

interface Params {
  params: { interviewId: string; questionId: string };
}

export async function POST(_req: Request, { params }: Params) {
  try {
    const { orgId, session } = await requireOrgMember('RECRUITER');

    const question = await db.interviewQuestion.findUnique({
      where: { id: params.questionId },
      include: { interview: { include: { job: true } } },
    });
    if (!question || question.interviewId !== params.interviewId) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }
    assertOwnership(question.interview.orgId, orgId);
    if (question.interview.status !== 'DRAFT') {
      return NextResponse.json({ error: 'Questions can only be regenerated while the interview is a draft' }, { status: 409 });
    }

    let generated;
    try {
      generated = await generateInterviewQuestions({
        jobTitle: question.interview.job.title,
        jobDescription: question.interview.job.description,
        requirements: question.interview.job.requirements,
        skills: question.interview.job.skills,
        experienceLevel: question.interview.job.experienceLevel,
        questionCount: 1,
        focusAreas: question.category ? [question.category] : undefined,
      });
    } catch (err) {
      if (err instanceof AiConfigError) {
        return NextResponse.json(
          { error: 'AI question generation is not configured yet. Set AI_PROVIDER and the matching API key.' },
          { status: 503 }
        );
      }
      if (err instanceof AiGenerationError) {
        console.error('[regenerate-question] AI generation failed:', err.message);
        return NextResponse.json({ error: 'The AI provider returned an unusable response. Please try again.' }, { status: 502 });
      }
      throw err;
    }

    const replacement = generated[0];
    if (!replacement) {
      return NextResponse.json({ error: 'AI did not return a replacement question' }, { status: 502 });
    }

    const updated = await db.interviewQuestion.update({
      where: { id: question.id },
      data: {
        text: replacement.text,
        type: replacement.type,
        category: replacement.category || null,
        difficulty: replacement.difficulty,
        expectedDurationSec: replacement.expectedDurationSec,
        evaluationCriteria: replacement.evaluationCriteria,
        aiGenerated: true,
      },
    });

    await writeAuditLog({
      orgId,
      userId: session.user.id,
      action: 'QUESTION_UPDATED',
      resourceType: 'InterviewQuestion',
      resourceId: updated.id,
      metadata: { action: 'regenerated' },
    });

    return NextResponse.json({ question: updated });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/interviews/:id/questions/:qid/regenerate POST]', err);
    return NextResponse.json({ error: 'Failed to regenerate question' }, { status: 500 });
  }
}
