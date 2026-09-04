import Link from 'next/link';
import type { Metadata } from 'next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CandidateSignupForm } from './candidate-signup-form';

export const metadata: Metadata = { title: 'Create your candidate account — 15days.io' };

export default function CandidateSignupPage() {
  return (
    <Card className="shadow-elevated">
      <CardHeader>
        <CardTitle className="text-xl">Create your candidate account</CardTitle>
        <CardDescription>Find jobs and track your applications across companies.</CardDescription>
      </CardHeader>
      <CardContent>
        <CandidateSignupForm />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login?role=candidate" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
