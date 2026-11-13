import { getHub, hubFetch } from '@/lib/hub';

/** Natural voices made by the hub's voice service (Supertonic 3). */
export const NATURAL_VOICES = ['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5'] as const;

/** Voices picked by ear as the defaults for each language. */
export const DEFAULT_NATURAL: Record<'en' | 'es' | 'ko', string> = { en: 'F2', es: 'F1', ko: 'F1' };

export type VoiceStatus = { available: boolean; voices: string[] };

/** Is the hub's voice service running? (false when not signed in) */
export async function getVoiceStatus(): Promise<VoiceStatus> {
  if (!getHub()) return { available: false, voices: [] };
  try {
    return await hubFetch<VoiceStatus>('/api/lampara/voice/status');
  } catch {
    return { available: false, voices: [] };
  }
}

/** Address + sign-in header for one verse's audio. */
export function voiceSource(text: string, lang: string, voice: string) {
  const hub = getHub();
  if (!hub) return null;
  const q = `lang=${lang}&voice=${voice}&text=${encodeURIComponent(text)}`;
  return { uri: `${hub.url}/api/lampara/voice?${q}`, headers: { Authorization: hub.token } };
}

/** Asks the hub to make these verses in the background, so they play right away later. */
export function warmVoices(texts: string[], lang: string, voice: string) {
  if (!getHub() || texts.length === 0) return;
  hubFetch('/api/lampara/voice/warm', { method: 'POST', body: { texts, lang, voice } }).catch(() => {});
}
