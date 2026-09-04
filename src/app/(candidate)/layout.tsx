import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ToastProvider } from '@/components/ui/toast';
import { CandidateNav } from '@/components/candidate/candidate-nav';
import { ThemeToggle } from '@/components/theme-toggle';

// Candidate counterpart of (dashboard)/layout.tsx. Phase 5 fills in the
// full nav shape (Home / Find Jobs / My Applications / My Profile
// functional; My Interviews / Mock Interview / Settings placeholders) —
// see components/candidate/candidate-nav.tsx. The theme toggle reuses the
// existing next-themes setup from the root layout (ThemeProvider already
// wraps the whole app) and the existing ThemeToggle component already used
// on the recruiter side — nothing new to build there, just surfaced here.
export default async function CandidateLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  // Server-side enforcement in addition to middleware — see middleware.ts.
  if (session.user.userType !== 'CANDIDATE') redirect('/dashboard');

  return (
    <ToastProvider>
      <div className="min-h-screen bg-surface-sunken">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 lg:px-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
              <Link href="/candidate" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  15
                </span>
                15days.io
              </Link>
              <CandidateNav />
            </div>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto max-w-5xl p-4 lg:p-6">{children}</main>
      </div>
    </ToastProvider>
  );
}
