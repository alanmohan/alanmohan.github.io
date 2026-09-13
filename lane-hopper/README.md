# Lane Hopper

## About this game

Lane Hopper is an endless road-crossing game where you guide
**Pip**, forward across busy roads, drifting
rivers and fast railways. Every lane you clear adds a point, and a single mistake ends the game. the obstacles are randomly generated, so each run is different and gets progressively more difficult.
While the gameplay is similar to Crossy Road, this game has much simpler graphics and audio cues. 

Another feature I added is the shield power-up.Once you are past 15 points, shield tokens start appearing on the grass lanes ahead. Each one you
pick up gives you a charge, you can hold two at most. When activated (by pressing `F`), it protects you from traffic and trains for four seconds. However, it doesn't protect from drowning in water or leaving the playable area,and there is a twelve second wait cooldown before you can activate another, so it is
worth saving for a crossing you would otherwise not risk.

## How to play

Use the arrow keys or `W`, `A`, `S`, and `D` to move Pip one space at a time. You can also use arrow keys.  Move forward across roads, rivers, and railways to increase your score; being hit by traffic or a train, falling into water, leaving the playable area, or falling too far behind ends the run. Press `Enter` or `Space` to start or restart, `Esc` or `P` to pause, and `M` to mute sound.

Press `F` to raise a shield, if you are holding a charge and the shield is not still recharging.
The HUD shows how many charges you have, how long a raised shield has left, and how much of the
recharge is still to run. Charges do not carry over: they are cleared when a run ends.

## AI tools and development strategy

- **ChatGPT — GPT-5.6 Sol (medium):** used to produce the detailed implementation specification in `SPEC.md`.
- **Kiro — Claude Opus 5 (Max effort):** used to read that specification, plan, and implement the game.

The development approach was to start from a detailed specification, have Kiro implement the game against it, then use focused follow-up prompts to address sound and convert the project to plain HTML, CSS, and JavaScript suitable for GitHub Pages. The complete record of the important prompts is in [prompt_log.md](prompt_log.md).

Note: Kiro initially implemented the game in react. I wasn't initially familar with the constraint of building it only using html/css/JS. I later asked Kiro to remove the react dependency and convert it to a static HTML/CSS/JS project. The prompt log reflects this step.

## Known issues or unfinished work

No known gameplay issues at the time this folder was prepared. The included automated test suite passes locally; the game is a static HTML/CSS/JavaScript project with locally vendored Three.js and no build step.

