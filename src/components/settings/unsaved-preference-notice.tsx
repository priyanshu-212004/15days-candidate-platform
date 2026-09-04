import { Info } from 'lucide-react';

export function UnsavedPreferenceNotice() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2.5 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>
        These preferences aren&apos;t saved to your account yet — there&apos;s no backend for org-wide defaults
        like this. Changes here reset on refresh. Interview-specific settings (like duration) are configured per
        interview when you create it.
      </p>
    </div>
  );
}
