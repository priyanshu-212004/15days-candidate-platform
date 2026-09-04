import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { calculateProfileCompletion } from '@/lib/candidate-profile-completion';
import { createViewUrl, isStorageConfigured } from '@/lib/storage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ProfileCompletionBar } from '@/components/candidate/profile-completion-bar';
import { FileText, Search, ClipboardList, UserRound, Eye, ArrowRight } from 'lucide-react';

export const metadata: Metadata = { title: 'Candidate dashboard — 15days.io' };

function initials(name: string | null | undefined) {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('');
}

export default async function CandidateHomePage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.userType !== 'CANDIDATE') redirect('/login');

  const profile = await db.candidateProfile.findUnique({ where: { userId: session.user.id } });
  if (!profile) redirect('/login');

  const [experienceCount, educationCount, applications] = await Promise.all([
    db.candidateExperience.count({ where: { candidateProfileId: profile.id } }),
    db.candidateEducation.count({ where: { candidateProfileId: profile.id } }),
    db.application.findMany({
      where: { candidate: { userId: session.user.id } },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, job: { select: { title: true, org: { select: { name: true } } } } },
    }),
  ]);

  const completion = calculateProfileCompletion({
    phone: profile.phone,
    location: profile.location,
    currentTitle: profile.currentTitle,
    totalExperienceYears: profile.totalExperienceYears,
    employmentStatus: profile.employmentStatus,
    preferredJobType: profile.preferredJobType,
    preferredWorkMode: profile.preferredWorkMode,
    skills: profile.skills,
    resumeParseStatus: profile.resumeParseStatus,
    resumeStorageKey: profile.resumeStorageKey,
    experienceCount,
    educationCount,
  });

  // Same short-lived signed URL pattern as profile/page.tsx — generated
  // regardless of parse status, since a failed extraction must never block
  // the candidate from viewing their own file.
  const resumeViewUrl =
    profile.resumeStorageKey && isStorageConfigured() ? await createViewUrl(profile.resumeStorageKey) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <div className="flex items-center gap-3">
        <Avatar className="h-11 w-11">
          <AvatarFallback className="text-sm">{initials(session.user.name)}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Welcome back{session.user.name ? `, ${session.user.name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground">Here&apos;s where things stand today.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/candidate/jobs">
          <Card className="h-full transition-colors hover:border-primary/40">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Search className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-sm font-medium">Find Jobs</p>
                <p className="text-xs text-muted-foreground">Browse open roles</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/candidate/applications">
          <Card className="h-full transition-colors hover:border-primary/40">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <ClipboardList className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-sm font-medium">My Applications</p>
                <p className="text-xs text-muted-foreground">Track your progress</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/candidate/profile">
          <Card className="h-full transition-colors hover:border-primary/40">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <UserRound className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-sm font-medium">My Profile</p>
                <p className="text-xs text-muted-foreground">{completion}% complete</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <ProfileCompletionBar percent={completion} />
      {completion < 100 && (
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link href="/candidate/profile">
            Complete your profile <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resume</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          {profile.resumeFileName ? (
            <p className="flex items-center gap-1.5 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground" /> {profile.resumeFileName}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No resume uploaded yet.</p>
          )}
          <div className="flex gap-2">
            {resumeViewUrl && (
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <a href={resumeViewUrl} target="_blank" rel="noopener noreferrer">
                  <Eye className="h-3.5 w-3.5" /> View
                </a>
              </Button>
            )}
            <Button asChild size="sm" variant="outline">
              <Link href="/candidate/profile">{profile.resumeFileName ? 'Manage' : 'Upload'}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {applications.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Recent applications</CardTitle>
            <Link href="/candidate/applications" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {applications.map((app: { id: string; job: { title: string; org: { name: string } } }) => (
              <Link
                key={app.id}
                href={`/candidate/applications/${app.id}`}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
              >
                <span className="font-medium">{app.job.title}</span>
                <span className="text-xs text-muted-foreground">{app.job.org.name}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
