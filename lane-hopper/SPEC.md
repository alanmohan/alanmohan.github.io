# Development Specification: Browser-Based Endless Road-Crossing Game

## 1. Project Brief

Build a polished, locally runnable JavaScript game inspired by the gameplay structure of *Crossy Road*. The player controls a voxel-style character crossing an endless sequence of roads, railways, rivers, and safe terrain while avoiding hazards.

The finished game must:

- Run entirely in a modern desktop browser.
- Require no backend, account, database, or internet connection.
- Start through a simple local development command.
- Use original or procedurally generated visuals, audio, names, and branding.
- Be playable with keyboard controls.
- Provide responsive movement, collision detection, scoring, procedural level generation, game-over handling, and restart.
- Maintain smooth performance near 60 FPS on a typical laptop.
- Be organized so another developer can add environments, obstacles, characters, and gameplay systems later.

Do not copy copyrighted game assets, music, sound effects, source code, logos, UI artwork, or character designs. Use a distinct project name and original presentation.

## 2. Recommended Technology

Use:

- JavaScript with ES modules
- Three.js for 3D rendering
- Vite for the local development server and production build
- HTML and CSS for menus and the HUD
- Vitest for unit tests
- Playwright for a minimal browser smoke test
- Web Audio API for simple synthesized sound effects

Avoid:

- A backend
- A physics engine
- React or another UI framework unless the existing project already uses one
- Remote assets or runtime CDN dependencies
- Mandatory textures
- Network requests during gameplay

Install dependencies through npm and keep all dependencies declared in `package.json`.

Required commands:

```bash
npm install
npm run dev
npm run build
npm run preview
npm test
```

Optional command:

```bash
npm run test:e2e
```

## 3. Target Browsers and Runtime

Support current desktop versions of:

- Chrome
- Edge
- Firefox
- Safari

Primary target:

- Desktop keyboard play
- Landscape viewport
- Minimum practical viewport: 800 × 600

The layout should resize when the browser window changes. The WebGL canvas must fill the available viewport without introducing page scrolling.

## 4. Product Scope

### 4.1 Required MVP

The minimum complete game includes:

- Title screen
- Start action
- Isometric or elevated perspective camera
- Grid-based player movement
- Endless forward generation
- Grass or safe lanes
- Roads with moving vehicles
- Rivers with moving logs or floating platforms
- Railway lanes with warning signals and trains
- Trees or rocks blocking selected safe tiles
- Collision detection
- Drowning and train/vehicle deaths
- Camera tracking
- Score and best score
- Game-over screen
- Restart
- Pause
- Sound mute control
- Local best-score persistence
- Basic automated tests
- A README with setup and control instructions

### 4.2 Optional Enhancements

Only add these after the MVP is stable:

- Multiple original characters
- Character selection
- Coins or collectibles
- Day/night palettes
- Mobile touch controls
- Difficulty presets
- Screen shake
- Particles
- Additional lane types
- Accessibility settings
- Gamepad support

Optional work must not delay or destabilize the MVP.

## 5. Core Gameplay

### 5.1 World Grid

Represent the world as a logical grid.

Recommended values:

- One tile equals one world unit.
- The player occupies one grid column and one lane at a time.
- The forward direction increases the lane index.
- Horizontal movement changes the column.
- The playable width is 13 columns, indexed from `-6` through `6`.
- Generate decorative scenery outside the playable columns.
- Keep the player centered on a tile after every completed movement.

Each lane must have:

```js
{
  id,
  index,
  type,
  seed,
  direction,
  speed,
  entities,
  blockers,
  metadata
}
```

The logical grid is authoritative. Three.js meshes visualize the game state but must not be the sole source of gameplay state.

### 5.2 Player Controls

Default controls:

| Action | Keys |
|---|---|
| Move forward | Arrow Up, W |
| Move backward | Arrow Down, S |
| Move left | Arrow Left, A |
| Move right | Arrow Right, D |
| Pause/resume | Escape, P |
| Restart after death | Enter, Space, R |
| Start game | Enter, Space |
| Mute/unmute | M |

Movement must be discrete and tile-based.

Rules:

- Each accepted movement advances exactly one tile.
- Movement uses a short animation instead of teleporting.
- Recommended movement duration: 100–150 ms.
- Ignore held-key browser repetition or buffer it deliberately.
- Permit at most two queued movement inputs.
- Reject movement into blocked tiles.
- Reject horizontal movement beyond the playable bounds.
- Backward movement is allowed unless it would enter a discarded lane.
- Prevent the arrow keys and spacebar from scrolling the page.
- Reset input state when the browser loses focus.

Touch controls are optional.

### 5.3 Movement Animation

A movement should include:

- Smooth interpolation from the starting tile to the destination tile
- A small vertical hop arc
- Optional rotation toward the movement direction
- Precise snapping to the destination at completion

Use a fixed logical start and target. Do not accumulate floating-point drift by repeatedly adding interpolated offsets.

Example easing:

```js
const eased = 1 - Math.pow(1 - t, 3);
const hop = Math.sin(Math.PI * t) * hopHeight;
```

Collision behavior during a hop must be clearly defined. Recommended approach:

- The player remains vulnerable throughout the animation.
- The player's collision volume follows the interpolated world position.
- The destination becomes the logical grid position only when the move completes.

### 5.4 Score

The score is the highest forward lane index reached during the current run, relative to the starting lane.

Requirements:

- Moving backward must not decrease the score.
- Moving sideways must not change the score.
- Display the score during play.
- Save the best score in `localStorage`.
- Gracefully continue if storage is unavailable.
- Update the best score immediately when a run ends or a new record is reached.

Suggested storage key:

```text
endless-crossing.bestScore.v1
```

## 6. Lane Types

### 6.1 Safe Grass Lane

Purpose:

- Provide breathing room.
- Establish the starting area.
- Contain static blockers.

Features:

- Green ground
- Trees, rocks, shrubs, or similar obstacles
- No moving hazards
- At least one traversable route through the lane

Rules:

- Never place a blocker on the player's initial tile.
- Avoid configurations that make forward progress impossible.
- Blockers occupy whole grid tiles.
- Collision with blockers prevents movement rather than killing the player.

### 6.2 Road Lane

Purpose:

- Introduce vehicles moving horizontally across the level.

Properties:

```js
{
  direction: -1 | 1,
  speed: number,
  vehicleType: "car" | "truck",
  spawnSpacing: number
}
```

Requirements:

- Vehicles travel continuously along the horizontal axis.
- Vehicles leaving one edge wrap to the opposite side or are recycled.
- Maintain enough spacing to avoid visually merged vehicles.
- Cars and trucks may have different lengths and speeds.
- Adjacent road lanes should not always share direction or speed.
- Collision between a live player and a vehicle causes immediate death.
- Collision testing must account for longer truck bodies.

Use box-based collision in world coordinates.

Suggested initial tuning:

- Car length: 1.4–1.8 tiles
- Truck length: 2.2–2.8 tiles
- Vehicle speed: 2.0–5.0 tiles per second
- Player collision footprint: approximately 0.55 × 0.55 tile

Tune values through centralized configuration rather than scattered constants.

### 6.3 River Lane

Purpose:

- Require the player to stand on moving platforms.

Features:

- Water covering the lane
- Logs, rafts, or other original floating platforms
- Horizontal platform movement
- Platform wrapping or recycling

Rules:

- Entering water without landing on a platform causes drowning.
- A player standing on a platform inherits its horizontal displacement.
- While riding, the player may still initiate movement.
- If carried beyond the playable horizontal boundary, the player dies.
- Platform support is evaluated continuously, including after platform wrapping.
- Platform length and spacing must leave viable crossings.

Avoid teleporting a supported player when a platform wraps. Before recycling a platform, determine whether it supports the player and handle that boundary case explicitly.

Suggested implementation:

1. Move platforms.
2. Detect whether the player is supported.
3. Apply the supporting platform's frame displacement to the player.
4. Re-evaluate support.
5. Apply drowning or boundary death if necessary.
6. Recycle off-screen platforms only after support handling.

### 6.4 Railway Lane

Purpose:

- Create a high-speed, telegraphed hazard.

Components:

- Track
- Warning signal
- Train
- Scheduled approach, warning, and pass phases

State model:

```text
IDLE → WARNING → PASSING → COOLDOWN → IDLE
```

Suggested timing:

- Idle: randomized 3–8 seconds
- Warning: 1.2–2 seconds
- Passing: based on train length and speed
- Cooldown: 1–3 seconds

Requirements:

- The warning must be visible before the train enters.
- Add a warning sound when audio is enabled.
- The train crosses much faster than ordinary vehicles.
- Contact causes immediate death.
- The train must be able to enter from either side.
- A train should not spawn directly over the player without completing its warning phase.

### 6.5 Starting Lanes

Generate several guaranteed-safe lanes around the starting location.

Recommended arrangement:

- Two safe lanes behind the player
- Starting safe lane
- Two safe lanes ahead
- First hazard no earlier than three moves forward

This gives the player time to understand the controls.

## 7. Procedural Generation

### 7.1 Deterministic Randomness

Use a seeded pseudorandom number generator.

Requirements:

- The run has a numeric or string seed.
- The same seed must generate the same lane sequence and entity configuration.
- Avoid using `Math.random()` inside generation code.
- A new run may generate a new seed by default.
- Development mode may accept a seed in the URL, such as:

```text
?seed=12345
```

Determinism should cover:

- Lane types
- Lane directions
- Speeds
- Blockers
- Vehicle/platform spacing
- Railway timing parameters
- Color variations

### 7.2 Generation Window

Do not build an infinite scene. Maintain a moving window around the player.

Recommended values:

- Keep 8–12 lanes behind the player.
- Keep 20–30 lanes ahead.
- Generate ahead as the player approaches the frontier.
- Dispose or pool lanes far behind the camera.
- Never discard the lane currently used by the player.
- Remove meshes, materials, event references, and entities when permanently discarding content.

Object pooling is recommended for vehicles, platforms, and common scenery but is not required for the first working build.

### 7.3 Lane Selection Rules

Use weighted lane selection with safety constraints.

Example baseline weights after the starting area:

| Lane type | Weight |
|---|---:|
| Safe grass | 30 |
| Road | 35 |
| River | 25 |
| Railway | 10 |

Add rules:

- Do not generate more than four road lanes consecutively.
- Do not generate more than three river lanes consecutively.
- Do not generate consecutive railway lanes in early gameplay.
- Insert a safe lane after long hazard sequences.
- Ensure every blocker layout has a viable passage.
- Avoid mechanically identical neighboring lanes.
- Increase difficulty gradually based on score.

### 7.4 Solvability

Generation must avoid obviously impossible states.

At minimum:

- Every safe lane must expose at least one open tile reachable from an open tile in the preceding lane.
- Rivers must have platform spacing and speeds that permit a crossing.
- Traffic gaps must periodically allow safe movement.
- Hazard generation cannot permanently cover the entire playable width.
- The starting region must always be navigable.

A full temporal pathfinding solver is not required for the MVP. Static reachability checks plus conservative speed and spacing limits are acceptable.

### 7.5 Difficulty Progression

Scale difficulty gradually using score bands.

Example:

| Score | Behavior |
|---:|---|
| 0–20 | Slow traffic, short hazard groups, long gaps |
| 21–50 | Moderate speeds, more mixed lanes |
| 51–100 | Faster entities, longer hazard groups |
| 101+ | Higher speed ceiling and tighter gaps |

Difficulty may affect:

- Hazard lane probability
- Vehicle speed
- Platform speed
- Safe gap size
- Train frequency
- Consecutive hazard count

Set firm upper and lower bounds so the game remains readable and technically stable.

## 8. Camera and Rendering

### 8.1 Visual Direction

Use a clean, colorful, low-poly or voxel-like style with original shapes.

Recommended presentation:

- Orthographic camera
- Elevated isometric angle
- Soft directional lighting
- Ambient or hemisphere light
- Simple shadows
- Flat colors
- Minimal or no textures
- Fog or background color to hide the generation boundary

The game should feel visually coherent without recreating proprietary artwork.

### 8.2 Camera Behavior

The camera follows forward progress.

Requirements:

- Smoothly track the player's highest forward position.
- Do not move backward every time the player takes one backward step.
- Keep the player below the vertical center of the screen so upcoming lanes remain visible.
- Camera movement must not alter collision calculations.
- Resize correctly with the viewport.
- Prevent abrupt jumps when the player restarts.

Recommended camera system:

- Track a `cameraProgress` value equal to the maximum smoothed forward position.
- Derive both the camera position and look-at target from that value.
- Use frame-rate-independent damping.

### 8.3 Renderer

Configure:

- Antialiasing
- Device-pixel-ratio cap, recommended maximum `2`
- Shadow-map quality appropriate for laptops
- Color-space configuration compatible with the chosen Three.js version
- Responsive resize handling

Do not allocate new geometry, materials, or large arrays every animation frame.

## 9. Art and Scene Construction

Create visuals from primitive geometry:

- Character: boxes or low-poly primitives
- Cars: body box, cabin box, wheels
- Trucks: cab, cargo body, wheels
- Trees: trunk and blocky foliage
- Logs: cylinders or elongated boxes
- Train: connected box-based cars
- Ground: lane-sized boxes or planes
- Water: flat colored plane with subtle animation
- Railway: rails and sleepers

Optimization rules:

- Reuse shared geometries and materials.
- Use `THREE.Group` for compound objects.
- Use instancing for repeated decoration if useful.
- Keep the visible triangle count modest.
- Avoid per-object shadow casting for tiny decorations.

## 10. Player Character

The default character must be original and visually distinct from recognizable commercial characters.

Required states:

- Idle
- Moving
- Riding a platform
- Dead
- Hidden or inactive before play

Possible design:

- Small block-bodied explorer, robot, animal, or abstract creature
- Simple directional facing
- Squash/stretch or hop animation
- Brief death animation appropriate to the cause

Keep death effects stylized and non-graphic.

## 11. Collision and Hazard Resolution

Use simple axis-aligned bounding boxes or interval overlap tests. A full physics engine is unnecessary.

### 11.1 Collision Categories

Support:

- Player vs. static blocker
- Player vs. vehicle
- Player vs. train
- Player vs. floating platform
- Player vs. playable bounds
- Player vs. water

### 11.2 Update Order

Use a consistent update order to prevent one-frame errors:

1. Read and queue input.
2. Advance player movement animation.
3. Update vehicles, platforms, and trains.
4. Apply platform carry movement.
5. Update world recycling or wrapping.
6. Recalculate collision volumes.
7. Resolve lethal collisions.
8. Resolve water support.
9. Update score and generation.
10. Update camera.
11. Render.

If the game enters a terminal state during an update, prevent additional deaths, score changes, and movement commands in the same frame.

### 11.3 Death Causes

Represent causes explicitly:

```js
"vehicle"
"train"
"water"
"out_of_bounds"
"left_behind"
```

This enables cause-specific effects and testing.

### 11.4 Camera Pressure

To preserve endless-runner tension, the player may die if they fall too far behind the camera.

Requirements:

- Use a clearly defined threshold.
- Do not apply it in the starting area.
- Pause must suspend camera pressure.
- Restart must reset it fully.

This feature can be omitted from the earliest MVP if it complicates testing, but it should be included before final polish.

## 12. Game State Machine

Use explicit game states:

```text
BOOT
MENU
PLAYING
PAUSED
DYING
GAME_OVER
```

Allowed transitions:

```text
BOOT → MENU
MENU → PLAYING
PLAYING → PAUSED
PAUSED → PLAYING
PLAYING → DYING
DYING → GAME_OVER
GAME_OVER → PLAYING
GAME_OVER → MENU
```

Requirements:

- Gameplay updates occur only in `PLAYING`.
- The final death animation may occur during `DYING`.
- Pause freezes movement, hazards, timers, and score.
- Restart resets every run-specific system.
- UI visibility is derived from the current state.
- Avoid independent booleans such as `isDead`, `isPaused`, and `isPlaying` that can contradict one another.

## 13. User Interface

Use HTML/CSS overlays above the canvas.

### 13.1 Title Screen

Display:

- Original game title
- Short instruction
- Start button
- Keyboard controls
- Mute state

### 13.2 HUD

Display during play:

- Current score
- Best score
- Pause button or pause hint
- Mute button

The HUD should not block the main route ahead.

### 13.3 Pause Overlay

Display:

- “Paused”
- Resume action
- Restart action
- Return-to-menu action

### 13.4 Game-Over Overlay

Display:

- Game-over message
- Final score
- Best score
- New-record indicator when applicable
- Restart button
- Return-to-menu button
- Keyboard restart hint

All buttons must work by mouse and keyboard.

## 14. Audio

Generate small original effects with the Web Audio API or include locally stored original/licensed sound files.

Suggested effects:

- Movement hop
- Blocked movement
- Vehicle impact
- Splash
- Train warning
- Train pass
- Score milestone
- Menu selection

Requirements:

- Audio begins only after user interaction.
- Provide mute/unmute.
- Persist mute preference in `localStorage`.
- Pause or suspend appropriate sounds when the game is paused.
- Audio failure must never prevent gameplay.
- Do not use copyrighted audio from the inspiration title.

Background music is optional.

## 15. Accessibility and Usability

Required:

- Keyboard-operable menu buttons
- Visible focus styling
- Adequate text contrast
- No important information communicated by color alone
- A mute control
- Clear control instructions
- Pause when the browser tab becomes hidden or the window loses focus
- Respect `prefers-reduced-motion`

Reduced-motion mode should:

- Lower camera smoothing movement
- Disable screen shake
- Reduce squash/stretch and decorative motion
- Keep essential gameplay movement visible

Optional:

- High-contrast palette
- Remappable controls
- Color-blind-friendly hazard indicators

## 16. Project Structure

Use a structure similar to:

```text
/
├── index.html
├── package.json
├── vite.config.js
├── README.md
├── public/
│   └── audio/
├── src/
│   ├── main.js
│   ├── styles.css
│   ├── config/
│   │   ├── gameplay.js
│   │   └── colors.js
│   ├── core/
│   │   ├── Game.js
│   │   ├── GameLoop.js
│   │   ├── GameState.js
│   │   └── SeededRandom.js
│   ├── world/
│   │   ├── World.js
│   │   ├── LaneFactory.js
│   │   ├── Lane.js
│   │   ├── generation.js
│   │   └── laneTypes/
│   │       ├── GrassLane.js
│   │       ├── RoadLane.js
│   │       ├── RiverLane.js
│   │       └── RailwayLane.js
│   ├── entities/
│   │   ├── Player.js
│   │   ├── Vehicle.js
│   │   ├── FloatingPlatform.js
│   │   └── Train.js
│   ├── rendering/
│   │   ├── Renderer.js
│   │   ├── CameraController.js
│   │   ├── Lighting.js
│   │   └── MeshFactory.js
│   ├── systems/
│   │   ├── InputSystem.js
│   │   ├── CollisionSystem.js
│   │   ├── ScoreSystem.js
│   │   ├── AudioSystem.js
│   │   └── StorageSystem.js
│   ├── ui/
│   │   └── UIController.js
│   └── utils/
│       ├── math.js
│       └── dispose.js
└── tests/
    ├── seededRandom.test.js
    ├── generation.test.js
    ├── movement.test.js
    ├── collision.test.js
    └── gameState.test.js
```

This is a guideline, not a requirement. Keep modules cohesive and avoid a single oversized game file.

## 17. Architecture Requirements

### 17.1 Separation of Concerns

Maintain clear separation between:

- Logical game state
- Rendering
- Input
- Collision
- Generation
- UI
- Audio
- Persistence

The renderer should read state and update meshes. UI code should not directly control world entities.

### 17.2 Configuration

Place tunable values in centralized configuration:

```js
export const GAMEPLAY = {
  tileSize: 1,
  playableHalfWidth: 6,
  moveDuration: 0.13,
  hopHeight: 0.35,
  lanesAhead: 24,
  lanesBehind: 10,
  maxInputQueue: 2,
  maxPixelRatio: 2
};
```

Avoid unexplained numeric constants in gameplay modules.

### 17.3 Time Handling

Use seconds consistently.

The main loop should:

- Read `requestAnimationFrame` timestamps.
- Calculate delta time.
- Clamp unusually large delta values.
- Update gameplay with frame-rate-independent movement.
- Render once per frame.

Recommended maximum delta:

```js
Math.min(rawDelta, 0.05)
```

For stronger determinism, use a fixed simulation step with an accumulator. This is preferred but not mandatory if variable-step behavior remains stable.

## 18. Performance Targets

Target:

- Approximately 60 FPS on a typical modern laptop
- No steady increase in memory usage during a long run
- Initial load under a few seconds from local storage
- No large frame hitch when generating new lanes

Performance requirements:

- Cap pixel ratio.
- Reuse common geometry and materials.
- Remove or pool discarded entities.
- Avoid allocations in hot loops.
- Do not recreate the renderer or canvas during restart.
- Generate new lanes incrementally.
- Keep DOM updates limited to changed values.
- Dispose GPU resources only when they are no longer shared.

Add an optional development-only debug panel showing:

- FPS
- Current seed
- Player lane and column
- Active lane count
- Active entity count
- Current game state

The debug panel must be disabled by default in production.

## 19. Testing Requirements

### 19.1 Unit Tests

Write tests for:

- Seeded RNG produces repeatable sequences.
- The same seed generates the same lanes.
- Different seeds usually generate different lanes.
- The starting region contains no lethal lane.
- Lane generation respects maximum consecutive-type limits.
- Grass blocker layouts preserve a route.
- Player movement changes the correct grid coordinate.
- Blocked movement does not change player position.
- Score only increases on a new forward record.
- Vehicle overlap causes death.
- Non-overlapping vehicle positions are safe.
- Water without support causes death.
- A platform supports and carries the player.
- Train collision is active only during the relevant pass.
- Pause prevents world advancement.
- Restart clears transient state.
- State-machine transitions reject invalid transitions.
- Best-score persistence handles missing or malformed data.

Tests should exercise logical state without requiring WebGL whenever possible.

### 19.2 Browser Smoke Test

Create at least one browser-level test that:

1. Opens the game.
2. Confirms the title screen is visible.
3. Starts a run.
4. Confirms the HUD appears.
5. Sends a movement key.
6. Confirms the score or player state changes.
7. Pauses and resumes.
8. Triggers or invokes a controlled game-over condition.
9. Restarts successfully.

Expose controlled testing hooks only in development/test builds if necessary.

### 19.3 Manual Test Checklist

Verify:

- All control keys work.
- Key holding does not create uncontrolled movement.
- Rapid alternating inputs do not corrupt position.
- The player cannot enter trees or rocks.
- Vehicle collisions are visually fair.
- The player does not drown while clearly standing on a platform.
- Platform wrapping does not teleport the player.
- Train warnings always precede trains.
- Pause freezes all hazards.
- Tab switching pauses the game.
- Restart works after every death type.
- Repeated restarts do not duplicate listeners.
- Best score persists after refresh.
- Muting persists after refresh.
- Resizing keeps the game playable.
- A 10-minute run does not show increasing slowdown.
- The production build works through the preview command.
- The browser console contains no uncaught errors.

## 20. Error Handling

Handle these cases without crashing:

- WebGL initialization fails.
- `localStorage` is disabled.
- Audio context creation fails.
- Audio is blocked until interaction.
- Browser window is resized to a very small size.
- The tab becomes hidden.
- A large animation-frame time gap occurs.
- URL seed input is malformed.

For a WebGL failure, display a readable HTML message explaining that the browser or device could not start the game.

## 21. Development Phases

### Phase 1: Foundation

Deliver:

- Vite project
- Three.js scene
- Camera, lighting, resize handling
- Game loop
- Primitive player and ground
- Basic HTML overlay

Exit condition: a player object renders correctly and the production build succeeds.

### Phase 2: Grid Movement

Deliver:

- Input system
- Tile-based movement
- Hop animation
- Bounds
- Blocked tiles
- Camera following

Exit condition: the character moves reliably on a static test grid.

### Phase 3: Roads

Deliver:

- Road lanes
- Cars and trucks
- Horizontal movement
- Wrapping
- Vehicle collisions
- Vehicle death and restart

Exit condition: a complete playable road-crossing loop works.

### Phase 4: Procedural World

Deliver:

- Seeded RNG
- Lane factory
- Generation window
- Lane disposal
- Safe starting lanes
- Score

Exit condition: the player can advance through an endless deterministic lane sequence.

### Phase 5: Rivers and Railways

Deliver:

- Water
- Moving platforms
- Carry behavior
- Drowning
- Tracks
- Train state machine
- Warning signals and sounds

Exit condition: all required lane types operate correctly.

### Phase 6: Product UI

Deliver:

- Title screen
- Pause overlay
- Game-over overlay
- Best score
- Mute
- Local persistence
- Focus and tab-visibility handling

Exit condition: the full run lifecycle is usable without developer controls.

### Phase 7: Testing and Polish

Deliver:

- Automated tests
- Performance cleanup
- Accessibility pass
- Original sound effects
- Visual polish
- README
- Final production build verification

Exit condition: all acceptance criteria pass.

## 22. Acceptance Criteria

The project is complete only when all of the following are true:

1. `npm install` completes from a clean checkout.
2. `npm run dev` starts the game locally.
3. `npm run build` succeeds without errors.
4. `npm test` passes.
5. The browser console has no uncaught errors during normal play.
6. The player can move in four directions using both arrow keys and WASD.
7. Player movement remains aligned with the grid.
8. Trees and other static blockers prevent entry.
9. Vehicles move, wrap correctly, and kill on contact.
10. Floating platforms move and carry the player.
11. Unsupported players drown in water.
12. Trains provide a visible warning before crossing.
13. Train collisions kill the player.
14. Terrain generates ahead as the player progresses.
15. Old terrain is removed or recycled.
16. The same seed reproduces the same world.
17. The score records the furthest forward progress.
18. The best score persists after refresh.
19. Pause freezes gameplay.
20. Game over prevents additional movement and scoring.
21. Restart begins a clean run without reloading the page.
22. The canvas and UI adapt to window resizing.
23. The game remains responsive during an extended run.
24. All assets and branding are original or appropriately licensed.
25. README instructions are sufficient for a new developer to run the project.

## 23. README Requirements

The README must contain:

- Game overview
- Screenshot or GIF if available
- Technology used
- Prerequisites
- Installation instructions
- Development command
- Production build command
- Preview command
- Test commands
- Controls
- Seeded-run instructions
- Project structure summary
- Known limitations
- Attribution and asset licenses
- Statement that the project is independently created and is not affiliated with the publisher of the inspiration title

## 24. Instructions for the Implementing Agent

The implementing agent should work autonomously and proceed phase by phase.

For each phase:

1. Inspect the existing repository before changing files.
2. Preserve unrelated existing work.
3. Implement the smallest coherent version of the phase.
4. Run relevant tests and the production build.
5. Launch the game and visually inspect it.
6. Fix functional and visual defects before continuing.
7. Keep tunable values centralized.
8. Do not add optional features until the required mechanics are stable.
9. Update the README when commands, controls, or architecture change.
10. End with a clean build, passing tests, and no known critical gameplay defects.

When a design choice is unspecified, prefer:

- Simple over clever
- Deterministic over random global state
- Reusable primitive geometry over external assets
- Explicit state machines over loosely related flags
- Logical collision state over mesh-dependent collision
- Central configuration over magic numbers
- Smooth, readable gameplay over maximal difficulty

The agent may adjust recommended numeric values during playtesting, but it must retain the specified behavior and acceptance criteria.

## 25. Final Delivery Checklist

Before declaring completion, the implementing agent must report:

- What was built
- How to start it
- How to run tests
- Where the primary game configuration is located
- Which optional features, if any, were included
- Any known limitations
- The final build and test results
- Confirmation that the game was visually inspected in a browser
- Confirmation that no proprietary assets from *Crossy Road* were used