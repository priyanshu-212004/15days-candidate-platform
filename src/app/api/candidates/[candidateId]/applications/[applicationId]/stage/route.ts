import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  requireOrgMember,
  assertOwnership,
  writeAuditLog,
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/authz';
import { stageChangeSchema } from '@/lib/validations/pipeline';

interface Params {
  params: { candidateId: string; applicationId: string };
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { orgId, session } = await requireOrgMember('RECRUITER');

    const application = await db.application.findUnique({
      where: { id: params.applicationId },
      include: { currentStage: { select: { id: true, name: true } } },
    });
    if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    assertOwnership(application.orgId, orgId);
    if (application.candidateId !== params.candidateId) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    const parsed = stageChangeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: parsed.error.flatten().fieldErrors },
        { status: 422 }
      );
    }

    // Re-check the target stage against the DB rather than trusting the
    // client — this is the same "never trust a client-supplied ID" rule
    // used everywhere else, and it also prevents moving a candidate to a
    // stage that belongs to a different organization.
    const targetStage = await db.pipelineStage.findUnique({ where: { id: parsed.data.stageId } });
    if (!targetStage || targetStage.orgId !== orgId) {
      return NextResponse.json({ error: 'That pipeline stage does not exist' }, { status: 422 });
    }

    if (targetStage.id === application.currentStageId) {
      return NextResponse.json({ application, unchanged: true });
    }

    const [updated] = await db.$transaction([
      db.application.update({
        where: { id: application.id },
        data: { currentStageId: targetStage.id },
        include: { currentStage: { select: { id: true, name: true } } },
      }),
      db.candidateStageHistory.create({
        data: {
          applicationId: application.id,
          stageId: targetStage.id,
          movedById: session.user.id,
          note: parsed.data.note ?? null,
        },
      }),
    ]);

    await writeAuditLog({
      orgId,
      userId: session.user.id,
      action: 'PIPELINE_STAGE_CHANGED',
      resourceType: 'Application',
      resourceId: application.id,
      metadata: {
        candidateId: params.candidateId,
        fromStage: application.currentStage?.name ?? null,
        toStage: targetStage.name,
      },
    });

    return NextResponse.json({ application: updated });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidates/:id/applications/:id/stage PATCH]', err);
    return NextResponse.json({ error: 'Failed to update pipeline stage' }, { status: 500 });
  }
}
