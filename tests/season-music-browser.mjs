import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const project = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = await readFile(path.join(project, 'src/season-music.js'), 'utf8');
const output = path.join(project, 'test-results');
await mkdir(output, { recursive: true });
const server = http.createServer((request, response) => {
  if (request.url === '/season-music.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
    response.end(source);
  } else {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><meta charset="utf-8"><title>Local original seasonal music test</title><button id="start">Start music test</button>');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(async () => {
    const module = await import('/season-music.js');
    window.seasonMusic = module.createSeasonMusic();
    window.statuses = [];
    document.querySelector('#start').addEventListener('click', () => {
      window.unlockResult = window.seasonMusic.unlock();
    });
  });
  assert.equal(await page.evaluate(() => window.seasonMusic.getStatus().playing), false);
  await page.click('#start');
  assert.equal(await page.evaluate(() => window.unlockResult), true);
  await page.waitForFunction(() => window.seasonMusic.getStatus().playing === true);
  await page.evaluate(() => window.seasonMusic.setSeason(1));
  await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(() => window.seasonMusic.getStatus().season), 1);
  await page.evaluate(() => window.seasonMusic.setPaused(true));
  await page.waitForFunction(() => window.seasonMusic.getStatus().playing === false);
  await page.evaluate(() => { window.seasonMusic.setSeason(3); window.seasonMusic.setPaused(false); });
  await page.waitForFunction(() => window.seasonMusic.getStatus().playing === true);
  await page.evaluate(() => window.seasonMusic.setEnabled(false));
  await page.waitForFunction(() => window.seasonMusic.getStatus().playing === false);
  await page.evaluate(() => window.seasonMusic.dispose());
  assert.equal(await page.evaluate(() => window.seasonMusic.getStatus().disposed), true);

  const rendered = await page.evaluate(async () => {
    const { SEASON_SCORES, getSeasonStepNotes, scheduleSeasonNote } = await import('/season-music.js');
    const sampleRate = 22050;
    const results = [];
    const previewParts = [];
    for (let season = 0; season < 4; season++) {
      const score = SEASON_SCORES[season];
      const context = new OfflineAudioContext(1, Math.ceil(sampleRate * (score.durationSeconds + 2)), sampleRate);
      const gain = context.createGain();
      gain.gain.setValueAtTime(.18, 0);
      gain.connect(context.destination);
      for (let step = 0; step < 128; step++) {
        const time = .05 + step * 30 / score.bpm;
        for (const note of getSeasonStepNotes(season, step)) scheduleSeasonNote(context, gain, note, time + note.offset);
      }
      const buffer = await context.startRendering();
      const samples = buffer.getChannelData(0);
      let energy = 0;
      let peak = 0;
      let finite = true;
      let maxDifference = 0;
      for (let i = 0; i < samples.length; i++) {
        const sample = samples[i];
        energy += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
        finite &&= Number.isFinite(sample);
        if (i) maxDifference = Math.max(maxDifference, Math.abs(sample - samples[i - 1]));
      }
      const preview = samples.slice(0, sampleRate * 12);
      // Fade the preview excerpt itself; this does not modify the live composition.
      for (let i = 0; i < Math.round(sampleRate * .2); i++) preview[preview.length - 1 - i] *= i / (sampleRate * .2);
      previewParts.push(preview, new Float32Array(Math.round(sampleRate * .4)));
      results.push({ season: score.id, title: score.title, bpm: score.bpm, durationSeconds: score.durationSeconds,
        samples: samples.length, finite, peak, rms: Math.sqrt(energy / samples.length), maxDifference });
    }
    const length = previewParts.reduce((sum, part) => sum + part.length, 0);
    const bytes = new ArrayBuffer(44 + length * 2);
    const view = new DataView(bytes);
    const string = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
    string(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); string(8, 'WAVE');
    string(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    string(36, 'data'); view.setUint32(40, length * 2, true);
    let offset = 44;
    for (const part of previewParts) for (const sample of part) { view.setInt16(offset, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true); offset += 2; }
    const array = new Uint8Array(bytes);
    let binary = '';
    for (let i = 0; i < array.length; i += 16384) binary += String.fromCharCode(...array.subarray(i, i + 16384));
    return { results, previewBase64: btoa(binary), previewOrder: 'spring / summer / autumn / winter; 12 seconds each, 0.4-second gaps' };
  });
  for (const result of rendered.results) {
    assert(result.finite, `${result.season}: no NaN samples`);
    assert(result.rms > .001 && result.rms < .06, `${result.season}: audible, conservative RMS (${result.rms})`);
    assert(result.peak > .01 && result.peak < .25, `${result.season}: unclipped conservative peak (${result.peak})`);
    assert(result.maxDifference < .1, `${result.season}: no abrupt full-scale edges`);
  }
  assert.equal(errors.length, 0, errors.join('\n'));
  const preview = Buffer.from(rendered.previewBase64, 'base64');
  const report = { passed: true, ...rendered, browserErrors: errors,
    previewSha256: createHash('sha256').update(preview).digest('hex'),
    subjectiveListening: 'Not performed by this automated test. Numerical audio checks do not establish musical preference.' };
  delete report.previewBase64;
  await writeFile(path.join(output, 'season-music-preview.wav'), preview);
  await writeFile(path.join(output, 'season-music-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
