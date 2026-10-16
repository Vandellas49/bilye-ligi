// IIS web.config denetimi: IIS bozuk XML'de 500.19 verir
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('web.config açıklamalarında yan yana iki tire yok (XML kuralı)', () => {
  const xml = fs.readFileSync(new URL('../web.config', import.meta.url), 'utf8');
  for (const m of xml.matchAll(/<!--([\s\S]*?)-->/g)) {
    assert.ok(!m[1].includes('--'), 'açıklamada "--" var: ' + m[1].split('\n').find(l => l.includes('--')));
  }
  assert.ok(xml.includes('AspNetCoreModuleV2'));
  assert.equal((xml.match(/<configuration>/g) || []).length, 1);
});
