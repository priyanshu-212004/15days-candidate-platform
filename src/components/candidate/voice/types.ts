export type VoicePhase =
  | 'connecting'
  | 'ai_speaking'
  | 'waiting_for_candidate'
  | 'candidate_speaking'
  | 'answer_finalizing'
  | 'uploading'
  | 'processing'
  | 'ended'
  | 'error';

export type DeviceStatus = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable' | 'unsupported';

export interface CurrentTurn {
  id: string;
  turnNumber: number;
  topic: string | null;
  question: string;
}
