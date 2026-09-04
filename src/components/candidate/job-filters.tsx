'use client';

import * as React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

const WORK_MODES = [
  { value: 'REMOTE', label: 'Remote' },
  { value: 'ON_SITE', label: 'On-site' },
];
const EMPLOYMENT_TYPES = [
  { value: 'FULL_TIME', label: 'Full-time' },
  { value: 'PART_TIME', label: 'Part-time' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'INTERNSHIP', label: 'Internship' },
];

const ANY = '__any__';

export function JobFilters({
  initial,
}: {
  initial: { q?: string; location?: string; workMode?: string; employmentType?: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = React.useState(initial.q ?? '');
  const [location, setLocation] = React.useState(initial.location ?? '');

  function applyParams(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value && value !== ANY) params.set(key, value);
      else params.delete(key);
    }
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        applyParams({ q, location });
      }}
      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
    >
      <div className="relative flex-1 sm:min-w-[220px]">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Job title, skill, or company"
          className="pl-8"
        />
      </div>
      <Input
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="Location"
        className="sm:w-[180px]"
      />
      <Select
        value={initial.workMode ?? ANY}
        onValueChange={(v) => applyParams({ workMode: v === ANY ? undefined : v })}
      >
        <SelectTrigger className="sm:w-[150px]">
          <SelectValue placeholder="Work mode" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any work mode</SelectItem>
          {WORK_MODES.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={initial.employmentType ?? ANY}
        onValueChange={(v) => applyParams({ employmentType: v === ANY ? undefined : v })}
      >
        <SelectTrigger className="sm:w-[160px]">
          <SelectValue placeholder="Employment type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any type</SelectItem>
          {EMPLOYMENT_TYPES.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" className="gap-1.5">
        <Search className="h-4 w-4" /> Search
      </Button>
    </form>
  );
}
