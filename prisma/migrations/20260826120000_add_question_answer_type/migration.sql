-- Phase 5: recruiter-controlled answer type lives on the question itself,
-- not just on the candidate's submitted response. Defaults to VIDEO so
-- every existing question keeps its current (pre-Phase-5) behavior.
ALTER TABLE "InterviewQuestion" ADD COLUMN "answerType" "AnswerType" NOT NULL DEFAULT 'VIDEO';
