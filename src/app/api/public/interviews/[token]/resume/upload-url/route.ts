import { NextResponse } from 'next/server';
import { resolveCandidateSession } from '@/lib/queries/candidate-session';
import { canModifySession } from '@/lib/candidate-session';
import { resumeUploadUrlRequestSchema } from '@/lib/validations/candidate';
import {
  isStorageConfigured,
  isAllowedResumeMimeType,
  isAllowedResumeExtension,
  buildResumeKey,
  createUploadUrl,
  RESUME_EXTENSION_BY_MIME_TYPE,
  MAX_RESUME_BYTES,
} from '@/lib/storage';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

interface Params {
  params: { token: string };
}

export async function POST(req: Request, { params }: Params) {
  const rate = await checkRateLimit({
    bucket: 'candidate-resume-upload-url',
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

  const application = await resolveCandidateSession(params.token);
  if (!application) {
    return NextResponse.json({ error: 'No active session. Please start the interview again.' }, { status: 401 });
  }
  if (!canModifySession(application.status)) {
    return NextResponse.json({ error: 'This interview has already been submitted and cannot be changed.' }, { status: 409 });
  }

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

  const key = buildResumeKey({
    orgId: application.orgId,
    applicationId: application.id,
    ext: RESUME_EXTENSION_BY_MIME_TYPE[mimeType] ?? 'pdf',
  });

  const upload = await createUploadUrl({ key, mimeType, maxBytes: sizeBytes });
  return NextResponse.json(upload);
}
