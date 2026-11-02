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
