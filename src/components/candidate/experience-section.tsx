'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { TagInput } from '@/components/ui/tag-input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';

interface Experience {
  id: string;
  company: string;
  title: string;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
  skills: string[];
}

const emptyForm = {
  company: '',
  title: '',
  startDate: '',
  endDate: '',
  isCurrent: false,
  description: '',
  skills: [] as string[],
};

function formatRange(exp: Experience) {
  const start = new Date(exp.startDate).getFullYear();
  const end = exp.isCurrent ? 'Present' : exp.endDate ? new Date(exp.endDate).getFullYear() : '—';
  return `${start} - ${end}`;
}

export function ExperienceSection({ initialExperience }: { initialExperience: Experience[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [experience, setExperience] = React.useState(initialExperience);
  const [editing, setEditing] = React.useState<Experience | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<Experience | null>(null);
  const [form, setForm] = React.useState(emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  function openAdd() {
    setForm(emptyForm);
    setFormError(null);
    setAdding(true);
  }

  function openEdit(exp: Experience) {
    setForm({
      company: exp.company,
      title: exp.title,
      startDate: exp.startDate.slice(0, 10),
      endDate: exp.endDate ? exp.endDate.slice(0, 10) : '',
      isCurrent: exp.isCurrent,
      description: exp.description ?? '',
      skills: exp.skills,
    });
    setFormError(null);
    setEditing(exp);
  }

  async function handleSave() {
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        ...form,
        endDate: form.isCurrent ? null : form.endDate || null,
      };
      const url = editing ? `/api/candidate/profile/experience/${editing.id}` : '/api/candidate/profile/experience';
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(data?.error ?? 'Could not save this entry.');
        return;
      }
      const saved: Experience = data.experience;
      setExperience((prev) => {
        const next = editing ? prev.map((e) => (e.id === saved.id ? saved : e)) : [saved, ...prev];
        return next;
      });
      toast({ variant: 'success', title: editing ? 'Experience updated' : 'Experience added' });
      setEditing(null);
      setAdding(false);
      router.refresh();
    } catch {
      setFormError('Network error — please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/candidate/profile/experience/${pendingDelete.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast({ variant: 'error', title: 'Could not delete', description: data?.error });
        return;
      }
      setExperience((prev) => prev.filter((e) => e.id !== pendingDelete.id));
      toast({ variant: 'success', title: 'Experience deleted' });
      setPendingDelete(null);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  const dialogOpen = adding || !!editing;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Work experience</CardTitle>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5" /> Add experience
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {experience.length === 0 && <p className="text-sm text-muted-foreground">No experience added yet.</p>}
        {experience.map((exp) => (
          <div key={exp.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">{exp.title}</p>
              <p className="text-sm text-muted-foreground">{exp.company}</p>
              <p className="text-xs text-muted-foreground">{formatRange(exp)}</p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button variant="outline" size="sm" onClick={() => openEdit(exp)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/5"
                onClick={() => setPendingDelete(exp)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAdding(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit experience' : 'Add experience'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="exp-company">Company</Label>
                <Input
                  id="exp-company"
                  value={form.company}
                  onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exp-title">Job title</Label>
                <Input
                  id="exp-title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exp-start">Start date</Label>
                <Input
                  id="exp-start"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exp-end">End date</Label>
                <Input
                  id="exp-end"
                  type="date"
                  disabled={form.isCurrent}
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="exp-current"
                checked={form.isCurrent}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, isCurrent: checked, endDate: checked ? '' : f.endDate }))}
              />
              <Label htmlFor="exp-current">I currently work here</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-description">Description</Label>
              <Textarea
                id="exp-description"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-skills">Skills used</Label>
              <TagInput
                id="exp-skills"
                value={form.skills}
                onChange={(v) => setForm((f) => ({ ...f, skills: v }))}
                placeholder="Add a skill and press Enter"
              />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleSave}
              disabled={saving || !form.company.trim() || !form.title.trim() || !form.startDate}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this experience?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {pendingDelete && `${pendingDelete.title} at ${pendingDelete.company}`} will be removed from your profile.
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
