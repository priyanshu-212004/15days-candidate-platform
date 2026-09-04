import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCandidateSession, UnauthorizedError, ForbiddenError } from '@/lib/authz';
import { resumeCompleteSchema } from '@/lib/validations/candidate';
import {
  headObject,
  getObjectBuffer,
  buildCandidateResumeKey,
  isAllowedResumeMimeType,
  isAllowedResumeExtension,
  MAX_RESUME_BYTES,
} from '@/lib/storage';
import { extractResumeText } from '@/lib/resume-extraction';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(req: Request) {
  try {
    const rate = await checkRateLimit({
      bucket: 'candidate-profile-resume-complete',
      identifier: getClientIp(req),
      limit: 20,
      windowSec: 60,
    });
    if (!rate.allowed) return rateLimitResponse(rate);

    const { session, profile } = await requireCandidateSession();

    const body = await req.json().catch(() => null);
    const parsed = resumeCompleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 422 });
    }
    const { storageKey, fileName, mimeType, sizeBytes } = parsed.data;

    if (!isAllowedResumeMimeType(mimeType) || !isAllowedResumeExtension(fileName)) {
      return NextResponse.json({ error: 'Please upload a PDF, DOC, or DOCX file.' }, { status: 415 });
    }
    if (sizeBytes > MAX_RESUME_BYTES) {
      return NextResponse.json({ error: 'Resume is too large — the limit is 10MB.' }, { status: 413 });
    }

    // Defense in depth: the key must be the exact one this session would
    // have been issued — a candidate can't point this at another
    // candidate's (or an application's) storage key.
    const expectedKey = buildCandidateResumeKey({
      userId: session.user.id,
      ext: mimeType === 'application/pdf' ? 'pdf' : mimeType.includes('openxmlformats') ? 'docx' : 'doc',
    });
    if (storageKey !== expectedKey) {
      return NextResponse.json({ error: 'Storage key does not match this account' }, { status: 403 });
    }

    const head = await headObject(storageKey);
    if (!head.exists) {
      return NextResponse.json(
        { error: 'We could not verify the upload finished. Please try again.' },
        { status: 422 }
      );
    }

    // Store metadata first (PROCESSING) so the upload record is never lost
    // even if extraction below throws — mirrors the existing application
    // resume complete route's approach.
    await db.candidateProfile.update({
      where: { id: profile.id },
      data: {
        resumeStorageKey: storageKey,
        resumeFileName: fileName,
        resumeMimeType: mimeType,
        resumeSizeBytes: head.sizeBytes || sizeBytes,
        resumeParseStatus: 'PROCESSING',
        resumeParsedText: null,
        resumeParseError: null,
      },
    });

    const buffer = await getObjectBuffer(storageKey);
    if (!buffer) {
      const failed = await db.candidateProfile.update({
        where: { id: profile.id },
        data: { resumeParseStatus: 'FAILED', resumeParseError: 'The uploaded file could not be read from storage.' },
      });
      return NextResponse.json({
        resume: {
          fileName: failed.resumeFileName,
          parseStatus: failed.resumeParseStatus,
          parseError: failed.resumeParseError,
        },
      });
    }

    const extraction = await extractResumeText({ buffer, mimeType });
    const updated = await db.candidateProfile.update({
      where: { id: profile.id },
      data:
        extraction.status === 'COMPLETED'
          ? { resumeParseStatus: 'COMPLETED', resumeParsedText: extraction.text, resumeParseError: null }
          : { resumeParseStatus: 'FAILED', resumeParseError: extraction.error },
    });

    return NextResponse.json({
      resume: {
        fileName: updated.resumeFileName,
        parseStatus: updated.resumeParseStatus,
        parseError: updated.resumeParseError,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidate/profile/resume/complete POST]', err);
    return NextResponse.json({ error: 'Failed to process resume' }, { status: 500 });
  }
}
