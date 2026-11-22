# The world kit, piece by piece (metres, Z up, front faces -Y). Each builder returns {material key: Part}. `hi` builds the detailed version that
# normal, AO and curvature are baked FROM; the low version (fewer bevel segments and sides) is what the game draws. Marked with the project's
# history labels in the comments: Tradition = common South Asian building tradition; Invented = our own design; History needs a year.
import math
from kitlib import Part

def parts(hi, *keys): return {k: Part(hi) for k in keys}

# ---- Arched window with louvred shutters. Tradition (arched, shuttered openings in lime-plastered masonry houses; no single date). Invented design.
def win(hi):
    p = parts(hi, 'stone', 'wood', 'lit'); s = p['stone']; w = p['wood']; g = p['lit']
    H = 1.3; R = 0.45
    for sx in (-1, 1): s.box((sx * (R + 0.12), -0.07, H / 2), (0.24, 0.2, H), 0.018)
    n = 9
    for i in range(n):
        a = math.pi * (i + 0.5) / n; k = 1.35 if i == n // 2 else 1.0
        s.box(((R + 0.12) * math.cos(a), -0.07, H + (R + 0.12) * math.sin(a)), (0.24 * k, 0.2, 0.2), 0.016, (0, -a, 0))
    s.box((0, -0.12, -0.05), (1.34, 0.3, 0.1), 0.02)
    for sx in (-1, 1): s.box((sx * 0.5, -0.1, -0.2), (0.14, 0.2, 0.22), 0.02)
    s.micro(0.004, 14, 1)
    for sx in (-1, 1): w.box((sx * 0.43, -0.03, H / 2), (0.05, 0.06, H), 0.008)
    w.box((0, -0.03, 0.8), (0.88, 0.05, 0.05), 0.008); w.box((0, -0.03, 0.04), (0.88, 0.05, 0.08), 0.008)
    for sx in (-1, 1):  # shutter leaves, swung open a little
        a = sx * 0.22; cx = sx * 0.78; cy = -0.17
        for dx, wd in ((-0.2, 0.05), (0.2, 0.05)): w.box((cx + dx * math.cos(a), cy - dx * math.sin(a) * 0.0, H / 2), (wd, 0.045, H), 0.008, (0, 0, a))
        for zz in (0.03, H - 0.03): w.box((cx, cy, zz), (0.44, 0.05, 0.07), 0.008, (0, 0, a))
        for k in range(8): w.box((cx, cy, 0.14 + k * 0.145), (0.38, 0.05, 0.045), 0.006, (0.6, 0, a))
    w.micro(0.003, 30, 2)
    pts = [(-0.43, -0.01, 0.0), (0.43, -0.01, 0.0)] + [(0.43 * math.cos(a), -0.01, H + 0.43 * math.sin(a)) for a in [i * math.pi / 14 for i in range(0, 15)]]
    g.tri_fan(pts, [list(range(len(pts)))])
    return p

# ---- Arched door with planks, studs and steps. Tradition. Invented design.
def door(hi):
    p = parts(hi, 'stone', 'wood', 'gold'); s = p['stone']; w = p['wood']; au = p['gold']
    H = 2.0; R = 0.5
    for sx in (-1, 1): s.box((sx * (R + 0.14), -0.1, H / 2), (0.28, 0.26, H), 0.02)
    n = 11
    for i in range(n):
        a = math.pi * (i + 0.5) / n; k = 1.3 if i == n // 2 else 1.0
        s.box(((R + 0.14) * math.cos(a), -0.1, H + (R + 0.14) * math.sin(a)), (0.28 * k, 0.26, 0.23), 0.02, (0, -a, 0))
    s.box((0, -0.32, 0.07), (1.8, 0.5, 0.14), 0.025); s.box((0, -0.2, 0.2), (1.4, 0.3, 0.12), 0.02)
    s.micro(0.005, 12, 3)
    for sx in (-1, 1):
        for k in range(4):
            x = sx * (0.06 + 0.12 * k + 0.06 + 0.0) if False else sx * (0.06 + k * 0.118)
            top = H + math.sqrt(max(0.0, R * R - (x * x) * 0.9)) * 0.98
            w.box((x + sx * 0.06, -0.06, top / 2 + 0.1), (0.113, 0.055, top - 0.2), 0.01)
    for zz in (0.5, 1.5): w.box((0, -0.1, zz), (0.98, 0.035, 0.12), 0.01)
    w.micro(0.003, 24, 4)
    for sx in (-1, 1):
        au.box((sx * 0.25, -0.13, 0.5), (0.5, 0.012, 0.05), 0.004); au.box((sx * 0.25, -0.13, 1.5), (0.5, 0.012, 0.05), 0.004)
        au.torus((sx * 0.08, -0.14, 1.0), 0.04, 0.007, (math.pi / 2, 0, 0)); au.sphere((sx * 0.08, -0.13, 1.0), 0.02)
        for k in range(8): au.sphere((sx * (0.12 + (k % 4) * 0.1), -0.12, 0.3 + (k // 4) * 1.2 + 0.2), 0.016, (1, 0.5, 1), 1)
    return p

# ---- Fluted column with a lotus capital. Tradition (lotus capitals and fluting are widespread; not tied to one site).
def column(hi):
    p = parts(hi, 'stone'); s = p['stone']
    s.box((0, 0, 0.09), (0.56, 0.56, 0.18), 0.03); s.torus((0, 0, 0.23), 0.2, 0.05)
    s.lathe((0, 0, 0.28), [(0.001, 0), (0.185, 0), (0.18, 1.0), (0.165, 1.9), (0.001, 1.9)], 12, flute=12, flute_amp=0.07)
    s.torus((0, 0, 2.2), 0.17, 0.035)
    s.lathe((0, 0, 2.2), [(0.15, 0), (0.24, 0.1), (0.3, 0.24), (0.27, 0.34), (0.33, 0.4), (0.001, 0.4)], 16)
    s.box((0, 0, 2.68), (0.6, 0.6, 0.14), 0.025)
    s.micro(0.003, 10, 5)
    return p

# ---- Market stall: counter, four posts, sagging striped awning with a scalloped valance, bowls of goods, jars, a hanging balance. Tradition.
def stall(hi):
    p = parts(hi, 'wood', 'cloth', 'clay', 'goods', 'gold'); w = p['wood']; c = p['cloth']; cl = p['clay']; gd = p['goods']; au = p['gold']
    W = 1.6; D = 0.8
    w.box((0, 0, 0.4), (W - 0.1, D - 0.18, 0.78), 0.015); w.box((0, 0, 0.82), (W + 0.04, D, 0.06), 0.015)
    for k in range(7): w.box((-0.66 + k * 0.22, -(D - 0.18) / 2 - 0.005, 0.4), (0.005, 0.03, 0.74), 0.004)
    for sx in (-1, 1):
        for sy in (-1, 1):
            w.cyl((sx * (W / 2 - 0.04), sy * (D / 2 - 0.06), 1.17), 0.032, 0.036, 2.34, 8, 0.01); w.box((sx * (W / 2 - 0.04), sy * (D / 2 - 0.06), 2.32), (0.1, 0.1, 0.05), 0.01)
    for sy in (-1, 1): w.box((0, sy * (D / 2 - 0.06), 2.27), (W - 0.04, 0.05, 0.07), 0.01)
    for sx in (-1, 1): w.box((sx * (W / 2 - 0.04), 0, 2.27), (0.05, D - 0.1, 0.07), 0.01)
    w.box((0, D / 2 - 0.12, 1.25), (W - 0.2, 0.22, 0.035), 0.01); w.box((0, D / 2 - 0.02, 1.0), (W - 0.2, 0.03, 0.04), 0.01)
    w.micro(0.003, 26, 6)
    def awn(u, v):
        x = (u - 0.5) * (W + 0.3); y = -0.62 + v * 1.1; sag = -0.07 * (1 - (2 * u - 1) ** 2)
        return (x, y, 2.3 + 0.16 * v + sag + 0.012 * math.sin(u * 40 + v * 3))
    c.grid(awn, 26, 6)
    def val(u, v):
        x = (u - 0.5) * (W + 0.3); sc = 0.06 * abs(math.cos(u * 8 * math.pi))
        y = -0.62 - 0.01 * v; z = 2.3 + 0.0 - 0.07 * (1 - (2 * u - 1) ** 2) - v * (0.2 + sc)
        return (x, y, z + 0.012 * math.sin(u * 40))
    c.grid(val, 48, 3, True)
    def skirt(u, v):
        x = (u - 0.5) * (W - 0.05); return (x, -(D - 0.18) / 2 - 0.03 - 0.012 * math.sin(u * 60), 0.78 - v * 0.62 + 0.0)
    c.grid(skirt, 40, 3, True)
    for k in range(4):
        x = -0.55 + k * 0.37
        cl.lathe((x, 0.02, 0.85), [(0.001, 0), (0.09, 0.0), (0.135, 0.04), (0.15, 0.09), (0.13, 0.09), (0.001, 0.05)], 14)
        for m in range(9 if hi else 6): gd.sphere((x + 0.045 * math.cos(m * 2.4) * (m > 0), 0.02 + 0.045 * math.sin(m * 2.4) * (m > 0), 0.93 + 0.03 * (m // 5) + 0.01), 0.04, (1, 1, 0.9), 1)
    cl.lathe((-0.6, -0.15, 0.85), [(0.001, 0), (0.1, 0), (0.17, 0.12), (0.18, 0.22), (0.12, 0.34), (0.08, 0.4), (0.1, 0.44), (0.08, 0.46), (0.001, 0.42)], 14)
    cl.lathe((0.62, 0.0, 0.85), [(0.001, 0), (0.08, 0), (0.14, 0.1), (0.15, 0.2), (0.09, 0.3), (0.07, 0.34), (0.09, 0.37), (0.001, 0.34)], 14)
    au.cyl((0.4, 0.2, 1.85), 0.005, 0.005, 0.7, 6); au.box((0.4, 0.2, 1.52), (0.5, 0.012, 0.014), 0.004)
    for sx in (-1, 1): au.cyl((0.4 + sx * 0.23, 0.2, 1.3), 0.06, 0.02, 0.025, 12)
    return p

# ---- Two-wheeled cart with sacks. Tradition (bullock carts, no single date).
def cart(hi):
    p = parts(hi, 'wood', 'gold', 'cloth'); w = p['wood']; au = p['gold']; c = p['cloth']
    w.box((0, 0, 0.55), (1.9, 1.0, 0.07), 0.012)
    for sy in (-1, 1): w.box((0, sy * 0.5, 0.7), (1.9, 0.05, 0.25), 0.01); w.box((sy * 0.95, 0, 0.7), (0.05, 1.0, 0.25), 0.01)
    for sy in (-1, 1):
        w.cyl((0, sy * 0.62, 0.45), 0.07, 0.07, 0.07, 10, 0.01, (math.pi / 2, 0, 0))
        for k in range(8): w.box((0, sy * 0.62, 0.45), (0.06, 0.04, 0.82), 0.008, (0, k * math.pi / 8, 0))
        w.torus((0, sy * 0.62, 0.45), 0.4, 0.03, (math.pi / 2, 0, 0), 28, 6); au.torus((0, sy * 0.62, 0.45), 0.43, 0.012, (math.pi / 2, 0, 0), 28, 4)
        w.cyl((-1.25, sy * 0.28, 0.46), 0.03, 0.025, 1.2, 8, 0.005, (0, math.pi / 2 - 0.1, 0))
    w.cyl((0, 0, 0.45), 0.04, 0.04, 1.3, 8, 0.005, (math.pi / 2, 0, 0))
    w.micro(0.003, 20, 7)
    for i, (x, y) in enumerate(((-0.4, -0.2), (0.15, -0.22), (-0.3, 0.2), (0.3, 0.18), (0.0, 0.0))):
        c.lathe((x, y, 0.6 + (0.2 if i == 4 else 0)), [(0.001, 0), (0.2, 0.01), (0.27, 0.15), (0.24, 0.32), (0.13, 0.46), (0.08, 0.5), (0.13, 0.56), (0.001, 0.56)], 10, scale=(1.0, 0.8, 1))
    c.micro(0.004, 8, 8)
    return p

# ---- Hanging lantern with a brass cage and a lit glass core. Tradition (brass and glass lanterns are common). Invented profile.
def lantern(hi):
    p = parts(hi, 'gold', 'lit'); au = p['gold']; g = p['lit']
    au.lathe((0, 0, 0.3), [(0.001, 0), (0.12, 0), (0.09, 0.06), (0.03, 0.12), (0.001, 0.12)], 12)
    au.torus((0, 0, 0.44), 0.025, 0.007, (0, 0, 0)); au.cyl((0, 0, 0.1), 0.07, 0.05, 0.1, 10, 0.008)
    for k in range(6):
        a = k * math.pi / 3; au.box((0.098 * math.cos(a), 0.098 * math.sin(a), 0.22), (0.012, 0.012, 0.22), 0.003, (0, 0, a))
    au.torus((0, 0, 0.31), 0.1, 0.008); au.torus((0, 0, 0.145), 0.085, 0.008)
    g.lathe((0, 0, 0.15), [(0.001, 0), (0.07, 0.0), (0.095, 0.07), (0.09, 0.13), (0.06, 0.16), (0.001, 0.16)], 12)
    return p

def jar(hi):
    p = parts(hi, 'clay'); c = p['clay']
    c.lathe((0, 0, 0), [(0.001, 0), (0.1, 0), (0.18, 0.12), (0.23, 0.3), (0.2, 0.5), (0.12, 0.66), (0.1, 0.72), (0.14, 0.78), (0.12, 0.8), (0.09, 0.74), (0.001, 0.7)], 16)
    c.torus((0, 0, 0.3), 0.226, 0.012, maj=24)
    for sx in (-1, 1): c.torus((sx * 0.13, 0, 0.66), 0.07, 0.014, (math.pi / 2, 0, 0))
    c.micro(0.003, 12, 9)
    return p

def barrel(hi):
    p = parts(hi, 'wood', 'gold'); w = p['wood']; au = p['gold']
    w.lathe((0, 0, 0), [(0.001, 0), (0.24, 0), (0.3, 0.2), (0.33, 0.45), (0.3, 0.7), (0.24, 0.9), (0.001, 0.9)], 16, flute=24, flute_amp=0.03)
    for z, r in ((0.1, 0.26), (0.3, 0.315), (0.62, 0.315), (0.8, 0.26)): au.torus((0, 0, z), r + 0.005, 0.014, maj=24, minr=4)
    w.micro(0.003, 18, 10)
    return p

def crate(hi):
    p = parts(hi, 'wood'); w = p['wood']
    for sx in (-1, 1):
        for sy in (-1, 1): w.box((sx * 0.26, sy * 0.26, 0.2), (0.06, 0.06, 0.4), 0.01)
    for k in range(4):
        z = 0.06 + k * 0.1
        for sy in (-1, 1): w.box((0, sy * 0.28, z), (0.56, 0.025, 0.085), 0.006)
        for sx in (-1, 1): w.box((sx * 0.28, 0, z), (0.025, 0.56, 0.085), 0.006)
    w.box((0, 0, 0.03), (0.52, 0.52, 0.03), 0.006); w.micro(0.003, 22, 11)
    return p

def bench(hi):
    p = parts(hi, 'wood'); w = p['wood']
    for k in range(3): w.box((0, -0.12 + k * 0.12, 0.43), (1.4, 0.11, 0.04), 0.008)
    for sx in (-1, 1):
        w.box((sx * 0.6, 0, 0.2), (0.07, 0.4, 0.4), 0.01); w.box((sx * 0.6, 0, 0.38), (0.09, 0.44, 0.04), 0.01)
    w.box((0, 0, 0.18), (1.2, 0.05, 0.05), 0.008); w.micro(0.003, 20, 12)
    return p

def sack(hi):
    p = parts(hi, 'cloth'); c = p['cloth']
    c.lathe((0, 0, 0), [(0.001, 0), (0.16, 0.005), (0.23, 0.12), (0.21, 0.3), (0.12, 0.45), (0.07, 0.5), (0.11, 0.56), (0.06, 0.62), (0.001, 0.58)], 10, scale=(1, 0.85, 1)); c.micro(0.006, 7, 13)
    return p

def basket(hi):
    p = parts(hi, 'clay'); c = p['clay']
    c.lathe((0, 0, 0), [(0.001, 0), (0.13, 0), (0.2, 0.12), (0.24, 0.26), (0.25, 0.28), (0.23, 0.28), (0.001, 0.2)], 18, flute=18, flute_amp=0.025)
    c.micro(0.004, 16, 14)
    return p

# ---- Street banner on a pole with a gilt finial. Tradition (processional and temple banners); our own design.
def banner(hi):
    p = parts(hi, 'wood', 'cloth', 'gold'); w = p['wood']; c = p['cloth']; au = p['gold']
    w.cyl((0, 0, 1.6), 0.04, 0.03, 3.2, 8, 0.008); w.box((0, 0, 3.0), (0.62, 0.035, 0.035), 0.006)
    def flag(u, v):
        return ((u - 0.5) * 0.56 + 0.03 * math.sin(v * 5 + u * 2) * v, -0.04 - 0.02 * math.sin(u * 6 + v * 4), 2.98 - v * 1.2 + (0.05 * abs(math.cos(u * 3 * math.pi)) if v > 0.9 else 0))
    c.grid(flag, 14, 18, True); c.grid(flag, 14, 18)
    au.cyl((0, 0, 3.28), 0.0, 0.05, 0.14, 8); au.sphere((0, 0, 3.2), 0.05, sub=1)
    for k in range(5): au.sphere(((k - 2) * 0.1, -0.04, 1.8), 0.025, sub=1)
    w.micro(0.002, 20, 15)
    return p

def rope(hi):
    p = parts(hi, 'cloth'); c = p['cloth']
    for k in range(3): c.torus((0, 0, 0.03 + k * 0.05), 0.18 - k * 0.01, 0.028, maj=22, minr=6)
    c.micro(0.004, 40, 16)
    return p

# ---- Tiled hip roof with a deep overhang, courses of curved tiles and a ridge cap. Tradition (clay tiles) / Invented profile. Scale in game to the footprint.
def roof_hip(hi):
    p = parts(hi, 'roof', 'wood'); r = p['roof']; w = p['wood']
    H = 0.55; half = 0.64; N = 11
    for s in range(4):
        def f(u, v, s=s):
            z = H * v; h = half * (1 - v) + 0.012
            vs = v * N; fr = vs - math.floor(vs); lip = 0.022 * (1 - fr) ** 2
            x = (u * 2 - 1) * h; d = h + lip + 0.011 * (0.5 + 0.5 * math.cos(x * 36)) * (1 - v)
            zz = z - 0.014 * fr
            a = s * math.pi / 2; ca = math.cos(a); sa = math.sin(a)
            return (x * ca - d * sa, x * sa + d * ca, zz + 0.07)
        r.grid(f, 26, N * 5)
    r.cyl((0, 0, 0.62), 0.06, 0.03, 0.16, 10, 0.01)
    w.box((0, 0, 0.06), (1.32, 1.32, 0.05), 0.01)
    for sx in (-1, 1): w.box((sx * 0.64, 0, 0.1), (0.04, 1.34, 0.08), 0.008); w.box((0, sx * 0.64, 0.1), (1.34, 0.04, 0.08), 0.008)
    r.micro(0.002, 18, 17, 1)
    return p

# ---- Door awning: a small sagging cloth canopy on two brackets. Tradition.
def awning(hi):
    p = parts(hi, 'cloth', 'wood'); c = p['cloth']; w = p['wood']
    def top(u, v): return ((u - 0.5) * 1.4, -v * 0.7, 0.35 - v * 0.2 - 0.05 * (1 - (2 * u - 1) ** 2) + 0.01 * math.sin(u * 40))
    c.grid(top, 24, 5)
    def val(u, v): return ((u - 0.5) * 1.4, -0.7 - 0.0, 0.15 - 0.05 * (1 - (2 * u - 1) ** 2) - v * (0.14 + 0.04 * abs(math.cos(u * 6 * math.pi))))
    c.grid(val, 36, 3, True)
    for sx in (-1, 1): w.box((sx * 0.62, -0.35, 0.18), (0.035, 0.8, 0.035), 0.006, (0.28, 0, 0)); w.box((sx * 0.62, -0.05, 0.05), (0.05, 0.1, 0.12), 0.008)
    return p

PIECES = dict(win=win, door=door, column=column, stall=stall, cart=cart, lantern=lantern, jar=jar, barrel=barrel, crate=crate, bench=bench, sack=sack, basket=basket, banner=banner, rope=rope, roof_hip=roof_hip, awning=awning)
