import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ProfileSettingsForm } from '@/components/settings/profile-settings-form';
import { InterviewPreferences, NotificationPreferences, RecruitmentPreferences } from '@/components/settings/local-preferences';
import { User, Video, Bell, Briefcase } from 'lucide-react';

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user.orgId || !session.user.id) redirect('/login');

  const [user, membership] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id }, select: { name: true, email: true } }),
    db.organizationMember.findFirst({
      where: { userId: session.user.id, orgId: session.user.orgId },
      select: { role: true, org: { select: { name: true } } },
    }),
  ]);

  if (!user) redirect('/login');

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account and recruitment preferences.</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <Tabs defaultValue="profile">
            <TabsList className="mb-6 flex-wrap">
              <TabsTrigger value="profile" className="gap-1.5">
                <User className="h-3.5 w-3.5" /> Profile
              </TabsTrigger>
              <TabsTrigger value="interview" className="gap-1.5">
                <Video className="h-3.5 w-3.5" /> Interview
              </TabsTrigger>
              <TabsTrigger value="notifications" className="gap-1.5">
                <Bell className="h-3.5 w-3.5" /> Notifications
              </TabsTrigger>
              <TabsTrigger value="recruitment" className="gap-1.5">
                <Briefcase className="h-3.5 w-3.5" /> Recruitment
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile">
              <ProfileSettingsForm
                initialName={user.name}
                email={user.email}
                orgName={membership?.org.name ?? '—'}
                role={membership?.role ?? '—'}
              />
            </TabsContent>
            <TabsContent value="interview">
              <InterviewPreferences />
            </TabsContent>
            <TabsContent value="notifications">
              <NotificationPreferences />
            </TabsContent>
            <TabsContent value="recruitment">
              <RecruitmentPreferences />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
