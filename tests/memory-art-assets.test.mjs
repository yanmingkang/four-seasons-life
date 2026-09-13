import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {MEMORY_ART} from '../src/memory-art.js';
import {ENDING_ART_FILES} from '../scripts/prepare-cloud-release.mjs';

test('all ending illustrations are distinct native 1200x800 renders included in the public release',async()=>{
  const hashes=new Set();let bytes=0;
  for(const artwork of Object.values(MEMORY_ART)){
    const file=await fs.readFile(new URL(`../public${artwork.src}`,import.meta.url));
    assert.deepEqual([...file.subarray(0,8)],[137,80,78,71,13,10,26,10]);
    assert.equal(file.readUInt32BE(16),1200);assert.equal(file.readUInt32BE(20),800);
    assert.ok(ENDING_ART_FILES.includes(artwork.src.slice(1)));
    hashes.add(createHash('sha256').update(file).digest('hex'));bytes+=file.length;
  }
  assert.equal(hashes.size,5,'Never alias all themes to a single repeated image');
  assert.ok(bytes<2_000_000,'Ending-only image payload stays bounded');
});
