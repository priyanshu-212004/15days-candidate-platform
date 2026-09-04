-- Adds video-recording persistence to adaptive interview turns.
-- Purely additive: new nullable columns plus one column with a safe
-- default (videoTranscriptStatus defaults to 'PENDING', reusing the
-- existing JobQueueStatus enum — no new enum needed). No existing table,
-- column, or row is touched.

ALTER TABLE "InterviewTurn" ADD COLUMN "videoStorageKey" TEXT;
ALTER TABLE "InterviewTurn" ADD COLUMN "videoMimeType" TEXT;
ALTER TABLE "InterviewTurn" ADD COLUMN "videoDurationSec" INTEGER;
ALTER TABLE "InterviewTurn" ADD COLUMN "videoTranscript" TEXT;
ALTER TABLE "InterviewTurn" ADD COLUMN "videoTranscriptStatus" "JobQueueStatus" NOT NULL DEFAULT 'PENDING';
