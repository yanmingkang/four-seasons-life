import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('choice and feedback cards remove daylight buttons from layout and the tab order', async () => {
  const css = await fs.readFile(new URL('../src/world-daylight.css', import.meta.url), 'utf8');
  const rule = css.match(/\.experience:is\(\[data-stage="choice"\],\s*\[data-stage="feedback"\]\)\s*>\s*\.daylight-switch\s*\{([^}]+)\}/);
  assert.ok(rule, 'Card stages share a scoped daylight visibility rule');
  assert.match(rule[1], /\bdisplay\s*:\s*none\s*;/, 'Hiding paint or pointer events alone would leave keyboard focus reachable');
});

test('card visibility does not replace the normal map display or the portrait guard', async () => {
  const css = await fs.readFile(new URL('../src/world-daylight.css', import.meta.url), 'utf8');
  const base = css.match(/^\.daylight-switch\s*\{([^}]+)\}/);
  assert.match(base?.[1] || '', /\bdisplay\s*:\s*flex\s*;/);
  assert.match(css, /@container\s+game-stage\s*\(orientation:\s*portrait\)\s*\{\s*\.daylight-switch\s*\{\s*visibility:\s*hidden/);
  assert.doesNotMatch(css, /\[data-stage="(?:ready|welcome|explore)"\]/, 'Map, welcome and landmark browsing keep their existing controls');
});
