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
  params: { token: string; turnId: string };
}

const EXT_BY_MIME: Record<string, string> = {
  'video/webm': 'webm',
  'video/mp4': 'mp4',
  'audio/webm': 'webm',
};

export async function POST(req: Request, { params }: Params) {
  const rate = await checkRateLimit({
    bucket: 'adaptive-recording-upload-url',
    identifier: getClientIp(req),
    limit: 30,
    windowSec: 60,
  });
  if (!rate.allowed) return rateLimitResponse(rate);

  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: 'Video recording is not enabled for this interview yet. Your spoken answer will still be used.' },
      { status: 501 }
    );
  }

  const application = await resolveCandidateSession(params.token);
  if (!application) {
    return NextResponse.json({ error: 'No active session. Please start the interview again.' }, { status: 401 });
  }
  if (application.interview.interviewType !== 'ADAPTIVE_VOICE') {
    return NextResponse.json({ error: 'This interview is not an adaptive voice interview' }, { status: 409 });
  }
  if (!canModifySession(application.status)) {
    return NextResponse.json({ error: 'This interview has already been submitted and cannot be changed.' }, { status: 409 });
  }

  // The turn must belong to this candidate's own session — the same
  // defense-in-depth check used by /adaptive/turn, so a candidate can never
  // upload against someone else's turn id.
  const turn = await db.interviewTurn.findFirst({
    where: { id: params.turnId, session: { applicationId: application.id } },
    select: { id: true },
  });
  if (!turn) return NextResponse.json({ error: 'Question not found' }, { status: 404 });

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

  // buildRecordingKey's `questionId` param is just a generic per-answer
  // identifier for key-namespacing — passing the turn id here keeps this
  // fully reusing the existing storage helper rather than duplicating it.
  const key = buildRecordingKey({
    orgId: application.orgId,
    applicationId: application.id,
    questionId: params.turnId,
    ext: EXT_BY_MIME[mimeType] ?? 'webm',
  });

  const upload = await createUploadUrl({ key, mimeType, maxBytes: sizeBytes });
  return NextResponse.json(upload);
}
