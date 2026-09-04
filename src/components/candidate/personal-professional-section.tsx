'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TagInput } from '@/components/ui/tag-input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';

const JOB_TYPES = [
  { value: 'FULL_TIME', label: 'Full-time' },
  { value: 'PART_TIME', label: 'Part-time' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'INTERNSHIP', label: 'Internship' },
];
const WORK_MODES = [
  { value: 'REMOTE', label: 'Remote' },
  { value: 'HYBRID', label: 'Hybrid' },
  { value: 'ON_SITE', label: 'On-site' },
];

interface ProfileData {
  phone: string | null;
  location: string | null;
  currentTitle: string | null;
  currentCompany: string | null;
  totalExperienceYears: number | null;
  employmentStatus: string | null;
  currentCtc: number | null;
  expectedCtc: number | null;
  ctcCurrency: string;
  noticePeriodDays: number | null;
  preferredJobType: string | null;
  preferredWorkMode: string | null;
  preferredLocations: string[];
  skills: string[];
  languages: string[];
  certifications: string[];
}

function displayLabel(options: { value: string; label: string }[], value: string | null) {
  return options.find((o) => o.value === value)?.label ?? '—';
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value || <span className="text-muted-foreground">—</span>}</p>
    </div>
  );
}

export function PersonalProfessionalSection({
  name,
  email,
  profile,
}: {
  name: string;
  email: string;
  profile: ProfileData;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState(profile);

  React.useEffect(() => {
    if (open) setForm(profile);
  }, [open, profile]);

  function set<K extends keyof ProfileData>(key: K, value: ProfileData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/candidate/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast({ variant: 'error', title: 'Could not update profile', description: data?.error });
        return;
      }
      toast({ variant: 'success', title: 'Profile updated' });
      setOpen(false);
      router.refresh();
    } catch {
      toast({ variant: 'error', title: 'Network error', description: 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Personal &amp; professional</CardTitle>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" value={name} />
          <Field label="Email" value={email} />
          <Field label="Phone" value={profile.phone} />
          <Field label="Location" value={profile.location} />
          <Field label="Current title" value={profile.currentTitle} />
          <Field label="Current company" value={profile.currentCompany} />
          <Field label="Employment status" value={profile.employmentStatus} />
          <Field
            label="Total experience"
            value={profile.totalExperienceYears != null ? `${profile.totalExperienceYears} yrs` : null}
          />
          <Field
            label="Current CTC"
            value={profile.currentCtc != null ? `${profile.ctcCurrency} ${profile.currentCtc.toLocaleString()}` : null}
          />
          <Field
            label="Expected CTC"
            value={
              profile.expectedCtc != null ? `${profile.ctcCurrency} ${profile.expectedCtc.toLocaleString()}` : null
            }
          />
          <Field label="Notice period" value={profile.noticePeriodDays != null ? `${profile.noticePeriodDays} days` : null} />
          <Field label="Preferred job type" value={displayLabel(JOB_TYPES, profile.preferredJobType)} />
          <Field label="Preferred work mode" value={displayLabel(WORK_MODES, profile.preferredWorkMode)} />
          <div className="sm:col-span-2">
            <Field label="Preferred locations" value={profile.preferredLocations.join(', ')} />
          </div>
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-xs text-muted-foreground">Skills</p>
            {profile.skills.length ? (
              <div className="flex flex-wrap gap-1.5">
                {profile.skills.map((s) => (
                  <span key={s} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
                    {s}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-xs text-muted-foreground">Languages</p>
            {profile.languages.length ? (
              <div className="flex flex-wrap gap-1.5">
                {profile.languages.map((s) => (
                  <span key={s} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
                    {s}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-xs text-muted-foreground">Certifications</p>
            {profile.certifications.length ? (
              <ul className="list-inside list-disc text-sm">
                {profile.certifications.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>Recruiters see this when you apply to a job.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} disabled />
              <p className="text-xs text-muted-foreground">
                Your email is your login identity and can&apos;t be changed here.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input id="location" value={form.location ?? ''} onChange={(e) => set('location', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currentTitle">Current title</Label>
                <Input
                  id="currentTitle"
                  value={form.currentTitle ?? ''}
                  onChange={(e) => set('currentTitle', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currentCompany">Current company</Label>
                <Input
                  id="currentCompany"
                  value={form.currentCompany ?? ''}
                  onChange={(e) => set('currentCompany', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employmentStatus">Employment status</Label>
                <Input
                  id="employmentStatus"
                  placeholder="e.g. Employed, Open to work"
                  value={form.employmentStatus ?? ''}
                  onChange={(e) => set('employmentStatus', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="totalExperienceYears">Total experience (years)</Label>
                <Input
                  id="totalExperienceYears"
                  type="number"
                  min={0}
                  max={60}
                  step={0.5}
                  value={form.totalExperienceYears ?? ''}
                  onChange={(e) => set('totalExperienceYears', e.target.value === '' ? null : Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currentCtc">Current CTC</Label>
                <Input
                  id="currentCtc"
                  type="number"
                  min={0}
                  value={form.currentCtc ?? ''}
                  onChange={(e) => set('currentCtc', e.target.value === '' ? null : Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expectedCtc">Expected CTC</Label>
                <Input
                  id="expectedCtc"
                  type="number"
                  min={0}
                  value={form.expectedCtc ?? ''}
                  onChange={(e) => set('expectedCtc', e.target.value === '' ? null : Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ctcCurrency">Currency</Label>
                <Input
                  id="ctcCurrency"
                  maxLength={3}
                  value={form.ctcCurrency}
                  onChange={(e) => set('ctcCurrency', e.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="noticePeriodDays">Notice period (days)</Label>
                <Input
                  id="noticePeriodDays"
                  type="number"
                  min={0}
                  max={365}
                  value={form.noticePeriodDays ?? ''}
                  onChange={(e) => set('noticePeriodDays', e.target.value === '' ? null : Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Preferred job type</Label>
                <Select
                  value={form.preferredJobType ?? undefined}
                  onValueChange={(v) => set('preferredJobType', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {JOB_TYPES.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Preferred work mode</Label>
                <Select
                  value={form.preferredWorkMode ?? undefined}
                  onValueChange={(v) => set('preferredWorkMode', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {WORK_MODES.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="preferredLocations">Preferred locations</Label>
              <TagInput
                id="preferredLocations"
                value={form.preferredLocations}
                onChange={(v) => set('preferredLocations', v)}
                placeholder="Add a location and press Enter"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="skills">Skills</Label>
              <TagInput id="skills" value={form.skills} onChange={(v) => set('skills', v)} placeholder="Add a skill and press Enter" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="languages">Languages</Label>
              <TagInput
                id="languages"
                value={form.languages}
                onChange={(v) => set('languages', v)}
                placeholder="Add a language and press Enter"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="certifications">Certifications</Label>
              <TagInput
                id="certifications"
                value={form.certifications}
                onChange={(v) => set('certifications', v)}
                placeholder="Add a certification and press Enter"
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
