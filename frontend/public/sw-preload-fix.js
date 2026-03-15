// Workaround for Chrome 143+ ServiceWorkerAutoPreload regression
// See: https://issues.chromium.org/issues/466790291
//
// The ServiceWorkerAutoPreload feature (shipped in M140, regressed in M143)
// causes PWA cold starts to show a blank screen when the SW is not running.
// Opt out by explicitly routing all requests through the fetch-event handler.
self.addEventListener('install', function (e) {
  if (e.addRoutes) {
    e.addRoutes({
      condition: { urlPattern: new URLPattern({}) },
      source: 'fetch-event',
    });
  }
});
