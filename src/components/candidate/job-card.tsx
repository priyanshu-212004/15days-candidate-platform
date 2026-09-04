import Link from 'next/link';
import { MapPin, Briefcase, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const EMPLOYMENT_LABELS: Record<string, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  INTERNSHIP: 'Internship',
};

function timeAgo(date: Date) {
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
  if (days === 0) return 'Posted today';
  if (days === 1) return 'Posted yesterday';
  return `Posted ${days} days ago`;
}

export function JobCard({
  job,
}: {
  job: {
    id: string;
    title: string;
    location: string | null;
    remote: boolean;
    employmentType: string;
    experienceLevel: string | null;
    skills: string[];
    createdAt: Date;
    org: { name: string; logoUrl: string | null };
  };
}) {
  return (
    <Link href={`/candidate/jobs/${job.id}`}>
      <Card className="transition-colors hover:border-primary/40">
        <CardContent className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-medium leading-tight">{job.title}</h3>
              <p className="text-sm text-muted-foreground">{job.org.name}</p>
            </div>
            <Badge variant="outline" className="shrink-0">
              {EMPLOYMENT_LABELS[job.employmentType] ?? job.employmentType}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {job.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {job.location}
                {job.remote && ' · Remote'}
              </span>
            )}
            {job.experienceLevel && (
              <span className="flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" /> {job.experienceLevel}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> {timeAgo(job.createdAt)}
            </span>
          </div>
          {job.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {job.skills.slice(0, 6).map((s) => (
                <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {s}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
