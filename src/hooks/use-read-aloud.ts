import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioSource } from 'expo-audio';
import * as Speech from 'expo-speech';
import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import type { Verse } from '@/lib/data';
import { voiceSource } from '@/lib/hub-voice';

/** Language codes the phone's text-to-speech understands, per Bible language. */
export const SPEECH_LANG = { en: 'en-US', es: 'es-ES', ko: 'ko-KR' } as const;
type SpeechLang = keyof typeof SPEECH_LANG;

/** Cleans a verse for speaking: drops pilcrows and brackets; old Spanish "á"/"é"/"ó"/"ú" words read as plain vowels. */
export function speakable(text: string, lang: SpeechLang) {
  let s = text.replace(/[¶[\]<>{}]/g, ' ');
  if (lang === 'es') s = s.replace(/(^|[\s,;:(])([áéóú])(?=[\s,;:.)]|$)/gi, (_, pre: string, v: string) => pre + v.normalize('NFD')[0]);
  return s.replace(/\s+/g, ' ').trim();
}

type NarratorState = {
  /** The player bar is showing. */
  open: boolean;
  playing: boolean;
  /** Verse number being read (or where it will resume). */
  verse: number | null;
  /** Which voice is actually reading. */
  engine: 'natural' | 'device';
  /** The hub's voice couldn't be reached, so the phone's voice took over. */
  fellBack: boolean;
};

type NarratorOptions = {
  lang: SpeechLang;
  rate: number;
  /** Device voice identifier (phone voice). */
  voice: string | undefined;
  /** Preferred engine, the hub's natural voice for this language, and whether the hub's voice service is up. */
  engine: 'natural' | 'device';
  naturalVoice: string;
  naturalOk: boolean;
  /** Shown on the lock screen, e.g. "John 3". */
  title: string;
  /** Turns to the next chapter; returns false at the end of the Bible. */
  onChapterEnd: () => boolean;
};

const PREFETCH = 2;
const KEEP = 24;

/**
 * Reads a chapter aloud, verse by verse, and keeps going into the next chapter.
 * Natural voice: each verse is an MP3 made by the hub (the next verses are requested ahead of time).
 * Phone voice: the device's text-to-speech ("pause" restarts the verse, because Android can't pause it).
 */
class Narrator {
  private state: NarratorState = { open: false, playing: false, verse: null, engine: 'device', fellBack: false };
  private listeners = new Set<() => void>();
  // Each verse gets a token; callbacks from older verses (after stop/skip) are ignored.
  private token = 0;
  private verses: Verse[] | null = null;
  private key: string | null = null;
  private playingKey: string | null = null;
  private opts: NarratorOptions = {
    lang: 'en',
    rate: 1,
    voice: undefined,
    engine: 'device',
    naturalVoice: 'F1',
    naturalOk: false,
    title: '',
    onChapterEnd: () => false,
  };
  private player: AudioPlayer | null = null;
  private onFinish: (() => void) | null = null;
  private pausedNatural = false;
  private naturalFailed = false;
  private audioModeSet = false;
  private lockScreen = false;
  // Verse audio already requested from the hub: key -> playable source.
  private audio = new Map<string, Promise<AudioSource>>();

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getState = () => this.state;

  private set(patch: Partial<NarratorState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private useNatural() {
    return this.opts.engine === 'natural' && this.opts.naturalOk && !this.naturalFailed;
  }

  private indexOf(v: number | null) {
    if (!this.verses || v == null) return 0;
    return Math.max(0, this.verses.findIndex((x) => x.v === v));
  }

  private silence() {
    this.token++;
    this.onFinish = null;
    this.pausedNatural = false;
    Speech.stop();
    this.player?.pause();
  }

  private ensurePlayer() {
    if (!this.player) {
      const p = createAudioPlayer(null);
      p.shouldCorrectPitch = true;
      p.addListener('playbackStatusUpdate', (s) => {
        if (s.didJustFinish) this.onFinish?.();
      });
      this.player = p;
    }
    if (!this.audioModeSet) {
      this.audioModeSet = true;
      // Keep reading with the screen off; pause other apps' audio while reading.
      setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' }).catch(() => {});
    }
    return this.player;
  }

  /** Asks the hub for a verse's audio (once), so it's ready by the time it's needed. */
  private fetchAudio(text: string): Promise<AudioSource> {
    const { lang, naturalVoice } = this.opts;
    const k = `${lang}|${naturalVoice}|${text}`;
    const have = this.audio.get(k);
    if (have) return have;
    const p = (async (): Promise<AudioSource> => {
      const src = voiceSource(text, lang, naturalVoice);
      if (!src) throw new Error('Not signed in to a hub.');
      const res = await fetch(src.uri, { headers: src.headers });
      if (!res.ok) throw new Error(`Voice error ${res.status}`);
      if (Platform.OS === 'web') return URL.createObjectURL(await res.blob());
      await res.arrayBuffer(); // made and cached on the hub; the player streams it from there
      return src;
    })();
    p.catch(() => this.audio.delete(k));
    this.audio.set(k, p);
    // Forget the oldest entries (and free browser memory).
    while (this.audio.size > KEEP) {
      const [oldKey, old] = this.audio.entries().next().value!;
      this.audio.delete(oldKey);
      if (Platform.OS === 'web') old.then((u) => typeof u === 'string' && URL.revokeObjectURL(u)).catch(() => {});
    }
    return p;
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
    this.set({ verse: v.v, playing: true, engine: this.useNatural() ? 'natural' : 'device' });
    if (this.useNatural()) this.playNatural(index, mine);
    else this.speakDevice(index, mine);
  }

  private speakDevice(index: number, mine: number) {
    const v = this.verses![index];
    Speech.speak(speakable(v.text, this.opts.lang), {
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

  private async playNatural(index: number, mine: number) {
    const verses = this.verses!;
    const v = verses[index];
    const text = speakable(v.text, this.opts.lang);
    // Ask for the next verses now so the hub makes them while this one plays.
    for (let j = index + 1; j <= index + PREFETCH && j < verses.length; j++) {
      this.fetchAudio(speakable(verses[j].text, this.opts.lang)).catch(() => {});
    }
    try {
      const src = await this.fetchAudio(text);
      if (this.token !== mine) return;
      const p = this.ensurePlayer();
      this.onFinish = () => {
        if (this.token === mine) this.speakAt(index + 1);
      };
      p.replace(src);
      p.setPlaybackRate(this.opts.rate);
      p.play();
      this.showOnLockScreen(v.v);
    } catch {
      if (this.token !== mine) return;
      // Hub unreachable: carry on with the phone's voice for this session.
      this.naturalFailed = true;
      this.set({ engine: 'device', fellBack: true });
      this.speakDevice(index, mine);
    }
  }

  private showOnLockScreen(verse: number) {
    if (Platform.OS === 'web' || !this.player) return;
    const meta = { title: `${this.opts.title}:${verse}`, artist: 'Lámpara' };
    try {
      if (!this.lockScreen) {
        this.player.setActiveForLockScreen(true, meta);
        this.lockScreen = true;
      } else this.player.updateLockScreenMetadata(meta);
    } catch {
      // Lock-screen controls are optional.
    }
  }

  configure(opts: NarratorOptions) {
    const prev = this.opts;
    this.opts = opts;
    if (opts.engine !== prev.engine || opts.naturalVoice !== prev.naturalVoice) this.naturalFailed = false;
    if (!this.state.playing || this.playingKey !== this.key) return;
    const voiceChanged =
      opts.lang !== prev.lang ||
      opts.engine !== prev.engine ||
      opts.naturalOk !== prev.naturalOk ||
      (this.state.engine === 'natural' ? opts.naturalVoice !== prev.naturalVoice : opts.voice !== prev.voice);
    if (voiceChanged) this.speakAt(this.indexOf(this.state.verse));
    else if (opts.rate !== prev.rate) {
      // Natural voice changes speed on the fly; the phone voice has to start the verse again.
      if (this.state.engine === 'natural') this.player?.setPlaybackRate(opts.rate);
      else this.speakAt(this.indexOf(this.state.verse));
    }
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
    this.naturalFailed = false;
    this.set({ open: true, fellBack: false });
    if (!this.verses) {
      // Verses still loading: reading starts as soon as they arrive.
      this.playingKey = null;
      this.set({ playing: true });
      return;
    }
    this.speakAt(this.indexOf(fromVerse ?? null));
  }
  pause() {
    if (this.state.engine === 'natural' && this.player && this.onFinish) {
      // Natural voice really pauses mid-verse.
      this.player.pause();
      this.pausedNatural = true;
      this.set({ playing: false });
      return;
    }
    this.silence();
    this.set({ playing: false });
  }
  resume() {
    if (this.pausedNatural && this.player && this.playingKey === this.key) {
      this.pausedNatural = false;
      this.player.play();
      this.set({ playing: true });
      return;
    }
    this.speakAt(this.playingKey === this.key ? this.indexOf(this.state.verse) : 0);
  }
  skip(delta: number) {
    if (!this.verses) return;
    this.speakAt(Math.min(this.verses.length - 1, Math.max(0, this.indexOf(this.state.verse) + delta)));
  }
  close() {
    this.silence();
    this.playingKey = null;
    if (this.lockScreen) {
      try {
        this.player?.clearLockScreenControls();
      } catch {
        // ignore
      }
      this.lockScreen = false;
    }
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
