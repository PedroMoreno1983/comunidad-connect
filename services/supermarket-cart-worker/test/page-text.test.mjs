import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

test('the browser page-text script reads both the title and body without syntax errors', () => {
  const source = fs.readFileSync(new URL('../src/automation.mjs', import.meta.url), 'utf8');
  const template = source.match(/async function bodyText\(driver\)\s*\{[\s\S]*?executeScript\((`[\s\S]*?`)\)/)?.[1];
  assert.ok(template, 'page-text script must be present');
  const script = vm.runInNewContext(template);
  const run = new Function('document', script);
  assert.equal(run({ title: 'Verificación humana', body: { innerText: 'Continúa aquí' } }), 'Verificación humana\nContinúa aquí');
  assert.equal(run({ title: 'Lider', body: null }), 'Lider\n');
});
