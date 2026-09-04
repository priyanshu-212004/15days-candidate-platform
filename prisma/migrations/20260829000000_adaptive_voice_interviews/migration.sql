-- Phase 6: adaptive voice interviews.
-- Purely additive on top of the existing schema — no table is dropped, no
-- column is removed or retyped, and every existing Interview row gets
-- interviewType = 'STATIC' by default, so all pre-existing interviews and
-- their questions/responses/evaluations are completely unaffected.

CREATE TYPE "InterviewType" AS ENUM ('STATIC', 'ADAPTIVE_VOICE');

ALTER TABLE "Interview" ADD COLUMN "interviewType" "InterviewType" NOT NULL DEFAULT 'STATIC';

CREATE TABLE "InterviewBlueprint" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "durationTargetMin" INTEGER NOT NULL DEFAULT 20,
    "durationMinMin" INTEGER NOT NULL DEFAULT 15,
    "durationMaxMin" INTEGER NOT NULL DEFAULT 22,
    "graceSeconds" INTEGER NOT NULL DEFAULT 60,
    "maxFollowUpsPerTopic" INTEGER NOT NULL DEFAULT 2,
    "evaluationAreas" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewBlueprint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InterviewBlueprint_interviewId_key" ON "InterviewBlueprint"("interviewId");
ALTER TABLE "InterviewBlueprint" ADD CONSTRAINT "InterviewBlueprint_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "InterviewSessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

CREATE TABLE "InterviewSession" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "status" "InterviewSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "currentTopic" TEXT,
    "topicsCovered" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "topicsRemaining" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "questionCount" INTEGER NOT NULL DEFAULT 0,
    "followUpCountByTopic" JSONB NOT NULL DEFAULT '{}',
    "candidateEvidence" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InterviewSession_applicationId_key" ON "InterviewSession"("applicationId");
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InterviewTurn" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "turnNumber" INTEGER NOT NULL,
    "topic" TEXT,
    "question" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "difficulty" TEXT,
    "askedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answerText" TEXT,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "InterviewTurn_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InterviewTurn_sessionId_turnNumber_idx" ON "InterviewTurn"("sessionId", "turnNumber");
ALTER TABLE "InterviewTurn" ADD CONSTRAINT "InterviewTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AiUsageLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "interviewId" TEXT,
    "applicationId" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DOUBLE PRECISION,
    "succeeded" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiUsageLog_applicationId_idx" ON "AiUsageLog"("applicationId");
CREATE INDEX "AiUsageLog_interviewId_createdAt_idx" ON "AiUsageLog"("interviewId", "createdAt");
CREATE INDEX "AiUsageLog_purpose_createdAt_idx" ON "AiUsageLog"("purpose", "createdAt");
