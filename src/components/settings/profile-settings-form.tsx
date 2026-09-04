'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';

export function ProfileSettingsForm({
  initialName,
  email,
  orgName,
  role,
}: {
  initialName: string;
  email: string;
  orgName: string;
  role: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = React.useState(initialName);
  const [saving, setSaving] = React.useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: 'error', title: 'Could not update profile', description: data.error });
        return;
      }
      toast({ variant: 'success', title: 'Profile updated' });
      router.refresh();
    } catch {
      toast({ variant: 'error', title: 'Network error', description: 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={email} disabled />
          <p className="text-xs text-muted-foreground">Contact support to change your email address.</p>
        </div>
        <div className="space-y-2">
          <Label>Organization</Label>
          <Input value={orgName} disabled />
        </div>
        <div className="space-y-2">
          <Label>Role</Label>
          <Input value={role} disabled />
        </div>
      </div>
      <Button type="submit" disabled={saving || name.trim().length === 0}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save changes
      </Button>
    </form>
  );
}
