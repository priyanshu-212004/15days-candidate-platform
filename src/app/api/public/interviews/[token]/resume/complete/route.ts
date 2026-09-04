import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveCandidateSession } from '@/lib/queries/candidate-session';
import { canModifySession } from '@/lib/candidate-session';
import { resumeCompleteSchema } from '@/lib/validations/candidate';
import {
  headObject,
  getObjectBuffer,
  buildResumeKey,
  isAllowedResumeMimeType,
  isAllowedResumeExtension,
  MAX_RESUME_BYTES,
} from '@/lib/storage';
import { extractResumeText } from '@/lib/resume-extraction';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

interface Params {
  params: { token: string };
}

export async function POST(req: Request, { params }: Params) {
  const rate = await checkRateLimit({
    bucket: 'candidate-resume-complete',
    identifier: getClientIp(req),
    limit: 20,
    windowSec: 60,
  });
  if (!rate.allowed) return rateLimitResponse(rate);

  const application = await resolveCandidateSession(params.token);
  if (!application) {
    return NextResponse.json({ error: 'No active session. Please start the interview again.' }, { status: 401 });
  }
  if (!canModifySession(application.status)) {
    return NextResponse.json({ error: 'This interview has already been submitted and cannot be changed.' }, { status: 409 });
  }

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

  // Defense in depth: the key must actually be the one this session would
  // have been issued, not an arbitrary client-supplied string.
  const expectedPrefix = buildResumeKey({ orgId: application.orgId, applicationId: application.id, ext: 'x' }).replace(
    /\.x$/,
    '.'
  );
  if (!storageKey.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: 'Storage key does not match this session' }, { status: 403 });
  }

  const head = await headObject(storageKey);
  if (!head.exists) {
    return NextResponse.json(
      { error: 'We could not verify the upload finished. Please try again.' },
      { status: 422 }
    );
  }

  // A re-upload invalidates any prior evaluation of the old file — remove it
  // before writing new resume metadata rather than leaving a stale score
  // attached to a different file.
  const existing = await db.resume.findUnique({ where: { applicationId: application.id }, select: { id: true } });
  if (existing) {
    await db.resumeEvaluation.deleteMany({ where: { resumeId: existing.id } });
  }

  // Store metadata first (PROCESSING) so we never lose the upload record —
  // even if extraction below throws, the file and its metadata are saved.
  const resume = await db.resume.upsert({
    where: { applicationId: application.id },
    update: {
      storageKey,
      fileName,
      mimeType,
      sizeBytes: head.sizeBytes || sizeBytes,
      parseStatus: 'PROCESSING',
      parsedText: null,
      parseError: null,
    },
    create: {
      applicationId: application.id,
      storageKey,
      fileName,
      mimeType,
      sizeBytes: head.sizeBytes || sizeBytes,
      parseStatus: 'PROCESSING',
    },
  });

  // Extraction is local CPU-bound text parsing (not a network call), so it's
  // safe and fast enough to run inline rather than needing a queue.
  const buffer = await getObjectBuffer(storageKey);
  if (!buffer) {
    const failed = await db.resume.update({
      where: { id: resume.id },
      data: { parseStatus: 'FAILED', parseError: 'The uploaded file could not be read from storage.' },
    });
    return NextResponse.json({
      resume: { id: failed.id, fileName: failed.fileName, parseStatus: failed.parseStatus, parseError: failed.parseError },
    });
  }

  const extraction = await extractResumeText({ buffer, mimeType });
  const updated = await db.resume.update({
    where: { id: resume.id },
    data:
      extraction.status === 'COMPLETED'
        ? { parseStatus: 'COMPLETED', parsedText: extraction.text, parseError: null }
        : { parseStatus: 'FAILED', parseError: extraction.error },
  });

  return NextResponse.json({
    resume: {
      id: updated.id,
      fileName: updated.fileName,
      parseStatus: updated.parseStatus,
      parseError: updated.parseError,
    },
  });
}
