import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const compose = fs.readFileSync(new URL('../compose.yaml', import.meta.url), 'utf8');
const example = fs.readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

test('the residential proxy has no embedded credentials', () => {
  assert.doesNotMatch(compose, /RESIDENTIAL_PROXY_(USER|PASS|HOST|PORT):-/) ;
  assert.doesNotMatch(compose, /iproyal/i);
  assert.match(compose, /\$\{RESIDENTIAL_PROXY_USER\}/);
  assert.match(compose, /\$\{RESIDENTIAL_PROXY_PASS\}/);
  for (const name of ['RESIDENTIAL_PROXY_HOST', 'RESIDENTIAL_PROXY_PORT', 'RESIDENTIAL_PROXY_USER', 'RESIDENTIAL_PROXY_PASS']) {
    assert.match(example, new RegExp(`^${name}=$`, 'm'));
  }
});
