import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('leaves APK downloads to the browser while handling website navigation', () => {
  const handlers = new Map();
  runInNewContext(readFileSync(new URL('../../web/public/sw.js', import.meta.url), 'utf8'), {
    self: {
      location: { origin: 'https://faraim.online' },
      addEventListener: (name, handler) => handlers.set(name, handler),
    },
    URL,
    fetch: async () => ({ status: 404 }),
  });

  function intercepted(pathname) {
    let handled = false;
    handlers.get('fetch')({
      request: { method: 'GET', url: `https://faraim.online${pathname}`, mode: 'navigate' },
      respondWith: () => { handled = true; },
    });
    return handled;
  }

  assert.equal(intercepted('/downloads/android/faraim-online-1.1.0-4.apk'), false);
  assert.equal(intercepted('/downloads/android/faraim-online-1.1.0-4.apk.sha256'), false);
  assert.equal(intercepted('/far/91'), true);
});
