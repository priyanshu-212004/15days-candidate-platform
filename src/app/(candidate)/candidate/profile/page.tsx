import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { calculateProfileCompletion } from '@/lib/candidate-profile-completion';
import { createViewUrl, isStorageConfigured } from '@/lib/storage';
import { ProfileCompletionBar } from '@/components/candidate/profile-completion-bar';
import { PersonalProfessionalSection } from '@/components/candidate/personal-professional-section';
import { ResumeCard } from '@/components/candidate/resume-card';
import { ExperienceSection } from '@/components/candidate/experience-section';
import { EducationSection } from '@/components/candidate/education-section';

export default async function CandidateProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.userType !== 'CANDIDATE') redirect('/login');

  const profile = await db.candidateProfile.findUnique({ where: { userId: session.user.id } });
  if (!profile) redirect('/candidate');

  const [experience, education] = await Promise.all([
    db.candidateExperience.findMany({
      where: { candidateProfileId: profile.id },
      orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }],
    }),
    db.candidateEducation.findMany({
      where: { candidateProfileId: profile.id },
      orderBy: [{ graduationYear: 'desc' }],
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
    experienceCount: experience.length,
    educationCount: education.length,
  });

  // Same pattern the existing recruiter candidate page already uses for
  // resume access (createViewUrl → short-lived signed GET URL, generated
  // server-side after the session/ownership check above has already run —
  // no new API route needed, this reuses the existing secure mechanism).
  // Generated regardless of parseStatus: a failed text-extraction must
  // never block the candidate from viewing/downloading their own file.
  const resumeViewUrl =
    profile.resumeStorageKey && isStorageConfigured() ? await createViewUrl(profile.resumeStorageKey) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
        <p className="text-sm text-muted-foreground">
          Keep this up to date — recruiters see it when you apply.
        </p>
      </div>

      <ProfileCompletionBar percent={completion} />

      <PersonalProfessionalSection
        name={session.user.name ?? ''}
        email={session.user.email ?? ''}
        profile={{
          phone: profile.phone,
          location: profile.location,
          currentTitle: profile.currentTitle,
          currentCompany: profile.currentCompany,
          totalExperienceYears: profile.totalExperienceYears,
          employmentStatus: profile.employmentStatus,
          currentCtc: profile.currentCtc,
          expectedCtc: profile.expectedCtc,
          ctcCurrency: profile.ctcCurrency,
          noticePeriodDays: profile.noticePeriodDays,
          preferredJobType: profile.preferredJobType,
          preferredWorkMode: profile.preferredWorkMode,
          preferredLocations: profile.preferredLocations,
          skills: profile.skills,
          languages: profile.languages,
          certifications: profile.certifications,
        }}
      />

      <ResumeCard
        resume={
          profile.resumeStorageKey
            ? {
                fileName: profile.resumeFileName,
                parseStatus: profile.resumeParseStatus,
                parseError: profile.resumeParseError,
              }
            : null
        }
        viewUrl={resumeViewUrl}
      />

      <ExperienceSection
        initialExperience={experience.map(
          (e: {
            id: string;
            company: string;
            title: string;
            startDate: Date;
            endDate: Date | null;
            isCurrent: boolean;
            description: string | null;
            skills: string[];
          }) => ({
            ...e,
            startDate: e.startDate.toISOString(),
            endDate: e.endDate ? e.endDate.toISOString() : null,
          })
        )}
      />

      <EducationSection initialEducation={education} />
    </div>
  );
}
