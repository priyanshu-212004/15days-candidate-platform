import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  requireOrgMember,
  assertOwnership,
  writeAuditLog,
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/authz';
import { blueprintInputSchema } from '@/lib/validations/interview';

interface Params {
  params: { interviewId: string };
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { orgId } = await requireOrgMember('VIEWER');
    const interview = await db.interview.findUnique({
      where: { id: params.interviewId },
      include: { blueprint: true },
    });
    if (!interview) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
    assertOwnership(interview.orgId, orgId);
    return NextResponse.json({ blueprint: interview.blueprint });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/interviews/:id/blueprint GET]', err);
    return NextResponse.json({ error: 'Failed to load blueprint' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const { orgId, session } = await requireOrgMember('RECRUITER');

    const interview = await db.interview.findUnique({ where: { id: params.interviewId } });
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
        { error: 'The blueprint can only be edited while the interview is still a draft' },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = blueprintInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }
    const data = parsed.data;

    const totalWeight = data.evaluationAreas.reduce((sum, a) => sum + a.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      return NextResponse.json(
        { error: `Evaluation area weights must sum to 100 (currently ${totalWeight}).` },
        { status: 422 }
      );
    }
    if (data.durationMinMin > data.durationTargetMin || data.durationTargetMin > data.durationMaxMin) {
      return NextResponse.json(
        { error: 'Duration settings must satisfy minimum ≤ target ≤ maximum.' },
        { status: 422 }
      );
    }

    const blueprint = await db.interviewBlueprint.upsert({
      where: { interviewId: interview.id },
      update: {
        durationTargetMin: data.durationTargetMin,
        durationMinMin: data.durationMinMin,
        durationMaxMin: data.durationMaxMin,
        graceSeconds: data.graceSeconds,
        maxFollowUpsPerTopic: data.maxFollowUpsPerTopic,
        evaluationAreas: data.evaluationAreas,
      },
      create: {
        interviewId: interview.id,
        durationTargetMin: data.durationTargetMin,
        durationMinMin: data.durationMinMin,
        durationMaxMin: data.durationMaxMin,
        graceSeconds: data.graceSeconds,
        maxFollowUpsPerTopic: data.maxFollowUpsPerTopic,
        evaluationAreas: data.evaluationAreas,
      },
    });

    await writeAuditLog({
      orgId,
      userId: session.user.id,
      action: 'BLUEPRINT_SAVED',
      resourceType: 'Interview',
      resourceId: interview.id,
      metadata: { areaCount: data.evaluationAreas.length },
    });

    return NextResponse.json({ blueprint });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/interviews/:id/blueprint PUT]', err);
    return NextResponse.json({ error: 'Failed to save blueprint' }, { status: 500 });
  }
}
