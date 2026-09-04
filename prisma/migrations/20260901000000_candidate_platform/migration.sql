-- Candidate platform (Phase 2): introduces the global candidate identity
-- (User.userType = CANDIDATE + CandidateProfile) alongside the existing
-- recruiter platform.
--
-- Purely additive:
--   * No existing table is dropped, renamed, or restructured.
--   * No existing column is dropped, renamed, or made non-nullable.
--   * "Candidate" keeps its existing orgId column and its existing
--     @@unique([orgId, email]) constraint — only a nullable "userId" column
--     is added, defaulting every existing row to NULL (unlinked), which is
--     exactly its current, valid, unmigrated state.
--   * "User" gets a "userType" column with DEFAULT 'RECRUITER', so every
--     existing User row remains a valid recruiter with no backfill.
--   * Everything else in this file is brand-new tables that no existing
--     code references yet.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "UserType" AS ENUM ('RECRUITER', 'CANDIDATE');
CREATE TYPE "WorkMode" AS ENUM ('REMOTE', 'HYBRID', 'ON_SITE');
CREATE TYPE "MockInterviewType" AS ENUM ('TECHNICAL', 'BEHAVIORAL', 'MIXED');
CREATE TYPE "MockInterviewDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');
CREATE TYPE "MockInterviewStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- ---------------------------------------------------------------------------
-- User: add userType (additive, defaulted — existing rows unaffected)
-- ---------------------------------------------------------------------------

ALTER TABLE "User" ADD COLUMN "userType" "UserType" NOT NULL DEFAULT 'RECRUITER';

-- ---------------------------------------------------------------------------
-- Candidate: add nullable link to a platform candidate account
-- ---------------------------------------------------------------------------

ALTER TABLE "Candidate" ADD COLUMN "userId" TEXT;
CREATE INDEX "Candidate_userId_idx" ON "Candidate"("userId");
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- CandidateProfile — the global candidate identity (1:1 with User)
-- ---------------------------------------------------------------------------

CREATE TABLE "CandidateProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT,
    "location" TEXT,
    "photoUrl" TEXT,
    "currentTitle" TEXT,
    "currentCompany" TEXT,
    "totalExperienceYears" DOUBLE PRECISION,
    "employmentStatus" TEXT,
    "currentCtc" DOUBLE PRECISION,
    "expectedCtc" DOUBLE PRECISION,
    "ctcCurrency" TEXT NOT NULL DEFAULT 'USD',
    "noticePeriodDays" INTEGER,
    "preferredJobType" "EmploymentType",
    "preferredWorkMode" "WorkMode",
    "preferredLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "certifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resumeStorageKey" TEXT,
    "resumeFileName" TEXT,
    "resumeMimeType" TEXT,
    "resumeSizeBytes" INTEGER,
    "resumeParsedText" TEXT,
    "resumeParseStatus" "JobQueueStatus" NOT NULL DEFAULT 'PENDING',
    "resumeParseError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CandidateProfile_userId_key" ON "CandidateProfile"("userId");
CREATE INDEX "CandidateProfile_userId_idx" ON "CandidateProfile"("userId");
ALTER TABLE "CandidateProfile" ADD CONSTRAINT "CandidateProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- CandidateExperience — many per CandidateProfile
-- ---------------------------------------------------------------------------

CREATE TABLE "CandidateExperience" (
    "id" TEXT NOT NULL,
    "candidateProfileId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateExperience_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CandidateExperience_candidateProfileId_idx" ON "CandidateExperience"("candidateProfileId");
ALTER TABLE "CandidateExperience" ADD CONSTRAINT "CandidateExperience_candidateProfileId_fkey" FOREIGN KEY ("candidateProfileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- CandidateEducation — many per CandidateProfile
-- ---------------------------------------------------------------------------

CREATE TABLE "CandidateEducation" (
    "id" TEXT NOT NULL,
    "candidateProfileId" TEXT NOT NULL,
    "degree" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "fieldOfStudy" TEXT,
    "graduationYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateEducation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CandidateEducation_candidateProfileId_idx" ON "CandidateEducation"("candidateProfileId");
ALTER TABLE "CandidateEducation" ADD CONSTRAINT "CandidateEducation_candidateProfileId_fkey" FOREIGN KEY ("candidateProfileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- MockInterview / MockInterviewTurn — isolated from Job/Application/
-- recruiter Candidate by construction (no FK to any of them).
-- ---------------------------------------------------------------------------

CREATE TABLE "MockInterview" (
    "id" TEXT NOT NULL,
    "candidateProfileId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "experienceBand" TEXT NOT NULL,
    "type" "MockInterviewType" NOT NULL,
    "difficulty" "MockInterviewDifficulty" NOT NULL,
    "durationTargetMin" INTEGER NOT NULL,
    "status" "MockInterviewStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "overallScore" DOUBLE PRECISION,
    "strengths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "weaknesses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "suggestedImprovements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "communicationFeedback" TEXT,
    "technicalFeedback" TEXT,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockInterview_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MockInterview_candidateProfileId_idx" ON "MockInterview"("candidateProfileId");
ALTER TABLE "MockInterview" ADD CONSTRAINT "MockInterview_candidateProfileId_fkey" FOREIGN KEY ("candidateProfileId") REFERENCES "CandidateProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MockInterviewTurn" (
    "id" TEXT NOT NULL,
    "mockInterviewId" TEXT NOT NULL,
    "turnNumber" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answerText" TEXT,
    "askedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "MockInterviewTurn_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MockInterviewTurn_mockInterviewId_turnNumber_idx" ON "MockInterviewTurn"("mockInterviewId", "turnNumber");
ALTER TABLE "MockInterviewTurn" ADD CONSTRAINT "MockInterviewTurn_mockInterviewId_fkey" FOREIGN KEY ("mockInterviewId") REFERENCES "MockInterview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
