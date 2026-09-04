'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { candidateInfoSchema, type CandidateInfoInput } from '@/lib/validations/candidate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function CandidateEntryForm({ token }: { token: string }) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CandidateInfoInput>({
    resolver: zodResolver(candidateInfoSchema),
    defaultValues: { preferredLanguage: 'en' },
  });

  async function onSubmit(values: CandidateInfoInput) {
    setServerError(null);
    const res = await fetch(`/api/public/interviews/${token}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setServerError(data?.error ?? 'Something went wrong. Please try again.');
      return;
    }

    router.push(`/interview/${token}/session`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {serverError}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="name">Full name</Label>
        <Input id="name" autoComplete="name" invalid={!!errors.name} {...register('name')} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input id="phone" type="tel" autoComplete="tel" {...register('phone')} />
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Start interview
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        By continuing, you consent to your responses being recorded and reviewed by the hiring team for this role.
      </p>
    </form>
  );
}
