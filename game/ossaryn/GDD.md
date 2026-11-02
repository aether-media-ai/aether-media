# The Kept Light: Game Design Document (v0.1, 2026-11-02)
*The Aether Realms: single-player action RPG for the browser. Working title. Game text is in English.*

## 1. Pitch
The world is dimming. In Ossaryn, the city carved into the walls of a 6 km sinkhole, the lanterns burn lower every night. Then the Warden Ring wakes white-gold on the Undermere, and pale things made of stone and seam climb out of the Forgotten Depths toward the last warm light.

You are a **lantern-bearer** of the seventh terrace. Your lantern is your weapon, your mana and your sight. Fight through the falling city, then **jump down the glowing wells** that the ancient builders bored through the world. Each well drops you into another realm. Every realm holds a shard of light the builders "kept". In the end you learn they did not keep it. They took it, and you decide whether to give it back.

**What makes it its own game, not a Diablo clone:**
- **Light is the core resource.** Your Light pool is your mana and also how far you can see (the screen darkens as Light drains). Lanterns in the world are checkpoints, objectives and buffs.
- **Jump-down wells instead of portals.** You don't step through gates. You leap into shafts, and the fall is a short cinematic. Ossaryn is a sinkhole, so the whole game goes *down* and *through*.
- **Echo Shards.** These are notes of stolen light that you socket into your lantern (from storyline B). Their order and combination change your spells and open the next well.
- **Painted, cinematic worlds.** Every area is a full AI-painted plate in the same style as the Aether Realms videos, and every story beat is a real video cutscene.

## 2. Protagonist: Nerith
**Nerith** (name chosen by Mads; `HERO_NAME = 'Nerith'` in `js/config.js`) is a veteran lantern-bearer of Ossaryn. She's rugged, scarred and stubborn, a terrace warden rather than a citizen.

**Look** (the reference is `assets/ui/portrait_bearer.jpg`; the 3D model matches it):
- a faded rust and ochre hooded robe over a darker under-robe
- a leather cross-strap and belt
- a bronze gorget, bronze bracers and one bronze pauldron
- a long bronze-banded **hook-staff** with an amber lantern hanging from the hook on a short chain

The lantern is her light source, her mana (Light) and her weapon focus. An alternative softer portrait is kept as `assets/ui/portrait_bearer_alt.jpg`.

**Class:** a single fixed class, the Lantern-Bearer, for now. Other bearers (playable variants with different lantern types) may come later. Nothing in the code assumes a class choice; gear and Echo Shards provide build variety.

## 3. Story outline: The Kept Light (storyline A + echo mechanic from B)
**Core truth (revealed late):** the ancient builders built the Glass Reef, the Warden Ring, the Forgotten Depths and the Halcyr salt cathedral as one machine that **drew light out of the world and stored it**. The world isn't dimming by accident. It's being emptied. The stored light is now leaking, and the Depths' guardians are waking to hunt any loose light, including your lantern.

| Ch. | World | Beat | Boss | Exit (jump-well) |
|---|---|---|---|---|
| I | **Ossaryn**, the City in the Hollow | The Ring wakes. Depths-creatures invade the terraces. Relight the terrace, close the seam rifts and defeat the Unsealed at the Well of Descent. You take the **first Echo Shard**. | The Unsealed | Well of Descent, white-gold shaft on the Undermere rim |
| II | **The Forgotten Depths** (the builders' archive) | Kilometres of stepped pale blocks and seam gates. Archive "recordings" (echoes) show the builders harvesting summers. You learn the shards are stolen light. | The Archivist (a seam-gate colossus) | A seam chasm that opens into freezing water |
| III | **The Glass Reef of Ithmere** | Polar night, aurora, a coral-shaped ice arch that holds "light from a summer no one living remembers". The **Thessal** (plated rower) arrives, following the light. It's not hostile; it's the last keeper (from B). | The Rimewarden (frozen reef guardian) | A dive through a glowing hole in the ice |
| IV | **Kesh Locks / Vael Shallows** (interlude) | The night ferry through the basalt locks, then the Bloom Tide. A breather chapter with an NPC ferry escort. It's optional or short. | Lockbreaker | Whirlpool in the Shallows |
| V | **Halcyr Flats**: the salt cathedral | The cathedral is the vault. At dawn it "catches fire without burning". All shards resonate. | The Kept Light itself | **Final choice:** give the light back (the world brightens, your lantern goes out, ending A) or keep it (Ossaryn is saved, the rest of the world stays dim, ending B). |

The Veyl Canopy, the Sunken Spires of Nethmar and the Cinder Steppe are reserved as side realms or DLC wells.

## 4. Chapter I: Ossaryn (vertical slice, playable skeleton)
**Opening cutscene (CS01 + CS01b):** the Warden Ring's plates turn, its seams light cold white-gold and the Undermere ripples. Then the lanterns of the lower terraces go out one by one, and a seam cracks open in the cliff, spilling fine sand and a narrow blade of cold light. Elder Teyth: *"Nerith: keep the terrace lit."*

### Areas (one AI-painted plate each, 16:9, fixed 3/4 camera)
1. **A1 Lantern Terrace** (the seventh terrace, start): a long cantilevered basalt terrace with a bronze railing over the Hollow and tower facades with ribbed bronze fins.
   - Quest **Q1 Keep the Terrace Lit**: relight 3 lantern posts. Relighting the second one triggers an ambush.
   - NPC: Elder Teyth (hooded, ochre robe, lantern pole).
   - Exit: stairs at the upper right. They're locked until Q1 is done.
2. **A2 The Banner Steps** (market quarter): a plaza with orange-rust banners and a turquoise moss channel set flush into the paving.
   - Quest **Q2**: close 2 **Seam Rifts**, spawner cracks that keep birthing Dustlings.
   - Exit: an arcade at the upper right, toward the Undermere rim.
3. **A3 The Well of Descent** (rim of the Undermere): a round plaza with the Warden Ring glowing far below and a bronze-rimmed shaft of white-gold light in the middle.
   - Mini-boss **The Unsealed** (Q3). Killing it drops the Echo Shard "The First Note".
   - Q4: **jump into the well**. A short leap animation, then a white-gold fade, cutscene CS03 *The Fall*, and the card "Chapter II: The Forgotten Depths".

### Enemies from the Forgotten Depths (bible: pale grey stepped blocks, hairline gold seams, cold white light, fine sand, no rocks)
| Enemy | Look | Behaviour | Slice status |
|---|---|---|---|
| **Dustling** | Dog-sized cluster of 3 stepped pale-grey blocks on four stone legs. A hairline gold seam runs round its middle and a thin cold-white slit glows at the front. Fine sand trickles from its joints. | Fast swarmer with a weak melee bite. Comes in packs of 3–5 and spawns from rifts. | Implemented |
| **Pale Wick** | A floating cold-white core the size of a head, orbited by 6 pale stone shards (octahedral flakes). No face. | Ranged kiter: it keeps about 5.5 m away and fires cold-white needles. It's "drawn to light" (later: drains Light on hit). | Implemented |
| **Stepwalker** | 2.5 m tall stack of 3 receding stepped blocks with slab arms and a single glowing slit. Gold seams between the tiers. | Slow tank. Its slam has a 0.9 s telegraph ring on the ground and a 2.4 m area. | Implemented |
| **Seam Rift** | A jagged crack in the paving leaking cold-white light and sand, ringed by heaved-up blocks. | Stationary spawner (max 4 Dustlings alive). Destroying it is the objective. | Implemented |
| **The Unsealed** *(mini-boss)* | A 5 m Stepwalker built to *keep a gate shut*. Its chest is a vertical **seam gate** whose two plates part to fire a narrow cold-white blade. | Ground slam with a ring telegraph. **Seam Blade**: a 1.2 s line telegraph, then a narrow beam about 14 m long. At 66% and 33% HP it summons Dustlings. | Implemented |

### Jump-well (portal design)
- A circular shaft cut into the floor and rimmed with bronze, with white-gold light rising from far below (ancient tech, so white-gold).
- It stays sealed (a dim ring) until the chapter's boss falls, then flares and its rim ring turns.
- To use it, interact (click, or F). The bearer runs to the rim and leaps in an arc to the centre, then drops. The screen flashes white-gold into the fall cutscene, then loads the next world.
- **Rule for all worlds:** every exit is a *descent*, such as a well, chasm, hole in the ice or whirlpool. There are never standing gates.

## 5. Combat
- Real-time. **LMB** on an enemy walks into range and attacks. **LMB** on the ground walks there; hold it to keep moving. **WASD/arrows** give direct, camera-relative movement. **Space** attacks in place toward the cursor.
- **Melee:** a 120° arc that hits everything in it, at 0.72 s per swing divided by weapon speed. Hits apply knockback, crits do ×1.75 damage, and Life on Hit is an affix.
- **Telegraphs:** every heavy enemy attack shows a cold-white ground shape (a ring or a line) before it lands, so players learn to dodge by moving. Courier Step (a dash) arrives at level 2 in the full version.
- **Damage taken** = raw × (1 − armor / (armor + 40 + 6 × level)).
- **Death:** a "The light goes out" screen, then you rise again at the area spawn with full Life. There's no corpse run; it's kept forgiving.

## 6. Stats
| Stat | Base | Notes |
|---|---|---|
| Life | 60 (+9/level) | Rust Draught heals 60% over 2 s |
| **Light** (mana/sight) | 50 (+5/level), regen 2.2/s | Spells cost Light. Low Light shrinks your view radius. Lamp Oil restores 60%. |
| Damage | From the weapon, plus flat affixes | Fists 2–4 |
| Armor | From gear | Formula above |
| Spell Power % | Lantern + affixes | Multiplies spell damage |
| Critical % | 5% base | |
| Move % | Boots/affixes | Base 5 m/s |

*Planned after the slice:* four attributes, **Might** (melee), **Grace** (crit/attack speed), **Will** (Light/spell power) and **Vigor** (Life), with 3 points per level.

## 7. Loot and rarity
- **Slots:** weapon, lantern (off-hand and spell focus), hood, robe, gloves, boots, charm. The bag holds 32.
- **Rarity tiers:**
  - **Worn** (stone grey `#c9c3b6`): base stats only.
  - **Fine** (turquoise `#5fd6c6`): 1 affix.
  - **Rare** (amber `#f0b04a`): 2 affixes plus a suffix name.
  - **Ancient** (white-gold `#fff0c4`): 3 affixes rolled ×1.4. It's builder-made, so it's the only gear allowed to glow white-gold.
  - **Echo** (violet `#b98cff`): quest shards.
- Each drop shows a beam of light in its rarity colour and a clickable name label.
- **Affix pool:** Life, Light, Armor, Damage, Spell Power, Crit, Move, Light regen, Life on Hit. Item names come from prefix + base + suffix, e.g. *"Kindled Frosted Lantern of the Undermere"*.
- **Drop chance:** Dustling 18%, Wick 40%, Stepwalker 75%, Rift 100%, boss 2 items (biased toward rare) plus the shard. Potions drop 14% of the time.
- **Salvage:** shift+click an item. *Planned:* salvage yields bronze scrap for re-rolling at the Ossaryn smith.

## 8. Spells (Light-powered; the slice implements 1 and 2)
1. **Lantern Flare** (Q) costs 22 Light with a 4 s cooldown. An amber nova (3.6 m) that knocks enemies back and burns them. *Implemented.*
2. **Wick Lance** (RMB/E) costs 10 Light with a 0.55 s cooldown. A piercing amber bolt toward the cursor. *Implemented.*
3. **Moss Mend** costs 30 Light. A turquoise moss circle on the ground that heals over 5 s while you stand in it (living water and moss, so turquoise).
4. **Courier Step** costs 12 Light. A 5 m dash with i-frames that leaves a faint mist wake (after the courier skiffs).
5. **Bronze Chime** costs 25 Light. Your lantern rings like a bell, stunning enemies in 4 m for 1.5 s and marking them; marked enemies take +20% damage. Its strength scales with the Echo Shards you've socketed.
6. **The Kept Light** (ultimate) uses an Echo charge. A shaft of real daylight drops from the Hollow's opening (or the realm's sky) and burns everything in it for 4 s.

**Echo Shards:** the lantern has 3 sockets. Each shard adds a "note", a passive plus a spell modifier. For example, *The First Note* makes Lantern Flare leave burning ground. Playing the right sequence at an ancient structure (a resonance puzzle) opens wells and lore.

## 9. Potions
- **Rust Draught** (key 1): heals 60% of Life over 2 s. You start with 3.
- **Lamp Oil** (key 2): restores 60% of Light instantly. You start with 2.
- *Planned:* **Mist Salt**, which cleanses and slows time briefly (a rare drop). Potions stack without limit in the slice; later the cap is 5 each.

## 10. Progression
- **XP to next level** = 40 + 55 × (level − 1). Chapter I ends around level 3–4, and the cap per chapter is roughly chapter × 5.
- **Unlocks:**
  - Level 2: Courier Step.
  - Level 3: Moss Mend.
  - Chapter I boss: the first Echo Shard and Bronze Chime.
  - Chapter II: The Kept Light.
- Gear scales with item level (+15% per level). Enemies scale +12% HP per player level within a chapter, kept mild.

## 11. UI
- **Bottom centre:** a Life orb (rust red) and a Light orb (amber), with the skill bar between them (LMB, RMB/E, Q, potions 1/2, bag I) and an XP bar and level line on top. The slots are also tappable.
- **Top centre:** an area-name banner (Cinzel font) that fades in and out, and the boss bar with portrait.
- **Top right:** the quest tracker. **Mid-bottom:** a hint line. Damage numbers float above targets, and loot labels sit on the ground.
- **Inventory/character panel (I):** 7 equipment slots, a stats grid, and a 32-slot bag. Hover shows a tooltip with a comparison to the equipped item; click to equip; shift+click to salvage.
- **Darkness overlay:** a multiply-blended radial mask centred on the bearer. Its radius follows Light, which makes "the world is dimming" a felt mechanic.
- **Dialogue box:** click or F to continue. **Cutscene layer:** video, or a still with a slow push-in, with subtitles; Esc or click skips.
- **Dev:** F2 opens the walk-polygon editor (alt+click adds points in plate pixels) for tracing real plates.

## 12. Cutscene list
| ID | Title | Type | Where | Status |
|---|---|---|---|---|
| CS01 | The Ring Wakes | Video, 12–15 s | Opening | Needs to be generated (ASSET_LIST) |
| CS01b | The Lights Go Out | Video, 10 s | Opening, part 2 | Needs to be generated |
| CS02 | The Unsealed | Still with push-in (video optional) | Boss intro at A3 | Needs to be generated |
| CS03 | The Fall | Video, 8–10 s | Jump into the Well of Descent | Needs to be generated |
| CS04 | Floor of the Archive | Video | Chapter II arrival | Later |
| CS05 | What the Builders Took | Video | Chapter II reveal | Later |
| CS06 | The Thessal Follows | Video | Chapter III | Later |
| CS07 | The Glass Reef | Video (video 16 can be reused re-cut to 16:9) | Chapter III | Later |
| CS08 | Halcyr Dawn | Video (based on 13) | Chapter V | Later |
| CS09a/b | Give it Back / Keep it | Video | Endings | Later |

Cutscenes are 16:9 landscape for the game. The existing 9:16 social videos can be cut down into teaser cutscenes, but new 16:9 renders look far better.

## 13. Tech plan
**Choice: Three.js (r187, vendored in `lib/`, no build step) with a fixed orthographic 3/4 camera, AI-painted "plates" as the environment, and simple real-time 3D characters.** This is the pre-rendered-background approach of Baldur's Gate / Pillars of Eternity / Disco Elysium, with AI paintings in place of renders.

**How it works**
- The camera is fixed at yaw 45° and pitch 50°, orthographic, so a painting made from the same angle lines up with the 3D world. Plates live in a logical 2560×1440 "plate space", and `PPU` = 64 plate px per metre.
- `engine.p2g` and `engine.g2p` map plate pixels to and from the ground plane exactly, so **all level data (walk polygons, blockers, spawns, lanterns, exits) is authored in plate pixels** by tracing over the painting with the F2 editor.
- The plate is drawn first as a camera-facing quad without depth. Characters, props and effects are real 3D, lit by dynamic lights (the bearer's lantern, Wick cores, the rift glow), so they sit *inside* the painting.
- **Occluders** (railings and pillars in front of the walk area) are polygons cut from the same plate and placed at the depth of their foot line. Characters walk behind them correctly, and no extra images are needed.
- When the plate file is missing, a procedural placeholder plate plus greybox 3D props is used, so the game always runs. Only files listed in `assets/manifest.json` are requested, so there are no 404s (`tools/build_manifest.py`).
- Cutscenes are HTML5 `<video>`, falling back to a still keyframe with a Ken Burns push, then to a gradient.

**Why this beats the alternatives for "environments must look like the videos"**
- *Full real-time 3D now* (Three.js or Godot with AI 3D models): today's image-to-3D models are far coarser than our keyframes, and lighting and fog won't reach the video look without weeks of art work per area.
- *Pure 2D sprites*: characters would need consistent 8-direction animated sprite sheets, which AI image tools can't produce reliably. Simple 3D characters animate for free, can be swapped for rigged models later, and carry over to a real-3D version.
- *Godot web export*: a heavier download (30–40 MB WASM), a slower iteration loop, and no visual gain for a plate-based game. It's the better engine for the later full-3D step.

**Known limits of the skeleton**
- Movement is straight-line with wall-sliding (no navmesh pathfinding yet).
- There's no save/load yet (localStorage is planned).
- Only 2 of the 6 spells are implemented, and attributes aren't implemented.
- On mobile, tap/hold moves and the slots can be tapped, but there's no virtual joystick.
- Plates upscaled from about 1280 px will look soft. Generate at the highest available resolution, and use an AI upscaler if one becomes available (`tools/prep_asset.py` does Lanczos plus a mild sharpen).

**Path to real 3D (the later ambition)**
1. Keep the systems engine-agnostic. `config.js` (data), `items.js` (loot) and the AI/combat logic are plain JS that can be ported module by module.
2. **Step 2.5D+:** replace plates with *camera-projection mapping*, i.e. the painting projected onto a rough 3D blockout of each area. This gives true depth, slight camera moves and real occlusion while keeping the painted look.
3. **Real 3D:** rebuild one area (the Well of Descent) as a 3D scene in Three.js or Godot 4, with the plates and videos as the art bible, a free camera, volumetric fog and bloom. The characters are already 3D, so they carry over (upgraded to rigged and animated models).
4. Then keep the cinematic videos as cutscenes, which stays our strongest asset.

## 14. Next steps after this slice
1. Generate the slice assets (ASSET_LIST.md), prep them, trace the walk polygons and occluders on the real plates (about 30 minutes per plate), and run QC.
2. Add Courier Step and Moss Mend, save/load, and simple A* pathfinding over the walk polygon.
3. Playtest balance with Mads, then host on GitHub Pages next to the Glass Reef prototype (once approved).
