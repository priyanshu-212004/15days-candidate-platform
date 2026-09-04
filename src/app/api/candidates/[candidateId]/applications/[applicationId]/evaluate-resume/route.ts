import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  requireOrgMember,
  assertOwnership,
  writeAuditLog,
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/authz';
import { evaluateResume } from '@/lib/ai-evaluation';
import { AiConfigError, AiGenerationError } from '@/lib/ai';

interface Params {
  params: { candidateId: string; applicationId: string };
}

/**
 * Recruiter-triggered resume evaluation — mirrors the existing
 * .../evaluate route's pattern for interview answers. Kept as an explicit,
 * recruiter-initiated action (not automatic on upload) because it's a real
 * external AI call: running it inline during the candidate's upload would
 * either block their request on network latency they have no reason to
 * wait on, or require a background-job queue this project doesn't have.
 * A resume can be evaluated as soon as extraction succeeds — it doesn't
 * require the application to be SUBMITTED, unlike interview-answer
 * evaluation.
 */
export async function POST(_req: Request, { params }: Params) {
  try {
    const { orgId, session } = await requireOrgMember('RECRUITER');

    const application = await db.application.findUnique({
      where: { id: params.applicationId },
      include: {
        candidate: { select: { id: true, name: true } },
        job: { select: { title: true, description: true, requirements: true, skills: true, experienceLevel: true } },
        resume: true,
      },
    });
    if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    assertOwnership(application.orgId, orgId);
    if (application.candidateId !== params.candidateId) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    if (!application.resume) {
      return NextResponse.json({ error: 'No resume has been uploaded for this candidate.' }, { status: 409 });
    }
    if (application.resume.parseStatus !== 'COMPLETED' || !application.resume.parsedText) {
      return NextResponse.json(
        {
          error:
            application.resume.parseStatus === 'FAILED'
              ? `Resume text could not be extracted: ${application.resume.parseError ?? 'unknown error'}`
              : 'Resume text extraction has not completed yet.',
        },
        { status: 409 }
      );
    }

    let result;
    try {
      result = await evaluateResume({
        jobTitle: application.job.title,
        jobDescription: application.job.description,
        requirements: application.job.requirements,
        skills: application.job.skills,
        experienceLevel: application.job.experienceLevel,
        candidateName: application.candidate.name,
        resumeText: application.resume.parsedText,
      });
    } catch (err) {
      if (err instanceof AiConfigError) {
        return NextResponse.json({ error: 'AI evaluation is not configured for this environment.' }, { status: 503 });
      }
      if (err instanceof AiGenerationError) {
        console.error('[api/candidates evaluate-resume]', err.message);
        return NextResponse.json({ error: 'AI evaluation failed. Please try again.' }, { status: 502 });
      }
      throw err;
    }

    const evaluation = await db.resumeEvaluation.upsert({
      where: { resumeId: application.resume.id },
      update: {
        overallScore: result.overallScore,
        skillsMatchScore: result.skillsMatchScore,
        experienceMatchScore: result.experienceMatchScore,
        relevanceScore: result.relevanceScore,
        strengths: result.strengths,
        missingSkills: result.missingSkills,
        concerns: result.concerns,
        recommendation: result.recommendation,
        summary: result.summary,
        modelName: process.env.AI_PROVIDER ?? 'unknown',
        modelVersion: process.env.AI_MODEL ?? 'default',
        promptVersion: '1.0.0',
        status: 'COMPLETED',
      },
      create: {
        resumeId: application.resume.id,
        overallScore: result.overallScore,
        skillsMatchScore: result.skillsMatchScore,
        experienceMatchScore: result.experienceMatchScore,
        relevanceScore: result.relevanceScore,
        strengths: result.strengths,
        missingSkills: result.missingSkills,
        concerns: result.concerns,
        recommendation: result.recommendation,
        summary: result.summary,
        modelName: process.env.AI_PROVIDER ?? 'unknown',
        modelVersion: process.env.AI_MODEL ?? 'default',
        promptVersion: '1.0.0',
        status: 'COMPLETED',
      },
    });

    await writeAuditLog({
      orgId,
      userId: session.user.id,
      action: 'RESUME_EVALUATED',
      resourceType: 'Application',
      resourceId: application.id,
    });

    return NextResponse.json({ resumeEvaluation: evaluation });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidates evaluate-resume POST]', err);
    return NextResponse.json({ error: 'Failed to run resume evaluation' }, { status: 500 });
  }
}
