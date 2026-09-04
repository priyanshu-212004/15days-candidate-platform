import { NextResponse } from 'next/server';
import { requireCandidateSession, UnauthorizedError, ForbiddenError } from '@/lib/authz';
import { resumeUploadUrlRequestSchema } from '@/lib/validations/candidate';
import {
  isStorageConfigured,
  isAllowedResumeMimeType,
  isAllowedResumeExtension,
  buildCandidateResumeKey,
  createUploadUrl,
  RESUME_EXTENSION_BY_MIME_TYPE,
  MAX_RESUME_BYTES,
} from '@/lib/storage';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export async function POST(req: Request) {
  try {
    const rate = await checkRateLimit({
      bucket: 'candidate-profile-resume-upload-url',
      identifier: getClientIp(req),
      limit: 20,
      windowSec: 60,
    });
    if (!rate.allowed) return rateLimitResponse(rate);

    if (!isStorageConfigured()) {
      return NextResponse.json(
        { error: 'Resume upload is not enabled for this environment yet.' },
        { status: 501 }
      );
    }

    const { session } = await requireCandidateSession();

    const body = await req.json().catch(() => null);
    const parsed = resumeUploadUrlRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid upload request' }, { status: 422 });
    }
    const { fileName, mimeType, sizeBytes } = parsed.data;

    if (!isAllowedResumeMimeType(mimeType) || !isAllowedResumeExtension(fileName)) {
      return NextResponse.json({ error: 'Please upload a PDF, DOC, or DOCX file.' }, { status: 415 });
    }
    if (sizeBytes > MAX_RESUME_BYTES) {
      return NextResponse.json({ error: 'Resume is too large — the limit is 10MB.' }, { status: 413 });
    }

    const key = buildCandidateResumeKey({
      userId: session.user.id,
      ext: RESUME_EXTENSION_BY_MIME_TYPE[mimeType] ?? 'pdf',
    });

    const upload = await createUploadUrl({ key, mimeType, maxBytes: sizeBytes });
    return NextResponse.json(upload);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidate/profile/resume/upload-url POST]', err);
    return NextResponse.json({ error: 'Failed to create upload URL' }, { status: 500 });
  }
}
