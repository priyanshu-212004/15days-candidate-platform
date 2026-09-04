export interface ExistingCandidateRow {
  id: string;
  userId: string | null;
}

export type CandidateLinkAction =
  | { kind: 'REUSE'; candidateId: string } // Case A: already linked to this user
  | { kind: 'LINK'; candidateId: string } // Case B: exists, unlinked — safe to link
  | { kind: 'CONFLICT' } // Case C: exists, linked to a different user — never overwrite
  | { kind: 'CREATE' }; // Case D: no existing row for this org+email

/**
 * Decides how a candidate account (session.user.id) should relate to the
 * org-scoped Candidate row for the org they're applying to, given whatever
 * row (if any) already exists for that org+email. Does not touch the
 * database itself — the caller does the actual find/update/create, this
 * just decides which one is safe.
 */
export function resolveCandidateLinkAction(
  existingByEmail: ExistingCandidateRow | null,
  sessionUserId: string
): CandidateLinkAction {
  if (!existingByEmail) return { kind: 'CREATE' }; // Case D

  if (existingByEmail.userId === sessionUserId) {
    return { kind: 'REUSE', candidateId: existingByEmail.id }; // Case A
  }

  if (existingByEmail.userId === null) {
    return { kind: 'LINK', candidateId: existingByEmail.id }; // Case B
  }

  // existingByEmail.userId is set, and it's not sessionUserId.
  return { kind: 'CONFLICT' }; // Case C
}
