'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';

interface Education {
  id: string;
  degree: string;
  institution: string;
  fieldOfStudy: string | null;
  graduationYear: number | null;
}

const emptyForm = { degree: '', institution: '', fieldOfStudy: '', graduationYear: '' };

export function EducationSection({ initialEducation }: { initialEducation: Education[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [education, setEducation] = React.useState(initialEducation);
  const [editing, setEditing] = React.useState<Education | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<Education | null>(null);
  const [form, setForm] = React.useState(emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  function openAdd() {
    setForm(emptyForm);
    setFormError(null);
    setAdding(true);
  }

  function openEdit(edu: Education) {
    setForm({
      degree: edu.degree,
      institution: edu.institution,
      fieldOfStudy: edu.fieldOfStudy ?? '',
      graduationYear: edu.graduationYear ? String(edu.graduationYear) : '',
    });
    setFormError(null);
    setEditing(edu);
  }

  async function handleSave() {
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        degree: form.degree,
        institution: form.institution,
        fieldOfStudy: form.fieldOfStudy || undefined,
        graduationYear: form.graduationYear ? Number(form.graduationYear) : undefined,
      };
      const url = editing ? `/api/candidate/profile/education/${editing.id}` : '/api/candidate/profile/education';
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
      const saved: Education = data.education;
      setEducation((prev) => (editing ? prev.map((e) => (e.id === saved.id ? saved : e)) : [saved, ...prev]));
      toast({ variant: 'success', title: editing ? 'Education updated' : 'Education added' });
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
      const res = await fetch(`/api/candidate/profile/education/${pendingDelete.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast({ variant: 'error', title: 'Could not delete', description: data?.error });
        return;
      }
      setEducation((prev) => prev.filter((e) => e.id !== pendingDelete.id));
      toast({ variant: 'success', title: 'Education deleted' });
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
        <CardTitle className="text-base">Education</CardTitle>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5" /> Add education
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {education.length === 0 && <p className="text-sm text-muted-foreground">No education added yet.</p>}
        {education.map((edu) => (
          <div key={edu.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">{edu.degree}</p>
              <p className="text-sm text-muted-foreground">
                {edu.institution}
                {edu.fieldOfStudy ? ` · ${edu.fieldOfStudy}` : ''}
              </p>
              {edu.graduationYear && <p className="text-xs text-muted-foreground">{edu.graduationYear}</p>}
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button variant="outline" size="sm" onClick={() => openEdit(edu)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/5"
                onClick={() => setPendingDelete(edu)}
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit education' : 'Add education'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edu-degree">Degree</Label>
              <Input id="edu-degree" value={form.degree} onChange={(e) => setForm((f) => ({ ...f, degree: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edu-institution">Institution</Label>
              <Input
                id="edu-institution"
                value={form.institution}
                onChange={(e) => setForm((f) => ({ ...f, institution: e.target.value }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edu-field">Field of study</Label>
                <Input
                  id="edu-field"
                  value={form.fieldOfStudy}
                  onChange={(e) => setForm((f) => ({ ...f, fieldOfStudy: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edu-year">Graduation year</Label>
                <Input
                  id="edu-year"
                  type="number"
                  value={form.graduationYear}
                  onChange={(e) => setForm((f) => ({ ...f, graduationYear: e.target.value }))}
                />
              </div>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={saving || !form.degree.trim() || !form.institution.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this education entry?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {pendingDelete && `${pendingDelete.degree}, ${pendingDelete.institution}`} will be removed from your profile.
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
