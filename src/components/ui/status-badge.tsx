import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  Star,
  Clock,
  Send,
  XCircle,
  Trophy,
  Loader2,
  AlertTriangle,
  CircleDashed,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface StatusConfig {
  label: string;
  variant: NonNullable<BadgeProps['variant']>;
  icon?: LucideIcon;
  /** Adds a small pulsing dot — reserved for genuinely "live/in-progress" states, not just any status. */
  pulse?: boolean;
  /** Extra color intent beyond the Badge primitive's variant palette (e.g. amber/indigo aren't first-class Badge variants). Composed on top via className, not a second styling system. */
  tone?: string;
}

// Every status string this app produces, in one place. Application status
// (PENDING/IN_PROGRESS/SUBMITTED/EVALUATED), free-text pipeline stage names
// (Applied/Screening/Interview/Shortlisted/Offer/Hired/Rejected — matching
// the org's seeded default stages), and derived evaluation outcomes
// (Successful/Unsuccessful) all resolve through this one map instead of
// being duplicated ad hoc across pages.
const STATUS_CONFIG: Record<string, StatusConfig> = {
  // Application.status
  PENDING: { label: 'Not started', variant: 'secondary', icon: CircleDashed },
  IN_PROGRESS: { label: 'In progress', variant: 'warning', icon: Loader2, pulse: true },
  SUBMITTED: { label: 'Submitted', variant: 'default', icon: Send },
  EVALUATED: { label: 'Evaluated', variant: 'success', icon: CheckCircle2 },

  // Pipeline stages (free-text names, matches the org's seeded defaults)
  APPLIED: { label: 'Applied', variant: 'default', icon: Send },
  SCREENING: { label: 'Screening', variant: 'secondary', icon: Clock },
  INTERVIEW: { label: 'Interview', variant: 'warning', icon: Loader2, pulse: true },
  SHORTLISTED: { label: 'Shortlisted', variant: 'default', icon: Star, tone: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10' },
  OFFER: { label: 'Offer', variant: 'success', icon: Trophy },
  HIRED: { label: 'Hired', variant: 'success', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', variant: 'destructive', icon: XCircle },

  // Evaluation outcome (derived — see SUCCESSFUL_SCORE_THRESHOLD)
  SUCCESSFUL: { label: 'Successful', variant: 'success', icon: CheckCircle2 },
  UNSUCCESSFUL: { label: 'Unsuccessful', variant: 'destructive', icon: XCircle },
  NOT_EVALUATED: { label: 'Not evaluated', variant: 'secondary', icon: CircleDashed },

  // Generic states reused in a few places (uploads, async processing)
  PROCESSING: { label: 'Processing', variant: 'default', icon: Loader2, pulse: true, tone: 'text-purple-600 dark:text-purple-400 bg-purple-500/10' },
  FAILED: { label: 'Failed', variant: 'destructive', icon: AlertTriangle },
};

function resolveConfig(status: string): StatusConfig {
  const key = status.trim().toUpperCase().replace(/\s+/g, '_');
  return STATUS_CONFIG[key] ?? { label: status, variant: 'secondary' };
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const config = resolveConfig(status);
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className={cn(config.tone, className)}>
      {config.pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {Icon && !config.pulse && <Icon className="h-3 w-3" />}
      {config.label}
    </Badge>
  );
}
