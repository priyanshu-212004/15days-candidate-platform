import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { ClipboardList } from 'lucide-react';

export default async function CandidateApplicationsPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.userType !== 'CANDIDATE') redirect('/login');

  const applications = await db.application.findMany({
    where: { candidate: { userId: session.user.id } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      createdAt: true,
      job: { select: { title: true, org: { select: { name: true } } } },
      currentStage: { select: { name: true } },
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My applications</h1>
        <p className="text-sm text-muted-foreground">
          {applications.length} application{applications.length === 1 ? '' : 's'}
        </p>
      </div>

      {applications.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title="No applications yet"
          description="Once you apply to a job, you'll be able to track its status here."
          action={
            <Button asChild size="sm">
              <Link href="/candidate/jobs">Find jobs</Link>
            </Button>
          }
        />
      )}

      <div className="space-y-3">
        {applications.map(
          (app: {
            id: string;
            status: string;
            createdAt: Date;
            job: { title: string; org: { name: string } };
            currentStage: { name: string } | null;
          }) => (
          <Link key={app.id} href={`/candidate/applications/${app.id}`}>
            <Card className="transition-colors hover:border-primary/40">
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{app.job.title}</p>
                  <p className="text-sm text-muted-foreground">{app.job.org.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Applied {app.createdAt.toLocaleDateString()}
                  </p>
                </div>
                <StatusBadge status={app.currentStage?.name ?? app.status} />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
