'use client';

import * as React from 'react';
import { Sparkles, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';

export interface EvaluationAreaDraft {
  name: string;
  weight: number;
  targetLevel?: string;
}

export interface BlueprintDraft {
  durationTargetMin: number;
  durationMinMin: number;
  durationMaxMin: number;
  graceSeconds: number;
  maxFollowUpsPerTopic: number;
  evaluationAreas: EvaluationAreaDraft[];
}

const EMPTY_BLUEPRINT: BlueprintDraft = {
  durationTargetMin: 20,
  durationMinMin: 15,
  durationMaxMin: 22,
  graceSeconds: 60,
  maxFollowUpsPerTopic: 2,
  evaluationAreas: [],
};

interface BlueprintEditorProps {
  interviewId: string;
  initialBlueprint: BlueprintDraft | null;
  readOnly: boolean;
  onSaved?: (blueprint: BlueprintDraft) => void;
}

export function BlueprintEditor({ interviewId, initialBlueprint, readOnly, onSaved }: BlueprintEditorProps) {
  const { toast } = useToast();
  const [draft, setDraft] = React.useState<BlueprintDraft>(initialBlueprint ?? EMPTY_BLUEPRINT);
  const [suggesting, setSuggesting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const totalWeight = draft.evaluationAreas.reduce((sum, a) => sum + (Number.isFinite(a.weight) ? a.weight : 0), 0);
  const weightOk = draft.evaluationAreas.length > 0 && Math.abs(totalWeight - 100) < 0.01;

  async function handleSuggest() {
    setSuggesting(true);
    try {
      const res = await fetch(`/api/interviews/${interviewId}/blueprint/suggest`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: 'error', title: 'Could not suggest evaluation areas', description: data.error });
        return;
      }
      setDraft((prev) => ({ ...prev, evaluationAreas: data.evaluationAreas }));
      toast({ variant: 'success', title: 'Suggested evaluation areas', description: 'Review and adjust before saving.' });
    } catch {
      toast({ variant: 'error', title: 'Network error', description: 'Please try again.' });
    } finally {
      setSuggesting(false);
    }
  }

  async function handleSave() {
    if (!weightOk) {
      toast({ variant: 'error', title: 'Weights must sum to 100', description: `Currently ${totalWeight}.` });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/interviews/${interviewId}/blueprint`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: 'error', title: 'Could not save blueprint', description: data.error });
        return;
      }
      toast({ variant: 'success', title: 'Blueprint saved' });
      onSaved?.(draft);
    } catch {
      toast({ variant: 'error', title: 'Network error', description: 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  function updateArea(index: number, patch: Partial<EvaluationAreaDraft>) {
    setDraft((prev) => ({
      ...prev,
      evaluationAreas: prev.evaluationAreas.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    }));
  }

  function removeArea(index: number) {
    setDraft((prev) => ({ ...prev, evaluationAreas: prev.evaluationAreas.filter((_, i) => i !== index) }));
  }

  function addArea() {
    setDraft((prev) => ({ ...prev, evaluationAreas: [...prev.evaluationAreas, { name: '', weight: 0 }] }));
  }

  if (readOnly) {
    return (
      <div className="space-y-3">
        {draft.evaluationAreas.map((area) => (
          <div key={area.name} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{area.name}</p>
              <span className="text-xs text-muted-foreground">{area.weight}%{area.targetLevel ? ` · ${area.targetLevel}` : ''}</span>
            </div>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Target duration {draft.durationTargetMin} min · Max {draft.durationMaxMin} min · Up to{' '}
          {draft.maxFollowUpsPerTopic} follow-ups per topic
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          What this adaptive interview should evaluate. The AI generates questions live during the interview based
          on these areas — no fixed question list to write.
        </p>
        <Button variant="outline" size="sm" onClick={handleSuggest} disabled={suggesting}>
          {suggesting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
          Suggest from job
        </Button>
      </div>

      <div className="space-y-3">
        {draft.evaluationAreas.map((area, i) => (
          <div key={i} className="flex items-end gap-2 rounded-lg border border-border bg-card p-3">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Area</Label>
              <Input value={area.name} onChange={(e) => updateArea(i, { name: e.target.value })} placeholder="e.g. React" />
            </div>
            <div className="w-24 space-y-1">
              <Label className="text-xs">Weight %</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={area.weight}
                onChange={(e) => updateArea(i, { weight: Number(e.target.value) })}
              />
            </div>
            <div className="w-36 space-y-1">
              <Label className="text-xs">Target level (optional)</Label>
              <Input
                value={area.targetLevel ?? ''}
                onChange={(e) => updateArea(i, { targetLevel: e.target.value || undefined })}
                placeholder="advanced"
              />
            </div>
            <Button variant="ghost" size="icon" onClick={() => removeArea(i)} aria-label="Remove area">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addArea}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add area
        </Button>
        <p className={`text-xs ${weightOk ? 'text-muted-foreground' : 'text-destructive'}`}>
          Weights total {totalWeight}{weightOk ? '' : ' — must total 100'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Min duration (min)</Label>
          <Input
            type="number"
            value={draft.durationMinMin}
            onChange={(e) => setDraft((p) => ({ ...p, durationMinMin: Number(e.target.value) }))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Target duration (min)</Label>
          <Input
            type="number"
            value={draft.durationTargetMin}
            onChange={(e) => setDraft((p) => ({ ...p, durationTargetMin: Number(e.target.value) }))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Max duration (min)</Label>
          <Input
            type="number"
            value={draft.durationMaxMin}
            onChange={(e) => setDraft((p) => ({ ...p, durationMaxMin: Number(e.target.value) }))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Max follow-ups/topic</Label>
          <Input
            type="number"
            value={draft.maxFollowUpsPerTopic}
            onChange={(e) => setDraft((p) => ({ ...p, maxFollowUpsPerTopic: Number(e.target.value) }))}
          />
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving || draft.evaluationAreas.length === 0}>
        {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
        Save blueprint
      </Button>
    </div>
  );
}
