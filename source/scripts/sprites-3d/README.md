# Personnages 3D → images du jeu

1. Tripo Studio : image → modèle 3D, Retopo (20 000 triangles), Rig humanoïde (Mixamo),
   animations préréglées « inactif » + « marcher », export GLB 2k, squelette, **animation sur place**.
2. Placer `render.html`, `render_sheet.py`, three.js (dossier `three/`, r169) et le `.glb` dans un même dossier.
3. Rendu (caméra orthographique, 35°) : une ligne par direction (face, profil gauche, dos),
   colonne 0 = immobile, 1-8 = marche. Le profil droit = profil gauche en miroir (dans le jeu).
4. Recadrage commun + `public/chars/<kind>.webp`, puis renseigner `SPRITE_META` (render/bodies.ts)
   et ajouter le `kind` à `SPRITE_KINDS` (core/characters.ts).
