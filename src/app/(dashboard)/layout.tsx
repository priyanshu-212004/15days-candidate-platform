import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Sidebar } from '@/components/dashboard/sidebar';
import { Topbar } from '@/components/dashboard/topbar';
import { ToastProvider } from '@/components/ui/toast';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  // Server-side enforcement in addition to middleware — see middleware.ts.
  if (session.user.userType === 'CANDIDATE') redirect('/candidate');

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-surface-sunken">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar />
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
