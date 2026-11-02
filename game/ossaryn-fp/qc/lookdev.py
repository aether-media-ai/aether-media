# Look-dev screenshots at fixed poses (dev hook ?pose=...). Not the human QC.
import asyncio, sys, os
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:18765/'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/workspace/aether/game/fp/qc/lookdev/'
os.makedirs(OUT, exist_ok=True)
POSES = {
  'a_start': 'pose=0,3,0,2',
  'b_void': 'pose=2,-10,-60,3&lit=1',
  'c_terrace_back': 'pose=1,-50,160,4&lit=2',
  'd_bridge': 'pose=14,-65,-90,2&lit=2',
  'e_enemy': 'pose=1,-20,0,2&lit=1&enemy=1.5,-24;-1,-26',
  'f_landing': 'pose=72,-65,-90,0&lit=3&open=1',
  'g_lookback': 'pose=60,-65,90,6&lit=3',
  'h_lantern': 'pose=1.3,-13.6,-40,8&lit=1',
  'i_shard': 'pose=84,-65,-90,-4&lit=3',
  'j_hulk': 'pose=73,-64,-60,8&lit=3&enemy=78,-61.5,1;76,-67',
}
TAG = sys.argv[4] if len(sys.argv) > 4 else ''
sel = sys.argv[3].split(',') if len(sys.argv) > 3 else list(POSES)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 720})
        errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        for k in sel:
            await pg.goto(BASE + '?' + POSES[k], wait_until='networkidle')
            await pg.wait_for_timeout(3500)
            await pg.screenshot(path=OUT + k + TAG + '.jpg', quality=88, type='jpeg')
            pr = await pg.evaluate('() => window.__fpProbe && window.__fpProbe()')
            print(k, pr and pr['fps'], pr and pr['pos'])
        print('\n'.join(errs[:20]))
        from PIL import Image
        ims = [Image.open(OUT + k + TAG + '.jpg') for k in sel]
        W, H = 640, 360; sh = Image.new('RGB', (W * 2, H * ((len(ims) + 1) // 2)))
        for i, im in enumerate(ims): sh.paste(im.resize((W, H)), ((i % 2) * W, (i // 2) * H))
        sh.save(OUT + 'sheet' + TAG + '.jpg', quality=85)
        await b.close()
asyncio.run(main())
