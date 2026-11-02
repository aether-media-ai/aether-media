# Prepares FP slice assets from the raw generated images in /workspace/fpsrc (copied from the store).
# - textures: make seamless (half-offset + cross-blend of a mirrored seam band), derive normal + roughness maps from luminance
# - sprites: key out magenta with matte unmixing + despill, crop, emissive mask for the Drowned's face
import numpy as np, sys, os
from PIL import Image, ImageFilter
SRC = '/workspace/fpsrc/'; OUT = os.path.join(os.path.dirname(__file__), '..', 'assets') + '/'

def seamless(a, band=0.18, ax='xy'):
    h, w, _ = a.shape
    s = np.roll(np.roll(a, w // 2 if 'x' in ax else 0, 1), h // 2 if 'y' in ax else 0, 0)       # seams now in the middle cross
    base = a                                              # original: seams at the borders
    # weight: 1 near the image centre (use rolled, which is seam-free at the borders) ... blend so that borders come from 'base'
    # Classic trick: out = base * wb + s * (1-wb) where wb is 0 at the centre cross of 's' and 1 elsewhere -> no: we want seam-free borders.
    yy, xx = np.mgrid[0:h, 0:w]
    dx = np.abs(xx - w / 2) / (w / 2); dy = np.abs(yy - h / 2) / (h / 2)   # 0 centre .. 1 border
    # 's' has its seam on the centre cross; 'base' has its seam on the borders.
    # use 's' near the borders (seam-free there) and 'base' near the cross lines (seam-free there)
    cx = np.abs(xx - w / 2) < w * band / 2; cy = np.abs(yy - h / 2) < h * band / 2
    m = np.zeros((h, w), np.float32)
    if 'x' in ax: m = np.maximum(m, np.clip(1 - np.abs(xx - w / 2) / (w * band / 2), 0, 1))
    if 'y' in ax: m = np.maximum(m, np.clip(1 - np.abs(yy - h / 2) / (h * band / 2), 0, 1))
    m = m[..., None] ** 0.7
    return s * (1 - m) + base * m

def tex(name, src, size=1024, nstrength=2.5, rough=(0.55, 0.95), seam=True, ax='xy'):
    im = Image.open(SRC + src).convert('RGB').resize((size, size), Image.LANCZOS)
    a = np.array(im).astype(np.float32)
    if seam: a = seamless(a, ax=ax)
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(OUT + f'tex/{name}.jpg', quality=88)
    L = (a @ np.array([0.299, 0.587, 0.114])) / 255.0
    Lb = np.array(Image.fromarray((L * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
    gx = (np.roll(Lb, -1, 1) - np.roll(Lb, 1, 1)) * nstrength * size / 256
    gy = (np.roll(Lb, -1, 0) - np.roll(Lb, 1, 0)) * nstrength * size / 256
    n = np.dstack([-gx, gy, np.ones_like(gx)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
    Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save(OUT + f'tex/{name}_n.jpg', quality=90)
    r = rough[1] - (rough[1] - rough[0]) * np.clip((L - L.min()) / (np.ptp(L) + 1e-6), 0, 1)
    Image.fromarray((r * 255).astype(np.uint8)).save(OUT + f'tex/{name}_r.jpg', quality=88)
    print('tex', name)

def key(src, dst, lo, hi, scale=1.0, pad=4):
    a = np.array(Image.open(SRC + src).convert('RGB')).astype(np.float32)
    border = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    k = np.median(border, axis=0)
    d = np.sqrt(((a - k) ** 2).sum(-1))
    alpha = np.clip((d - lo) / (hi - lo), 0, 1)
    am = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    alpha = np.array(am).astype(np.float32) / 255
    al = np.maximum(alpha, 0.08)[..., None]
    c = np.clip((a - (1 - al) * k) / al, 0, 255)
    R, G, B = c[..., 0], c[..., 1], c[..., 2]
    spill = np.minimum(R, B) - G                     # magenta spill: R and B both above G
    sp = np.clip(spill, 0, None) * np.clip(1.15 - alpha, 0.35, 1)   # stronger at edges
    R -= sp * 0.9; B -= sp
    c = np.clip(np.dstack([R, G, B]), 0, 255)
    out = Image.fromarray(np.dstack([c, alpha * 255]).astype(np.uint8), 'RGBA')
    bb = out.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox()
    x0, y0, x1, y1 = bb
    box = (max(0, x0 - pad), max(0, y0 - pad), min(out.width, x1 + pad), min(out.height, y1 + pad))
    out = out.crop(box)
    if scale != 1: out = out.resize((int(out.width * scale), int(out.height * scale)), Image.LANCZOS)
    out.save(OUT + dst, optimize=True)
    print('key', dst, out.size, 'key colour', k.round(), 'crop', box)
    return out, box

tex('basalt', 'basalt.jpg', nstrength=3.0, rough=(0.5, 0.92))
tex('floor', 'floor.jpg', nstrength=2.6, rough=(0.45, 0.95))
tex('bronze', 'bronze.jpg', nstrength=2.0, rough=(0.3, 0.6), ax='y')
vm, vbox = key('viewmodel.jpg', 'sprites/viewmodel.png', 45, 120)
dr, dbox = key('drowned.jpg', 'sprites/drowned.png', 50, 130, scale=0.6)
# emissive mask: bright cold-blue pixels (the face slit)
d = np.array(dr).astype(np.float32)
R, G, B, A = d[..., 0], d[..., 1], d[..., 2], d[..., 3]
m = np.clip((B - np.maximum(R, G * 0.85) - 25) / 80, 0, 1) * np.clip((B - 110) / 80, 0, 1) * (A / 255)
em = np.dstack([R * m, G * m, B * m]).astype(np.uint8)
Image.fromarray(em).filter(ImageFilter.GaussianBlur(1)).save(OUT + 'sprites/drowned_emit.png')
# vista
Image.open(SRC + 'vista.jpg').convert('RGB').save(OUT + 'env/vista.jpg', quality=90)
print('viewmodel crop', vbox, 'drowned crop', dbox)
