import { GAMEPLAY } from '../config/gameplay.js';

/**
 * Original sound effects synthesised at runtime with the Web Audio API.
 *
 * No audio files ship with the game, so nothing can be mistaken for a
 * third-party recording. Every entry point is wrapped so that a missing or
 * blocked AudioContext degrades to silence and never interrupts gameplay.
 *
 * The context is created lazily on the first user gesture, satisfying browser
 * autoplay policies.
 */

/**
 * Output level of the master bus.
 *
 * A compressor sits after this gain, so individual effects can be mixed loud
 * enough to be clearly audible on laptop speakers without the sum clipping when
 * several overlap.
 */
const MASTER_GAIN = 0.85;

/**
 * Per-effect mix levels, gathered here so the balance can be tuned in one place.
 *
 * These are peak amplitudes before the master gain. Values around 0.4 to 0.7
 * land in a healthy range, roughly -9 to -5 dBFS at the output.
 */
const MIX = Object.freeze({
  hop: 0.55,
  blocked: 0.42,
  impactTone: 0.7,
  impactNoise: 0.55,
  splashNoise: 0.6,
  splashTone: 0.36,
  bellHigh: 0.5,
  bellLow: 0.48,
  bellTail: 0.4,
  rumbleNoise: 0.62,
  rumbleTone: 0.4,
  milestone: 0.45,
  menu: 0.4,
  shieldPickup: 0.48,
  shieldUp: 0.5,
  shieldDown: 0.42,
  shieldDeflectTone: 0.55,
  shieldDeflectNoise: 0.4
});

/** Default envelope shape, as fractions of an effect's duration. */
const ENVELOPE = Object.freeze({
  /** Attack time in seconds, capped at a third of the duration. */
  attack: 0.008,
  /** Fraction of the duration held at full level before the decay starts. */
  sustain: 0.45,
  /** Floor used by the exponential ramps, which cannot target zero. */
  floor: 0.0001
});

/** Level above which the soft clipper starts to saturate. */
const SOFT_CLIP_KNEE = 0.7;

/**
 * Transfer curve for the output soft clipper.
 *
 * Linear below the knee, so normal effects pass through untouched, then a smooth
 * saturation that asymptotes below full scale. A WaveShaper clamps its input to
 * [-1, 1], so anything hotter than full scale lands on the curve's endpoint and
 * the output can never exceed it.
 */
function softClipCurve(samples = 2048) {
  const curve = new Float32Array(samples);
  const range = 1 - SOFT_CLIP_KNEE;
  for (let i = 0; i < samples; i += 1) {
    const x = (i / (samples - 1)) * 2 - 1;
    const magnitude = Math.abs(x);
    curve[i] =
      magnitude <= SOFT_CLIP_KNEE
        ? x
        : Math.sign(x) * (SOFT_CLIP_KNEE + range * Math.tanh((magnitude - SOFT_CLIP_KNEE) / range));
  }
  return curve;
}

export class AudioSystem {
  /** @param {import('./StorageSystem.js').StorageSystem} [storage] */
  constructor(storage = null) {
    this.storage = storage;
    this.mutedKey = GAMEPLAY.storage.muted;
    this.muted = storage ? storage.getBoolean(this.mutedKey, false) : false;

    this._ctx = null;
    this._master = null;
    this._limiter = null;
    this._softClip = null;
    this._noiseBuffer = null;
    this._failed = false;
    this._unlocked = false;
  }

  get available() {
    return !this._failed;
  }

  /**
   * Creates and resumes the audio context. Must be called from a user gesture.
   * Safe to call repeatedly.
   */
  unlock() {
    if (this._failed) return;
    try {
      if (!this._ctx) {
        const Ctor =
          typeof AudioContext !== 'undefined'
            ? AudioContext
            : typeof webkitAudioContext !== 'undefined'
              ? webkitAudioContext
              : null;
        if (!Ctor) {
          this._failed = true;
          return;
        }
        this._ctx = new Ctor();

        this._master = this._ctx.createGain();
        this._master.gain.value = this.muted ? 0 : MASTER_GAIN;
        this._buildOutputChain();
      }
      // Browsers start the context suspended until a gesture; Safari in
      // particular can also reject the resume, so the promise is handled.
      if (this._ctx.state === 'suspended') {
        const resuming = this._ctx.resume();
        if (resuming && typeof resuming.catch === 'function') resuming.catch(() => {});
      }
      this._unlocked = true;
    } catch {
      this._failed = true;
    }
  }

  /**
   * Builds the output chain: master gain, then a compressor, then a soft clipper.
   *
   * Effects are mixed loud enough to be clearly audible on laptop speakers, and
   * several can sound at once - a crossing bell, a train rumble, a hop and an
   * impact. The compressor rides the sum down, and the soft clipper guarantees
   * the result stays inside the output range instead of clipping harshly. Both
   * stages are optional so an unusual implementation still gets audio.
   */
  _buildOutputChain() {
    const ctx = this._ctx;
    let tail = this._master;

    this._limiter = this._createNode('createDynamicsCompressor', (limiter) => {
      limiter.threshold.value = -8;
      limiter.knee.value = 6;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.12;
    });
    if (this._limiter) {
      tail.connect(this._limiter);
      tail = this._limiter;
    }

    this._softClip = this._createNode('createWaveShaper', (shaper) => {
      shaper.curve = softClipCurve();
      shaper.oversample = '2x';
    });
    if (this._softClip) {
      tail.connect(this._softClip);
      tail = this._softClip;
    }

    tail.connect(ctx.destination);
  }

  /** Creates and configures an optional node, or null if unsupported. */
  _createNode(factoryName, configure) {
    try {
      if (typeof this._ctx[factoryName] !== 'function') return null;
      const node = this._ctx[factoryName]();
      configure(node);
      return node;
    } catch {
      return null;
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.storage) this.storage.setBoolean(this.mutedKey, this.muted);
    try {
      if (this._master) this._master.gain.value = this.muted ? 0 : MASTER_GAIN;
    } catch {
      /* gain assignment cannot meaningfully fail; ignore defensively */
    }
    return this.muted;
  }

  toggleMute() {
    return this.setMuted(!this.muted);
  }

  /** Suspends output while the game is paused or the tab is hidden. */
  suspend() {
    try {
      if (this._ctx && this._ctx.state === 'running') this._ctx.suspend();
    } catch {
      /* ignore */
    }
  }

  resume() {
    try {
      if (this._unlocked && this._ctx && this._ctx.state === 'suspended') this._ctx.resume();
    } catch {
      /* ignore */
    }
  }

  dispose() {
    try {
      if (this._ctx) this._ctx.close();
    } catch {
      /* ignore */
    }
    this._ctx = null;
    this._master = null;
    this._limiter = null;
    this._softClip = null;
    this._noiseBuffer = null;
  }

  // ---------------------------------------------------------------- effects

  /**
   * A short rising blip for a successful hop.
   * Kept brief because hops can follow each other every 130 ms.
   */
  hop() {
    this._tone({
      type: 'triangle',
      from: 460,
      to: 700,
      duration: 0.12,
      gain: MIX.hop,
      sustain: 0.35
    });
  }

  /** A dull thud when a movement is refused. */
  blocked() {
    // A square wave keeps this audible on small speakers, where a low sine
    // would mostly disappear.
    this._tone({ type: 'square', from: 190, to: 130, duration: 0.11, gain: MIX.blocked });
  }

  /** Impact: a falling thump plus a burst of noise. */
  vehicleImpact() {
    this._tone({ type: 'sawtooth', from: 260, to: 70, duration: 0.32, gain: MIX.impactTone });
    this._noise({ duration: 0.26, gain: MIX.impactNoise, filter: 'lowpass', from: 1800, to: 240 });
  }

  /** Water entry: a falling filtered noise sweep. */
  splash() {
    this._noise({
      duration: 0.42,
      gain: MIX.splashNoise,
      filter: 'bandpass',
      from: 2400,
      to: 420,
      q: 1.1
    });
    this._tone({ type: 'sine', from: 680, to: 200, duration: 0.28, gain: MIX.splashTone });
  }

  /** Two-tone crossing bell before a train arrives. */
  trainWarning() {
    this._tone({ type: 'sine', from: 880, to: 880, duration: 0.18, gain: MIX.bellHigh });
    this._tone({
      type: 'sine',
      from: 660,
      to: 660,
      duration: 0.18,
      gain: MIX.bellLow,
      delay: 0.2
    });
    this._tone({
      type: 'sine',
      from: 880,
      to: 880,
      duration: 0.18,
      gain: MIX.bellTail,
      delay: 0.4
    });
  }

  /** Rumble as a train crosses. */
  trainPass() {
    this._noise({
      duration: 0.8,
      gain: MIX.rumbleNoise,
      filter: 'lowpass',
      from: 900,
      to: 220,
      sustain: 0.6
    });
    // Pitched up from a sub-bass growl so laptop speakers can reproduce it.
    this._tone({
      type: 'sawtooth',
      from: 150,
      to: 95,
      duration: 0.75,
      gain: MIX.rumbleTone,
      sustain: 0.6
    });
  }

  /** Rising arpeggio when a score milestone is passed. */
  milestone() {
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((frequency, i) => {
      this._tone({
        type: 'triangle',
        from: frequency,
        to: frequency,
        duration: 0.14,
        gain: MIX.milestone,
        delay: i * 0.1
      });
    });
  }

  /** Soft click for menu interaction. */
  menu() {
    this._tone({ type: 'sine', from: 520, to: 760, duration: 0.1, gain: MIX.menu });
  }

  /** Bright two-note chime when a shield token is collected. */
  shieldPickup() {
    this._tone({ type: 'triangle', from: 700, to: 700, duration: 0.11, gain: MIX.shieldPickup });
    this._tone({
      type: 'triangle',
      from: 1050,
      to: 1050,
      duration: 0.14,
      gain: MIX.shieldPickup,
      delay: 0.09
    });
  }

  /** Rising swell as a shield is raised. Distinct from the hop's short blip. */
  shieldUp() {
    this._tone({
      type: 'sine',
      from: 340,
      to: 880,
      duration: 0.3,
      gain: MIX.shieldUp,
      sustain: 0.6
    });
  }

  /** Falling counterpart as the shield expires, so its end is audible. */
  shieldDown() {
    this._tone({
      type: 'sine',
      from: 760,
      to: 300,
      duration: 0.26,
      gain: MIX.shieldDown,
      sustain: 0.5
    });
  }

  /** Metallic clang when the shield turns a hazard away. */
  shieldDeflect() {
    this._tone({ type: 'square', from: 620, to: 940, duration: 0.14, gain: MIX.shieldDeflectTone });
    this._noise({
      duration: 0.2,
      gain: MIX.shieldDeflectNoise,
      filter: 'bandpass',
      from: 2600,
      to: 1400,
      q: 1.4
    });
  }

  // ------------------------------------------------------------- internals

  _ready() {
    return !this._failed && this._ctx && this._master && !this.muted;
  }

  /**
   * Writes an attack / hold / decay envelope onto a gain parameter.
   *
   * The hold matters: ramping straight from the attack down to the floor spends
   * almost the whole effect near silence, which is what made these sounds so
   * hard to hear. Holding at full level for part of the duration raises the
   * perceived loudness substantially at the same peak amplitude.
   */
  _applyEnvelope(param, { start, duration, gain, attack = ENVELOPE.attack, sustain = ENVELOPE.sustain }) {
    const { floor } = ENVELOPE;
    const attackTime = Math.min(attack, duration * 0.3);
    const attackEnd = start + attackTime;
    // Keep the hold strictly between the attack and the end of the sound.
    const holdEnd = Math.min(
      start + duration - 0.001,
      Math.max(attackEnd + 0.001, start + duration * sustain)
    );

    param.setValueAtTime(floor, start);
    param.exponentialRampToValueAtTime(gain, attackEnd);
    param.setValueAtTime(gain, holdEnd);
    param.exponentialRampToValueAtTime(floor, start + duration);
  }

  /** Oscillator with an exponential frequency sweep and a percussive envelope. */
  _tone({ type = 'sine', from, to, duration, gain = 0.4, delay = 0, attack, sustain }) {
    if (!this._ready()) return;
    try {
      const ctx = this._ctx;
      const start = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, from), start);
      if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);

      this._applyEnvelope(env.gain, { start, duration, gain, attack, sustain });

      osc.connect(env);
      env.connect(this._master);
      osc.start(start);
      osc.stop(start + duration + 0.02);
      osc.onended = () => {
        try {
          osc.disconnect();
          env.disconnect();
        } catch {
          /* ignore */
        }
      };
    } catch {
      /* a single failed effect must never break the frame */
    }
  }

  /** Filtered white noise burst. */
  _noise({
    duration,
    gain = 0.4,
    filter = 'lowpass',
    from = 1200,
    to = 300,
    q = 1,
    delay = 0,
    sustain
  }) {
    if (!this._ready()) return;
    try {
      const ctx = this._ctx;
      const start = ctx.currentTime + delay;
      const source = ctx.createBufferSource();
      source.buffer = this._getNoiseBuffer();

      const biquad = ctx.createBiquadFilter();
      biquad.type = filter;
      biquad.Q.value = q;
      biquad.frequency.setValueAtTime(from, start);
      biquad.frequency.exponentialRampToValueAtTime(Math.max(40, to), start + duration);

      const env = ctx.createGain();
      this._applyEnvelope(env.gain, { start, duration, gain, attack: 0.012, sustain });

      source.connect(biquad);
      biquad.connect(env);
      env.connect(this._master);
      source.start(start);
      source.stop(start + duration + 0.02);
      source.onended = () => {
        try {
          source.disconnect();
          biquad.disconnect();
          env.disconnect();
        } catch {
          /* ignore */
        }
      };
    } catch {
      /* ignore */
    }
  }

  /** One second of white noise, generated once and reused. */
  _getNoiseBuffer() {
    if (this._noiseBuffer) return this._noiseBuffer;
    const ctx = this._ctx;
    const length = Math.floor(ctx.sampleRate);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buffer;
    return buffer;
  }
}
