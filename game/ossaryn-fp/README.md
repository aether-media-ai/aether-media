# The Kept Light: first-person concept (Chapter I: Ossaryn)
A separate, short (about 5–8 min) playable vertical slice that tests **first person** as an alternative to the isometric ARPG (`../arpg`, live at `game/ossaryn/`, untouched).
The Aether Realms is openly AI-generated: textures, sprites, the vista, title art and cutscenes are generated. The code is hand-written Three.js.

- **Live:** https://aether-media-ai.github.io/aether-media/game/ossaryn-fp/
- **Run locally:** `cd /workspace/aether/game/fp && python3 -m http.server 18765`, then open http://127.0.0.1:18765/. It needs http:// because it uses ES modules. There is no build step; Three.js r187 is vendored in `lib/`.
- **Human QC:** `QC_W=960 QC_H=540 /workspace/pwvenv/bin/python qc/human_qc.py [URL]`. It plays the whole slice with real keyboard and mouse input only. Its only page access is the read-only `window.__fpProbe()` and `window.__fpRay()`. It writes `qc/shots/*.jpg` and `qc/qc_result.json`.
- **Look-dev stills:** `/workspace/pwvenv/bin/python qc/lookdev.py URL OUTDIR [poses] [tag]`. This uses the dev-only `?pose=x,z,yawDeg,pitchDeg&lit=n&open=1&enemy=x,z[,hulk]` hook, which skips the title. It is not part of play or QC.

## Controls
| Input | Action |
|---|---|
| WASD + mouse (pointer lock) | move and look. Arrow keys also turn. |
| Shift / Space | sprint / jump |
| E | interact (relight lantern, take item, take shard, leap into the well) |
| LMB | staff strike (about 2.9 m reach, short cone) |
| RMB or Q | Lantern Flare: 20 oil. Burns and knocks back the Drowned in front of you (and anything within 3.5 m). |
| 1 / 2 | Rust Draught (heal +45) / Lamp Oil (+60 oil) |
| K | unstick: back to the last checkpoint |
| Shift+N | debug skip: next lantern, then shard, then open the well, then stand at the well |
| O / F3 / Esc | quality toggle (High/Low) / fps counter / pause |

## Design
- **Route.** You start at the closed gate on the seventh terrace, a 9 m wide walkway carved into the west cliff of the sinkhole with the void on your right.
  1. L1: relight it, and two Drowned climb over the parapet.
  2. Pickups on a crate.
  3. L2: relight it, and three Drowned attack.
  4. Plaza and a pickup.
  5. The 59 m arched bridge. L3 is on its crest, and three Drowned attack on the bridge.
  6. The east tower landing.
  7. The Echo Shard is in a niche. Taking it raises a hulk out of the sealed Well of Descent, plus two more Drowned.
  8. Killing them opens the well's iris. You walk or press E to jump in: the fall, then a white-out, then cs03 *The Fall*, then the end card "Chapter II: The Forgotten Depths".
  - The intro is cs01, with Skip/Esc, then a 3-line story card.
- **Light is the resource.**
  - The lantern is a real point light that moves with you. Its reach and brightness scale with oil, and the screen darkens as oil runs out.
  - Oil drains slowly, and refills (along with a little health) while you stand by a lit lantern.
  - Lit lanterns burn Drowned that come within 5.5 m, so fights pull you back to the light.
  - The Flare spends oil for burst damage and crowd control.
  - Relighting a lantern is free and sets a checkpoint, so a no-oil softlock is impossible.
- **Drowned.**
  - They are camera-facing billboards from a keyed generated sprite. They use MeshStandardMaterial, so your lantern and the world lights light them.
  - They have an emissive face mask, a hit flash, a burn tint and knockback.
  - Their states are climb, chase, windup and strike. They path through region portals, so they follow you onto the bridge.
- **World.**
  - Real near geometry: basalt walls with pilasters, arched recesses with amber glass, slot windows, ribbed bronze organ-pipe clusters, parapets, corbels, the extruded arch bridge with railings and hanging lamps, and the east tower.
  - Textures are generated, made tileable, and given normal and roughness maps.
  - The mid-ground is about 12 tiered, ribbed gothic spire-towers with sparse amber windows, plus three distant bridges.
  - Behind that is the generated city vista on an inner cylinder, which fades into a hazy sky dome with a bright opening above.
  - Atmosphere: exponential fog, 4 drifting mist sheets in the void, 14 soft-edged mist curtains, 9 god-ray planes, mist motes and lantern dust.
  - Baked vertex tint: teal-green moss on up-facing ledges, colder and darker with depth.
- **Post.** ACES, then UnrealBloom (High quality only), then a grade pass. The grade does teal-shadow/amber-highlight split toning, vignette, grain, and hurt, flash, low-oil and white-out overlays.
- **Collision.**
  - The walkable union of rectangles is pre-shrunk by the player radius.
  - Every visible thing that reaches into the walkway at body height (pilasters, frames, parapet posts, gate pillars, crates, lantern posts, the sealed well, the altar) is also a collision box or circle.
  - Movement slides along edges. Bridge height follows the arch.

## QC (latest run)
See `qc/qc_result.json`. The run covers title, cs01 skip, card, play, every objective, the cs03 skip and the end card. It also covers:
- invisible-wall probes (walk into a wall, parapet or rail, then raycast for visible geometry),
- the K checkpoint return,
- prompt checks at about 1.6–2.1 m while aiming at each interactable,
- a second session that walks the Shift+N debug path.

## Known weaknesses (honest)
- **Performance is unverified on a real GPU.** The box only has a software renderer (SwiftShader). There the game runs about 7 fps at 960×540 Low and about 1–4 fps at 720p High. The design targets 60 fps on a normal GPU:
  - about 10 point lights,
  - materials merged into about 10 draw calls for the world,
  - half-float composer, MSAA only on High.
  
  But this has to be checked on a real machine. Low quality (O) drops bloom, MSAA, particles and pixel ratio.
- **Drowned are flat billboards.** At close range, or from the side, they read as cards. They also have no attack animation, only a lunge, tint and flash. This is the biggest gap against the video look.
- **The viewmodel is a 2D overlay** (staff and lantern image). It bobs, swings and thrusts, but it does not shade with the world (only a brightness sync to the flame).
- **Stone texture repetition** is visible on large flat walls, and the geometry is still boxy close up. kf01's moss, hanging vegetation, waterfalls and sculpted organic rock are only hinted at, by baked moss tint and mist.
- **The vista is a single 16:9 image mirrored around a cylinder**, so a careful 360° look reveals mirroring.
- **The slice is short and linear** (about 2 min for the QC bot, about 5–8 min for a human). There are no loot, skills or inventory, which the ARPG has.
- Audio is synth placeholder SFX and ambience.

## First person vs the isometric ARPG
**Better in FP**
- Scale and vertigo. The sinkhole, the bridge over the void and the towers are felt, not just seen. This is the closest the game gets to the cinematic look of the videos.
- The lantern-as-light mechanic is much stronger when the light is literally your view.
- Environment art carries the experience, and characters can stay simple.
- Cutscenes match the camera language better.

**Worse in FP**
- Enemies and characters are the weak point at close range. FP needs real animated 3D creatures; the ARPG gets away with small figures.
- More 3D modelling is needed per metre of level, because everything is seen up close.
- Combat depth (builds, loot, spells) is harder to communicate than in the ARPG.
- Motion sickness for some players.
- Higher GPU demands.

**Effort estimate** (from this slice):
- Production-quality FP chapter (30–45 min): roughly 8–12 weeks for one dev plus generated art. Most of it goes to:
  - rigged and animated enemies (or a 2.5D sprite-sheet animation set per enemy, 8 directions × 4 actions),
  - kit-bashed modular architecture to replace boxes,
  - level layout and encounter tuning,
  - audio.
- Polishing this slice to a "feels like a real indie game" bar: 2–3 weeks. That covers animated enemy sprites, a 3D viewmodel, a second vista, a sound pass and real-GPU profiling.
- For comparison, the ARPG path is cheaper per area, because generated plates do most of the work. It looks less like the videos, though.
