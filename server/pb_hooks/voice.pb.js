/// <reference path="../pb_data/types.d.ts" />
// Natural read-aloud voices. The voice service (Supertonic 3, its own container) makes an MP3 per verse
// and keeps it in a shared folder; the hub checks you're signed in and serves that file.

/** Is the voice service running? */
routerAdd(
  'GET',
  '/api/lampara/voice/status',
  (e) => {
    const base = $os.getenv('LAMPARA_VOICE_URL');
    if (!base) return e.json(200, { available: false, voices: [] });
    try {
      const r = $http.send({ url: base + '/health', method: 'GET', timeout: 5 });
      const ok = r.statusCode === 200 && r.json && r.json.ok;
      return e.json(200, { available: !!ok, voices: ok ? r.json.voices : [], langs: ok ? r.json.langs : [] });
    } catch (err) {
      return e.json(200, { available: false, voices: [] });
    }
  },
  $apis.requireAuth('users')
);

/** One verse as audio: GET /api/lampara/voice?lang=es&voice=F1&text=... -> audio/mpeg (supports byte ranges). */
routerAdd(
  'GET',
  '/api/lampara/voice',
  (e) => {
    const base = $os.getenv('LAMPARA_VOICE_URL');
    if (!base) throw new NotFoundError('Read-aloud voices are not set up on this hub.');
    const q = e.request.url.query();
    const text = String(q.get('text') || '').trim();
    const lang = String(q.get('lang') || '');
    const voice = String(q.get('voice') || '');
    if (!text || text.length > 2000) throw new BadRequestError('Text is missing or too long.');
    if (['en', 'es', 'ko'].indexOf(lang) < 0) throw new BadRequestError('Unsupported language.');
    if (!/^[FM][1-5]$/.test(voice)) throw new BadRequestError('Unknown voice.');

    let r;
    try {
      r = $http.send({
        url: base + '/synth',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: text, lang: lang, voice: voice }),
        timeout: 120,
      });
    } catch (err) {
      throw new ApiError(503, 'The voice service is not responding.', {});
    }
    if (r.statusCode !== 200 || !r.json || !/^[0-9a-f]{40}\.mp3$/.test(String(r.json.file || ''))) {
      throw new ApiError(502, 'The voice service could not read this verse.', {});
    }
    // The same text + voice always gives the same audio, so phones and browsers may keep it.
    e.response.header().set('Cache-Control', 'private, max-age=2592000');
    return e.fileFS($os.dirFS($os.getenv('LAMPARA_VOICE_CACHE') || '/voice_cache'), String(r.json.file));
  },
  $apis.requireAuth('users')
);

/** Make verses ahead of time: POST /api/lampara/voice/warm {lang, voice, texts: [...]} (the rest of a chapter). */
routerAdd(
  'POST',
  '/api/lampara/voice/warm',
  (e) => {
    const base = $os.getenv('LAMPARA_VOICE_URL');
    if (!base) return e.json(200, { queued: 0 });
    const b = e.requestInfo().body || {};
    const lang = String(b.lang || '');
    const voice = String(b.voice || '');
    if (['en', 'es', 'ko'].indexOf(lang) < 0) throw new BadRequestError('Unsupported language.');
    if (!/^[FM][1-5]$/.test(voice)) throw new BadRequestError('Unknown voice.');
    const texts = [];
    const list = Array.isArray(b.texts) ? b.texts : [];
    for (let i = 0; i < list.length && texts.length < 300; i++) {
      const t = String(list[i] || '').trim();
      if (t && t.length <= 2000) texts.push(t);
    }
    try {
      const r = $http.send({
        url: base + '/warm',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ texts: texts, lang: lang, voice: voice }),
        timeout: 10,
      });
      return e.json(200, { queued: (r.json && r.json.queued) || 0 });
    } catch (err) {
      throw new ApiError(503, 'The voice service is not responding.', {});
    }
  },
  $apis.requireAuth('users')
);
