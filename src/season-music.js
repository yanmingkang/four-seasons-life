// Original, locally synthesized scores. No recordings, network calls or copied melodies.
// Each season is a 16-bar composition, not a one-shot transition sound.
const REST = -1;
const deepFreeze = (value) => {
  Object.values(value).forEach((entry) => {
    if (entry && typeof entry === 'object') deepFreeze(entry);
  });
  return Object.freeze(value);
};

export const SEASON_SCORES = deepFreeze([
  {
    id: 'spring', title: '春 · 初芽来信', stage: '初入社会', bpm: 100,
    instrument: 'flute', harmony: 'pluck', bass: 'round', rhythm: 'spring',
    description: '明亮短笛与拨弦，轻快的探索旋律',
    chords: [[48, 52, 55], [50, 53, 57], [55, 59, 62], [48, 52, 55],
      [45, 48, 52], [53, 57, 60], [55, 59, 62], [48, 52, 55],
      [48, 52, 55], [52, 55, 59], [53, 57, 60], [55, 59, 62],
      [45, 48, 52], [50, 53, 57], [55, 59, 62], [48, 52, 55]],
    melody: [
      [72, REST, 76, 79, 76, REST, 74, 72], [74, 77, REST, 81, 79, REST, 77, 74],
      [79, REST, 83, 81, 79, 77, REST, 74], [76, 79, 84, REST, 79, REST, 76, REST],
      [76, REST, 81, 79, 76, 74, 72, REST], [77, REST, 81, 84, 81, REST, 79, 77],
      [79, 81, 83, REST, 86, 83, 81, 79], [76, REST, 74, 72, REST, REST, 67, REST],
      [76, 79, REST, 84, 83, 79, 76, REST], [79, REST, 83, 86, 83, REST, 79, 76],
      [81, 79, 77, REST, 84, 81, 79, 77], [83, REST, 81, 79, 77, 74, REST, 71],
      [72, 76, 81, REST, 79, 76, 74, REST], [74, 77, 81, 84, 81, REST, 77, 74],
      [79, REST, 83, 86, 84, 83, 79, REST], [76, 74, 72, REST, REST, REST, REST, REST],
    ],
  },
  {
    id: 'summer', title: '夏 · 向阳赶路', stage: '努力打拼', bpm: 114,
    instrument: 'pluck', harmony: 'strum', bass: 'round', rhythm: 'summer',
    description: '温暖拨弦与轻打击乐，向前生长的切分节奏',
    chords: [[43, 47, 50], [40, 43, 47], [48, 52, 55], [50, 54, 57],
      [43, 47, 50], [45, 48, 52], [48, 52, 55], [50, 54, 57],
      [47, 50, 54], [40, 43, 47], [48, 52, 55], [43, 47, 50],
      [45, 48, 52], [48, 52, 55], [50, 54, 57], [43, 47, 50]],
    melody: [
      [79, 74, REST, 79, 83, 81, 79, 74], [76, REST, 79, 83, 86, REST, 83, 79],
      [79, 76, 72, REST, 76, 79, 84, 83], [81, REST, 78, 74, 78, 81, 86, REST],
      [83, 79, 74, 79, REST, 83, 81, 79], [81, REST, 76, 72, 76, 81, 84, 81],
      [79, 84, 83, 79, REST, 76, 79, 84], [81, 78, 74, REST, 78, 81, 83, 86],
      [83, REST, 86, 90, 86, 83, 81, 78], [79, 83, REST, 86, 83, 79, 76, REST],
      [84, 83, 79, 76, 79, REST, 84, 86], [83, REST, 79, 74, 79, 83, 86, 83],
      [81, 84, REST, 88, 86, 84, 81, 76], [79, REST, 84, 88, 86, 84, 79, 76],
      [78, 81, 86, REST, 90, 86, 83, 81], [79, REST, 83, 79, 74, REST, 79, REST],
    ],
  },
  {
    id: 'autumn', title: '秋 · 收好来时路', stage: '重新选择', bpm: 82,
    instrument: 'piano', harmony: 'marimba', bass: 'round', rhythm: 'autumn',
    description: '低音区木琴与柔和钢琴，留白中的回望',
    chords: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55],
      [50, 53, 57], [43, 46, 50], [46, 50, 53], [45, 49, 52],
      [53, 57, 60], [48, 52, 55], [50, 53, 57], [46, 50, 53],
      [43, 46, 50], [50, 53, 57], [45, 49, 52], [50, 53, 57]],
    melody: [
      [69, REST, REST, 65, 62, REST, 64, REST], [65, REST, 62, REST, 58, REST, REST, 62],
      [65, REST, 69, REST, 72, REST, 69, 67], [64, REST, REST, 67, 72, REST, 67, REST],
      [69, REST, 65, 64, 62, REST, REST, REST], [62, REST, REST, 58, 55, REST, 58, 62],
      [65, REST, 62, REST, 70, REST, 69, 65], [64, REST, 61, REST, 57, REST, REST, REST],
      [69, REST, 72, REST, 77, REST, 72, 69], [67, REST, REST, 64, 60, REST, 64, REST],
      [65, 69, REST, 74, 72, REST, 69, 65], [62, REST, 65, REST, 70, REST, REST, 65],
      [67, REST, 62, 58, 55, REST, 58, REST], [62, REST, 65, REST, 69, 67, 65, REST],
      [64, REST, 61, REST, 69, REST, 64, 61], [62, REST, REST, REST, 65, REST, 62, REST],
    ],
  },
  {
    id: 'winter', title: '冬 · 雪落仍有光', stage: '独立生活', bpm: 70,
    instrument: 'bell', harmony: 'pad', bass: 'soft', rhythm: 'winter',
    description: '稀疏钟声与绵长和声，雪夜中的安定呼吸',
    chords: [[40, 47, 54], [48, 55, 59], [43, 50, 57], [50, 57, 62],
      [40, 47, 54], [45, 52, 59], [48, 55, 59], [47, 54, 59],
      [43, 50, 57], [50, 57, 62], [40, 47, 54], [48, 55, 59],
      [45, 52, 59], [47, 54, 59], [48, 55, 59], [40, 47, 54]],
    melody: [
      [83, REST, REST, REST, 78, REST, REST, REST], [79, REST, REST, 76, REST, REST, 83, REST],
      [81, REST, REST, REST, 79, REST, 74, REST], [78, REST, REST, REST, REST, REST, 81, REST],
      [83, REST, REST, REST, 86, REST, REST, REST], [88, REST, REST, 83, REST, REST, 81, REST],
      [79, REST, REST, REST, 83, REST, REST, REST], [78, REST, REST, REST, 71, REST, REST, REST],
      [86, REST, REST, REST, 81, REST, REST, REST], [81, REST, 78, REST, 74, REST, REST, REST],
      [78, REST, REST, REST, 83, REST, 86, REST], [88, REST, REST, REST, 83, REST, REST, REST],
      [81, REST, REST, 76, REST, REST, 83, REST], [78, REST, REST, REST, 83, REST, REST, REST],
      [79, REST, REST, REST, 76, REST, REST, REST], [78, REST, REST, REST, 76, REST, REST, REST],
    ],
  },
].map((score) => ({ ...score, name: score.title, bars: 16, beatsPerBar: 4, durationSeconds: 16 * 4 * 60 / score.bpm })));

const TIMBRES = {
  flute: { attack: .035, release: .12, partials: [[1, .85, 'sine'], [2, .1, 'sine'], [3, .04, 'sine']] },
  pluck: { attack: .008, release: .19, partials: [[1, .64, 'triangle'], [2, .19, 'sine'], [3, .08, 'sine']] },
  strum: { attack: .012, release: .13, partials: [[1, .60, 'triangle'], [2, .17, 'sine']] },
  piano: { attack: .008, release: .27, partials: [[1, .73, 'sine'], [2, .18, 'sine'], [3, .06, 'sine']] },
  marimba: { attack: .005, release: .14, partials: [[1, .83, 'sine'], [4, .12, 'sine']] },
  bell: { attack: .01, release: .8, partials: [[1, .63, 'sine'], [2.01, .21, 'sine'], [3.97, .08, 'sine']] },
  pad: { attack: .35, release: .42, partials: [[1, .75, 'sine'], [2, .14, 'sine']] },
  round: { attack: .012, release: .1, partials: [[1, .89, 'sine'], [2, .08, 'sine']] },
  soft: { attack: .13, release: .3, partials: [[1, .85, 'sine']] },
};

const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const safeDisconnect = (node) => { try { node.disconnect(); } catch { /* Already disconnected. */ } };

/** Pure score-to-note mapping, shared by the realtime player and offline regression tests. */
export function getSeasonStepNotes(season, step) {
  const score = SEASON_SCORES[season];
  if (!score) throw new RangeError('Season must be 0, 1, 2 or 3.');
  const normalizedStep = ((step % 128) + 128) % 128;
  const bar = Math.floor(normalizedStep / 8);
  const pulse = normalizedStep % 8;
  const beat = 60 / score.bpm;
  const chord = score.chords[bar];
  const notes = [];
  const melody = score.melody[bar][pulse];
  if (melody !== REST) {
    const duration = beat * (season === 3 ? 1.35 : season === 2 ? .72 : .37);
    notes.push({ midi: melody, instrument: score.instrument, duration, gain: .19, offset: 0 });
  }
  if (season === 0 && pulse % 2 === 0) {
    notes.push({ midi: chord[(pulse / 2 + bar) % 3] + 12, instrument: score.harmony, duration: beat * .65, gain: .095, offset: 0 });
  } else if (season === 1 && [0, 3, 4, 7].includes(pulse)) {
    chord.forEach((midi, index) => notes.push({ midi: midi + 12, instrument: score.harmony, duration: beat * .48, gain: .047, offset: index * .012 }));
  } else if (season === 2 && [0, 3, 6].includes(pulse)) {
    notes.push({ midi: chord[[0, 3, 6].indexOf(pulse)] + 12, instrument: score.harmony, duration: beat * .8, gain: .12, offset: 0 });
  } else if (season === 3 && pulse === 0) {
    chord.forEach((midi) => notes.push({ midi: midi + 12, instrument: score.harmony, duration: beat * 3.5, gain: .035, offset: 0 }));
  }
  const bassPulses = season === 1 ? [0, 2, 4, 6] : season === 3 ? [0] : [0, 4];
  if (bassPulses.includes(pulse)) {
    notes.push({ midi: (pulse === 4 && season !== 3 ? chord[2] : chord[0]) - 12,
      instrument: score.bass, duration: beat * (season === 3 ? 3.6 : .85), gain: .15, offset: 0 });
  }
  if (season === 1 && [0, 2, 4, 6].includes(pulse)) {
    notes.push({ instrument: pulse % 4 === 0 ? 'kick' : 'tick', duration: .1, gain: .07, offset: 0 });
  } else if (season === 0 && pulse === 6 && bar % 2 === 1) {
    notes.push({ instrument: 'tick', duration: .045, gain: .025, offset: 0 });
  }
  return notes;
}

/** Render a note using oscillator partials; no sample files or random/network dependencies. */
export function scheduleSeasonNote(context, destination, note, time, onEnded) {
  const envelope = context.createGain();
  envelope.connect(destination);
  const percussion = note.instrument === 'kick' || note.instrument === 'tick';
  const timbre = TIMBRES[note.instrument] || TIMBRES.soft;
  const attack = percussion ? .003 : timbre.attack;
  const release = percussion ? .04 : timbre.release;
  const end = time + Math.max(note.duration, attack + .01) + release;
  const peak = note.gain;
  envelope.gain.setValueAtTime(0, time);
  envelope.gain.linearRampToValueAtTime(peak, time + attack);
  envelope.gain.exponentialRampToValueAtTime(Math.max(.0001, peak * .22), time + Math.max(note.duration, attack + .01));
  envelope.gain.linearRampToValueAtTime(0, end);
  const nodes = [envelope];
  const oscillators = [];
  let completed = 0;
  let disconnected = false;
  const disconnect = () => {
    if (disconnected) return;
    disconnected = true;
    nodes.forEach(safeDisconnect);
    onEnded?.();
  };
  const partials = percussion ? [[1, 1, 'sine']] : timbre.partials;
  partials.forEach(([ratio, amplitude, type]) => {
    const oscillator = context.createOscillator();
    const partialGain = context.createGain();
    oscillator.type = type;
    if (percussion) {
      oscillator.frequency.setValueAtTime(note.instrument === 'kick' ? 115 : 1400, time);
      oscillator.frequency.exponentialRampToValueAtTime(note.instrument === 'kick' ? 48 : 520, end);
    } else {
      oscillator.frequency.setValueAtTime(frequency(note.midi) * ratio, time);
    }
    partialGain.gain.setValueAtTime(amplitude, time);
    oscillator.connect(partialGain);
    partialGain.connect(envelope);
    nodes.push(oscillator, partialGain);
    oscillators.push(oscillator);
    oscillator.onended = () => { if (++completed === partials.length) disconnect(); };
    oscillator.start(time);
    oscillator.stop(end + .015);
  });
  return {
    endTime: end + .015,
    stop(at = context.currentTime, immediatelyDisconnect = false) {
      oscillators.forEach((oscillator) => { try { oscillator.stop(at); } catch { /* Already ended. */ } });
      if (immediatelyDisconnect) disconnect();
    },
  };
}

/** Small look-ahead sequencer: only the next 200ms is queued, even after background throttling. */
export function createSeasonMusic(options = {}) {
  const NativeAudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
  const contextFactory = options.contextFactory || (NativeAudioContext ? () => new NativeAudioContext() : null);
  const timers = options.timers || globalThis;
  let context = null;
  let master = null;
  let timer = null;
  let current = null;
  const channels = new Set();
  let enabled = options.enabled !== false;
  let volume = Number.isFinite(options.volume) ? clamp(options.volume, 0, 1) : .18;
  let season = 0;
  let paused = false;
  let unlocked = false;
  let blocked = false;
  let disposed = false;
  let resumeStep = 0;
  let revision = 0;
  let lastStatus = '';

  function getStatus() {
    return { supported: !!contextFactory, unlocked, enabled, paused,
      playing: !disposed && timer !== null && context?.state === 'running',
      season, volume, blocked, disposed, title: SEASON_SCORES[season].title };
  }
  function publish() {
    const status = getStatus();
    const serialized = JSON.stringify(status);
    if (lastStatus !== serialized) {
      lastStatus = serialized;
      try { options.onStatusChange?.(status); } catch { /* Presentation must not interrupt audio cleanup. */ }
    }
  }
  function releaseChannel(channel, immediately = false, stopAt = context.currentTime) {
    channel.active = false;
    channel.retireAt = stopAt;
    for (const voice of channel.voices) voice.stop(stopAt, immediately);
    if (immediately) {
      safeDisconnect(channel.gain);
      channels.delete(channel);
    }
  }
  function stopPlayback() {
    if (timer !== null) timers.clearInterval(timer);
    timer = null;
    if (current && context) {
      resumeStep = Math.max(0, Math.floor((context.currentTime - current.startedAt) / current.stepDuration) + current.firstStep) % 128;
    }
    if (context) for (const channel of [...channels]) releaseChannel(channel, true);
    current = null;
  }
  function createChannel(fade = .08) {
    const gain = context.createGain();
    gain.connect(master);
    const now = context.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + fade);
    const channel = { season, gain, active: true, voices: new Set(),
      nextStep: resumeStep, firstStep: resumeStep, startedAt: now + .04,
      nextAt: now + .04, stepDuration: 30 / SEASON_SCORES[season].bpm, retireAt: Infinity };
    channels.add(channel);
    current = channel;
  }
  function tick() {
    if (!current || !context || context.state !== 'running' || disposed) return;
    const now = context.currentTime;
    for (const channel of [...channels]) {
      if (!channel.active && now >= channel.retireAt + .02) {
        releaseChannel(channel, true);
      }
    }
    // A sleeping tab must never play a backlog of missed notes in one burst.
    if (current.nextAt < now - .15) {
      const skipped = Math.ceil((now - current.nextAt) / current.stepDuration);
      current.nextStep = (current.nextStep + skipped) % 128;
      current.nextAt = now + .035;
    }
    while (current.nextAt < now + .2) {
      const channel = current;
      for (const note of getSeasonStepNotes(channel.season, channel.nextStep)) {
        let voice;
        voice = scheduleSeasonNote(context, channel.gain, note, channel.nextAt + note.offset, () => channel.voices.delete(voice));
        channel.voices.add(voice);
      }
      channel.nextStep = (channel.nextStep + 1) % 128;
      channel.nextAt += channel.stepDuration;
    }
  }
  function startPlayback() {
    if (timer !== null || disposed || !enabled || paused || !unlocked || context?.state !== 'running') return;
    createChannel();
    timer = timers.setInterval(tick, 80);
    tick();
    publish();
  }
  async function reconcile() {
    const operation = ++revision;
    if (disposed || !context) { publish(); return false; }
    if (!enabled || paused || !unlocked) {
      stopPlayback();
      try { if (context.state === 'running') await context.suspend(); } catch { /* Closed/interrupted context. */ }
      publish();
      return false;
    }
    try {
      // Queue a resume even while currently running: a preceding suspend may still be pending.
      await context.resume();
      if (operation !== revision || disposed || paused || !enabled) return false;
      blocked = context.state !== 'running';
      if (!blocked) startPlayback();
      publish();
      return !blocked;
    } catch {
      if (operation === revision) { blocked = true; stopPlayback(); publish(); }
      return false;
    }
  }
  async function unlock() {
    if (disposed || !contextFactory) { publish(); return false; }
    try {
      if (!context) {
        context = contextFactory();
        master = context.createGain();
        master.gain.setValueAtTime(volume, context.currentTime);
        master.connect(context.destination);
        context.addEventListener?.('statechange', publish);
      }
      // Invoke resume synchronously inside the caller's user gesture before the first await.
      const resumed = context.resume();
      await resumed;
      if (disposed) return false;
      unlocked = context.state === 'running';
      blocked = !unlocked;
      await reconcile();
      publish();
      return unlocked;
    } catch {
      if (!disposed) { blocked = true; unlocked = false; stopPlayback(); publish(); }
      return false;
    }
  }
  function setSeason(index) {
    if (disposed) return;
    if (!Number.isInteger(index) || index < 0 || index > 3) throw new RangeError('Season must be 0, 1, 2 or 3.');
    if (season === index) return;
    season = index;
    resumeStep = 0;
    if (current && context?.state === 'running') {
      const now = context.currentTime;
      // Only one outgoing channel is retained, even if several season changes happen rapidly.
      for (const channel of [...channels]) if (channel !== current) releaseChannel(channel, true);
      const previous = current;
      previous.gain.gain.cancelScheduledValues(now);
      previous.gain.gain.setValueAtTime(Math.max(0, previous.gain.gain.value), now);
      previous.gain.gain.linearRampToValueAtTime(0, now + .8);
      releaseChannel(previous, false, now + .82);
      createChannel(.8);
      tick();
    }
    publish();
  }
  function setEnabled(value) {
    if (disposed) return;
    enabled = !!value;
    void reconcile();
    publish();
  }
  function setPaused(value) {
    if (disposed || paused === !!value) return;
    paused = !!value;
    void reconcile();
    publish();
  }
  function setVolume(value) {
    if (disposed || !Number.isFinite(value)) return;
    volume = clamp(value, 0, 1);
    if (master && context) {
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(volume, context.currentTime, .045);
    }
    publish();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    ++revision;
    stopPlayback();
    if (master) safeDisconnect(master);
    if (context) {
      context.removeEventListener?.('statechange', publish);
      try { Promise.resolve(context.close()).catch(() => {}); } catch { /* Already closed. */ }
    }
    publish();
  }
  publish();
  return { unlock, setSeason, setEnabled, setVolume, setPaused, getStatus, dispose };
}
