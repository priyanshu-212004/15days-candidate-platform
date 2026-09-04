import { NextResponse } from 'next/server';
import { requireCandidateSession, UnauthorizedError, ForbiddenError } from '@/lib/authz';
import { listMarketplaceJobs } from '@/lib/queries/candidate-jobs';
import { marketplaceJobFiltersSchema } from '@/lib/validations/candidate-jobs';

export async function GET(req: Request) {
  try {
    await requireCandidateSession();

    const { searchParams } = new URL(req.url);
    const parsed = marketplaceJobFiltersSchema.safeParse({
      q: searchParams.get('q') ?? undefined,
      location: searchParams.get('location') ?? undefined,
      workMode: searchParams.get('workMode') ?? undefined,
      employmentType: searchParams.get('employmentType') ?? undefined,
      page: searchParams.get('page') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid search parameters' }, { status: 422 });
    }

    const result = await listMarketplaceJobs(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error('[api/candidate/jobs GET]', err);
    return NextResponse.json({ error: 'Failed to load jobs' }, { status: 500 });
  }
}
