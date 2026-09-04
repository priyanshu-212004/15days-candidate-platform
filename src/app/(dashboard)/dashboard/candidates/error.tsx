'use client';

import { ErrorState } from '@/components/ui/state';

export default function CandidatesError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-7xl">
      <ErrorState
        title="Couldn't load candidates"
        description="Something went wrong while loading your candidates. Please try again."
        onRetry={reset}
      />
    </div>
  );
}
