import { Badge } from '@/components/ui/badge';

const JOB_STATUS_CONFIG: Record<string, { label: string; variant: 'secondary' | 'success' | 'warning' | 'outline' }> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  OPEN: { label: 'Open', variant: 'success' },
  PAUSED: { label: 'Paused', variant: 'warning' },
  ARCHIVED: { label: 'Archived', variant: 'outline' },
};

const INTERVIEW_STATUS_CONFIG: Record<string, { label: string; variant: 'secondary' | 'success' | 'warning' | 'outline' }> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  ACTIVE: { label: 'Active', variant: 'success' },
  PAUSED: { label: 'Paused', variant: 'warning' },
  EXPIRED: { label: 'Expired', variant: 'outline' },
};

export function JobStatusBadge({ status }: { status: string }) {
  const config = JOB_STATUS_CONFIG[status] ?? { label: status, variant: 'secondary' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function InterviewStatusBadge({ status }: { status: string }) {
  const config = INTERVIEW_STATUS_CONFIG[status] ?? { label: status, variant: 'secondary' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
