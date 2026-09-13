import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Deliberately bounded: this imports only the team's eight approved originals.
// Old cinematics and desktop originals are never modified or used as outputs.
const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = 'C:/Users/25293/Desktop/动画';
const BIN = 'C:/Users/25293/AppData/Roaming/TRAE SOLO CN/ModularData/ai-agent/vm/tools/app/ffmpeg';
const TARGET = path.join(PROJECT, 'public/cinematics/team-20260912');
const REPORTS = path.join(PROJECT, 'test-results/team-cinematics');
const REPORT = path.join(REPORTS, 'media.json');
const APPROVED = Object.freeze([
  [6, '6.客户会议室.mp4'], [8, '8.楼道吸烟角.mp4'],
  [11, '11.攻坚作战室.mp4'], [15, '15.合租卫生间.mp4'],
  [18, '18.医院.mp4'], [22, '22.宴会厅.mp4'],
  [27, '27.猎头办公室.mp4'], [31, '31.人事办公室.mp4'],
]);
const PROFILE = Object.freeze({
  version: 1, video: 'libx264', preset: 'slow', crf: 20,
  pixelFormat: 'yuv420p', maxWidth: 1280, maxHeight: 720,
  scale: 'fit, no upscaling, even dimensions, original aspect ratio',
  audio: 'aac', audioBitrate: '128k', frameRate: 'source timestamps (passthrough)',
  faststart: true, duration: 'entire original, no trim', posterSeconds: 0.1,
  metadata: 'preserve original AIGC provenance; omit unrelated source comments',
});
const digest = value => createHash('sha256').update(value).digest('hex');
const profileSha256 = digest(JSON.stringify(PROFILE));
const exists = async filename => fs.stat(filename).then(() => true, error => {
  if (error.code === 'ENOENT') return false;
  throw error;
});
const sha256 = async filename => digest(await fs.readFile(filename));
const stem = cell => `cell-${String(cell).padStart(2, '0')}`;

function inside(root, filename) {
  const relative = path.relative(root, filename);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Refusing a target outside the approved output directory.');
  }
  return filename;
}

function run(executable, args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', expired = false;
    const timer = setTimeout(() => { expired = true; child.kill(); }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (expired || code !== 0) reject(new Error(`${path.basename(executable)} failed (${expired ? 'timeout' : code}): ${stderr}`));
      else resolve({ stdout, stderr });
    });
  });
}

const ffmpeg = args => run(path.join(BIN, 'ffmpeg.exe'), ['-hide_banner', '-nostdin', '-v', 'error', '-n', ...args]);
async function probe(filename) {
  const { stdout } = await run(path.join(BIN, 'ffprobe.exe'), ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', filename]);
  return JSON.parse(stdout);
}

function summarize(info) {
  const video = info.streams.find(stream => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
  if (!video) throw new Error('Approved movie has no playable video stream.');
  return {
    bytes: Number(info.format.size), durationSeconds: Number(info.format.duration),
    video: {
      codec: video.codec_name, codecTag: video.codec_tag_string, profile: video.profile,
      width: video.width, height: video.height, pixelFormat: video.pix_fmt,
      sampleAspectRatio: video.sample_aspect_ratio || '1:1', displayAspectRatio: video.display_aspect_ratio,
      fps: video.avg_frame_rate, frameRate: video.r_frame_rate,
      frames: Number(video.nb_frames) || null, durationSeconds: Number(video.duration),
    },
    audio: info.streams.filter(stream => stream.codec_type === 'audio').map(stream => ({
      codec: stream.codec_name, sampleRate: Number(stream.sample_rate), channels: stream.channels,
      channelLayout: stream.channel_layout, durationSeconds: Number(stream.duration),
    })),
    hasAigcProvenance: Boolean(info.format.tags?.AIGC),
  };
}

async function inspectFaststart(filename) {
  const buffer = await fs.readFile(filename);
  const boxes = [];
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (size === 1) {
      if (offset + 16 > buffer.length) throw new Error('Invalid extended MP4 box.');
      size = Number(buffer.readBigUInt64BE(offset + 8));
    } else if (size === 0) size = buffer.length - offset;
    if (size < 8 || offset + size > buffer.length) throw new Error('Invalid MP4 box bounds.');
    boxes.push({ type, offset, bytes: size });
    offset += size;
  }
  const moov = boxes.find(box => box.type === 'moov');
  const mdat = boxes.find(box => box.type === 'mdat');
  if (!moov || !mdat || moov.offset >= mdat.offset) throw new Error('MP4 is not faststart.');
  return { passed: true, moovOffset: moov.offset, mdatOffset: mdat.offset, topLevelBoxes: boxes };
}

async function decodeEntireMovie(filename) {
  const result = await ffmpeg(['-xerror', '-i', filename, '-map', '0:v:0', '-map', '0:a:0?', '-f', 'null', '-']);
  if (result.stderr.trim()) throw new Error(`Movie decoder reported errors: ${result.stderr}`);
  return { passed: true, fullVideoAndAudio: true, stderr: '' };
}

async function verifyExisting(inputs) {
  if (!(await exists(REPORT))) throw new Error('Output exists without an import report; refusing to overwrite it.');
  const previous = JSON.parse(await fs.readFile(REPORT, 'utf8'));
  if (previous.profileSha256 !== profileSha256 || previous.clips?.length !== APPROVED.length) {
    throw new Error('Existing import has a different or incomplete profile; refusing overwrite.');
  }
  const expectedNames = APPROVED.flatMap(([cell]) => [`${stem(cell)}.mp4`, `${stem(cell)}-poster.jpg`]).sort();
  const actualNames = (await fs.readdir(TARGET)).sort();
  if (JSON.stringify(expectedNames) !== JSON.stringify(actualNames)) throw new Error('Existing output contains unexpected or missing files.');
  for (const input of inputs) {
    const clip = previous.clips.find(candidate => candidate.cell === input.cell);
    if (!clip || clip.input.sha256 !== input.sha256) throw new Error(`Cell ${input.cell}: original changed; refusing overwrite.`);
    for (const [filename, hash] of [[clip.output.filename, clip.output.sha256], [clip.poster.filename, clip.poster.sha256]]) {
      const output = inside(TARGET, path.join(TARGET, filename));
      if (await sha256(output) !== hash) throw new Error(`Cell ${input.cell}: output hash differs; refusing overwrite.`);
    }
    const contact = inside(REPORTS, path.join(REPORTS, clip.contactSheet.filename));
    if (await sha256(contact) !== clip.contactSheet.sha256) throw new Error(`Cell ${input.cell}: contact sheet differs.`);
  }
  console.log('SKIPPED: all eight originals, encoded movies, posters and contact sheets match the existing report.');
}

async function main() {
  inside(path.join(PROJECT, 'public/cinematics'), TARGET);
  const inputs = [];
  for (const [cell, filename] of APPROVED) {
    const source = inside(INPUT, path.join(INPUT, filename));
    const stat = await fs.lstat(source);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Cell ${cell}: expected a regular original file.`);
    const info = await probe(source);
    const media = summarize(info);
    if (cell === 8 && media.audio.length) throw new Error('Cell 8 unexpectedly has audio; inspect the original before import.');
    inputs.push({ cell, filename, source, sha256: await sha256(source), info, media });
  }
  if (await exists(TARGET)) return verifyExisting(inputs);
  if (await exists(REPORT)) throw new Error('Report exists without its output directory; refusing an ambiguous replacement.');
  for (const [cell] of APPROVED) {
    if (await exists(path.join(REPORTS, `${stem(cell)}-contact.jpg`))) throw new Error('A contact sheet target already exists; refusing overwrite.');
  }
  await fs.mkdir(REPORTS, { recursive: true });
  const staging = await fs.mkdtemp(path.join(REPORTS, '.import-'));
  const stagedPublic = inside(staging, path.join(staging, 'public'));
  await fs.mkdir(stagedPublic);
  console.log(`Importing ${APPROVED.length} approved clips. Originals and previous cinematics remain untouched.`);
  const clips = [];
  for (const input of inputs) {
    const name = stem(input.cell);
    const output = inside(stagedPublic, path.join(stagedPublic, `${name}.mp4`));
    const poster = inside(stagedPublic, path.join(stagedPublic, `${name}-poster.jpg`));
    const video = input.media.video;
    const ratio = Math.min(1, PROFILE.maxWidth / video.width, PROFILE.maxHeight / video.height);
    const width = Math.floor(video.width * ratio / 2) * 2;
    const height = Math.floor(video.height * ratio / 2) * 2;
    const provenance = input.info.format.tags?.AIGC;
    const args = ['-i', input.source, '-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '-1', '-map_chapters', '-1',
      '-vf', `scale=${width}:${height}:flags=lanczos`, '-c:v', PROFILE.video, '-preset', PROFILE.preset,
      '-crf', String(PROFILE.crf), '-pix_fmt', PROFILE.pixelFormat, '-fps_mode', 'passthrough',
      '-c:a', PROFILE.audio, '-b:a', PROFILE.audioBitrate,
      '-movflags', '+faststart+use_metadata_tags'];
    // Preserve source AI provenance without copying unrelated source comments or paths.
    if (provenance) args.push('-metadata', `AIGC=${provenance}`);
    args.push(output);
    await ffmpeg(args);
    const info = await probe(output);
    const media = summarize(info);
    if (media.video.codec !== 'h264' || media.video.pixelFormat !== 'yuv420p' || media.video.width > 1280 || media.video.height > 720) {
      throw new Error(`Cell ${input.cell}: output is not the approved browser format.`);
    }
    if (media.audio.length !== input.media.audio.length || media.audio.some(audio => audio.codec !== 'aac')) throw new Error('Audio stream mismatch.');
    if (Math.abs(media.durationSeconds - input.media.durationSeconds) > 0.12 || Math.abs(media.video.durationSeconds - video.durationSeconds) > 0.06) {
      throw new Error(`Cell ${input.cell}: unexpected duration change.`);
    }
    if (video.frames && media.video.frames !== video.frames) throw new Error(`Cell ${input.cell}: original video frames were not all retained.`);
    if (provenance && info.format.tags?.AIGC !== provenance) throw new Error('Source AIGC provenance was not retained.');
    const publicTags = JSON.stringify(info.format.tags || {});
    if (/[a-z]:[\\/]|Users[\\/]|sk-[a-zA-Z0-9]/.test(publicTags)) throw new Error('Public container metadata contains a private path or key-like string.');
    const decoding = await decodeEntireMovie(output);
    const faststart = await inspectFaststart(output);
    await ffmpeg(['-ss', String(PROFILE.posterSeconds), '-i', output, '-frames:v', '1', '-q:v', '2', poster]);
    const frameSeconds = [0.1, media.video.durationSeconds * 0.5, media.video.durationSeconds * 0.9];
    const framePaths = [];
    for (let index = 0; index < frameSeconds.length; index++) {
      const frame = inside(staging, path.join(staging, `${name}-frame-${index}.jpg`));
      await ffmpeg(['-ss', frameSeconds[index].toFixed(6), '-i', output, '-frames:v', '1', '-vf', 'scale=640:-2:flags=lanczos', '-q:v', '2', frame]);
      framePaths.push(frame);
    }
    const contactName = `${name}-contact.jpg`;
    const contact = inside(staging, path.join(staging, contactName));
    await ffmpeg([...framePaths.flatMap(frame => ['-i', frame]), '-filter_complex', '[0:v][1:v][2:v]hstack=inputs=3[v]', '-map', '[v]', '-frames:v', '1', '-q:v', '2', contact]);
    if (await sha256(input.source) !== input.sha256) throw new Error(`Cell ${input.cell}: original changed during import.`);
    const clip = {
      cell: input.cell,
      input: { filename: input.filename, sha256: input.sha256, ...input.media },
      output: { filename: `${name}.mp4`, url: `/cinematics/team-20260912/${name}.mp4`, sha256: await sha256(output), ...media },
      poster: { filename: `${name}-poster.jpg`, seconds: PROFILE.posterSeconds, bytes: (await fs.stat(poster)).size, sha256: await sha256(poster) },
      contactSheet: { filename: contactName, frameSeconds, sha256: await sha256(contact), width: 1920, height: 360 },
      verification: { decoding, faststart, originalUnchanged: true, originalFrameCountPreserved: video.frames === media.video.frames,
        aigcProvenancePreserved: !provenance || info.format.tags?.AIGC === provenance },
    };
    clips.push(clip);
    console.log(`Cell ${input.cell}: ${media.durationSeconds.toFixed(6)}s, ${width}x${height}, ${(media.bytes / 1048576).toFixed(2)} MiB, audio=${media.audio.length}, decode/faststart PASS`);
  }
  const totalMovieBytes = clips.reduce((total, clip) => total + clip.output.bytes, 0);
  const report = {
    generatedAt: new Date().toISOString(), profile: PROFILE, profileSha256,
    provenance: 'Team-supplied desktop originals; full-duration browser transcodes and actual-frame posters. No AI, network or business API calls made by this importer.',
    totalMovieBytes, totalMovieMiB: totalMovieBytes / 1048576, withinSoft16MiBBudget: totalMovieBytes < 16 * 1048576,
    totalDurationSeconds: clips.reduce((total, clip) => total + clip.output.durationSeconds, 0),
    passed: clips.length === APPROVED.length, clips,
  };
  const stagedReport = inside(staging, path.join(staging, 'media.json'));
  await fs.writeFile(stagedReport, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  // Publish the complete, verified asset directory in one same-volume rename.
  // Staging is retained as nonpublic evidence; failed runs never publish partial clips.
  if (await exists(TARGET)) throw new Error('Output appeared during import; refusing to replace it.');
  await fs.mkdir(path.dirname(TARGET), { recursive: true });
  await fs.rename(stagedPublic, TARGET);
  for (const clip of clips) {
    await fs.link(path.join(staging, clip.contactSheet.filename), path.join(REPORTS, clip.contactSheet.filename));
  }
  await fs.link(stagedReport, REPORT);
  console.log(`DONE: ${clips.length} clips, ${report.totalMovieMiB.toFixed(2)} MiB, full decode + faststart verified.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
