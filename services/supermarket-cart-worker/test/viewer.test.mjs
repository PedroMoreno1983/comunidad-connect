import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { viewerHtml } from '../src/viewer.mjs';

test('readable and fitted views preserve the same remote session', async () => {
  const html = viewerHtml({ id: 'test-session', store: 'Lider', total: 3, detail: '', config: { hosts: ['super.lider.cl'] } });
  const nodes = new Map();
  for (const id of ['state', 'detail', 'missing', 'counter', 'progress', 'resume', 'close', 'browser', 'actual', 'fit', 'fullscreen']) {
    nodes.set('#' + id, { attributes: {}, handlers: {}, style: {}, setAttribute(name, value) { this.attributes[name] = value; }, addEventListener(event, handler) { this.handlers[event] = handler; } });
  }
  const browser = nodes.get('#browser');
  browser.src = 'https://cart.example' + html.match(/<iframe[^>]+src="([^"]+)"/)[1];
  const original = new URL(browser.src);
  assert.equal(original.searchParams.get('resize'), 'off');
  assert.equal(original.searchParams.get('view_clip'), '0');
  assert.equal(original.searchParams.get('quality'), '4');
  assert.doesNotMatch(html, /aspect-ratio:/);
  const document = { querySelector: selector => nodes.get(selector), addEventListener() {}, documentElement: { requestFullscreen: async () => { document.fullscreenElement = true; } }, exitFullscreen: async () => { document.fullscreenElement = null; } };
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], { URL, document, fetch: async () => ({ ok: true, json: async () => ({ status: 'ready', current: 3, total: 3 }) }), setInterval() {}, window: { close() {} } });
  nodes.get('#fit').handlers.click();
  const fitted = new URL(browser.src);
  assert.equal(fitted.searchParams.get('resize'), 'scale');
  assert.equal(fitted.pathname, original.pathname);
  assert.equal(fitted.searchParams.get('path'), original.searchParams.get('path'));
  assert.equal(nodes.get('#fit').attributes['aria-pressed'], 'true');
  nodes.get('#actual').handlers.click();
  assert.equal(new URL(browser.src).searchParams.get('resize'), 'off');
  await nodes.get('#fullscreen').handlers.click();
  assert.equal(document.fullscreenElement, true);
});
