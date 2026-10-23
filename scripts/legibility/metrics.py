"""Contrast and terrain-richness metrics from measure.mjs captures.

usage: python3 metrics.py DIR [DIR2]   (DIR2: print a before/after table)

Per shot (time of day x zoom x terrain), soldiers' pixels are found as the difference between
the frame with soldiers (A) and without (B). For each soldier:
  mean  = WCAG contrast between the soldier's average luminance (outline + fill + rim) and the
          terrain in a ring 1..7 px around it (from B).
  edge  = silhouette contrast: the outer 3 px contour band of the soldier as drawn; the larger of
          the WCAG contrasts of its dark side (10th percentile luminance, the ink) and its light
          side (90th percentile, the halo) against that same ring. >= 3 means the contour stands
          off the ground on at least one side all the way round.
Reported as the median over the squad and the worst soldier.
Terrain richness, from the B frames: mean HSV saturation, value range (L* p95 - p5), and
detail (mean local std-dev of L* in 7x7 windows: the busyness that competes with soldiers).
"""
import json, sys, os
import numpy as np
from PIL import Image


def lin(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lum(img):
    l = lin(img[..., :3].astype(np.float64))
    return 0.2126 * l[..., 0] + 0.7152 * l[..., 1] + 0.0722 * l[..., 2]


def lstar(Y):
    return np.where(Y > 0.008856, 116 * np.cbrt(Y) - 16, 903.3 * Y)


def ratio(a, b):
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


def dilate(m, r):
    out = m.copy()
    for _ in range(r):
        n = out.copy()
        n[1:, :] |= out[:-1, :]; n[:-1, :] |= out[1:, :]
        n[:, 1:] |= out[:, :-1]; n[:, :-1] |= out[:, 1:]
        out = n
    return out


def box(a, k):
    p = k // 2
    a = np.pad(a, p, mode='edge')
    c = a.cumsum(0).cumsum(1)
    c = np.pad(c, ((1, 0), (1, 0)))
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)


def sat(img):
    f = img[..., :3].astype(np.float64)
    mx, mn = f.max(-1), f.min(-1)
    return np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)


def shot_metrics(d, s):
    A = np.asarray(Image.open(f"{d}/{s['tag']}-A.png").convert('RGB'))
    B = np.asarray(Image.open(f"{d}/{s['tag']}-B.png").convert('RGB'))
    H, W = A.shape[:2]
    z = s['zoom']
    diff = np.abs(A.astype(int) - B.astype(int)).max(-1) > 30
    yy, xx = np.mgrid[0:H, 0:W]
    units = s['units']
    R = max(14, 46 * z) if z >= 0.55 else 30
    cy_off = 12 * z if z >= 0.55 else 8
    # Nearest-soldier assignment, inside a radius.
    best = np.full((H, W), -1)
    bd = np.full((H, W), 1e9)
    for i, u in enumerate(units):
        dd = np.hypot(xx - u['sx'], (yy - (u['sy'] - cy_off)) * 0.8)
        sel = (dd < R) & (dd < bd)
        best[sel] = i
        bd[sel] = dd[sel]
    mask_all = diff & (best >= 0)
    LA, LB = lum(A), lum(B)
    res = []
    for i, u in enumerate(units):
        m = mask_all & (best == i)
        if m.sum() < 6:
            continue
        ring = dilate(m, 7) & ~dilate(mask_all, 1)
        if ring.sum() < 6:
            ring = dilate(m, 10) & ~mask_all
        if ring.sum() < 6:
            continue
        band = dilate(~m, 3) & m
        tl = LB[ring].mean()
        bl = LA[band]
        # The contour carries the figure if its dark (ink) or its light (halo) side stands off the ground.
        edge = max(ratio(np.percentile(bl, 10), tl), ratio(np.percentile(bl, 90), tl))
        res.append((ratio(LA[m].mean(), tl), edge, u['kind']))
    if not res:
        return None
    mean = np.array([r[0] for r in res]); edge = np.array([r[1] for r in res])
    return dict(n=len(res), mean_med=float(np.median(mean)), mean_min=float(mean.min()), edge_med=float(np.median(edge)), edge_min=float(edge.min()))


def terrain_metrics(d, s):
    B = np.asarray(Image.open(f"{d}/{s['tag']}-B.png").convert('RGB'))
    L = lstar(lum(B))
    S = sat(B)
    sd = np.sqrt(np.maximum(box(L * L, 7) - box(L, 7) ** 2, 0))
    return dict(sat=float(S.mean()), vrange=float(np.percentile(L, 95) - np.percentile(L, 5)), detail=float(sd.mean()), Lmean=float(L.mean()))


def run(d):
    meta = json.load(open(f"{d}/meta.json"))
    rows = {}
    for s in meta['shots']:
        m = shot_metrics(d, s)
        t = terrain_metrics(d, s)
        rows[(s['tod'], s['zoom'], s['terrain'])] = (m, t)
    return rows


TOD = {0.02: 'dawn', 0.35: 'noon', 0.76: 'dusk', 0.92: 'night'}


def fmt(m, k):
    return '  -  ' if m is None else f"{m[k]:5.2f}"


if __name__ == '__main__':
    a = run(sys.argv[1])
    b = run(sys.argv[2]) if len(sys.argv) > 2 else None
    print('tod   zoom terrain | edge med/min        | mean med/min        | n')
    for key in sorted(a):
        tod, zoom, ter = key
        ma, ta = a[key]
        line = f"{TOD.get(tod, tod):5} {zoom:4} {ter:7} | {fmt(ma,'edge_med')}/{fmt(ma,'edge_min')}"
        if b and key in b:
            mb, tb = b[key]
            line += f" -> {fmt(mb,'edge_med')}/{fmt(mb,'edge_min')}"
        line += f" | {fmt(ma,'mean_med')}/{fmt(ma,'mean_min')}"
        if b and key in b:
            line += f" -> {fmt(mb,'mean_med')}/{fmt(mb,'mean_min')}"
        line += f" | {ma['n'] if ma else 0}" + (f"->{b[key][0]['n'] if b and key in b and b[key][0] else 0}" if b else '')
        print(line)
    print('\nterrain per time of day (B frames, mean over zooms and spots): sat | L* range p5-p95 | detail (local std L*) | mean L*')
    for tod in sorted({k[0] for k in a}):
        def agg(rows):
            ts = [rows[k][1] for k in rows if k[0] == tod]
            return {k: np.mean([t[k] for t in ts]) for k in ts[0]}
        ta = agg(a)
        line = f"{TOD.get(tod, tod):5} sat {ta['sat']:.3f} range {ta['vrange']:.1f} detail {ta['detail']:.2f} L* {ta['Lmean']:.1f}"
        if b:
            tb = agg(b)
            line += f"  ->  sat {tb['sat']:.3f} range {tb['vrange']:.1f} detail {tb['detail']:.2f} L* {tb['Lmean']:.1f}"
        print(line)
