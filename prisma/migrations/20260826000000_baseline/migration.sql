-- Baseline migration.
--
-- The migrations that originally shipped in this folder
-- (20260826120000_add_question_answer_type, 20260826130000_resume_evaluation)
-- are both ALTER-only: they assume "InterviewQuestion" and "Resume" already
-- exist. No migration in this project ever created the initial schema, so
-- `prisma migrate dev`'s shadow-database replay (which always rebuilds the
-- full migration history from an empty database) fails immediately on the
-- very first migration. This migration supplies that missing baseline —
-- the complete schema exactly as it stood before those two migrations were
-- written — so the full history becomes replayable from empty.
--
-- If you already have a database where these tables exist (e.g. it was
-- provisioned via `prisma db push` during development, or the two old
-- migrations were already applied by hand), do NOT let this migration run
-- against it as a normal migration — instead mark it as already satisfied:
--   npx prisma migrate resolve --applied 20260826000000_baseline
-- This only updates Prisma's migration-history bookkeeping; it does not
-- touch any table or row.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'RECRUITER', 'VIEWER');
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'OPEN', 'PAUSED', 'ARCHIVED');
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP');
CREATE TYPE "InterviewStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED');
CREATE TYPE "QuestionType" AS ENUM ('BEHAVIORAL', 'TECHNICAL', 'SITUATIONAL', 'CULTURE_FIT');
CREATE TYPE "QuestionDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'EVALUATED');
CREATE TYPE "JobQueueStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "AnswerType" AS ENUM ('TEXT', 'VIDEO');
CREATE TYPE "ScoreCategory" AS ENUM ('TECHNICAL', 'COMMUNICATION', 'CONFIDENCE', 'ROLE_FIT', 'RELEVANCE', 'COMPLETENESS');
CREATE TYPE "IntegrationProvider" AS ENUM ('SLACK', 'GREENHOUSE', 'LEVER', 'WEBHOOK', 'CALENDAR');

-- ---------------------------------------------------------------------------
-- Identity & tenancy
-- ---------------------------------------------------------------------------

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "image" TEXT,
    "emailVerified" TIMESTAMP(3),
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_email_idx" ON "User"("email");

CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE INDEX "Organization_slug_idx" ON "Organization"("slug");

CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_email_idx" ON "PasswordResetToken"("email");

CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'RECRUITER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrganizationMember_userId_orgId_key" ON "OrganizationMember"("userId", "orgId");
CREATE INDEX "OrganizationMember_orgId_idx" ON "OrganizationMember"("orgId");
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Jobs & interviews (pre-Phase-6 shape — no interviewType/blueprint yet)
-- ---------------------------------------------------------------------------

CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" TEXT[],
    "skills" TEXT[],
    "experienceLevel" TEXT,
    "location" TEXT,
    "remote" BOOLEAN NOT NULL DEFAULT false,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Job_orgId_status_idx" ON "Job"("orgId", "status");
ALTER TABLE "Job" ADD CONSTRAINT "Job_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "status" "InterviewStatus" NOT NULL DEFAULT 'DRAFT',
    "expiresAt" TIMESTAMP(3),
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "languages" TEXT[] DEFAULT ARRAY['en']::TEXT[],
    "requireCv" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Interview_publicToken_key" ON "Interview"("publicToken");
CREATE INDEX "Interview_orgId_status_idx" ON "Interview"("orgId", "status");
CREATE INDEX "Interview_publicToken_idx" ON "Interview"("publicToken");
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InterviewQuestion" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'BEHAVIORAL',
    "category" TEXT,
    "difficulty" "QuestionDifficulty" NOT NULL DEFAULT 'MEDIUM',
    "expectedDurationSec" INTEGER NOT NULL DEFAULT 120,
    "evaluationCriteria" TEXT[],
    "order" INTEGER NOT NULL,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewQuestion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InterviewQuestion_interviewId_order_idx" ON "InterviewQuestion"("interviewId", "order");
ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Candidates & applications
-- ---------------------------------------------------------------------------

CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "location" TEXT,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Candidate_orgId_email_key" ON "Candidate"("orgId", "email");
CREATE INDEX "Candidate_orgId_idx" ON "Candidate"("orgId");
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PipelineStage_orgId_name_key" ON "PipelineStage"("orgId", "name");
CREATE INDEX "PipelineStage_orgId_order_idx" ON "PipelineStage"("orgId", "order");
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "currentStageId" TEXT,
    "startedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Application_orgId_jobId_idx" ON "Application"("orgId", "jobId");
CREATE INDEX "Application_orgId_currentStageId_idx" ON "Application"("orgId", "currentStageId");
CREATE INDEX "Application_candidateId_idx" ON "Application"("candidateId");
ALTER TABLE "Application" ADD CONSTRAINT "Application_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_currentStageId_fkey" FOREIGN KEY ("currentStageId") REFERENCES "PipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Resume" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "parsedText" TEXT,
    "parseStatus" "JobQueueStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Resume_applicationId_key" ON "Resume"("applicationId");
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Video responses, evaluation, anti-cheat
-- ---------------------------------------------------------------------------

CREATE TABLE "VideoResponse" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerType" "AnswerType" NOT NULL DEFAULT 'VIDEO',
    "answerText" TEXT,
    "storageKey" TEXT,
    "durationSec" INTEGER,
    "transcript" TEXT,
    "transcriptStatus" "JobQueueStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoResponse_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VideoResponse_applicationId_questionId_key" ON "VideoResponse"("applicationId", "questionId");
CREATE INDEX "VideoResponse_applicationId_idx" ON "VideoResponse"("applicationId");
ALTER TABLE "VideoResponse" ADD CONSTRAINT "VideoResponse_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoResponse" ADD CONSTRAINT "VideoResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "InterviewQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SuspiciousFlag" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "videoResponseId" TEXT,
    "type" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "detail" TEXT,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuspiciousFlag_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SuspiciousFlag_applicationId_idx" ON "SuspiciousFlag"("applicationId");
ALTER TABLE "SuspiciousFlag" ADD CONSTRAINT "SuspiciousFlag_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SuspiciousFlag" ADD CONSTRAINT "SuspiciousFlag_videoResponseId_fkey" FOREIGN KEY ("videoResponseId") REFERENCES "VideoResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "summary" TEXT NOT NULL,
    "strengths" TEXT[],
    "concerns" TEXT[],
    "modelName" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "status" "JobQueueStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Evaluation_applicationId_key" ON "Evaluation"("applicationId");
CREATE INDEX "Evaluation_applicationId_idx" ON "Evaluation"("applicationId");
CREATE INDEX "Evaluation_overallScore_idx" ON "Evaluation"("overallScore");
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EvaluationScore" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "category" "ScoreCategory" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "rationale" TEXT,

    CONSTRAINT "EvaluationScore_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EvaluationScore_evaluationId_category_key" ON "EvaluationScore"("evaluationId", "category");
ALTER TABLE "EvaluationScore" ADD CONSTRAINT "EvaluationScore_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Pipeline / ATS
-- ---------------------------------------------------------------------------

CREATE TABLE "CandidateStageHistory" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "movedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateStageHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CandidateStageHistory_applicationId_idx" ON "CandidateStageHistory"("applicationId");
CREATE INDEX "CandidateStageHistory_applicationId_createdAt_idx" ON "CandidateStageHistory"("applicationId", "createdAt");
ALTER TABLE "CandidateStageHistory" ADD CONSTRAINT "CandidateStageHistory_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateStageHistory" ADD CONSTRAINT "CandidateStageHistory_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CandidateStageHistory" ADD CONSTRAINT "CandidateStageHistory_movedById_fkey" FOREIGN KEY ("movedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Cross-cutting: notes, audit, notifications, integrations
-- ---------------------------------------------------------------------------

CREATE TABLE "CandidateNote" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CandidateNote_candidateId_idx" ON "CandidateNote"("candidateId");
CREATE INDEX "CandidateNote_candidateId_createdAt_idx" ON "CandidateNote"("candidateId", "createdAt");
ALTER TABLE "CandidateNote" ADD CONSTRAINT "CandidateNote_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateNote" ADD CONSTRAINT "CandidateNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CandidateComment" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CandidateComment_candidateId_idx" ON "CandidateComment"("candidateId");
CREATE INDEX "CandidateComment_candidateId_createdAt_idx" ON "CandidateComment"("candidateId", "createdAt");
ALTER TABLE "CandidateComment" ADD CONSTRAINT "CandidateComment_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateComment" ADD CONSTRAINT "CandidateComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "readAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Integration_orgId_provider_key" ON "Integration"("orgId", "provider");
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
