'use client';

/**
 * Candidate-facing voice presets for the AI interviewer's TTS. We never fake
 * an accent by tweaking pitch/rate on an arbitrary voice — each preset is
 * matched to an actual browser `SpeechSynthesisVoice` by BCP-47 language
 * (and, as a tie-breaker, name hints some engines expose). If the browser
 * genuinely has no voice for a preset's language, that preset is reported as
 * unavailable rather than silently substituted, and the UI is expected to
 * fall back to the closest available English voice on the candidate's
 * behalf (see `resolveFallbackVoice`).
 */
export type VoicePresetId = 'en-IN-female' | 'en-IN-male' | 'en-GB' | 'en-US';

export interface VoicePreset {
  id: VoicePresetId;
  label: string;
  description: string;
  lang: string; // BCP-47 prefix to match against voice.lang
  /** Rough gender hint used only to disambiguate between multiple voices that share `lang` — never used to synthesize an accent on its own. */
  genderHint?: 'female' | 'male';
}

export const VOICE_PRESETS: VoicePreset[] = [
  { id: 'en-IN-female', label: 'Indian English — Female', description: 'A female Indian-English voice.', lang: 'en-IN', genderHint: 'female' },
  { id: 'en-IN-male', label: 'Indian English — Male', description: 'A male Indian-English voice.', lang: 'en-IN', genderHint: 'male' },
  { id: 'en-GB', label: 'British English', description: 'A British-English voice.', lang: 'en-GB' },
  { id: 'en-US', label: 'American English', description: 'An American-English voice.', lang: 'en-US' },
];

const FEMALE_NAME_HINTS = ['female', 'woman', 'girl', 'zira', 'susan', 'heera', 'veena', 'lekha', 'samantha', 'karen', 'tessa'];
const MALE_NAME_HINTS = ['male', 'man', 'boy', 'ravi', 'david', 'daniel', 'george', 'rishi', 'guy'];

function nameMatchesGender(name: string, gender: 'female' | 'male'): boolean {
  const lower = name.toLowerCase();
  const hints = gender === 'female' ? FEMALE_NAME_HINTS : MALE_NAME_HINTS;
  return hints.some((hint) => lower.includes(hint));
}

/** All voices whose `lang` matches the given BCP-47 prefix (case-insensitive, tolerant of `en_IN` vs `en-IN`). */
function voicesForLang(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice[] {
  const normalized = lang.toLowerCase().replace('_', '-');
  return voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(normalized));
}

/**
 * Picks the best matching voice for a preset, or `null` if the browser has
 * none for that language at all. When multiple candidates share the
 * language, a name-based gender hint (when the preset has one) is used only
 * to choose between real, distinct voices — never to alter a single voice's
 * output.
 */
export function resolvePresetVoice(voices: SpeechSynthesisVoice[], preset: VoicePreset): SpeechSynthesisVoice | null {
  const candidates = voicesForLang(voices, preset.lang);
  if (candidates.length === 0) return null;
  if (preset.genderHint) {
    const byName = candidates.find((v) => nameMatchesGender(v.name, preset.genderHint!));
    if (byName) return byName;
  }
  return candidates[0] ?? null;
}

/**
 * Closest available English voice to fall back to when a preset's exact
 * language isn't available on this device — tries the other presets' langs
 * in order, then any `en-` voice, then finally the browser/OS default voice.
 * Never returns "no voice" while `voices` is non-empty.
 */
export function resolveFallbackVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  for (const lang of ['en-US', 'en-GB', 'en-IN']) {
    const match = voicesForLang(voices, lang)[0];
    if (match) return match;
  }
  const anyEnglish = voices.find((v) => v.lang.toLowerCase().startsWith('en'));
  if (anyEnglish) return anyEnglish;
  return voices.find((v) => v.default) ?? voices[0] ?? null;
}

export interface ResolvedVoiceOption {
  preset: VoicePreset;
  /** The actual voice to use — either a real match for the preset's language, or the best fallback. */
  voice: SpeechSynthesisVoice | null;
  /** True only when `voice` genuinely matches the preset's own language — false when it's a fallback. */
  available: boolean;
}

/** Resolves every preset against the browser's currently-loaded voice list, computing availability + fallback for each. */
export function resolveAllVoiceOptions(voices: SpeechSynthesisVoice[]): ResolvedVoiceOption[] {
  const fallback = resolveFallbackVoice(voices);
  return VOICE_PRESETS.map((preset) => {
    const match = resolvePresetVoice(voices, preset);
    return { preset, voice: match ?? fallback, available: !!match };
  });
}

/**
 * Loads the browser's voice list, waiting for the async `voiceschanged`
 * event if the list isn't populated yet (Chrome in particular often returns
 * an empty array on the very first synchronous call).
 */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !window.speechSynthesis) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const existing = synth.getVoices();
  if (existing.length > 0) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (voices: SpeechSynthesisVoice[]) => {
      if (settled) return;
      settled = true;
      synth.removeEventListener?.('voiceschanged', onVoicesChanged);
      resolve(voices);
    };
    const onVoicesChanged = () => finish(synth.getVoices());
    synth.addEventListener?.('voiceschanged', onVoicesChanged);
    // Safety net for browsers that never fire voiceschanged at all.
    setTimeout(() => finish(synth.getVoices()), 1000);
  });
}
