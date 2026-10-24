"""
Planche d'un personnage 3D pour le jeu.
Usage : python3 make_sheet.py <dossier_rendu> <glb> <kind>
  - <dossier_rendu> contient render.html, render_sheet.py et three/ (three.js r169)
  - écrit public/chars/<kind>.webp et affiche la ligne SPRITE_META à copier
Colonnes : 0 = immobile, 1-8 = marche, 9 = victoire, 10 = défaite, 11 = pose de bombe.
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
base = {"url": glb, "cell": C, "fit": FIT, "elev": 35, "dirs": ["down", "left", "up"]}
jobs = [
    [f"{D}/{KIND}_idle.png", {**base, "clip": "idle", "frames": 1}],
    [f"{D}/{KIND}_walk.png", {**base, "clip": "walk", "frames": 8}],
] + [[f"{D}/{KIND}_{n}.png", {**base, "clip": "idle", "frames": 1, "pose": p}] for n, p in POSES.items()]
subprocess.run(["python3", f"{D}/render_sheet.py", D, json.dumps(jobs)], check=True, cwd=D)
ims = [Image.open(j[0]) for j in jobs]
cell = lambda im, f, r: im.crop((f * C, r * C, (f + 1) * C, (r + 1) * C))
cells = [[cell(ims[0], 0, r)] + [cell(ims[1], f, r) for f in range(8)] + [cell(im, 0, r) for im in ims[2:]] for r in range(3)]
def bbox(cols):
    x0 = y0 = C; x1 = y1 = 0
    for row in cells:
        for im in (row[i] for i in cols):
            b = im.getbbox()
            if b: x0, y0, x1, y1 = min(x0, b[0]), min(y0, b[1]), max(x1, b[2]), max(y1, b[3])
    return x0 - 2, y0 - 2, x1 + 2, y1 + 2
x0, y0, x1, y1 = bbox(range(12))
_, by0, _, by1 = bbox(range(9))   # hauteur du corps seul (immobile + marche)
w, h = x1 - x0, y1 - y0
sheet = Image.new("RGBA", (w * 12, h * 3), (0, 0, 0, 0))
for r, row in enumerate(cells):
    for f, im in enumerate(row): sheet.paste(im.crop((x0, y0, x1, y1)), (f * w, r * h))
out = f"{ROOT}/public/chars/{KIND}.webp"
sheet.save(out, "WEBP", quality=90, method=6)
fb = cells[0][0].getbbox()
prev = Image.new("RGBA", sheet.size, (78, 110, 64, 255)); prev.alpha_composite(sheet); prev.convert("RGB").save(f"{D}/{KIND}_preview.png")
print(f'  {KIND}: {{ w: {w}, h: {h}, bh: {by1 - by0}, foot: {round((fb[3] - y0) / h, 4)}, cx: {round((C / 2 - x0) / w, 4)}, walk: 8 }},', os.path.getsize(out) // 1024, "Ko")
