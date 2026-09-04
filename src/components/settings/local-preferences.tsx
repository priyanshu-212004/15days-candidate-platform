'use client';

import * as React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { UnsavedPreferenceNotice } from './unsaved-preference-notice';

interface ToggleRow {
  id: string;
  label: string;
  description: string;
  defaultChecked?: boolean;
}

function TogglePreferences({ rows }: { rows: ToggleRow[] }) {
  const [state, setState] = React.useState<Record<string, boolean>>(
    Object.fromEntries(rows.map((r) => [r.id, r.defaultChecked ?? true]))
  );

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3">
          <div>
            <Label htmlFor={row.id} className="cursor-pointer">
              {row.label}
            </Label>
            <p className="text-xs text-muted-foreground">{row.description}</p>
          </div>
          <Switch
            id={row.id}
            checked={state[row.id]}
            onCheckedChange={(checked) => setState((prev) => ({ ...prev, [row.id]: checked }))}
          />
        </div>
      ))}
    </div>
  );
}

export function InterviewPreferences() {
  const [targetMinutes, setTargetMinutes] = React.useState(20);
  return (
    <div className="space-y-4">
      <UnsavedPreferenceNotice />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="target-duration">Suggested interview duration (minutes)</Label>
          <Input
            id="target-duration"
            type="number"
            min={5}
            max={90}
            value={targetMinutes}
            onChange={(e) => setTargetMinutes(Number(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">
            Used as the starting default when you create a new adaptive interview blueprint.
          </p>
        </div>
      </div>
      <TogglePreferences
        rows={[
          {
            id: 'voice-interviews',
            label: 'Enable adaptive voice interviews',
            description: 'Show the adaptive voice interview option when creating new interviews.',
          },
          {
            id: 'video-recording',
            label: 'Record candidate video by default',
            description: 'Video recording still depends on object storage being configured for this deployment.',
          },
        ]}
      />
    </div>
  );
}

export function NotificationPreferences() {
  return (
    <div className="space-y-4">
      <UnsavedPreferenceNotice />
      <TogglePreferences
        rows={[
          {
            id: 'interview-complete',
            label: 'Interview completion notifications',
            description: 'Notify me when a candidate finishes an interview.',
          },
          {
            id: 'evaluation-ready',
            label: 'Evaluation ready notifications',
            description: 'Notify me when an AI evaluation finishes processing.',
          },
          {
            id: 'weekly-digest',
            label: 'Weekly summary email',
            description: 'A weekly digest of new candidates and pipeline activity.',
          },
        ]}
      />
    </div>
  );
}

export function RecruitmentPreferences() {
  return (
    <div className="space-y-4">
      <UnsavedPreferenceNotice />
      <TogglePreferences
        rows={[
          {
            id: 'auto-shortlist',
            label: 'Suggest shortlisting high scorers',
            description: 'Highlight candidates scoring above your evaluation threshold in the pipeline.',
          },
          {
            id: 'require-resume',
            label: 'Require resume uploads by default',
            description: 'Pre-select "Require CV" when creating new interviews.',
          },
        ]}
      />
    </div>
  );
}
