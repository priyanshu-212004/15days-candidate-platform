import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveCandidateSession } from '@/lib/queries/candidate-session';
import { canModifySession } from '@/lib/candidate-session';
import { recordingCompleteSchema } from '@/lib/validations/candidate';
import { headObject, getObjectBuffer, buildRecordingKey } from '@/lib/storage';
import { transcribeRecording, MAX_TRANSCRIBABLE_BYTES } from '@/lib/transcription';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

interface Params {
  params: { token: string; questionId: string };
}

/** Extension → MIME, the reverse of the upload-url route's EXT_BY_MIME. The
 * actual MIME type isn't persisted on VideoResponse (no schema change
 * needed for this fix), so it's recovered from the storage key's extension,
 * which buildRecordingKey always derives from the original upload's MIME
 * type — this is a lossless round-trip for the two formats this app allows. */
function mimeTypeFromRecordingKey(key: string): string {
  return key.endsWith('.mp4') ? 'video/mp4' : 'video/webm';
}

export async function POST(req: Request, { params }: Params) {
  const rate = await checkRateLimit({
    bucket: 'candidate-recording-complete',
    identifier: getClientIp(req),
    limit: 30,
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

  const question = await db.interviewQuestion.findFirst({
    where: { id: params.questionId, interviewId: application.interviewId },
    select: { id: true, answerType: true },
  });
  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 });

  if (question.answerType !== 'VIDEO') {
    return NextResponse.json(
      { error: 'This question requires a written answer, not a recording.' },
      { status: 422 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = recordingCompleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 422 });
  }
  const { storageKey, durationSec } = parsed.data;

  // Defense in depth: the key must actually be the one this session/question
  // pair would have been issued, not an arbitrary client-supplied string —
  // otherwise a candidate could point their answer at someone else's object.
  const expectedPrefix = buildRecordingKey({
    orgId: application.orgId,
    applicationId: application.id,
    questionId: params.questionId,
    ext: 'x', // extension not checked here, only the directory/name prefix
  }).replace(/\.x$/, '.');
  if (!storageKey.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: 'Storage key does not match this session' }, { status: 403 });
  }

  const head = await headObject(storageKey);
  if (!head.exists) {
    return NextResponse.json(
      { error: 'We could not verify the upload finished. Please try recording again.' },
      { status: 422 }
    );
  }

  const saved = await db.videoResponse.upsert({
    where: { applicationId_questionId: { applicationId: application.id, questionId: params.questionId } },
    update: { answerType: 'VIDEO', storageKey, durationSec, answerText: null, transcript: null, transcriptStatus: 'PROCESSING' },
    create: {
      applicationId: application.id,
      questionId: params.questionId,
      answerType: 'VIDEO',
      storageKey,
      durationSec,
      transcriptStatus: 'PROCESSING',
    },
    select: { id: true, updatedAt: true },
  });

  // Transcription runs inline, same as resume extraction: it's the
  // simplest reliable option without a job queue, and a candidate's answer
  // recording is short enough that this doesn't meaningfully delay the
  // response. Never fabricated — a real failure (no provider configured,
  // file too large, provider error) is stored as FAILED with a real
  // reason, and the existing evaluation route already treats a
  // video-without-transcript as "not evaluable" rather than guessing.
  let transcript: string | null = null;
  let transcriptStatus: 'COMPLETED' | 'FAILED' = 'FAILED';

  if (head.sizeBytes > MAX_TRANSCRIBABLE_BYTES) {
    console.error(`[recordings/complete] recording too large to transcribe: ${head.sizeBytes} bytes`);
  } else {
    const buffer = await getObjectBuffer(storageKey);
    if (!buffer) {
      console.error('[recordings/complete] could not download recording for transcription');
    } else {
      const result = await transcribeRecording({ buffer, mimeType: mimeTypeFromRecordingKey(storageKey) });
      if (result.status === 'COMPLETED') {
        transcript = result.text;
        transcriptStatus = 'COMPLETED';
      } else {
        console.error('[recordings/complete] transcription failed:', result.error);
      }
    }
  }

  await db.videoResponse.update({
    where: { id: saved.id },
    data: { transcript, transcriptStatus },
  });

  return NextResponse.json({ saved: true, updatedAt: saved.updatedAt, transcriptStatus });
}
