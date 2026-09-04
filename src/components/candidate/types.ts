export interface SessionQuestion {
  id: string;
  text: string;
  type: string;
  order: number;
  expectedDurationSec: number;
  // The recruiter's fixed choice of how this question must be answered.
  // The candidate never chooses or changes this.
  requiredAnswerType: 'TEXT' | 'VIDEO';
  answered: boolean;
  answerType: 'TEXT' | 'VIDEO' | null;
  answerText: string | null;
  hasRecording: boolean;
}

export interface SessionProgress {
  answeredCount: number;
  totalCount: number;
  isComplete: boolean;
  nextUnansweredQuestionId: string | null;
}

export interface SessionData {
  status: 'PENDING' | 'IN_PROGRESS' | 'SUBMITTED' | 'EVALUATED';
  candidateName: string;
  interviewTitle: string;
  jobTitle: string;
  recordingEnabled: boolean;
  requireCv: boolean;
  resume: { fileName: string; parseStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'; parseError: string | null } | null;
  progress: SessionProgress;
  questions: SessionQuestion[];
}
