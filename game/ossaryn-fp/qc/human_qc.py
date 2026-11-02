"""Human-style QC for the first-person Ossaryn slice.

Plays the whole slice with REAL keyboard / mouse input only (Playwright page.keyboard / page.mouse).
The only page access is the read-only window.__fpProbe() (state) and window.__fpRay() (distance to visible
geometry, used to tell a real wall from an invisible one). Nothing writes game state.

Route: title -> Begin -> skip cs01 -> card -> play -> L1 (+wave) -> pickups -> L2 (+wave) -> plaza pickup ->
bridge -> L3 on the crest (+wave) -> landing pickup -> Echo Shard (+hulk wave) -> well opens -> walk in -> fall ->
skip cs03 -> end card. Then a 2nd session checks K (unstick) and Shift+N (debug skip) on their own.
"""
import asyncio, json, math, os, sys, time
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:18765/'
QC = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(QC, 'shots'); os.makedirs(SHOTS, exist_ok=True)
VW, VH = int(os.environ.get('QC_W', 1280)), int(os.environ.get('QC_H', 720))
SENS = 0.0022
LOG, ISSUES = [], []
T0 = time.time()

def log(*a):
    s = f'[{time.time() - T0:7.1f}s] ' + ' '.join(str(x) for x in a); print(s, flush=True); LOG.append(s)
def issue(kind, msg, **kw):
    ISSUES.append({'kind': kind, 'msg': msg, **kw}); log('ISSUE', kind, msg, kw)
def wrap(a):
    while a > math.pi: a -= 2 * math.pi
    while a < -math.pi: a += 2 * math.pi
    return a
def yaw_to(px, pz, x, z):   # forward = (-sin yaw, -cos yaw)
    return math.atan2(-(x - px), -(z - pz))

class Bot:
    def __init__(s, pg):
        s.pg, s.mx, s.my, s.held = pg, VW / 2, VH / 2, set()
    async def probe(s):
        return await s.pg.evaluate('() => window.__fpProbe()')
    async def ray(s, dx, dz):
        return await s.pg.evaluate(f'() => window.__fpRay({dx},{dz})')
    async def down(s, k):
        if k not in s.held: await s.pg.keyboard.down(k); s.held.add(k)
    async def up(s, k):
        if k in s.held: await s.pg.keyboard.up(k); s.held.discard(k)
    async def release(s):
        for k in list(s.held): await s.up(k)
    async def tap(s, k, ms=60):
        await s.pg.keyboard.down(k); await s.pg.wait_for_timeout(ms); await s.pg.keyboard.up(k)
    async def mouse_turn(s, dyaw, dpitch=0.0):
        """relative mouse move; mouse right = yaw decreases. Keeps the (unlocked) cursor inside the window."""
        dx, dy = -dyaw / SENS, -dpitch / SENS
        nx, ny = s.mx + dx, s.my + dy
        if not (8 < nx < VW - 8 and 8 < ny < VH - 8): return False
        steps = max(1, int(max(abs(dx), abs(dy)) / 60))
        await s.pg.mouse.move(nx, ny, steps=steps); s.mx, s.my = nx, ny; return True
    async def ensure_play(s):
        p = await s.probe()
        if p['mode'] == 'pause': log('paused (pointer lock lost) -> Enter'); await s.tap('Enter'); await s.pg.wait_for_timeout(300); p = await s.probe()
        if p['mode'] == 'dead':
            log('DIED at', p['pos'], '-> Rise again (Enter)'); await s.release(); await s.shot('death'); await s.tap('Enter'); await s.pg.wait_for_timeout(500); p = await s.probe()
        return p
    async def face(s, yaw_t, tol=0.06, timeout=25):
        t_end = time.time() + timeout
        while time.time() < t_end:
            p = await s.ensure_play(); e = wrap(yaw_t - p['yaw'])
            # keep the view level-ish
            if abs(p['pitch'] + 0.05) > 0.12: await s.mouse_turn(0, -0.05 - p['pitch'])
            if abs(e) < tol: await s.up('ArrowLeft'); await s.up('ArrowRight'); return True
            if abs(e) < 0.9 and await s.mouse_turn(e): continue
            # coarse: arrow keys (ArrowLeft increases yaw); recentre budget not needed
            k, o = ('ArrowLeft', 'ArrowRight') if e > 0 else ('ArrowRight', 'ArrowLeft')
            await s.up(o); await s.down(k)
            await s.pg.wait_for_timeout(40 if abs(e) > 0.5 else 15)
            await s.up(k)
        await s.release(); return False
    async def walk_to(s, x, z, tol=0.6, sprint=False, timeout=90, fight=True, label=''):
        t_end = time.time() + timeout; best = 1e9; best_t = time.time(); last_check = None
        while time.time() < t_end:
            p = await s.ensure_play()
            if p['mode'] != 'play': await s.release(); return p
            if fight and any(e['dist'] < 7 and e['state'] not in ('climb',) for e in p['enemies']):
                await s.release(); await s.fight(radius=9); continue
            px, pz = p['pos'][0], p['pos'][2]; d = math.hypot(x - px, z - pz)
            if d < tol: await s.release(); return p
            yt = yaw_to(px, pz, x, z); e = wrap(yt - p['yaw'])
            if abs(e) > 0.35: await s.up('KeyW'); await s.face(yt, tol=0.12)
            elif abs(e) > 0.06: await s.mouse_turn(e)
            if d < 2.2:   # close: short steps so a slow frame rate never makes us orbit the target
                await s.up('ShiftLeft'); await s.up('KeyW'); await s.tap('KeyW', 220)
            else:
                await s.down('KeyW')
                if sprint and d > 4: await s.down('ShiftLeft')
                else: await s.up('ShiftLeft')
            if d < best - 0.15: best, best_t = d, time.time(); s.sidestepped = False
            elif time.time() - best_t > 3.5 and not getattr(s, 'sidestepped', False):
                # like a player bumping into a pillar: strafe a little, then carry on
                s.sidestepped = True; await s.up('KeyW'); key = 'KeyD' if (int(time.time()) % 2) else 'KeyA'
                await s.down(key); await s.down('KeyW'); await s.pg.wait_for_timeout(700); await s.up(key); best_t = time.time() - 3.0
            elif time.time() - best_t > 6 and d < tol + 0.4: break   # close enough; short taps just aren't registering at this fps
            elif time.time() - best_t > 6:
                # no progress: is there something visible in front of us?
                f = (-math.sin(p['yaw']), -math.cos(p['yaw'])); r = await s.ray(*f)
                vis = min([v for v in r if v is not None], default=None)
                if vis is None or vis > 1.0: issue('invisible_wall', f'stuck walking to {label} {x,z} at {p["pos"]} with no visible geometry ahead (ray {r})', pos=p['pos'])
                else: issue('stuck', f'blocked by visible geometry walking to {label} {x,z} at {p["pos"]} (ray {r})', pos=p['pos'])
                await s.release(); return p
            await s.pg.wait_for_timeout(120)
        await s.release(); issue('timeout', f'walk_to {label} {x,z} timed out'); return await s.probe()
    async def fight(s, radius=14, timeout=150, wave=None):
        t_end = time.time() + timeout; hits = 0; flares = 0
        if wave:   # the wave spawns ~1.4 s after the trigger and climbs over the parapet: wait for it
            tw = time.time()
            while time.time() - tw < 15:
                p = await s.probe()
                if any(e['wave'] == wave for e in p['enemies']) or p['kills'] and not any(e['wave'] == wave for e in p['enemies']) and time.time() - tw > 8: break
                await s.pg.wait_for_timeout(300)
        while time.time() < t_end:
            p = await s.ensure_play()
            if p['mode'] != 'play': break
            es = [e for e in p['enemies'] if e['dist'] < radius and (wave is None or e['wave'] == wave)]
            if not es:
                if wave and any(e['wave'] == wave for e in p['enemies']):   # some still climbing far away: wait
                    await s.pg.wait_for_timeout(300); continue
                break
            if p['hp'] < 40 and p['pots']['heal'] > 0: log('drink Rust Draught (1), hp', p['hp']); await s.tap('Digit1')
            if p['oil'] < 30 and p['pots']['oil'] > 0: log('drink Lamp Oil (2), oil', p['oil']); await s.tap('Digit2')
            tgt = min(es, key=lambda e: e['dist'])
            px, pz = p['pos'][0], p['pos'][2]
            yt = yaw_to(px, pz, *tgt['pos']); e = wrap(yt - p['yaw'])
            if abs(e) > 0.12: await s.up('KeyW'); await s.face(yt, tol=0.1, timeout=6)
            near = [x for x in es if x['dist'] < 4.0]
            if (len(near) >= 2 or tgt['hulk']) and p['oil'] > 35 and tgt['dist'] < 5:
                await s.pg.mouse.down(button='right'); await s.pg.wait_for_timeout(50); await s.pg.mouse.up(button='right'); flares += 1
            if tgt['dist'] > 2.5 and tgt['state'] not in ('climb', 'rise'):
                await s.down('KeyW'); await s.pg.wait_for_timeout(120); await s.up('KeyW')
            elif tgt['dist'] <= 2.7:
                await s.pg.mouse.down(); await s.pg.wait_for_timeout(50); await s.pg.mouse.up(); hits += 1
                await s.pg.wait_for_timeout(150)
            else:
                await s.pg.wait_for_timeout(200)
        await s.release(); p = await s.probe(); log(f'fight done: swings {hits}, flares {flares}, hp {p["hp"]}, oil {p["oil"]}, kills {p["kills"]}'); return p
    async def interact(s, x, z, expect, stand=None, label=''):
        """walk near, aim at it, check the prompt, press E"""
        if stand: await s.walk_to(*stand, tol=0.5, label=label)
        p = await s.probe(); d = math.hypot(x - p['pos'][0], z - p['pos'][2])
        if d > 2.6: p = await s.walk_to(x, z, tol=2.2, label=label)
        await s.face(yaw_to(p['pos'][0], p['pos'][2], x, z), tol=0.08)
        await s.pg.wait_for_timeout(400); p = await s.probe()
        d = math.hypot(x - p['pos'][0], z - p['pos'][2])
        if not p['prompt'] or expect.lower() not in p['prompt'].lower():
            issue('prompt', f'{label}: expected prompt "{expect}" at {d:.2f} m, got {p["prompt"]!r}', pos=p['pos'])
        else: log(f'prompt OK for {label} at {d:.2f} m: {p["prompt"]!r}')
        await s.tap('KeyE'); await s.pg.wait_for_timeout(300); return await s.probe()
    async def shot(s, name):
        path = os.path.join(SHOTS, f'{len(os.listdir(SHOTS)):02d}_{name}.jpg')
        await s.pg.screenshot(path=path, type='jpeg', quality=90); log('shot', path); return path

async def wall_probe(bot, dx, dz, label, max_gap=0.75):
    """walk sideways into an edge; when we stop, a visible surface must be close (no invisible walls)"""
    p = await bot.probe(); start = p['pos']
    await bot.face(math.atan2(-dx, -dz), tol=0.08)
    await bot.down('KeyW'); last = None; t = time.time(); still = time.time()
    while time.time() - t < 15:
        await bot.pg.wait_for_timeout(200); q = await bot.probe()
        if last is None or math.hypot(q['pos'][0] - last[0], q['pos'][2] - last[2]) > 0.03: last, still = q['pos'], time.time()
        elif time.time() - still > 1.5: break
    await bot.up('KeyW'); q = await bot.probe(); r = await bot.ray(dx, dz)
    vis = min([v for v in r if v is not None], default=None)
    ok = vis is not None and vis <= max_gap
    log(f'wall probe {label}: stopped at {q["pos"]} gap to visible geometry {r} -> {"OK" if ok else "INVISIBLE WALL?"}')
    if not ok: issue('invisible_wall', f'{label}: stopped {vis} m from visible geometry', pos=q['pos'])
    return q

async def new_page(b):
    ctx = await b.new_context(viewport={'width': VW, 'height': VH})
    pg = await ctx.new_page(); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    return ctx, pg, errs

async def start_game(bot, quality_low):
    pg = bot.pg
    await pg.goto(BASE, wait_until='networkidle'); await pg.wait_for_timeout(1500)
    if quality_low:
        q = await pg.text_content('#qualT')
        if 'High' in q: await pg.click('#qualT')
    await bot.shot('title') if quality_low is not None else None
    await pg.click('#begin'); await pg.wait_for_timeout(2500)
    p = await bot.probe(); log('after Begin mode', p['mode'])
    if p['mode'] == 'cut':
        await bot.shot('cs01_playing'); await bot.tap('Escape'); await pg.wait_for_timeout(800)
    p = await bot.probe(); log('after skip mode', p['mode'])
    if p['mode'] == 'card':
        await pg.wait_for_timeout(3500); await bot.shot('story_card'); await pg.mouse.click(VW / 2, VH / 2); await pg.wait_for_timeout(800)
    p = await bot.probe(); log('play mode', p['mode'], 'locked', p['locked'], 'noLock', p['noLock'])
    bot.mx, bot.my = VW / 2, VH / 2
    return p

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'])
        ctx, pg, errs = await new_page(b); bot = Bot(pg)
        low = os.environ.get('QC_LOW', '1') == '1'
        p = await start_game(bot, low)
        if p['mode'] != 'play': issue('flow', f'did not reach play: {p["mode"]}')
        await pg.wait_for_timeout(1500); p = await bot.probe(); log('fps', p['fps'], 'quality', p['quality'])
        await bot.shot('start')
        # --- invisible-wall probes on the terrace: inner wall (west), parapet (east), gate (behind)
        await bot.walk_to(0, -3, tol=0.4, label='terrace')
        await wall_probe(bot, -1, 0, 'west facade wall')
        await bot.walk_to(1.5, -4.5, tol=0.4, label='terrace mid')
        await wall_probe(bot, 1, 0, 'east parapet')
        # --- L1
        p = await bot.interact(3.3, -16, 'Relight', stand=(1.6, -13.5), label='L1')
        if not p['lit'][0]: issue('flow', 'L1 did not light')
        await bot.shot('L1_lit')
        await pg.wait_for_timeout(1500)
        # wave L1 climbs the parapet
        t = time.time()
        while time.time() - t < 25:
            p = await bot.probe()
            if any(e['wave'] == 'L1' for e in p['enemies']) and any(e['state'] != 'climb' for e in p['enemies']): break
            await pg.wait_for_timeout(300)
        p = await bot.probe(); log('L1 enemies', [(e['id'], e['state'], e['dist']) for e in p['enemies']])
        # face the first one and grab a combat screenshot
        if p['enemies']:
            e0 = min(p['enemies'], key=lambda e: e['dist']); await bot.face(yaw_to(p['pos'][0], p['pos'][2], *e0['pos']), tol=0.1)
            await bot.shot('combat_L1')
        await bot.fight(wave='L1', radius=20)
        # --- unstick key: K returns to the checkpoint
        await bot.walk_to(0, -22, tol=0.6, label='before K')
        await bot.tap('KeyK'); await pg.wait_for_timeout(400); p = await bot.probe()
        if math.hypot(p['pos'][0] - p['cp'][0], p['pos'][2] - p['cp'][2]) > 0.3: issue('unstick', f'K did not return to checkpoint {p["cp"]}: {p["pos"]}')
        else: log('K unstick OK ->', p['pos'])
        # --- pickups on the crate
        p = await bot.interact(-3.6, -31, 'Take', stand=(-1.6, -31), label='pickup oil')
        p = await bot.interact(-3.6, -32.2, 'Take', stand=(-1.6, -32.2), label='pickup heal')
        log('pots', p['pots'])
        # --- L2
        p = await bot.interact(3.3, -46, 'Relight', stand=(1.6, -43.5), label='L2')
        if not p['lit'][1]: issue('flow', 'L2 did not light')
        await pg.wait_for_timeout(2500)
        await bot.fight(wave='L2', radius=30)
        await bot.shot('after_L2')
        # --- plaza + pickup
        await bot.walk_to(1.0, -62, tol=0.7, sprint=True, label='plaza')
        p = await bot.interact(8.5, -72.5, 'Take', stand=(8.5, -70.8), label='pickup plaza heal')
        await bot.walk_to(9.5, -65, tol=0.5, label='bridge foot')
        await bot.face(yaw_to(9.5, -65, 30, -65)); await pg.wait_for_timeout(500); await bot.shot('bridge_view')
        # bridge railing probe
        await bot.walk_to(24, -65, tol=0.5, sprint=True, label='bridge')
        await wall_probe(bot, 0, 1, 'bridge rail (south)')
        # --- L3 at the crest
        p = await bot.interact(40.5, -63.2, 'Relight', stand=(38.5, -65), label='L3')
        if not p['lit'][2]: issue('flow', 'L3 did not light')
        await pg.wait_for_timeout(2000)
        await bot.fight(wave='L3', radius=40)
        await bot.walk_to(40, -65.5, tol=0.8, label='crest')
        await bot.face(yaw_to(40, -65.5, 79, -65)); await pg.wait_for_timeout(500); await bot.shot('bridge_crest_lit')
        # --- landing
        await bot.walk_to(71.5, -65, tol=0.6, sprint=True, label='landing')
        p = await bot.interact(73, -78.5, 'Take', stand=(73, -76.6), label='pickup landing oil')
        # sealed well: prompt should say sealed, and it must block
        await bot.walk_to(74.5, -66, tol=0.6, label='well side')
        await bot.face(yaw_to(74.5, -66, 79, -65)); await pg.wait_for_timeout(400); p = await bot.probe(); log('sealed well prompt:', p['prompt'])
        # around the well to the shard
        await bot.walk_to(76, -70.8, tol=0.6, label='round the well'); await bot.walk_to(84.5, -69.5, tol=0.6, label='round the well 2')
        p = await bot.interact(88.2, -65, 'Echo Shard', stand=(85.6, -65), label='shard')
        if not p['shard']: issue('flow', 'shard not taken')
        await pg.wait_for_timeout(2500)
        p = await bot.probe()
        if p['enemies']:
            e0 = min(p['enemies'], key=lambda e: e['dist']); await bot.face(yaw_to(p['pos'][0], p['pos'][2], *e0['pos']), tol=0.1); await bot.shot('hulk_rises')
        await bot.fight(wave='SHARD', radius=40, timeout=240)
        t = time.time()
        while time.time() - t < 20:
            p = await bot.probe()
            if p['wellOpen']: break
            await pg.wait_for_timeout(400)
        if not p['wellOpen']: issue('flow', f'well did not open; objective {p["objective"]}')
        await pg.wait_for_timeout(5000)
        await bot.walk_to(84, -65, tol=0.6, fight=True, label='before the well')
        await bot.face(yaw_to(84, -65, 79, -65)); await pg.wait_for_timeout(600); p = await bot.probe(); log('open well prompt at 5 m:', p['prompt'])
        await bot.shot('well_open')
        # walk straight in
        await bot.down('KeyW'); t = time.time()
        while time.time() - t < 30:
            p = await bot.probe()
            if p['mode'] != 'play': break
            await pg.wait_for_timeout(150)
        await bot.release(); log('mode after walking into the well', p['mode'])
        if p['mode'] != 'fall': issue('flow', f'walking into the open well did not start the fall ({p["mode"]})')
        await pg.wait_for_timeout(1200); await bot.shot('falling')
        t = time.time()
        while time.time() - t < 60:
            p = await bot.probe()
            if p['mode'] == 'cut': await pg.wait_for_timeout(1500); await bot.shot('cs03'); await bot.tap('Escape')
            if p['mode'] == 'end': break
            await pg.wait_for_timeout(500)
        await pg.wait_for_timeout(1500)
        if p['mode'] != 'end': issue('flow', f'did not reach the end card ({p["mode"]})')
        await bot.shot('end_card'); end_txt = await pg.text_content('#end'); log('END:', ' '.join(end_txt.split()))
        main_errs = list(errs); summary = await bot.probe()
        await ctx.close()

        # --- session 2: Shift+N debug skip path
        ctx, pg, errs2 = await new_page(b); bot = Bot(pg)
        await start_game(bot, None)
        seq = []
        for i in range(5):
            await pg.keyboard.press('Shift+KeyN'); await pg.wait_for_timeout(900); p = await bot.probe(); seq.append((p['lit'], p['shard'], p['wellOpen'], p['pos']))
        log('Shift+N sequence', seq)
        if not (all(seq[2][0]) and seq[3][1] and seq[4][2]): issue('debugskip', f'unexpected Shift+N sequence {seq}')
        await bot.walk_to(79, -65, tol=0.5, fight=False, label='debug well'); p = await bot.probe(); log('debug session mode', p['mode'])
        await ctx.close(); await b.close()
        out = {'issues': ISSUES, 'console_errors': main_errs + errs2, 'final': summary, 'log': LOG}
        json.dump(out, open(os.path.join(QC, 'qc_result.json'), 'w'), indent=1)
        log('ISSUES', len(ISSUES)); [log(' -', i) for i in ISSUES]; log('console errors', (main_errs + errs2)[:10])

asyncio.run(main())
