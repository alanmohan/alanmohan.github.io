/**
 * Original flat colour palette. Values are plain hex integers so Three.js can
 * consume them directly and unit tests can read them without a renderer.
 *
 * Arrays hold deterministic variation choices - the seeded RNG indexes into
 * them, never Math.random().
 */

export const COLORS = Object.freeze({
  sky: 0x9fd8ef,
  fog: 0xb4e2f2,

  grass: Object.freeze([0x79c257, 0x71bb50, 0x82ca62, 0x6db44c]),
  grassEdge: 0x5da344,
  soil: 0x8a6a48,

  road: 0x4a4d57,
  roadEdge: 0x3d4048,
  roadDash: 0xdfe0d2,

  water: 0x3d8fd6,
  waterDeep: 0x2e72b4,

  trunk: 0x7b5330,
  foliage: Object.freeze([0x2f8f4a, 0x35a054, 0x277f3d, 0x3aa95c]),
  rock: Object.freeze([0x9aa0a6, 0x8a9096, 0xa8aeb4]),

  logBark: Object.freeze([0x8a5a34, 0x7a4f2d, 0x96653c]),
  logRing: 0xc79a6b,

  carBodies: Object.freeze([
    0xef5d5d, 0x3fa9f5, 0xf5c542, 0x9b6bd6, 0xf58a42, 0x4bd6a0, 0xe85fa0, 0x6dd15f
  ]),
  carCabin: 0xbfe6f5,
  truckCab: Object.freeze([0xe8eaed, 0xf4d35e, 0x7fb2f0]),
  truckCargo: Object.freeze([0xd94f4f, 0x4d6fa8, 0x8a8f96, 0x3f9e6d]),
  wheel: 0x2b2b31,
  headlight: 0xfff3c4,
  taillight: 0xff5a4a,

  ballast: 0x82806f,
  sleeper: 0x6b5233,
  rail: 0x9aa0a8,
  signalPost: 0x4c5058,
  signalLampOff: 0x54282a,
  signalLampOn: 0xff3b30,
  signalStripe: 0xf7f3e8,

  /** Shield power-up: the collectible token and the aura worn while active. */
  shield: Object.freeze({
    plate: 0x4bb6e8,
    rim: 0xf7f3e8,
    emblem: 0xf5c542,
    aura: 0xbdf0ff
  }),

  trainBody: 0xd3d7dd,
  trainAccent: 0x2f3b52,
  trainNose: 0xf5c542,
  trainWindow: 0x9fd0e8,

  player: Object.freeze({
    body: 0xf7f3e8,
    belly: 0xffffff,
    accent: 0xf2803c,
    eye: 0x22262e,
    pack: 0x4a7fd6,
    foot: 0xf0a44f
  })
});
