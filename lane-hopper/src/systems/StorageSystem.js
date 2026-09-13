/**
 * Namespaced, failure-tolerant persistence.
 *
 * localStorage can be unavailable (private browsing, disabled storage, blocked
 * third-party contexts) and its contents can be malformed because anything may
 * have written to it. Every access is guarded and falls back to an in-memory
 * store so gameplay continues either way.
 */
export class StorageSystem {
  /**
   * @param {string} prefix key namespace
   * @param {Storage} [backend] injectable for tests
   */
  constructor(prefix, backend = detectBackend()) {
    this.prefix = prefix;
    this._backend = backend;
    this._memory = new Map();
    this.available = Boolean(backend);
  }

  _key(key) {
    return `${this.prefix}.${key}`;
  }

  _read(key) {
    const fullKey = this._key(key);
    if (this._backend) {
      try {
        return this._backend.getItem(fullKey);
      } catch {
        // Reading can throw in hardened privacy modes; fall through to memory.
        this.available = false;
      }
    }
    return this._memory.has(fullKey) ? this._memory.get(fullKey) : null;
  }

  _write(key, value) {
    const fullKey = this._key(key);
    this._memory.set(fullKey, value);
    if (!this._backend) return false;
    try {
      this._backend.setItem(fullKey, value);
      return true;
    } catch {
      // Quota exceeded or storage disabled mid-session.
      this.available = false;
      return false;
    }
  }

  /**
   * Reads a non-negative integer. Missing, non-numeric, negative and fractional
   * values all fall back to `fallback`.
   */
  getInteger(key, fallback = 0) {
    const raw = this._read(key);
    if (raw === null || raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) return fallback;
    return value;
  }

  setInteger(key, value) {
    if (!Number.isFinite(value)) return false;
    return this._write(key, String(Math.max(0, Math.trunc(value))));
  }

  /** Reads a boolean stored as "1"/"0". Anything else falls back. */
  getBoolean(key, fallback = false) {
    const raw = this._read(key);
    if (raw === '1' || raw === 'true') return true;
    if (raw === '0' || raw === 'false') return false;
    return fallback;
  }

  setBoolean(key, value) {
    return this._write(key, value ? '1' : '0');
  }

  remove(key) {
    const fullKey = this._key(key);
    this._memory.delete(fullKey);
    if (!this._backend) return;
    try {
      this._backend.removeItem(fullKey);
    } catch {
      this.available = false;
    }
  }
}

/** Probes localStorage with a real write, since presence alone is not enough. */
function detectBackend() {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return null;
    const probe = '__lane_hopper_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}
