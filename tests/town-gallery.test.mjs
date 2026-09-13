import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {World} from '../src/world.js';
import {JourneyWorld} from '../src/journey-world.js';
import {TOWN_LANDMARKS,townGalleryMarkup} from '../src/town-gallery.js';

test('default town uses the real 3D renderer, with no Canvas2D substitution',()=>{
  assert.equal(World,JourneyWorld);
  assert.equal(typeof World.prototype.focusLandmark,'function');
});
test('four design cards link only to known 3D landmarks and the shipped PNG has an alpha channel',()=>{
  assert.deepEqual(TOWN_LANDMARKS.map(item=>item.id),['library','stadium','village','bookstall']);
  const html=townGalleryMarkup();assert.equal((html.match(/data-landmark=/g)||[]).length,4);
  assert.match(html,/图册为去底设计图/);assert.match(html,/不会移动角色或改动存档/);
  const png=readFileSync(new URL('../public/art/life-landmarks-v1.png',import.meta.url));
  assert.equal(png.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(png[25],6,'PNG color type is truecolor + alpha');
  assert.equal(png.readUInt32BE(16),1254);assert.equal(png.readUInt32BE(20),1254);
});
