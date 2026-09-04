'use client';

import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

const INTERVIEW_STATUS_OPTIONS = [
  { value: 'ALL', label: 'Any interview status' },
  { value: 'PENDING', label: 'Not started' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'EVALUATED', label: 'Evaluated' },
];

const EVALUATION_STATUS_OPTIONS = [
  { value: 'ALL', label: 'Any evaluation' },
  { value: 'NOT_EVALUATED', label: 'Not evaluated' },
  { value: 'EVALUATED', label: 'Evaluated' },
  { value: 'SUCCESSFUL', label: 'Successful' },
  { value: 'UNSUCCESSFUL', label: 'Unsuccessful' },
];

export function CandidatesToolbar({
  initialSearch,
  initialJobId,
  initialInterviewStatus,
  initialEvaluationStatus,
  jobs,
}: {
  initialSearch: string;
  initialJobId: string;
  initialInterviewStatus: string;
  initialEvaluationStatus: string;
  jobs: { id: string; title: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = React.useState(initialSearch);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (search) params.set('search', search);
      else params.delete('search');
      router.push(`${pathname}?${params.toString()}`);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'ALL') params.delete(key);
    else params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or job"
          className="pl-8"
          aria-label="Search candidates"
        />
      </div>

      <Select defaultValue={initialJobId || 'ALL'} onValueChange={(v) => setParam('jobId', v)}>
        <SelectTrigger className="sm:w-48" aria-label="Filter by job">
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

      <Select defaultValue={initialInterviewStatus || 'ALL'} onValueChange={(v) => setParam('interviewStatus', v)}>
        <SelectTrigger className="sm:w-44" aria-label="Filter by interview status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {INTERVIEW_STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select defaultValue={initialEvaluationStatus || 'ALL'} onValueChange={(v) => setParam('evaluationStatus', v)}>
        <SelectTrigger className="sm:w-40" aria-label="Filter by evaluation status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EVALUATION_STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
