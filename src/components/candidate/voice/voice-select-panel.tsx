'use client';

import * as React from 'react';
import { Volume2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createTtsController } from '@/lib/voice/tts';
import { loadVoices, resolveAllVoiceOptions, type VoicePresetId, type ResolvedVoiceOption } from '@/lib/voice/voice-options';

const TEST_PHRASE = "Hello, I'm your AI interviewer today. Let's get started when you're ready.";

export interface SelectedVoice {
  presetId: VoicePresetId;
  voice: SpeechSynthesisVoice | null;
}

export function VoiceSelectPanel({ onConfirm }: { onConfirm: (selection: SelectedVoice) => void }) {
  const [loading, setLoading] = React.useState(true);
  const [options, setOptions] = React.useState<ResolvedVoiceOption[]>([]);
  const [selectedId, setSelectedId] = React.useState<VoicePresetId | null>(null);
  const [testingId, setTestingId] = React.useState<VoicePresetId | null>(null);
  const ttsRef = React.useRef(createTtsController());

  React.useEffect(() => {
    let cancelled = false;
    const tts = ttsRef.current;
    (async () => {
      const voices = await loadVoices();
      if (cancelled) return;
      const resolved = resolveAllVoiceOptions(voices);
      setOptions(resolved);
      setSelectedId(resolved.find((o) => o.available)?.preset.id ?? resolved[0]?.preset.id ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      tts.cancel();
    };
  }, []);

  const selected = options.find((o) => o.preset.id === selectedId) ?? null;

  const handleTestVoice = React.useCallback(
    (option: ResolvedVoiceOption) => {
      setTestingId(option.preset.id);
      void ttsRef.current
        .speak(TEST_PHRASE, { voice: option.voice })
        .catch(() => undefined)
        .finally(() => setTestingId((current) => (current === option.preset.id ? null : current)));
    },
    []
  );

  const handleContinue = React.useCallback(() => {
    ttsRef.current.cancel();
    if (!selected) {
      onConfirm({ presetId: 'en-US', voice: null });
      return;
    }
    onConfirm({ presetId: selected.preset.id, voice: selected.voice });
  }, [selected, onConfirm]);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-lg justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const noTtsAtAll = !ttsRef.current.isSupported;

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardContent className="space-y-5 p-6 sm:p-8">
          <div className="space-y-1.5">
            <h1 className="text-lg font-semibold">Choose your interviewer&apos;s voice</h1>
            <p className="text-sm text-muted-foreground">
              Pick the voice you&apos;d like the AI interviewer to use for this interview. You can preview each
              option before starting.
            </p>
          </div>

          {noTtsAtAll ? (
            <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm text-warning-foreground">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Your browser doesn&apos;t support spoken questions. The interview will still work — questions will be
                shown as captions instead.
              </p>
            </div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {options.map((option) => {
                const isSelected = option.preset.id === selectedId;
                return (
                  <div
                    key={option.preset.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(option.preset.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedId(option.preset.id);
                      }
                    }}
                    className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-3.5 text-left transition-colors ${
                      isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-surface-sunken'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">{option.preset.label}</span>
                      {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{option.preset.description}</p>
                    {!option.available && (
                      <p className="text-xs italic text-warning-foreground">
                        Not available on this device — will use the closest available voice instead.
                      </p>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-1 w-fit gap-1.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTestVoice(option);
                      }}
                      disabled={testingId === option.preset.id}
                    >
                      {testingId === option.preset.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Volume2 className="h-3.5 w-3.5" />
                      )}
                      Test voice
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end pt-1">
            <Button onClick={handleContinue}>Continue to interview</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
