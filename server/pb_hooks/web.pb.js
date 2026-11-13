/// <reference path="../pb_data/types.d.ts" />
// The Lámpara website is served from pb_public by this same server.
// Its on-device database (SQLite in the browser) needs cross-origin isolation headers.
routerUse((e) => {
  const h = e.response.header();
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Embedder-Policy', 'credentialless');
  return e.next();
});
