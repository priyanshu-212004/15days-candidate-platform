// Weighted sections, each contributing up to its own share of 100. Kept as
// simple presence checks (not stored anywhere) so the number is always a
// live reflection of the actual profile — see Phase 4 spec §13.
const SECTION_WEIGHTS = {
  personal: 15, // phone + location
  professional: 20, // currentTitle + totalExperienceYears + employmentStatus
  preferences: 10, // preferredJobType + preferredWorkMode
  skills: 15,
  resume: 20,
  experience: 10,
  education: 10,
} as const;

export interface ProfileCompletionInput {
  phone?: string | null;
  location?: string | null;
  currentTitle?: string | null;
  totalExperienceYears?: number | null;
  employmentStatus?: string | null;
  preferredJobType?: string | null;
  preferredWorkMode?: string | null;
  skills?: string[];
  resumeParseStatus?: string | null;
  resumeStorageKey?: string | null;
  experienceCount: number;
  educationCount: number;
}

function hasText(v: string | null | undefined): boolean {
  return !!v && v.trim().length > 0;
}

/** Returns an integer 0–100. Deterministic — no I/O, no randomness, unit-testable in isolation. */
export function calculateProfileCompletion(input: ProfileCompletionInput): number {
  let score = 0;

  if (hasText(input.phone) && hasText(input.location)) {
    score += SECTION_WEIGHTS.personal;
  }
  if (hasText(input.currentTitle) && input.totalExperienceYears != null && hasText(input.employmentStatus)) {
    score += SECTION_WEIGHTS.professional;
  }
  if (hasText(input.preferredJobType) && hasText(input.preferredWorkMode)) {
    score += SECTION_WEIGHTS.preferences;
  }
  if ((input.skills?.length ?? 0) > 0) {
    score += SECTION_WEIGHTS.skills;
  }
  if (hasText(input.resumeStorageKey)) {
    score += SECTION_WEIGHTS.resume;
  }
  if (input.experienceCount > 0) {
    score += SECTION_WEIGHTS.experience;
  }
  if (input.educationCount > 0) {
    score += SECTION_WEIGHTS.education;
  }

  return Math.min(100, score);
}
