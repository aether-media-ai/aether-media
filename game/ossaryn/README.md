# The Kept Light: ARPG vertical slice (Chapter I: Ossaryn)
A static site with no build step. ES modules plus Three.js r187 vendored in `lib/`.

- **Run locally:** `cd /workspace/aether/game/arpg && python3 -m http.server 8766`, then open http://localhost:8766/. ES modules need http://, not file://.
- **QC:** `/workspace/pwvenv/bin/python qc/qc.py`. It plays the whole slice headlessly, writes screenshots to `qc/` and prints console errors, state and fps.
- **Docs:** `GDD.md` (design) and `ASSET_LIST.md` (what to generate and where it goes).

## Files
- `js/config.js`: all data. Camera, plate space, asset paths, levels (in plate pixels), enemies, spells, quests, dialogue, cutscene text, and `HERO_NAME` (placeholder).
- `js/engine.js`: renderer, fixed ortho 3/4 camera, plate↔ground mapping (`p2g`/`g2p`/`s2g`/`g2s`), plate and occluder quads, the procedural placeholder plate and greybox props.
- `js/meshes.js`: simple procedural 3D hero, NPC, enemies, lantern posts, loot beams and FX.
- `js/items.js`: item bases, affixes, rarity rolls, Echo Shards.
- `js/main.js`: game loop, input, combat, AI, quests, jump-well, cutscene player, HUD, inventory, and the F2 editor. `window.__arpg` is exposed for QC.
- `js/audio.js`: WebAudio synth SFX and ambience.
- `tools/prep_asset.py`: crops and resizes a generated image into place, then rebuilds the manifest.
- `tools/build_manifest.py`: lists the files in `assets/`. The game only requests listed files, so there are no 404s.

## Swapping in real art
1. Generate the images from `ASSET_LIST.md`.
2. Run `python3 tools/prep_asset.py <img> <path>`.
3. Reload the game.
4. Press **F2** in game. It shows the walk (turquoise), blockers (red) and occluders (yellow) over the plate. Alt+click to trace a new polygon, then paste the printed array into `LEVELS.<id>.walk` (or blockers) in `config.js`.
5. Occluders: add `{ poly: [[x,y],...], base: <plate y of the object's foot line> }` to `LEVELS.<id>.occluders` for railings or pillars that should cover the player.

## v0.3 — navigation & interaction fixes
- `js/nav.js`: A* pathfinding on a 16 px plate-space grid (walk polygons minus blockers). Click-to-move paths around obstacles; clicking unwalkable ground walks to the nearest reachable point. Unreachable objectives are pulled onto reachable floor at load (softlock guard).
- Lanterns: the whole post is a big screen-space click target (hover = pointer cursor, highlight, "Click: Relight lantern" prompt); click from any distance walks there and relights; F relights within 3.2 m. Unlit lanterns have a pulsing ground ring, a beacon and a label. Exits have rings + labels (sealed/open) and trigger by proximity or click.
- Keys: K = unstuck (snap to reachable floor, clear dialog). Shift+N = debug skip area.
- QC: `node tools/reach_check.mjs` (reachability from every spawn/arrival point; exit 1 on failure), `python3 tools/overlay_levels.py` (walk/blocker/reachable overlays → qc/nav/), `python qc/human_qc.py [URL] [OUTDIR]` (plays all three areas with real mouse clicks/keys only; reads `window.__arpgProbe()` to aim).
