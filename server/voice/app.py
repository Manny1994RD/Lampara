"""Lámpara voice service: reads Bible verses aloud with Supertonic 3 and keeps the audio as MP3 files.

Only the hub talks to this service (it is not exposed outside Docker). The hub checks that you are
signed in, asks for a verse here, and then serves the cached MP3 file from the shared folder.

  GET  /health  -> {"ok": true, "voices": [...]}
  POST /synth   {"text": "...", "lang": "en|es|ko", "voice": "F1"} -> {"file": "<sha1>.mp3"}
  POST /warm    {"texts": [...], "lang": "...", "voice": "..."} -> {"queued": n}
                Makes those verses in the background (e.g. the rest of a chapter), so playing them is instant.
"""

import hashlib
import json
import os
import threading
import time
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import soundfile as sf
from supertonic import TTS

CACHE = os.environ.get("VOICE_CACHE", "/voice_cache")
CACHE_MB = int(os.environ.get("VOICE_CACHE_MB", "3000"))
THREADS = int(os.environ.get("VOICE_THREADS", "0")) or None
LANGS = {"en", "es", "ko"}
VOICES = [f"{g}{i}" for g in "FM" for i in range(1, 6)]
# Bump when the model or settings change so old audio is not reused.
VERSION = "supertonic-3/v1"
MAX_TEXT = 2000

os.makedirs(CACHE, exist_ok=True)
tts = TTS(intra_op_num_threads=THREADS)
styles = {}
# One verse at a time: the CPU is shared with the rest of the server.
lock = threading.Lock()
made_since_prune = 0
# Verses someone is waiting for right now go before the background queue.
waiting = 0
waiting_lock = threading.Lock()
# Background queue of (text, lang, voice); the newest request goes first.
queue = deque()
queued = set()
queue_cv = threading.Condition()
MAX_QUEUE = 600


def prune():
    """Keeps the cache under VOICE_CACHE_MB by removing the least recently used files."""
    files = []
    for name in os.listdir(CACHE):
        if name.endswith(".mp3"):
            p = os.path.join(CACHE, name)
            st = os.stat(p)
            files.append((st.st_mtime, st.st_size, p))
    total = sum(f[1] for f in files)
    limit = CACHE_MB * 1024 * 1024
    if total <= limit:
        return
    for _, size, p in sorted(files):
        try:
            os.remove(p)
        except OSError:
            pass
        total -= size
        if total <= limit * 0.9:
            break


def cache_name(text: str, lang: str, voice: str) -> str:
    return hashlib.sha1(f"{VERSION}|{lang}|{voice}|{text}".encode("utf-8")).hexdigest() + ".mp3"


def synth(text: str, lang: str, voice: str, background: bool = False) -> str:
    global waiting
    name = cache_name(text, lang, voice)
    key = name[:-4]
    path = os.path.join(CACHE, name)
    if os.path.exists(path):
        os.utime(path, None)  # recently used
        return name
    if not background:
        with waiting_lock:
            waiting += 1
    try:
        return _make(text, lang, voice, name, key, path)
    finally:
        if not background:
            with waiting_lock:
                waiting -= 1


def _make(text, lang, voice, name, key, path):
    global made_since_prune
    with lock:
        if os.path.exists(path):
            return name
        style = styles.get(voice)
        if style is None:
            style = styles[voice] = tts.get_voice_style(voice)
        wav, _ = tts.synthesize(text, voice_style=style, lang=lang)
        audio = np.asarray(wav, dtype=np.float32).reshape(-1)
        tmp = os.path.join(CACHE, f"{key}.tmp")
        sf.write(tmp, audio, tts.sample_rate, format="MP3")
        os.replace(tmp, path)
        made_since_prune += 1
        if made_since_prune >= 50:
            made_since_prune = 0
            prune()
    return name


def warm(texts, lang, voice):
    """Adds verses to the front of the background queue (skipping ones already made or queued)."""
    items = []
    for t in texts:
        item = (t, lang, voice)
        if item in queued or os.path.exists(os.path.join(CACHE, cache_name(t, lang, voice))):
            continue
        items.append(item)
    with queue_cv:
        for item in reversed(items):
            queue.appendleft(item)
            queued.add(item)
        while len(queue) > MAX_QUEUE:
            queued.discard(queue.pop())
        queue_cv.notify()
    return len(items)


def worker():
    while True:
        with queue_cv:
            while not queue:
                queue_cv.wait()
            item = queue.popleft()
            queued.discard(item)
        # Let verses someone is listening to right now go first.
        while waiting > 0:
            time.sleep(0.05)
        try:
            synth(*item, background=True)
        except Exception as e:  # keep going with the rest
            print(f"warm failed: {e}", flush=True)


class Handler(BaseHTTPRequestHandler):
    def _json(self, status: int, data: dict):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {"ok": True, "voices": VOICES, "langs": sorted(LANGS)})
        return self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path not in ("/synth", "/warm"):
            return self._json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(min(length, 1024 * 1024)) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self._json(400, {"error": "bad json"})
        if self.path == "/warm":
            lang, voice, texts = req.get("lang"), req.get("voice"), req.get("texts")
            if lang not in LANGS or voice not in VOICES or not isinstance(texts, list):
                return self._json(400, {"error": "need texts, lang and voice"})
            texts = [str(t).strip() for t in texts[:300] if str(t).strip() and len(str(t)) <= MAX_TEXT]
            return self._json(200, {"queued": warm(texts, lang, voice)})
        text = str(req.get("text") or "").strip()
        lang = req.get("lang")
        voice = req.get("voice")
        if not text or len(text) > MAX_TEXT or lang not in LANGS or voice not in VOICES:
            return self._json(400, {"error": "need text (max 2000 chars), lang (en/es/ko) and voice (F1-F5, M1-M5)"})
        try:
            return self._json(200, {"file": synth(text, lang, voice)})
        except Exception as e:  # keep serving other requests
            return self._json(500, {"error": str(e)})

    def log_message(self, fmt, *args):  # quieter logs
        pass


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    threading.Thread(target=worker, daemon=True).start()
    print(f"Lámpara voice service on :{port} (cache {CACHE}, max {CACHE_MB} MB)", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
