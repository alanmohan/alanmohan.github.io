import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GAMEPLAY } from '../src/config/gameplay.js';
import { AudioSystem } from '../src/systems/AudioSystem.js';
import { StorageSystem } from '../src/systems/StorageSystem.js';

/**
 * The Web Audio API is mocked so the synthesiser can be verified in Node.
 *
 * The mock records every scheduled automation event, which is what lets these
 * tests assert the envelope *shape* rather than just that a node was created.
 * Real output levels are measured separately in a browser.
 */

class MockParam {
  constructor(name) {
    this.name = name;
    this.value = 0;
    this.events = [];
  }
  setValueAtTime(value, time) {
    this.events.push({ kind: 'set', value, time });
    return this;
  }
  exponentialRampToValueAtTime(value, time) {
    this.events.push({ kind: 'ramp', value, time });
    return this;
  }
  linearRampToValueAtTime(value, time) {
    this.events.push({ kind: 'linear', value, time });
    return this;
  }
}

class MockNode {
  constructor(kind, ctx) {
    this.kind = kind;
    this.ctx = ctx;
    this.connections = [];
    this.started = null;
    this.stopped = null;
    this.disconnected = false;
  }
  connect(destination) {
    this.connections.push(destination);
    this.ctx.connections.push([this.kind, destination.kind || 'destination']);
    return destination;
  }
  disconnect() {
    this.disconnected = true;
  }
  start(time) {
    this.started = time;
    this.ctx.starts.push({ kind: this.kind, time });
  }
  stop(time) {
    this.stopped = time;
  }
}

class MockAudioContext {
  constructor({ initialState = 'suspended', omit = [], throwOn = null } = {}) {
    this.state = initialState;
    this.sampleRate = 48000;
    this.currentTime = 0;
    this.destination = { kind: 'destination' };
    this.nodes = [];
    this.connections = [];
    this.starts = [];
    this.resumeCount = 0;
    this.suspendCount = 0;
    this.closed = false;
    this._throwOn = throwOn;

    for (const name of omit) this[name] = undefined;
  }

  _make(kind) {
    if (this._throwOn === kind) throw new Error(`refused to create ${kind}`);
    const node = new MockNode(kind, this);
    this.nodes.push(node);
    return node;
  }

  createGain() {
    const node = this._make('gain');
    node.gain = new MockParam('gain');
    return node;
  }
  createOscillator() {
    const node = this._make('oscillator');
    node.frequency = new MockParam('frequency');
    node.type = 'sine';
    return node;
  }
  createBufferSource() {
    const node = this._make('bufferSource');
    node.buffer = null;
    return node;
  }
  createBiquadFilter() {
    const node = this._make('biquad');
    node.frequency = new MockParam('biquadFrequency');
    node.Q = { value: 0 };
    node.type = 'lowpass';
    return node;
  }
  createDynamicsCompressor() {
    const node = this._make('compressor');
    for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) {
      node[key] = { value: 0 };
    }
    return node;
  }
  createWaveShaper() {
    const node = this._make('waveShaper');
    node.curve = null;
    node.oversample = 'none';
    return node;
  }
  createBuffer(channels, length, sampleRate) {
    return {
      length,
      sampleRate,
      numberOfChannels: channels,
      getChannelData: () => new Float32Array(length)
    };
  }
  resume() {
    this.resumeCount += 1;
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    this.suspendCount += 1;
    this.state = 'suspended';
    return Promise.resolve();
  }
  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

/** Installs a mock AudioContext and returns the instance the system builds. */
function install(options) {
  let created = null;
  globalThis.AudioContext = class extends MockAudioContext {
    constructor() {
      super(options);
      created = this;
    }
  };
  return () => created;
}

const originalAudioContext = globalThis.AudioContext;

afterEach(() => {
  globalThis.AudioContext = originalAudioContext;
});

/** Oscillator nodes created for effects, excluding the master bus. */
function oscillators(ctx) {
  return ctx.nodes.filter((node) => node.kind === 'oscillator');
}

/** The gain node that carries an effect's envelope, i.e. one with ramp events. */
function envelopeNodes(ctx) {
  return ctx.nodes.filter((node) => node.gain && node.gain.events.length > 2);
}

describe('AudioSystem gating', () => {
  it('creates no context until unlocked, respecting autoplay policy', () => {
    const get = install();
    const audio = new AudioSystem(null);
    audio.hop();
    audio.vehicleImpact();
    expect(get()).toBeNull();
  });

  it('builds the output chain on unlock and resumes a suspended context', () => {
    const get = install({ initialState: 'suspended' });
    const audio = new AudioSystem(null);
    audio.unlock();

    const ctx = get();
    expect(ctx).toBeTruthy();
    expect(ctx.resumeCount).toBe(1);
    expect(ctx.state).toBe('running');

    // master gain -> compressor -> soft clipper -> destination
    expect(ctx.connections).toEqual([
      ['gain', 'compressor'],
      ['compressor', 'waveShaper'],
      ['waveShaper', 'destination']
    ]);
  });

  it('does not resume a context that is already running', () => {
    const get = install({ initialState: 'running' });
    const audio = new AudioSystem(null);
    audio.unlock();
    expect(get().resumeCount).toBe(0);
  });

  it('unlocking repeatedly reuses the same context', () => {
    const get = install();
    const audio = new AudioSystem(null);
    audio.unlock();
    const first = get();
    audio.unlock();
    audio.unlock();
    expect(get()).toBe(first);
    expect(first.nodes.filter((n) => n.kind === 'gain')).toHaveLength(1);
  });

  it('plays effects once unlocked', () => {
    const get = install();
    const audio = new AudioSystem(null);
    audio.unlock();
    audio.hop();

    const ctx = get();
    expect(oscillators(ctx)).toHaveLength(1);
    expect(ctx.starts.some((s) => s.kind === 'oscillator')).toBe(true);
  });
});

describe('effect envelopes', () => {
  let get;
  let audio;

  beforeEach(() => {
    get = install();
    audio = new AudioSystem(null);
    audio.unlock();
  });

  /**
   * Regression test for the reason the sound was inaudible: the envelope used to
   * ramp straight from the attack down to the floor, so a 100 ms effect spent
   * almost all of its life near silence. It must now hold at full level.
   */
  it('holds each effect at full level before decaying', () => {
    audio.hop();
    const [envelope] = envelopeNodes(get());
    const events = envelope.gain.events;

    expect(events).toHaveLength(4);
    const [floorStart, attack, hold, release] = events;

    expect(floorStart.kind).toBe('set');
    expect(floorStart.value).toBeLessThan(0.001);

    expect(attack.kind).toBe('ramp');
    expect(attack.value).toBeGreaterThan(0.1);

    // The hold anchors the level so the decay does not begin at the attack.
    expect(hold.kind).toBe('set');
    expect(hold.value).toBe(attack.value);
    expect(hold.time).toBeGreaterThan(attack.time);

    expect(release.kind).toBe('ramp');
    expect(release.value).toBeLessThan(0.001);
    expect(release.time).toBeGreaterThan(hold.time);
  });

  it('spends a meaningful share of each effect at full level', () => {
    audio.hop();
    const [envelope] = envelopeNodes(get());
    const [start, attack, hold, release] = envelope.gain.events;

    const duration = release.time - start.time;
    const holdTime = hold.time - attack.time;
    // At least a fifth of the sound sits at peak, which is what makes it audible.
    expect(holdTime / duration).toBeGreaterThan(0.2);
  });

  it('keeps envelope times strictly ordered for every effect', () => {
    const effects = [
      'hop',
      'blocked',
      'vehicleImpact',
      'splash',
      'trainWarning',
      'trainPass',
      'milestone',
      'menu',
      'shieldPickup',
      'shieldUp',
      'shieldDown',
      'shieldDeflect'
    ];

    for (const name of effects) {
      const local = install();
      const system = new AudioSystem(null);
      system.unlock();
      system[name]();

      const envelopes = envelopeNodes(local());
      expect(envelopes.length, name).toBeGreaterThan(0);

      for (const node of envelopes) {
        const times = node.gain.events.map((event) => event.time);
        for (let i = 1; i < times.length; i += 1) {
          expect(times[i], `${name} event ${i}`).toBeGreaterThan(times[i - 1]);
        }
        // Exponential ramps cannot target zero.
        for (const event of node.gain.events) {
          expect(event.value, name).toBeGreaterThan(0);
        }
      }
    }
  });

  it('never ramps a frequency to zero', () => {
    audio.vehicleImpact();
    audio.splash();
    for (const node of get().nodes) {
      const param = node.frequency;
      if (!param) continue;
      for (const event of param.events) expect(event.value).toBeGreaterThan(0);
    }
  });

  it('mixes effects at a level that is actually audible', () => {
    // Guards against a regression to the original quiet gain staging, where the
    // loudest effect peaked around 0.1 before the master gain.
    const peaks = [];
    for (const name of ['hop', 'blocked', 'vehicleImpact', 'trainWarning', 'menu']) {
      const local = install();
      const system = new AudioSystem(null);
      system.unlock();
      system[name]();
      for (const node of envelopeNodes(local())) {
        peaks.push(Math.max(...node.gain.events.map((event) => event.value)));
      }
    }

    expect(Math.min(...peaks)).toBeGreaterThan(0.3);
    // Headroom is provided by the limiter and soft clipper, not by mixing quietly.
    expect(Math.max(...peaks)).toBeLessThanOrEqual(1);
  });

  it('drives the master bus at a healthy level', () => {
    const master = get().nodes.find((node) => node.gain);
    expect(master.gain.value).toBeGreaterThan(0.7);
    expect(master.gain.value).toBeLessThanOrEqual(1);
  });

  it('reuses one noise buffer across noisy effects', () => {
    audio.vehicleImpact();
    audio.splash();
    audio.trainPass();
    const sources = get().nodes.filter((node) => node.kind === 'bufferSource');
    expect(sources.length).toBe(3);
    const buffers = new Set(sources.map((source) => source.buffer));
    expect(buffers.size).toBe(1);
  });

  it('shapes noise through a filter before the master bus', () => {
    audio.splash();
    const ctx = get();
    expect(ctx.connections).toEqual(
      expect.arrayContaining([
        ['bufferSource', 'biquad'],
        ['biquad', 'gain']
      ])
    );
  });

  it('schedules layered effects with increasing delays', () => {
    audio.trainWarning();
    const starts = get()
      .starts.filter((entry) => entry.kind === 'oscillator')
      .map((entry) => entry.time);
    expect(starts).toHaveLength(3);
    expect(starts[1]).toBeGreaterThan(starts[0]);
    expect(starts[2]).toBeGreaterThan(starts[1]);
  });
});

describe('mute', () => {
  it('silences output and restores it', () => {
    const get = install();
    const audio = new AudioSystem(null);
    audio.unlock();
    const master = get().nodes.find((node) => node.gain);

    expect(audio.setMuted(true)).toBe(true);
    expect(master.gain.value).toBe(0);

    const before = oscillators(get()).length;
    audio.hop();
    expect(oscillators(get()).length, 'muted effects should not build nodes').toBe(before);

    expect(audio.setMuted(false)).toBe(false);
    expect(master.gain.value).toBeGreaterThan(0.7);
    audio.hop();
    expect(oscillators(get()).length).toBe(before + 1);
  });

  it('toggles', () => {
    install();
    const audio = new AudioSystem(null);
    audio.unlock();
    expect(audio.toggleMute()).toBe(true);
    expect(audio.toggleMute()).toBe(false);
  });

  it('can be muted before the context exists, and applies it on unlock', () => {
    const get = install();
    const audio = new AudioSystem(null);
    audio.setMuted(true);
    audio.unlock();
    expect(get().nodes.find((node) => node.gain).gain.value).toBe(0);
  });

  it('persists the preference and reloads it', () => {
    const backend = new Map();
    const storage = new StorageSystem(GAMEPLAY.storage.prefix, {
      getItem: (k) => (backend.has(k) ? backend.get(k) : null),
      setItem: (k, v) => backend.set(k, String(v)),
      removeItem: (k) => backend.delete(k)
    });

    install();
    const first = new AudioSystem(storage);
    expect(first.muted).toBe(false);
    first.setMuted(true);

    const second = new AudioSystem(storage);
    expect(second.muted).toBe(true);
  });
});

describe('suspend and resume', () => {
  it('suspends a running context and resumes it after unlocking', () => {
    const get = install();
    const audio = new AudioSystem(null);
    audio.unlock();
    const ctx = get();

    audio.suspend();
    expect(ctx.suspendCount).toBe(1);
    expect(ctx.state).toBe('suspended');

    audio.resume();
    expect(ctx.state).toBe('running');
  });

  it('does nothing when never unlocked', () => {
    const get = install();
    const audio = new AudioSystem(null);
    expect(() => audio.suspend()).not.toThrow();
    expect(() => audio.resume()).not.toThrow();
    expect(get()).toBeNull();
  });

  it('does not resume before the first gesture', () => {
    const get = install();
    const audio = new AudioSystem(null);
    audio.unlock();
    const ctx = get();
    ctx.resumeCount = 0;
    audio.suspend();
    audio.resume();
    expect(ctx.resumeCount).toBe(1);
  });
});

describe('graceful degradation', () => {
  it('reports unavailable when there is no AudioContext at all', () => {
    globalThis.AudioContext = undefined;
    const audio = new AudioSystem(null);
    audio.unlock();
    expect(audio.available).toBe(false);
    expect(() => audio.hop()).not.toThrow();
  });

  it('survives a constructor that throws, e.g. a blocked context', () => {
    globalThis.AudioContext = class {
      constructor() {
        throw new Error('blocked');
      }
    };
    const audio = new AudioSystem(null);
    audio.unlock();
    expect(audio.available).toBe(false);
    expect(() => audio.trainWarning()).not.toThrow();
  });

  it('still plays when the optional output stages are unavailable', () => {
    const get = install({ omit: ['createDynamicsCompressor', 'createWaveShaper'] });
    const audio = new AudioSystem(null);
    audio.unlock();

    const ctx = get();
    // Falls back to connecting the master bus straight to the destination.
    expect(ctx.connections).toEqual([['gain', 'destination']]);

    audio.hop();
    expect(oscillators(ctx)).toHaveLength(1);
  });

  it('still plays when creating an output stage throws', () => {
    const get = install({ throwOn: 'compressor' });
    const audio = new AudioSystem(null);
    audio.unlock();
    audio.hop();
    expect(oscillators(get())).toHaveLength(1);
  });

  it('never throws from any effect, even with no context', () => {
    globalThis.AudioContext = undefined;
    const audio = new AudioSystem(null);
    const effects = [
      'hop',
      'blocked',
      'vehicleImpact',
      'splash',
      'trainWarning',
      'trainPass',
      'milestone',
      'menu',
      'shieldPickup',
      'shieldUp',
      'shieldDown',
      'shieldDeflect'
    ];
    for (const name of effects) expect(() => audio[name](), name).not.toThrow();
  });

  it('closes the context on dispose and tolerates a second call', () => {
    const get = install();
    const audio = new AudioSystem(null);
    audio.unlock();
    const ctx = get();
    audio.dispose();
    expect(ctx.closed).toBe(true);
    expect(() => audio.dispose()).not.toThrow();
  });
});
