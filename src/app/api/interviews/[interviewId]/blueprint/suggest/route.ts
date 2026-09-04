import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  requireOrgMember,
  assertOwnership,
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/authz';
import { suggestBlueprint, AiConfigError, AiGenerationError } from '@/lib/interview-engine';

interface Params {
  params: { interviewId: string };
}

export async function POST(_req: Request, { params }: Params) {
  try {
    const { orgId } = await requireOrgMember('RECRUITER');

    const interview = await db.interview.findUnique({
      where: { id: params.interviewId },
      include: { job: true },
    });
    if (!interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
    assertOwnership(interview.orgId, orgId);

    if (interview.interviewType !== 'ADAPTIVE_VOICE') {
      return NextResponse.json(
        { error: 'This interview is not set up as an adaptive voice interview.' },
        { status: 409 }
      );
    }
    if (interview.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'The blueprint can only be regenerated while the interview is still a draft' },
        { status: 409 }
      );
    }

    let evaluationAreas;
    try {
      evaluationAreas = await suggestBlueprint(
        {
          jobTitle: interview.job.title,
          jobDescription: interview.job.description,
          requirements: interview.job.requirements,
          skills: interview.job.skills,
          experienceLevel: interview.job.experienceLevel,
        },
        interview.id
      );
    } catch (err) {
      if (err instanceof AiConfigError) {
        return NextResponse.json(
          { error: 'AI blueprint suggestion is not configured yet. Set AI_PROVIDER and the matching API key to enable it.' },
          { status: 503 }
        );
      }
      if (err instanceof AiGenerationError) {
        console.error('[blueprint/suggest] AI generation failed:', err.message);
        return NextResponse.json(
          { error: 'The AI provider returned an unusable response. Please try again.' },
          { status: 502 }
        );
      }
      throw err;
    }

    return NextResponse.json({ evaluationAreas });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/interviews/:id/blueprint/suggest POST]', err);
    return NextResponse.json({ error: 'Failed to suggest a blueprint' }, { status: 500 });
  }
}
