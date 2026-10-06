"""Génère les icônes de l'app et l'image d'aperçu des liens (public/*.png).
À relancer seulement si le visuel change :  python3 scripts/make-assets.py
(nécessite Playwright + Chromium et un build à jour dans dist/www)."""
import base64, subprocess, time, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
JS = ROOT / "dist" / "assets.js"
subprocess.run(["bun", "build", "scripts/assets-entry.ts", "--target=browser", "--format=iife", f"--outfile={JS}"], cwd=ROOT, check=True)

def save(data_url, name):
    (PUB / name).write_bytes(base64.b64decode(data_url.split(",", 1)[1]))

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.set_content("<html><body></body></html>")
    pg.add_script_tag(content=JS.read_text())
    for size, mask, name in [(512, False, "icon-512.png"), (192, False, "icon-192.png"), (180, True, "apple-touch-icon.png"), (512, True, "icon-maskable-512.png"), (64, False, "favicon.png")]:
        url = pg.evaluate(f"""() => {{ const c = document.createElement('canvas'); c.width = c.height = {size}; drawIcon(c, {str(mask).lower()}); return c.toDataURL('image/png'); }}""")
        save(url, name)
    # icônes Android (mipmaps + icône adaptative)
    RES = ROOT / "android" / "res"
    dens = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
    for d, f in dens.items():
        (RES / f"mipmap-{d}").mkdir(parents=True, exist_ok=True)
        for shape, base, name in [("square", 48, "ic_launcher.png"), ("round", 48, "ic_launcher_round.png"), ("foreground", 108, "ic_launcher_foreground.png"), ("background", 108, "ic_launcher_background.png")]:
            size = round(base * f)
            url = pg.evaluate(f"""() => {{ const c = document.createElement('canvas'); c.width = c.height = {size}; drawIcon(c, '{shape}'); return c.toDataURL('image/png'); }}""")
            (RES / f"mipmap-{d}" / name).write_bytes(base64.b64decode(url.split(",", 1)[1]))
    # aperçu des liens : l'écran d'accueil réel du jeu
    og = b.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
    og.goto((ROOT / "dist" / "www" / "index.html").as_uri())
    time.sleep(1.2)
    og.evaluate("localStorage.setItem('bomberush.profile', JSON.stringify({named: true, name: 'Joueur', starterGift: true, coins: 1250, daily: {last: '2099-01-01', streak: 1}}))")
    og.reload(); time.sleep(1.2)
    og.click("#boot"); time.sleep(1.5)
    og.evaluate("window.__bombeRush.modal.close()"); time.sleep(0.8)
    og.screenshot(path=str(PUB / "og.png"))
    b.close()
print("OK :", ", ".join(sorted(f.name for f in PUB.glob('*.png'))))
