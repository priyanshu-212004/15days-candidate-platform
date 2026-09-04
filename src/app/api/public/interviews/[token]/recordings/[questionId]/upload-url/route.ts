import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveCandidateSession } from '@/lib/queries/candidate-session';
import { canModifySession } from '@/lib/candidate-session';
import { uploadUrlRequestSchema } from '@/lib/validations/candidate';
import {
  isStorageConfigured,
  isAllowedRecordingMimeType,
  buildRecordingKey,
  createUploadUrl,
  MAX_RECORDING_BYTES,
} from '@/lib/storage';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

interface Params {
  params: { token: string; questionId: string };
}

const EXT_BY_MIME: Record<string, string> = {
  'video/webm': 'webm',
  'video/mp4': 'mp4',
  'audio/webm': 'webm',
};

export async function POST(req: Request, { params }: Params) {
  const rate = await checkRateLimit({
    bucket: 'candidate-upload-url',
    identifier: getClientIp(req),
    limit: 30,
    windowSec: 60,
  });
  if (!rate.allowed) return rateLimitResponse(rate);

  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: 'Video recording is not enabled for this interview yet. Please use the text answer instead.' },
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

  const question = await db.interviewQuestion.findFirst({
    where: { id: params.questionId, interviewId: application.interviewId },
    select: { id: true, answerType: true },
  });
  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 });

  // The recruiter chose the answer type for this question — never the
  // candidate. Reject a video upload for a question that requires text.
  if (question.answerType !== 'VIDEO') {
    return NextResponse.json(
      { error: 'This question requires a written answer, not a recording.' },
      { status: 422 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = uploadUrlRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid upload request' }, { status: 422 });
  }
  const { mimeType, sizeBytes } = parsed.data;

  if (!isAllowedRecordingMimeType(mimeType)) {
    return NextResponse.json({ error: 'Unsupported recording format' }, { status: 415 });
  }
  if (sizeBytes > MAX_RECORDING_BYTES) {
    return NextResponse.json({ error: 'Recording is too large' }, { status: 413 });
  }

  const key = buildRecordingKey({
    orgId: application.orgId,
    applicationId: application.id,
    questionId: params.questionId,
    ext: EXT_BY_MIME[mimeType] ?? 'webm',
  });

  const upload = await createUploadUrl({ key, mimeType, maxBytes: sizeBytes });
  return NextResponse.json(upload);
}
