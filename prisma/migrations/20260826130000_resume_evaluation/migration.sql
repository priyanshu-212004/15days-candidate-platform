-- Phase 5: resume text-extraction error reporting + resume AI evaluation.

ALTER TABLE "Resume" ADD COLUMN "parseError" TEXT;

CREATE TABLE "ResumeEvaluation" (
    "id" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "skillsMatchScore" DOUBLE PRECISION NOT NULL,
    "experienceMatchScore" DOUBLE PRECISION NOT NULL,
    "relevanceScore" DOUBLE PRECISION NOT NULL,
    "strengths" TEXT[],
    "missingSkills" TEXT[],
    "concerns" TEXT[],
    "recommendation" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "status" "JobQueueStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResumeEvaluation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResumeEvaluation_resumeId_key" ON "ResumeEvaluation"("resumeId");

ALTER TABLE "ResumeEvaluation" ADD CONSTRAINT "ResumeEvaluation_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;
