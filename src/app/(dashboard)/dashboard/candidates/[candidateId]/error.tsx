'use client';

import { ErrorState } from '@/components/ui/state';

export default function CandidateDetailError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-4xl">
      <ErrorState
        title="Couldn't load this candidate"
        description="Something went wrong while loading this candidate's details. Please try again."
        onRetry={reset}
      />
    </div>
  );
}
