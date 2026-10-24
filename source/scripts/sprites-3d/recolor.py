"""
Variantes de couleur (skins) d'une planche de personnage 3D.
Usage : python3 recolor.py <kind> <suffixe> <teinte cible en degrés | ombre | or>
Écrit public/chars/<kind>-<suffixe>.webp. La peau, le blanc et le noir ne bougent pas.
"""
import sys, numpy as np
from PIL import Image

def hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(-1); mn = rgb.min(-1); d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rm = m & (mx == r); gm = m & (mx == g) & ~rm; bm = m & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = (b - r)[gm] / d[gm] + 2
    h[bm] = (r - g)[bm] / d[bm] + 4
    h = h * 60
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return h, s, mx

def rgb_of(h, s, v):
    h = (h % 360) / 60; i = np.floor(h).astype(int) % 6; f = h - np.floor(h)
    p = v * (1 - s); q = v * (1 - s * f); t = v * (1 - s * (1 - f))
    out = np.stack([
        np.choose(i, [v, q, p, p, t, v]),
        np.choose(i, [t, v, v, q, p, p]),
        np.choose(i, [p, p, t, v, v, q]),
    ], -1)
    return out

def recolor(kind, suffix, target, root="public/chars"):
    im = Image.open(f"{root}/{kind}.webp").convert("RGBA")
    a = np.asarray(im).astype(np.float32) / 255
    rgb, al = a[..., :3], a[..., 3]
    h, s, v = hsv(rgb)
    skin = (h > 5) & (h < 42) & (s > 0.12) & (s < 0.62) & (v > 0.45)
    colored = (al > 0.05) & (s > 0.22) & ~skin
    w = np.clip((s - 0.22) / 0.15, 0, 1) * colored  # fondu doux sur les gris
    if target == "ombre":
        nh, ns, nv = h, s * 0.18, v * 0.62
    elif target == "or":
        nh, ns, nv = np.full_like(h, 44), np.clip(s * 0.9 + 0.1, 0, 1), np.clip(v * 1.05, 0, 1)
    else:
        hh = h[colored & (al > 0.5)]
        ww = s[colored & (al > 0.5)]
        ang = np.deg2rad(hh)
        dom = np.rad2deg(np.arctan2((np.sin(ang) * ww).sum(), (np.cos(ang) * ww).sum())) % 360
        shift = float(target) - dom
        nh, ns, nv = h + shift, s, v
    new = rgb_of(nh, ns, nv)
    out = rgb * (1 - w[..., None]) + new * w[..., None]
    res = np.concatenate([out, al[..., None]], -1)
    Image.fromarray((np.clip(res, 0, 1) * 255).astype(np.uint8), "RGBA").save(f"{root}/{kind}-{suffix}.webp", "WEBP", quality=88, method=6)
    return f"{root}/{kind}-{suffix}.webp"

if __name__ == "__main__":
    print(recolor(sys.argv[1], sys.argv[2], sys.argv[3]))
