"""Procedural textures for eyes, lashes, brows (PIL + numpy, deterministic). Not shipped; the baked PNG/WebP files are.
Hair-like textures are white-grey strands with alpha: the game tints them with the look's hair colour."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import skin_tex as ST

def _smooth(a, b, x): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

IRIS = {  # name -> (outer, inner, ring) sRGB
    'dark_brown': ('#2b1a0f', '#6a4020', '#1a0e08'), 'brown': ('#4a2c16', '#9a6a34', '#25140a'), 'hazel': ('#5a4a22', '#b08a3a', '#2a2210'), 'green_brown': ('#3b4a2a', '#9a8a3a', '#1c2412'),
    'grey': ('#5c666c', '#9aa4a4', '#2a3034'), 'blue': ('#2f5f8f', '#8ab0c8', '#142a40'), 'green': ('#2f6a46', '#98b060', '#12301e'), 'amber': ('#7a4a14', '#d09a3a', '#3a2008'),
}
def _hex(h): h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)]) / 255.0

def eye_atlas(cell=256, seed=3):
    """8 iris variants side by side (cell x 8, cell). Planar front mapping: r = sin(theta); iris edge at r = 0.465, pupil at 0.17."""
    names = list(IRIS); out = np.zeros((cell, cell * len(names), 3), np.float32); yy, xx = np.mgrid[0:cell, 0:cell].astype(np.float32)
    x = (xx + 0.5) / cell * 2 - 1; y = 1 - (yy + 0.5) / cell * 2; r = np.hypot(x, y); ph = np.arctan2(y, x)
    rng = np.random.default_rng(seed)
    for k, nm in enumerate(names):
        co, ci, cr = [_hex(h) for h in IRIS[nm]]
        # sclera: warm off-white, faint veins that fade in toward the corners, dark toward the top and bottom (lids)
        sc = np.array([0.82, 0.78, 0.72])[None, None, :] * np.ones((cell, cell, 1))
        veins = np.zeros((cell, cell), np.float32)
        for _ in range(26):
            a0 = rng.uniform(0, 2 * np.pi); rr0 = rng.uniform(0.55, 0.9); px, py = rr0 * np.cos(a0), rr0 * np.sin(a0); ang = a0 + np.pi + rng.normal(0, 0.35)
            for s in range(40):
                px += np.cos(ang) * 0.012; py += np.sin(ang) * 0.012; ang += rng.normal(0, 0.12)
                ix, iy = int((px + 1) / 2 * cell), int((1 - py) / 2 * cell)
                if 0 <= ix < cell and 0 <= iy < cell: veins[iy, ix] = max(veins[iy, ix], 0.5 * (1 - s / 40))
        veins = np.array(Image.fromarray((veins * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))) / 255.0
        corner = _smooth(0.45, 0.95, np.abs(x)) * 0.5
        sc = sc * (1 - (veins * (0.35 + corner))[..., None] * np.array([0.1, 0.65, 0.6])[None, None, :])
        sc = sc * (1 - 0.40 * _smooth(0.50, 0.98, r)[..., None]) * (1 - 0.25 * _smooth(0.35, 0.95, np.abs(y))[..., None])
        sc = sc * np.array([1.0, 0.97, 0.92]) ** (corner[..., None] * 2)
        # iris: radial fibres, collarette, limbal ring, pupil
        ir = np.clip(r / 0.465, 0, 1.5); fib = 0.5 + 0.5 * np.sin(ph * 46 + 5 * np.sin(ph * 7 + ir * 5)) * 0.5 + 0.25 * np.sin(ph * 113 + ir * 9)
        base = co[None, None, :] * (1 - ir[..., None] * 0) ; grad = _smooth(0.12, 0.75, ir)[..., None]
        iris = ci[None, None, :] * (1 - grad) + co[None, None, :] * grad
        iris = iris * (0.72 + 0.5 * fib[..., None]); col_ring = np.exp(-((ir - 0.40) / 0.075) ** 2)[..., None]; iris = iris * (1 + 0.25 * col_ring)
        limb = _smooth(0.74, 1.0, ir)[..., None]; iris = iris * (1 - limb) + cr[None, None, :] * 0.8 * limb
        iris = iris * (1 - 0.35 * _smooth(0.2, 0.0, np.abs(ph - np.pi / 2))[..., None] * _smooth(0.4, 1.0, ir)[..., None])      # lid shadow on the iris top
        pupil = _smooth(0.168, 0.150, r)[..., None]; iris = iris * (1 - pupil) + np.array([0.01, 0.008, 0.008]) * pupil
        edge = _smooth(0.485, 0.455, r)[..., None]; img = sc * (1 - edge) + iris * edge
        img = img * (1 - _smooth(0.995, 1.0, r)[..., None])            # outside the disc is never visible
        out[:, k * cell:(k + 1) * cell] = img
    return np.clip(out, 0, 1), names

def eye_orm(cell=256):
    yy, xx = np.mgrid[0:cell, 0:cell].astype(np.float32); x = (xx + 0.5) / cell * 2 - 1; y = 1 - (yy + 0.5) / cell * 2; r = np.hypot(x, y)
    rough = 0.30 * (1 - _smooth(0.47, 0.5, r)) * 0 + np.where(r < 0.49, 0.035, 0.30 - 0.05 * _smooth(0.5, 0.9, r)); ao = 1 - 0.35 * _smooth(0.55, 1.0, r)
    return np.stack([ao, rough, np.zeros_like(r)], 2).astype(np.float32)

def _stroke(draw, pts, w0, w1, fill):
    n = len(pts) - 1
    for i in range(n):
        w = max(1, int(round(w0 + (w1 - w0) * i / max(1, n - 1)))); draw.line([pts[i], pts[i + 1]], fill=fill, width=w)

def lash_strip(w=512, h=128, seed=5, count=44, upper=True):
    """Alpha lash card: u along the lid (inner -> outer), v from the lid margin (bottom) to the tips (top). Returns RGBA uint8 (white-grey hairs; tinted by hair colour)."""
    SS = 4; im = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0)); d = ImageDraw.Draw(im); rng = np.random.default_rng(seed)
    for i in range(count):
        u = (i + rng.uniform(-0.3, 0.3)) / count * 0.94 + 0.03; x0 = u * w * SS; y0 = h * SS * 0.02
        L = h * SS * rng.uniform(0.62, 0.96) * (0.65 + 0.7 * np.sin(np.pi * np.clip(u, 0, 1)) ** 0.7 * (1.0 if upper else 0.6)); curl = (u - 0.45) * 0.9 + rng.normal(0, 0.12)   # outer lashes lean outward
        pts = []
        for t in np.linspace(0, 1, 14):
            x = x0 + curl * L * (t ** 1.8) * 0.9 + rng.normal(0, 0.4); y = y0 + L * t
            pts.append((x, h * SS - y))      # v runs up the card: the margin is the bottom row, the tips the top
        g = int(rng.uniform(150, 255)); _stroke(d, pts, 9.0, 2.4, (g, g, g, 255))
    im = im.resize((w, h), Image.LANCZOS)
    return np.array(im)

def brow_strip(w=512, h=128, seed=9, count=240):
    """Alpha brow card: u from the inner end to the tail, v across (0.5 centre). A soft dense core (the hair mass) plus feathered strands that rise from the lower inner
    edge and sweep outward. Strand width is about 0.4 mm so it still reads at the game camera."""
    SS = 4; im = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0)); d = ImageDraw.Draw(im); rng = np.random.default_rng(seed)
    for i in range(count):
        u = rng.uniform(0.0, 0.97); v = np.clip(rng.normal(0.5, 0.15), 0.1, 0.9)
        ang = np.deg2rad(np.interp(u, [0, 0.3, 0.65, 1.0], [62, 22, -2, -22]) + rng.normal(0, 6) + (v - 0.5) * 20)
        Lh = rng.uniform(0.07, 0.13) * w * SS * (1.0 - 0.4 * u); x0 = u * w * SS * 0.985; y0 = (1 - v) * h * SS
        pts = [(x0 + np.cos(ang) * Lh * t + rng.normal(0, 0.5), y0 - np.sin(ang) * Lh * t * 0.6 + (t ** 2) * Lh * 0.05) for t in np.linspace(0, 1, 8)]
        g = int(rng.uniform(150, 255)); _stroke(d, pts, rng.uniform(10.0, 15.0), 3.0, (g, g, g, 255))
    im = im.resize((w, h), Image.LANCZOS); a = np.array(im).astype(np.float32)
    yy = np.linspace(0, 1, h)[:, None]; xx = np.linspace(0, 1, w)[None, :]
    core = np.exp(-((yy - 0.5) / 0.20) ** 2) * (0.35 + 0.65 * np.sin(np.pi * np.clip(xx, 0, 1)) ** 0.5) * np.clip(xx / 0.04, 0, 1)
    rgb = np.clip(a[..., :3] * (a[..., 3:4] / 255.0) + 150 * core[..., None] * (1 - a[..., 3:4] / 255.0), 0, 255)
    alpha = np.clip(np.maximum(a[..., 3], 215 * core), 0, 255)
    fade = np.clip(np.minimum(yy, 1 - yy) / 0.08, 0, 1) * np.clip(np.minimum(xx, 1 - xx) / 0.02, 0, 1)
    return np.dstack([rgb, alpha * fade]).astype(np.uint8)

def hair_atlas(cells=8, cw=128, h=512, seed=21):
    """Strand atlas: `cells` locks side by side. u across a lock, v 0 (top) = root .. 1 = tip. White-grey strands (root a little darker) with alpha; tinted by the hair colour in the game."""
    SS = 3; W = cells * cw; im = Image.new('RGBA', (W * SS, h * SS), (0, 0, 0, 0)); d = ImageDraw.Draw(im); rng = np.random.default_rng(seed)
    for c in range(cells):
        n = int(rng.integers(9, 15))
        for k in range(n):
            x0 = (c + rng.uniform(0.08, 0.92)) * cw * SS; amp = rng.uniform(1, 6) * SS * 0.4; ph = rng.uniform(0, 6.28); fr = rng.uniform(1.2, 3.0); drift = rng.normal(0, 4) * SS * 0.5
            wd = rng.uniform(3.2, 5.8) * SS * 0.5; g = int(rng.uniform(150, 255)); pts = []
            for t in np.linspace(0, 1, 26):
                x = x0 + amp * np.sin(ph + fr * t * 6.28) + drift * t; x = np.clip(x, c * cw * SS + 2, (c + 1) * cw * SS - 2); pts.append((x, t * h * SS * rng.uniform(0.9, 1.0) if False else t * h * SS))
            for i in range(len(pts) - 1):
                t = i / len(pts); w = max(1, int(round(wd * (1 - 0.82 * t ** 1.6)))); a = int(255 * (1 if t < 0.82 else max(0.0, 1 - (t - 0.82) / 0.18)))
                root = 0.55 + 0.45 * min(1, t * 5)
                gg = int(g * root); d.line([pts[i], pts[i + 1]], fill=(gg, gg, gg, a), width=w)
    im = im.resize((W, h), Image.LANCZOS); a = np.array(im)
    # a solid core down the middle of each lock so the lock reads as a mass; edges stay feathered
    xx = (np.arange(W) % cw + 0.5) / cw; yy = np.linspace(0, 1, h)[:, None]
    core = np.exp(-((xx[None, :] - 0.5) / 0.2) ** 2) * (1 - 0.9 * np.clip((yy - 0.55) / 0.4, 0, 1))
    al = a[..., 3].astype(np.float32); al = np.maximum(al, 255 * 0.6 * core); rgb = a[..., :3].astype(np.float32); rgb = np.where(a[..., 3:4] > 20, rgb, 120 + 60 * core[..., None])
    edge = np.clip(np.minimum(xx, 1 - xx) / 0.06, 0, 1)[None, :]; al = al * edge
    return np.dstack([rgb, al]).astype(np.uint8)
