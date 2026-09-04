import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveCandidateSession } from '@/lib/queries/candidate-session';
import { canModifySession } from '@/lib/candidate-session';
import { recordingCompleteSchema } from '@/lib/validations/candidate';
import { headObject, getObjectBuffer, buildRecordingKey } from '@/lib/storage';
import { transcribeRecording, MAX_TRANSCRIBABLE_BYTES } from '@/lib/transcription';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

interface Params {
  params: { token: string; turnId: string };
}

function mimeTypeFromRecordingKey(key: string): string {
  return key.endsWith('.mp4') ? 'video/mp4' : 'video/webm';
}

export async function POST(req: Request, { params }: Params) {
  const rate = await checkRateLimit({
    bucket: 'adaptive-recording-complete',
    identifier: getClientIp(req),
    limit: 30,
    windowSec: 60,
  });
  if (!rate.allowed) return rateLimitResponse(rate);

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

  const turn = await db.interviewTurn.findFirst({
    where: { id: params.turnId, session: { applicationId: application.id } },
    select: { id: true },
  });
  if (!turn) return NextResponse.json({ error: 'Question not found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = recordingCompleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 422 });
  }
  const { storageKey, durationSec } = parsed.data;

  // Defense in depth — the key must actually be the one this session/turn
  // pair would have been issued, never an arbitrary client-supplied string.
  const expectedPrefix = buildRecordingKey({
    orgId: application.orgId,
    applicationId: application.id,
    questionId: params.turnId,
    ext: 'x',
  }).replace(/\.x$/, '.');
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

  await db.interviewTurn.update({
    where: { id: params.turnId },
    data: {
      videoStorageKey: storageKey,
      videoMimeType: mimeTypeFromRecordingKey(storageKey),
      videoDurationSec: durationSec,
      videoTranscriptStatus: 'PROCESSING',
    },
  });

  // Transcription is a durable backup of the live browser-STT transcript
  // already captured for this turn's answerText — never on the critical
  // path for advancing the adaptive conversation, which already has what
  // it needs. Run it best-effort and record a real FAILED status on error
  // rather than fabricating a transcript.
  let videoTranscript: string | null = null;
  let videoTranscriptStatus: 'COMPLETED' | 'FAILED' = 'FAILED';

  if (head.sizeBytes > MAX_TRANSCRIBABLE_BYTES) {
    console.error(`[adaptive/recordings/complete] recording too large to transcribe: ${head.sizeBytes} bytes`);
  } else {
    const buffer = await getObjectBuffer(storageKey);
    if (!buffer) {
      console.error('[adaptive/recordings/complete] could not download recording for transcription');
    } else {
      const result = await transcribeRecording({ buffer, mimeType: mimeTypeFromRecordingKey(storageKey) });
      if (result.status === 'COMPLETED') {
        videoTranscript = result.text;
        videoTranscriptStatus = 'COMPLETED';
      } else {
        console.error('[adaptive/recordings/complete] transcription failed:', result.error);
      }
    }
  }

  await db.interviewTurn.update({
    where: { id: params.turnId },
    data: { videoTranscript, videoTranscriptStatus },
  });

  return NextResponse.json({ saved: true, videoTranscriptStatus });
}
