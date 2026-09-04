'use client';

import * as React from 'react';
import { Loader2, Ear } from 'lucide-react';

export type AvatarState = 'idle' | 'speaking' | 'listening' | 'processing';

/**
 * A lightweight, local SVG/CSS avatar for the AI interviewer. Deliberately
 * no external avatar service/video — just a face built from SVG shapes with
 * CSS animations layered on top, so it costs nothing to run and never adds
 * network dependencies to a live interview:
 *  - idle: a slow "breathing" scale + occasional blink
 *  - speaking: a talking mouth animation + waveform bars + subtle head bob
 *  - listening: a calmer pulse + a small ear/listening indicator
 *  - processing: a spinner overlay, everything else pauses
 *
 * Kept visually subtle on purpose — it must support the interview, not
 * compete with the candidate's own video for attention.
 */
export function AiInterviewerAvatar({ label, state }: { label: string; state: AvatarState }) {
  const speaking = state === 'speaking';
  const listening = state === 'listening';
  const processing = state === 'processing';

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-3 overflow-hidden bg-slate-900">
      <div
        className={`relative flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32 ${
          speaking ? 'avatar-bob' : 'avatar-breathe'
        }`}
      >
        {/* Ambient rings: pulse while speaking, gentler while listening, still while idle/processing */}
        {(speaking || listening) && (
          <>
            <span
              className={`absolute inline-flex h-full w-full rounded-full bg-primary/30 ${
                speaking ? 'animate-ping' : 'animate-pulse'
              }`}
            />
            <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-primary/15" style={{ animationDuration: '2s' }} />
          </>
        )}

        <svg viewBox="0 0 120 120" className="relative h-24 w-24 sm:h-28 sm:w-28" aria-hidden="true">
          <circle cx="60" cy="60" r="54" fill="rgb(var(--primary))" opacity="0.12" />
          <circle cx="60" cy="58" r="42" fill="rgb(var(--primary))" />
          {/* Eyes — blink periodically via CSS animation */}
          <ellipse cx="45" cy="52" rx="4.5" ry="6" fill="white" className="avatar-blink" />
          <ellipse cx="75" cy="52" rx="4.5" ry="6" fill="white" className="avatar-blink" />
          {/* Mouth — swaps shape between idle/listening (calm line) and speaking (talking) */}
          {speaking ? (
            <ellipse cx="60" cy="76" rx="10" ry="6" fill="white" className="avatar-mouth-talk" style={{ transformOrigin: '60px 76px' }} />
          ) : (
            <rect x="49" y="74" width="22" height="4" rx="2" fill="white" opacity="0.9" />
          )}
        </svg>

        {processing && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-900/50">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
        )}

        {listening && !processing && (
          <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow ring-2 ring-slate-900">
            <Ear className="h-4 w-4" />
          </span>
        )}
      </div>

      {/* Speaking waveform */}
      <div className={`flex h-4 items-end gap-0.5 transition-opacity ${speaking ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="w-1 rounded-full bg-primary/80 avatar-wave-bar"
            style={{ animationDelay: `${i * 0.12}s` }}
          />
        ))}
      </div>

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-xs font-medium text-white">
        {label}
      </div>

      <style jsx>{`
        .avatar-breathe {
          animation: avatar-breathe 4s ease-in-out infinite;
        }
        .avatar-bob {
          animation: avatar-bob 0.9s ease-in-out infinite;
        }
        .avatar-blink {
          transform-origin: center;
          animation: avatar-blink 5s ease-in-out infinite;
        }
        .avatar-mouth-talk {
          animation: avatar-mouth-talk 0.35s ease-in-out infinite;
        }
        .avatar-wave-bar {
          height: 100%;
          animation: avatar-wave 0.9s ease-in-out infinite;
        }
        @keyframes avatar-breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.035); }
        }
        @keyframes avatar-bob {
          0%, 100% { transform: translateY(0) scale(1.02); }
          50% { transform: translateY(-2px) scale(1.04); }
        }
        @keyframes avatar-blink {
          0%, 92%, 100% { transform: scaleY(1); }
          96% { transform: scaleY(0.1); }
        }
        @keyframes avatar-mouth-talk {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(0.4); }
        }
        @keyframes avatar-wave {
          0%, 100% { height: 30%; }
          50% { height: 100%; }
        }
      `}</style>
    </div>
  );
}
