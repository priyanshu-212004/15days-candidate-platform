export type OrgRole = 'OWNER' | 'ADMIN' | 'RECRUITER' | 'VIEWER';

/**
 * A recruiter/comment note item can be modified (edited or deleted) by its
 * own author, or by an org ADMIN/OWNER for moderation purposes. Anyone else
 * — including other RECRUITERs and VIEWERs — can read it but not change it.
 * Used identically by both the notes and comments API routes so the rule
 * can't drift between the two.
 */
export function canModifyDiscussionItem(params: {
  authorId: string;
  currentUserId: string;
  role: OrgRole | string;
}): boolean {
  if (params.authorId === params.currentUserId) return true;
  return params.role === 'ADMIN' || params.role === 'OWNER';
}
