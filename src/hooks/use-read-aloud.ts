import * as Speech from 'expo-speech';
import { useEffect, useSyncExternalStore } from 'react';

import type { Verse } from '@/lib/data';

/** Language codes the phone's text-to-speech understands, per Bible language. */
export const SPEECH_LANG = { en: 'en-US', es: 'es-ES', ko: 'ko-KR' } as const;
type SpeechLang = keyof typeof SPEECH_LANG;

/** Cleans a verse for speaking: drops pilcrows, brackets and doubled spaces. */
function speakable(text: string) {
  return text.replace(/[¶[\]<>{}]/g, ' ').replace(/\s+/g, ' ').trim();
}

type NarratorState = {
  /** The player bar is showing. */
  open: boolean;
  playing: boolean;
  /** Verse number being read (or where it will resume). */
  verse: number | null;
};

type NarratorOptions = {
  lang: SpeechLang;
  rate: number;
  voice: string | undefined;
  /** Turns to the next chapter; returns false at the end of the Bible. */
  onChapterEnd: () => boolean;
};

/**
 * Reads a chapter aloud, verse by verse, with the device's built-in voice, and keeps going into
 * the next chapter. "Pause" stops and remembers the verse, because Android can't pause mid-sentence.
 */
class Narrator {
  private state: NarratorState = { open: false, playing: false, verse: null };
  private listeners = new Set<() => void>();
  // Each utterance gets a token; callbacks from older utterances (after stop/skip) are ignored.
  private token = 0;
  private verses: Verse[] | null = null;
  private key: string | null = null;
  private playingKey: string | null = null;
  private opts: NarratorOptions = { lang: 'en', rate: 1, voice: undefined, onChapterEnd: () => false };

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getState = () => this.state;

  private set(patch: Partial<NarratorState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private indexOf(v: number | null) {
    if (!this.verses || v == null) return 0;
    return Math.max(0, this.verses.findIndex((x) => x.v === v));
  }

  private silence() {
    this.token++;
    Speech.stop();
  }

  private speakAt(index: number) {
    this.silence();
    const mine = this.token;
    const verses = this.verses;
    if (!verses) return;
    this.playingKey = this.key;
    if (index >= verses.length) {
      // End of the chapter: turn the page; reading continues once the next chapter's verses arrive.
      this.set({ verse: null });
      if (!this.opts.onChapterEnd()) this.set({ playing: false });
      return;
    }
    const v = verses[index];
    this.set({ verse: v.v, playing: true });
    Speech.speak(speakable(v.text), {
      language: SPEECH_LANG[this.opts.lang],
      voice: this.opts.voice,
      rate: this.opts.rate,
      onDone: () => {
        if (this.token === mine) this.speakAt(index + 1);
      },
      onError: () => {
        if (this.token === mine) this.set({ playing: false });
      },
    });
  }

  configure(opts: NarratorOptions) {
    const changed = opts.rate !== this.opts.rate || opts.voice !== this.opts.voice || opts.lang !== this.opts.lang;
    this.opts = opts;
    // New speed or voice while reading: say the current verse again with it.
    if (changed && this.state.playing && this.playingKey === this.key) this.speakAt(this.indexOf(this.state.verse));
  }

  /** The chapter on screen (verses are null while loading). */
  setChapter(key: string, verses: Verse[] | null) {
    this.key = key;
    this.verses = verses;
    if (this.playingKey !== key) {
      if (this.state.playing && verses) this.speakAt(0);
      else if (!this.state.playing) this.set({ verse: null });
    }
  }

  start(fromVerse?: number) {
    this.set({ open: true });
    this.speakAt(this.indexOf(fromVerse ?? null));
  }
  pause() {
    this.silence();
    this.set({ playing: false });
  }
  resume() {
    this.speakAt(this.playingKey === this.key ? this.indexOf(this.state.verse) : 0);
  }
  skip(delta: number) {
    if (!this.verses) return;
    this.speakAt(Math.min(this.verses.length - 1, Math.max(0, this.indexOf(this.state.verse) + delta)));
  }
  close() {
    this.silence();
    this.playingKey = null;
    this.set({ open: false, playing: false, verse: null });
  }
}

export const narrator = new Narrator();

/** Connects the reader to the narrator and returns the player state. */
export function useReadAloud({
  verses,
  book,
  chapter,
  ...opts
}: NarratorOptions & { verses: Verse[] | undefined; book: number; chapter: number }) {
  const state = useSyncExternalStore(narrator.subscribe, narrator.getState, narrator.getState);
  // Only pass verses that belong to the chapter on screen (the old chapter's verses linger while loading).
  const loaded = verses && verses.length > 0 && verses[0].book === book && verses[0].ch === chapter ? verses : null;
  const key = `${book}:${chapter}`;

  useEffect(() => {
    narrator.configure(opts);
  });
  useEffect(() => {
    narrator.setChapter(key, loaded);
  }, [key, loaded]);
  // Stop talking when the reader goes away.
  useEffect(() => () => narrator.close(), []);

  return state;
}

/** Voices installed on this device for a Bible language (best quality first). */
export async function voicesFor(lang: SpeechLang) {
  const all = await Speech.getAvailableVoicesAsync();
  return all
    .filter((v) => v.language?.toLowerCase().replace('_', '-').startsWith(lang))
    .sort((a, b) => (a.quality === b.quality ? a.name.localeCompare(b.name) : a.quality === 'Enhanced' ? -1 : 1));
}
