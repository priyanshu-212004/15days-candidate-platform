import Link from 'next/link';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in — 15days.io' };

function LoginFormFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

// The role picked here is a UX convenience only — which form copy/signup
// link to show. It has no bearing on authorization: LoginForm always
// redirects based on the authenticated session's actual userType (read from
// the database via NextAuth's jwt/session callbacks), never based on this
// query param. See login-form.tsx.
type Role = 'candidate' | 'recruiter';

function parseRole(value: string | string[] | undefined): Role | null {
  return value === 'candidate' || value === 'recruiter' ? value : null;
}

export default function LoginPage({ searchParams }: { searchParams: { role?: string } }) {
  const role = parseRole(searchParams.role);

  if (!role) {
    return (
      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>Choose how you&apos;d like to sign in.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button asChild variant="outline" className="w-full">
            <Link href="/login?role=candidate">Login as Candidate</Link>
          </Button>
          <Button asChild className="w-full">
            <Link href="/login?role=recruiter">Login as Recruiter</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isCandidate = role === 'candidate';

  return (
    <Card className="shadow-elevated">
      <CardHeader>
        <CardTitle className="text-xl">Login as {isCandidate ? 'Candidate' : 'Recruiter'}</CardTitle>
        <CardDescription>
          {isCandidate
            ? 'Sign in to find jobs and track your applications.'
            : 'Sign in to your recruiter dashboard.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<LoginFormFallback />}>
          <LoginForm />
        </Suspense>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isCandidate ? 'Not a candidate yet? ' : "Don't have an account? "}
          <Link
            href={isCandidate ? '/candidate-signup' : '/signup'}
            className="font-medium text-primary hover:underline"
          >
            {isCandidate ? 'Create candidate account' : 'Create recruiter account'}
          </Link>
        </p>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          <Link href="/login" className="hover:underline">
            ← Choose a different way to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
