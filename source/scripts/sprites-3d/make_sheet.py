"""
Planche d'un personnage 3D pour le jeu.
Usage : python3 make_sheet.py <dossier_rendu> <glb> <kind>
  - <dossier_rendu> contient render.html, render_sheet.py et three/ (three.js r169)
  - écrit public/chars/<kind>.webp et affiche la ligne SPRITE_META à copier
"""
import sys, json, os, subprocess
from PIL import Image
D, GLB, KIND = sys.argv[1], sys.argv[2], sys.argv[3]
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
C = 256
glb = os.path.basename(GLB)
jobs = [
    [f"{D}/{KIND}_idle.png", {"url": glb, "clip": "idle", "frames": 1, "cell": C, "elev": 35, "dirs": ["down", "left", "up"]}],
    [f"{D}/{KIND}_walk.png", {"url": glb, "clip": "walk", "frames": 8, "cell": C, "elev": 35, "dirs": ["down", "left", "up"]}],
]
subprocess.run(["python3", f"{D}/render_sheet.py", D, json.dumps(jobs)], check=True, cwd=D)
idle = Image.open(jobs[0][0]); walk = Image.open(jobs[1][0])
cells = [[idle.crop((0, r * C, C, (r + 1) * C))] + [walk.crop((f * C, r * C, (f + 1) * C, (r + 1) * C)) for f in range(8)] for r in range(3)]
x0 = y0 = C; x1 = y1 = 0
for row in cells:
    for im in row:
        b = im.getbbox()
        if b: x0, y0, x1, y1 = min(x0, b[0]), min(y0, b[1]), max(x1, b[2]), max(y1, b[3])
x0 -= 2; y0 -= 2; x1 += 2; y1 += 2
w, h = x1 - x0, y1 - y0
sheet = Image.new("RGBA", (w * 9, h * 3), (0, 0, 0, 0))
for r, row in enumerate(cells):
    for f, im in enumerate(row): sheet.paste(im.crop((x0, y0, x1, y1)), (f * w, r * h))
out = f"{ROOT}/public/chars/{KIND}.webp"
sheet.save(out, "WEBP", quality=90, method=6)
fb = cells[0][0].getbbox()
prev = Image.new("RGBA", sheet.size, (78, 110, 64, 255)); prev.alpha_composite(sheet); prev.convert("RGB").save(f"{D}/{KIND}_preview.png")
print(f'  {KIND}: {{ w: {w}, h: {h}, foot: {round((fb[3] - y0) / h, 4)}, cx: {round((C / 2 - x0) / w, 4)}, walk: 8 }},', os.path.getsize(out) // 1024, "Ko")
