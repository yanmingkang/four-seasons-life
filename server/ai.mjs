import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { MODEL, createModelGate as createPortableModelGate, createNarrator as createPortableNarrator } from './ai-core.mjs';

export * from './ai-core.mjs';

const run = promisify(execFile);
const CLI = process.env.ZHIHU_CLI_PATH || path.join(process.env.LOCALAPPDATA || '', 'ZhihuCLI', 'current', 'zhihu-cli.exe');

async function defaultExecute(prompt, { signal }) {
  const { stdout } = await run(CLI, ['answer', '--query', prompt, '--model', MODEL, '--output', 'json', '--timeout', '20s'], {
    timeout: 21000, signal, maxBuffer: 2 * 1024 * 1024, windowsHide: true,
  });
  return stdout;
}

// Preserve the local Node entry point while the portable core stays independent
// of executable paths, environment variables and subprocess support.
export function createModelGate({ execute = defaultExecute, ...options } = {}) {
  return createPortableModelGate({ ...options, execute });
}

export function createNarrator({ execute = defaultExecute, transport = 'official-cli', ...options } = {}) {
  return createPortableNarrator({ ...options, execute, transport });
}
