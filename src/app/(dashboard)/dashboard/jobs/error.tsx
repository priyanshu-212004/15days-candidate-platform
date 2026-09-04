'use client';

import { ErrorState } from '@/components/ui/state';

export default function JobsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-7xl">
      <ErrorState
        title="Couldn't load jobs"
        description="Something went wrong while loading your jobs. Please try again."
        onRetry={reset}
      />
    </div>
  );
}
