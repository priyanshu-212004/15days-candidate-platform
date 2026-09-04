'use client';

import * as React from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

export function PipelineToolbar({
  initialSearch,
  initialJobId,
  jobs,
}: {
  initialSearch: string;
  initialJobId: string;
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

  function setJob(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'ALL') params.delete('jobId');
    else params.set('jobId', value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search candidates"
          className="pl-8"
          aria-label="Search pipeline"
        />
      </div>
      <Select defaultValue={initialJobId || 'ALL'} onValueChange={setJob}>
        <SelectTrigger className="sm:w-56" aria-label="Filter by job">
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
