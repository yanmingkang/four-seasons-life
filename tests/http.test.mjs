import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { newGame, land, choose, advance, snapshot } from '../src/engine.js';
import { MAX_BODY_BYTES } from '../server/ai.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

async function unusedPort() {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return port;
}

test('HTTP v4 contract in an isolated server with official CLI deliberately disabled', async t => {
  const port = await unusedPort(), base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.mjs', '--production'], {
    cwd: root, windowsHide: true,
    env: { ...process.env, PORT: String(port), ZHIHU_CLI_PATH: path.join(root, 'test-results', 'intentionally-missing-cli-for-http-test.exe') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '', failure = '';
  child.stdout.on('data', value => { output += value; });
  child.stderr.on('data', value => { failure += value; });
  child.on('error', error => { failure += error.message; });
  const post = game => fetch(`${base}/api/narrate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(game) });
  try {
    // Read this child's startup acknowledgement before sending any application requests.
    for (let attempt = 0; attempt < 100 && !output.includes(base); attempt++) {
      if (child.exitCode !== null) throw new Error(`Isolated test server exited: ${failure}`);
      await delay(20);
    }
    assert.ok(output.includes(base), `Isolated server did not start: ${failure}`);
    const status = await (await fetch(`${base}/api/ai/status`)).json();
    assert.equal(status.configured, false);
    assert.equal(status.available, false);

    await t.test('methods, media type, malformed input and request limits return explicit errors', async () => {
      assert.equal((await fetch(`${base}/api/narrate`)).status, 405);
      assert.equal((await fetch(`${base}/api/narrate`, { method: 'POST', body: '{}' })).status, 415);
      assert.equal((await fetch(`${base}/api/narrate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' })).status, 400);
      assert.equal((await post({ padding: 'x'.repeat(MAX_BODY_BYTES) })).status, 413);
      const chunkedStatus = await new Promise((resolve, reject) => {
        const request = http.request(`${base}/api/narrate`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } }, response => {
          response.resume(); response.on('end', () => resolve(response.statusCode));
        });
        request.on('error', reject);
        request.write('x'.repeat(MAX_BODY_BYTES + 1)); request.end();
      });
      assert.equal(chunkedStatus, 413);
    });

    await t.test('v1/v2/v3, unsettled, impossible and premature-summary snapshots are rejected', async () => {
      const ready = snapshot(newGame('demo'));
      const event = snapshot(choose(land(newGame('demo'), 1), 0));
      for (const input of [
        { kind: 'event', game: { ...event, version: 1 } },
        { kind: 'event', game: { ...event, version: 2 } },
        { kind: 'event', game: { ...event, version: 3 } },
        { kind: 'event', game: ready },
        { kind: 'event', game: snapshot(land(newGame(), 2)) },
        { kind: 'summary', game: event },
        { kind: 'event', game: { ...event, moves: [{ die: 7, choice: 0 }] } },
      ]) assert.equal((await post(input)).status, 400);
    });

    await t.test('valid v4 feedback uses the replayed ledger and does not trust client narrative', async () => {
      const state = choose(land(newGame('demo'), 1), 0);
      const response = await post({ kind: 'event', game: { ...snapshot(state), money: 999999, scene: 'UNTRUSTED_SCENE', history: [{ result: 'UNTRUSTED_RESULT' }] } });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('cache-control'), /no-store/);
      const result = await response.json();
      assert.equal(result.mode, 'fallback');
      assert.equal(result.model, 'zhida-fast-1p5');
      assert.ok(result.text.includes(state.history[0].result));
      assert.ok(result.text.includes(state.history[0].lesson));
      assert.doesNotMatch(JSON.stringify(result), /UNTRUSTED|999999|intentionally-missing-cli|reasoning_content/);
    });

    await t.test('v4 third choice resolves from the server event definition',async()=>{
      const state=choose(land(newGame('demo'),1),2);
      const response=await post({kind:'event',game:snapshot(state)});
      assert.equal(response.status,200);
      const result=await response.json();
      assert.equal(result.mode,'fallback');
      assert.ok(result.text.includes(state.history[0].result));
      assert.equal((await post({kind:'event',game:{...snapshot(state),version:3}})).status,400);
    });

    await t.test('terminal v4 snapshot summarizes the actual route; moves after the end are invalid', async () => {
      let state = newGame('full');
      for (const choice of [1, 0, 0, 0, 1, 0, 0]) state = advance(choose(land(state, 6), choice));
      const game = snapshot(state);
      assert.equal(state.position, 39); assert.equal(state.turn, 7);
      const response = await post({ kind: 'summary', game });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.mode, 'fallback');
      assert.ok(result.text.includes(state.history[0].choiceLabel));
      assert.ok(result.text.includes(state.history.at(-1).choiceLabel));
      assert.equal((await post({ kind: 'summary', game: { ...game, moves: [...game.moves, { die: 1, choice: 0 }] } })).status, 400);
    });
  } finally {
    // Only terminate the child created by this test, never the existing game server.
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  }
});
