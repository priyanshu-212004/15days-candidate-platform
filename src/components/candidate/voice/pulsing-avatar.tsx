'use client';

import * as React from 'react';
import { Mic } from 'lucide-react';

/**
 * A simple pulsing circle avatar for the AI interviewer, matching the
 * reference UI's "avatar with a mic badge that animates while speaking."
 * Deliberately just a CSS animation on a ring + scale — no canvas/video —
 * per "do not overcomplicate the animation."
 */
export function PulsingAvatar({
  label,
  speaking,
}: {
  label: string;
  speaking: boolean;
}) {
  const initial = label.trim().charAt(0).toUpperCase() || 'A';

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-slate-900">
      <div className="relative flex h-24 w-24 items-center justify-center">
        {speaking && (
          <>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40" />
            <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-primary/20" style={{ animationDuration: '1.6s' }} />
          </>
        )}
        <div
          className={`relative flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-semibold text-primary-foreground shadow-lg transition-transform duration-300 ${
            speaking ? 'scale-105' : 'scale-100'
          }`}
        >
          {initial}
        </div>
        {speaking && (
          <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow ring-2 ring-slate-900">
            <Mic className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-xs font-medium text-white">
        {label}
      </div>
    </div>
  );
}
