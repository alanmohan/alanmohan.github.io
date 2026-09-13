# Lane Hopper — Prompt Log
## Prompt 1

**Tool/model:** ChatGPT with GPT-5.6 Sol (medium)

```text
I want to re-create crossy road in JS that can run locally on a browser. Give me a detailed spec for the development of this app that an agent can use to build the game on its own
```

Output Contents SPEC.md file

## Prompt 2

**Tool/model:** Kiro with Claude Opus (Max effort)

```text
@SPEC.md I have a detailed spec for the implementation of the crossy road game. Read the spec document carefully, understand all the requirements, plan and develop the game as detailed in the spec doc.
```

## Prompt 3

**Tool/model:** Kiro with Claude Opus (Max effort)


```text
the sound is not working, check and fix
```

## Prompt 4

**Tool/model:** Kiro with Claude Opus (Max effort)


```text
I want this app to now work with plain html/css/js without any build or server requirements, so that it can run in github pages. would it be possible to migrate the app so that it can run this way?
```

## Prompt 5

**Tool/model:** Kiro with Claude Opus (Max effort)


```text
Add a shield power-up to Lane Hopper without changing the existing core gameplay or build setup. Lane Hopper is a static HTML/CSS/JavaScript Three.js game in which the player moves a character forward across alternating grass, road, and water lanes while avoiding vehicles, trains, and other hazards. The score increases as the player advances, the camera follows the player, and the existing game loop, collision handling, procedural lane generation, HUD, title screen, audio system, and primitive Three.js rendering should remain the primary architecture. To understand the current implementation, start with the HTML entry point and identify the main JavaScript game module, then trace initialization into the update/render loop, player movement, lane generation, collision and death handling, score progression, HUD updates, input bindings, and audio playback. Review the existing tests and README before making changes so the shield follows current naming, module, and test conventions.

Spawn a collectible shield token only on reachable grass lanes, starting after score 15. Allow at most one uncollected token in the world at once, with at least 12 lanes between spawns.
Collecting a token gives one shield charge, up to a maximum of 2 charges.
Press F to activate a charge. An active shield lasts 4 seconds and then has a 12-second cooldown before another charge can be activated.
While active, the shield prevents death from vehicles and trains only. It must not prevent death from water, leaving the playable area, or falling too far behind.
Add a clear HUD indicator showing charges, active-shield time remaining, and cooldown. Add F to the controls on the title screen.
Use the existing architecture, primitive Three.js style, audio system, and static HTML/CSS/JS setup. Do not add dependencies or a build step.
Add focused unit tests for spawning, charge limits, activation, cooldown, and protected versus unprotected death causes. Update the README controls and feature description afterward.
Preserve the existing game rules, progression, controls, visual style, audio behavior, and build workflow except where changes are required to support the shield. Ensure the shield cannot be farmed indefinitely, cannot stack beyond two charges, cannot be activated during cooldown or without a charge, and is removed or reset consistently when the player dies or a run ends according to the existing lifecycle conventions.
```