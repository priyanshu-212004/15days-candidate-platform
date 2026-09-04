'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { jobCreateSchema, type JobCreateInput } from '@/lib/validations/job';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TagInput } from '@/components/ui/tag-input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { Loader2 } from 'lucide-react';

export interface JobFormValues extends JobCreateInput {}

interface JobFormProps {
  jobId?: string;
  defaultValues?: Partial<JobFormValues>;
}

const EMPLOYMENT_TYPES: { value: JobFormValues['employmentType']; label: string }[] = [
  { value: 'FULL_TIME', label: 'Full-time' },
  { value: 'PART_TIME', label: 'Part-time' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'INTERNSHIP', label: 'Internship' },
];

const STATUSES: { value: JobFormValues['status']; label: string }[] = [
  { value: 'DRAFT', label: 'Draft — not visible to candidates' },
  { value: 'OPEN', label: 'Open — actively hiring' },
  { value: 'PAUSED', label: 'Paused' },
];

export function JobForm({ jobId, defaultValues }: JobFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<JobFormValues>({
    resolver: zodResolver(jobCreateSchema),
    defaultValues: {
      title: '',
      description: '',
      requirements: [],
      skills: [],
      experienceLevel: '',
      location: '',
      remote: false,
      employmentType: 'FULL_TIME',
      status: 'DRAFT',
      ...defaultValues,
    },
  });

  // Warn on tab close / navigation away if there are unsaved changes.
  React.useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  async function onSubmit(values: JobFormValues) {
    setServerError(null);
    try {
      const res = await fetch(jobId ? `/api/jobs/${jobId}` : '/api/jobs', {
        method: jobId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json();

      if (!res.ok) {
        setServerError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      toast({
        variant: 'success',
        title: jobId ? 'Job updated' : 'Job created',
        description: values.title,
      });
      router.push(`/dashboard/jobs/${data.job.id}`);
      router.refresh();
    } catch {
      setServerError('Network error — please check your connection and try again.');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {serverError && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {serverError}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="title">Job title</Label>
        <Input id="title" placeholder="e.g. Senior Backend Engineer" invalid={!!errors.title} {...register('title')} />
        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          rows={6}
          placeholder="What will this person own? What does success look like in the first 90 days?"
          invalid={!!errors.description}
          {...register('description')}
        />
        {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="requirements">Requirements</Label>
          <Controller
            control={control}
            name="requirements"
            render={({ field }) => (
              <TagInput
                id="requirements"
                value={field.value}
                onChange={field.onChange}
                placeholder="Type a requirement, press Enter"
              />
            )}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="skills">Skills</Label>
          <Controller
            control={control}
            name="skills"
            render={({ field }) => (
              <TagInput id="skills" value={field.value} onChange={field.onChange} placeholder="Type a skill, press Enter" />
            )}
          />
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="experienceLevel">Experience level</Label>
          <Input id="experienceLevel" placeholder="e.g. Mid-Senior" {...register('experienceLevel')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input id="location" placeholder="e.g. Remote, or New York, NY" {...register('location')} />
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Employment type</Label>
          <Controller
            control={control}
            name="employmentType"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger aria-label="Employment type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYMENT_TYPES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-2">
          <Label>Status</Label>
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger aria-label="Job status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="flex items-end justify-between rounded-md border border-input bg-surface px-3 py-2 shadow-xs sm:justify-start sm:gap-3">
          <Label htmlFor="remote" className="cursor-pointer">
            Remote role
          </Label>
          <Controller
            control={control}
            name="remote"
            render={({ field }) => (
              <Switch id="remote" checked={field.value} onCheckedChange={field.onChange} />
            )}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-5">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {jobId ? 'Save changes' : 'Create job'}
        </Button>
      </div>
    </form>
  );
}
