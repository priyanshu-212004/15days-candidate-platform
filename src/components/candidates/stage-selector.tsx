'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';

interface StageOption {
  id: string;
  name: string;
}

interface StageSelectorProps {
  candidateId: string;
  applicationId: string;
  currentStageId: string | null;
  stages: StageOption[];
}

export function StageSelector({ candidateId, applicationId, currentStageId, stages }: StageSelectorProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = React.useState(false);

  async function handleChange(stageId: string) {
    if (stageId === currentStageId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/applications/${applicationId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: 'error', title: 'Could not move candidate', description: data.error });
        return;
      }
      const stageName = stages.find((s) => s.id === stageId)?.name ?? 'new stage';
      toast({ variant: 'success', title: 'Pipeline stage updated', description: `Moved to ${stageName}` });
      router.refresh();
    } catch {
      toast({ variant: 'error', title: 'Network error', description: 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={currentStageId ?? undefined} onValueChange={handleChange} disabled={saving}>
        <SelectTrigger className="w-48" aria-label="Pipeline stage">
          <SelectValue placeholder="No stage set" />
        </SelectTrigger>
        <SelectContent>
          {stages.map((stage) => (
            <SelectItem key={stage.id} value={stage.id}>
              {stage.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
  );
}
