'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { CalendarRange, Briefcase } from 'lucide-react';

const RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
];

export function AnalyticsToolbar({
  initialRange,
  initialJobId,
  jobs,
}: {
  initialRange: string;
  initialJobId: string;
  jobs: { id: string; title: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'ALL') params.delete(key);
    else params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Select defaultValue={initialRange} onValueChange={(v) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('range', v);
        router.push(`${pathname}?${params.toString()}`);
      }}>
        <SelectTrigger className="gap-1.5 sm:w-44" aria-label="Date range">
          <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RANGE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select defaultValue={initialJobId || 'ALL'} onValueChange={(v) => setParam('jobId', v)}>
        <SelectTrigger className="gap-1.5 sm:w-56" aria-label="Filter by job">
          <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All jobs</SelectItem>
          {jobs.map((job) => (
            <SelectItem key={job.id} value={job.id}>
              {job.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
