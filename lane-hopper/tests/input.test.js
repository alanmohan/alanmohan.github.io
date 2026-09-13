import { beforeEach, describe, expect, it } from 'vitest';
import { InputActions, InputSystem } from '../src/systems/InputSystem.js';
import { Directions } from '../src/systems/MovementSystem.js';

/**
 * The input system only reads `code`, `key`, `repeat` and calls
 * `preventDefault`, so a plain EventTarget plus lightweight synthetic events are
 * enough to test it without a DOM.
 */
function keyEvent(type, code, { repeat = false, key } = {}) {
  const event = new Event(type);
  let prevented = false;
  Object.defineProperties(event, {
    code: { value: code },
    key: { value: key ?? code },
    repeat: { value: repeat },
    preventDefault: { value: () => { prevented = true; } },
    wasPrevented: { get: () => prevented }
  });
  return event;
}

describe('InputSystem', () => {
  let target;
  let input;
  let intents;

  beforeEach(() => {
    target = new EventTarget();
    input = new InputSystem({ target, blurTarget: target });
    intents = [];
    input.onInput((intent) => intents.push(intent));
    input.attach();
  });

  /** Presses and releases a key, so the next press of it is accepted. */
  function tap(code, options) {
    target.dispatchEvent(keyEvent('keydown', code, options));
    target.dispatchEvent(keyEvent('keyup', code));
  }

  it('maps both arrow keys and WASD to all four directions', () => {
    const expected = [
      ['ArrowUp', Directions.FORWARD],
      ['KeyW', Directions.FORWARD],
      ['ArrowDown', Directions.BACKWARD],
      ['KeyS', Directions.BACKWARD],
      ['ArrowLeft', Directions.LEFT],
      ['KeyA', Directions.LEFT],
      ['ArrowRight', Directions.RIGHT],
      ['KeyD', Directions.RIGHT]
    ];

    for (const [code, direction] of expected) {
      intents.length = 0;
      tap(code);
      expect(intents, code).toHaveLength(1);
      expect(intents[0].type).toBe(InputActions.MOVE);
      expect(intents[0].direction, code).toBe(direction);
    }
  });

  it('covers every direction with each key family', () => {
    const arrowDirections = new Set();
    for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      intents.length = 0;
      tap(code);
      arrowDirections.add(intents[0].direction.name);
    }
    expect([...arrowDirections].sort()).toEqual(['backward', 'forward', 'left', 'right']);

    const wasdDirections = new Set();
    for (const code of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) {
      intents.length = 0;
      tap(code);
      wasdDirections.add(intents[0].direction.name);
    }
    expect([...wasdDirections].sort()).toEqual(['backward', 'forward', 'left', 'right']);
  });

  it('maps the action keys the controls legend advertises', () => {
    const expected = [
      ['Escape', InputActions.PAUSE],
      ['KeyP', InputActions.PAUSE],
      ['Enter', InputActions.CONFIRM],
      ['NumpadEnter', InputActions.CONFIRM],
      ['Space', InputActions.CONFIRM],
      ['KeyR', InputActions.RESTART],
      ['KeyM', InputActions.MUTE],
      ['KeyF', InputActions.SHIELD]
    ];

    for (const [code, action] of expected) {
      intents.length = 0;
      tap(code);
      expect(intents, code).toHaveLength(1);
      expect(intents[0].type, code).toBe(action);
    }
  });

  it('ignores browser auto-repeat, so holding a key cannot flood movement', () => {
    target.dispatchEvent(keyEvent('keydown', 'ArrowUp'));
    for (let i = 0; i < 30; i += 1) {
      target.dispatchEvent(keyEvent('keydown', 'ArrowUp', { repeat: true }));
    }
    expect(intents).toHaveLength(1);
  });

  it('requires a key release before the same key fires again', () => {
    // Some platforms send repeats without the repeat flag set.
    for (let i = 0; i < 10; i += 1) {
      target.dispatchEvent(keyEvent('keydown', 'ArrowUp'));
    }
    expect(intents).toHaveLength(1);

    target.dispatchEvent(keyEvent('keyup', 'ArrowUp'));
    target.dispatchEvent(keyEvent('keydown', 'ArrowUp'));
    expect(intents).toHaveLength(2);
  });

  it('accepts a different key while one is still held', () => {
    target.dispatchEvent(keyEvent('keydown', 'ArrowUp'));
    target.dispatchEvent(keyEvent('keydown', 'ArrowLeft'));
    expect(intents.map((i) => i.direction.name)).toEqual(['forward', 'left']);
  });

  it('handles rapid alternating input in order', () => {
    const sequence = ['ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight'];
    for (const code of sequence) tap(code);
    expect(intents.map((i) => i.direction.name)).toEqual(['left', 'right', 'left', 'right']);
  });

  it('prevents the default action for keys that would scroll the page', () => {
    for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']) {
      const event = keyEvent('keydown', code);
      target.dispatchEvent(event);
      expect(event.wasPrevented, code).toBe(true);
      target.dispatchEvent(keyEvent('keyup', code));
    }
  });

  it('leaves other keys alone', () => {
    const event = keyEvent('keydown', 'KeyM');
    target.dispatchEvent(event);
    expect(event.wasPrevented).toBe(false);
  });

  it('ignores keys that are not bound', () => {
    tap('KeyQ');
    tap('F5');
    tap('Digit1');
    expect(intents).toHaveLength(0);
  });

  it('falls back to event.key when code is unavailable', () => {
    const event = new Event('keydown');
    Object.defineProperties(event, {
      code: { value: '' },
      key: { value: ' ' },
      repeat: { value: false },
      preventDefault: { value: () => {} }
    });
    target.dispatchEvent(event);
    expect(intents).toHaveLength(1);
    expect(intents[0].type).toBe(InputActions.CONFIRM);
  });

  it('clears held keys when focus is lost, so a key is not stuck down', () => {
    target.dispatchEvent(keyEvent('keydown', 'ArrowUp'));
    expect(intents).toHaveLength(1);

    // Without a keyup, the key would otherwise stay latched.
    target.dispatchEvent(new Event('blur'));
    target.dispatchEvent(keyEvent('keydown', 'ArrowUp'));
    expect(intents).toHaveLength(2);
  });

  it('reset clears held keys explicitly', () => {
    target.dispatchEvent(keyEvent('keydown', 'KeyD'));
    input.reset();
    target.dispatchEvent(keyEvent('keydown', 'KeyD'));
    expect(intents).toHaveLength(2);
  });

  it('attaching twice does not double-report, so restarts cannot duplicate listeners', () => {
    input.attach();
    input.attach();
    tap('ArrowUp');
    expect(intents).toHaveLength(1);
  });

  it('stops reporting once detached', () => {
    input.detach();
    tap('ArrowUp');
    expect(intents).toHaveLength(0);

    // Re-attaching restores exactly one subscription.
    input.attach();
    tap('ArrowUp');
    expect(intents).toHaveLength(1);
  });

  it('detaching twice is safe', () => {
    input.detach();
    expect(() => input.detach()).not.toThrow();
  });

  it('does nothing before a listener is registered', () => {
    const bare = new InputSystem({ target: new EventTarget(), blurTarget: new EventTarget() });
    bare.attach();
    expect(() => bare.attach()).not.toThrow();
    bare.detach();
  });
});
