import 'server-only';
import { db } from '@/lib/db';
import { getSessionApplicationId } from '@/lib/candidate-session-cookie';

/**
 * Resolves the candidate's session from their cookie and re-verifies, on
 * every call, that the referenced Application actually belongs to the
 * interview named in the URL. A cookie alone is never enough — we never
 * trust that a valid-looking id belongs to the resource the request is
 * scoped to.
 */
export async function resolveCandidateSession(token: string) {
  const applicationId = getSessionApplicationId(token);
  if (!applicationId) return null;

  const application = await db.application.findUnique({
    where: { id: applicationId },
    include: {
      interview: {
        select: { id: true, orgId: true, publicToken: true, status: true, expiresAt: true, interviewType: true },
      },
      candidate: { select: { id: true, name: true, email: true } },
    },
  });

  if (!application) return null;
  if (application.interview.publicToken !== token) return null; // cookie doesn't belong to this interview

  return application;
}
