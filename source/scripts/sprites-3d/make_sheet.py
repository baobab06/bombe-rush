"""
Planche d'un personnage 3D pour le jeu.
Usage : python3 make_sheet.py <dossier_rendu> <glb> <kind>
  - <dossier_rendu> contient render.html, render_sheet.py et three/ (three.js r169)
  - écrit public/chars/<kind>.webp et affiche la ligne SPRITE_META à copier
Colonnes : immobile (IDLE images), marche (8), victoire (WIN images), défaite (1), pose de bombe (1).
Lignes : face, profil gauche, dos.
"""
import sys, json, os, subprocess
from PIL import Image
D, GLB, KIND = sys.argv[1], sys.argv[2], sys.argv[3]
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
C = 320          # case de rendu (marge pour les bras levés)
FIT = 1.25       # même échelle qu'une case de 256 à fit 1
glb = os.path.basename(GLB)
M = lambda d: {**{k.replace("Left", "Right"): [-v[0], v[1], v[2]] for k, v in d.items() if "Left" in k}, **d}
POSES = {
    "win": M({"LeftArm": [0.8, 1, 0.15], "LeftForeArm": [0.35, 1, 0.15], "Head": [0, 1, -0.15]}),
    "lose": M({"Spine": [0, 1, 0.1], "Spine1": [0, 1, 0.16], "Neck": [0, 1, 0.25], "Head": [0, 1, 0.38],
               "LeftArm": [0.2, -1, 0.15], "LeftForeArm": [0.1, -1, 0.25],
               "LeftUpLeg": [0.12, -1, 0.25], "LeftLeg": [0.05, -1, -0.2]}),
    "bomb": M({"Spine": [0, 1, 0.18], "Spine1": [0, 1, 0.22], "Head": [0, 1, 0.05], "LeftArm": [0.35, -0.3, 1], "LeftForeArm": [0.15, -0.35, 1],
               "LeftUpLeg": [0.22, -0.6, 0.75], "LeftLeg": [0.05, -0.9, -0.45]}),
}
# réglages par personnage : images d'attente, images de victoire, retouches des os
WIN_ANIM = [
    M({"LeftArm": [0.8, 1, 0.15], "LeftForeArm": [0.35, 1, 0.15], "Head": [0, 1, -0.15]}),
    {**M({"Head": [0, 1, -0.15]}), "LeftArm": [0.25, 1, 0.1], "LeftForeArm": [0.1, 1, 0.1], "RightArm": [-1, 0.15, 0.4], "RightForeArm": [-0.2, 1, 0.3]},
    M({"LeftArm": [0.8, 1, 0.15], "LeftForeArm": [0.35, 1, 0.15], "Head": [0, 1, -0.15]}),
    {**M({"Head": [0, 1, -0.15]}), "RightArm": [-0.25, 1, 0.1], "RightForeArm": [-0.1, 1, 0.1], "LeftArm": [1, 0.15, 0.4], "LeftForeArm": [0.2, 1, 0.3]},
]
CFG = {
    "blaze": {"idle": 6, "win": WIN_ANIM, "tweak": {"RightArm": [0, 0, 1, -14], "LeftArm": [0, 0, 1, 14]}},
}.get(KIND, {})
IDLE = CFG.get("idle", 1)
WIN = CFG.get("win", [POSES["win"]])
TWEAK = CFG.get("tweak")
base = {"url": glb, "cell": C, "fit": FIT, "elev": 35, "dirs": ["down", "left", "up"]}
tw = {"tweak": TWEAK} if TWEAK else {}
jobs = [
    [f"{D}/{KIND}_idle.png", {**base, **tw, "clip": "idle", "frames": IDLE}],
    [f"{D}/{KIND}_walk.png", {**base, **tw, "clip": "walk", "frames": 8}],
    [f"{D}/{KIND}_win.png", {**base, "clip": "idle", "frames": len(WIN), "poses": WIN}],
    [f"{D}/{KIND}_lose.png", {**base, "clip": "idle", "frames": 1, "pose": POSES["lose"]}],
    [f"{D}/{KIND}_bomb.png", {**base, "clip": "idle", "frames": 1, "pose": POSES["bomb"]}],
]
subprocess.run(["python3", f"{D}/render_sheet.py", D, json.dumps(jobs)], check=True, cwd=D)
ims = [Image.open(j[0]) for j in jobs]
cell = lambda im, f, r: im.crop((f * C, r * C, (f + 1) * C, (r + 1) * C))
NCOL = IDLE + 8 + len(WIN) + 2
cells = [[cell(ims[0], f, r) for f in range(IDLE)] + [cell(ims[1], f, r) for f in range(8)] + [cell(ims[2], f, r) for f in range(len(WIN))]
         + [cell(ims[3], 0, r), cell(ims[4], 0, r)] for r in range(3)]
def bbox(cols):
    x0 = y0 = C; x1 = y1 = 0
    for row in cells:
        for im in (row[i] for i in cols):
            b = im.getbbox()
            if b: x0, y0, x1, y1 = min(x0, b[0]), min(y0, b[1]), max(x1, b[2]), max(y1, b[3])
    return x0 - 2, y0 - 2, x1 + 2, y1 + 2
x0, y0, x1, y1 = bbox(range(NCOL))
_, by0, _, by1 = bbox(range(IDLE + 8))   # hauteur du corps seul (immobile + marche)
w, h = x1 - x0, y1 - y0
sheet = Image.new("RGBA", (w * NCOL, h * 3), (0, 0, 0, 0))
for r, row in enumerate(cells):
    for f, im in enumerate(row): sheet.paste(im.crop((x0, y0, x1, y1)), (f * w, r * h))
out = f"{ROOT}/public/chars/{KIND}.webp"
sheet.save(out, "WEBP", quality=90, method=6)
fb = cells[0][0].getbbox()
prev = Image.new("RGBA", sheet.size, (78, 110, 64, 255)); prev.alpha_composite(sheet); prev.convert("RGB").save(f"{D}/{KIND}_preview.png")
print(f'  {KIND}: {{ w: {w}, h: {h}, bh: {by1 - by0}, foot: {round((fb[3] - y0) / h, 4)}, cx: {round((C / 2 - x0) / w, 4)}, idle: {IDLE}, walk: 8, win: {len(WIN)} }},', os.path.getsize(out) // 1024, "Ko")
