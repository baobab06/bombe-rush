/**
 * Registre des personnages et de leurs skins — PUREMENT DES DONNÉES.
 *
 * - Un personnage = une silhouette (`kind`, dessinée par render/bodies.ts).
 * - Un skin = palette + tenue (accessoires) + motif + aura. 100 % cosmétique :
 *   aucune stat n'en dépend, la simulation ne lit jamais ces champs.
 * - Les skins « thématiques » (pirate, plage, volcan…) sont générés pour
 *   chaque personnage à partir de THEMES : ajouter un thème = une entrée,
 *   et il apparaît automatiquement pour tous les personnages, en boutique
 *   et dans la collection.
 * - Le prix d'un skin dépend de sa rareté (voir meta/economy.ts) sauf
 *   s'il précise `price`.
 */
/** personnages 3D (images rendues depuis un modèle Tripo) */
export type SpriteKind = "blaze" | "nova" | "zoe" | "jax";
export type BodyKind = "fox" | "robot" | "frog" | "ninja" | "mushroom" | "bear" | "penguin" | SpriteKind;
/**
 * Personnages modélisés en 3D (Tripo) puis rendus en images (public/chars/<kind>.webp).
 * Ils ne sont pas dessinés par des formes : pas de skins « thématiques » recolorés.
 */
export const SPRITE_KINDS: readonly BodyKind[] = ["blaze", "nova", "zoe", "jax"];
export const isSpriteKind = (k: BodyKind): boolean => SPRITE_KINDS.includes(k);
export type Rarity = "common" | "rare" | "epic" | "legend";

/** Objets portés. Le « slot » évite d'empiler deux chapeaux. */
export type Accessory =
  | "none"
  | "crown"
  | "glasses"
  | "scarf"
  | "flower"
  | "headphones"
  | "pirate"
  | "eyepatch"
  | "bandana"
  | "shades"
  | "visor"
  | "helmet"
  | "halo"
  | "horns"
  | "beanie"
  | "lei"
  | "tophat"
  | "bow"
  | "cap";
export type WearSlot = "head" | "face" | "neck";
export const WEAR_SLOT: Record<Exclude<Accessory, "none">, WearSlot> = {
  crown: "head",
  pirate: "head",
  helmet: "head",
  halo: "head",
  horns: "head",
  beanie: "head",
  tophat: "head",
  cap: "head",
  headphones: "head",
  flower: "head",
  bow: "head",
  glasses: "face",
  eyepatch: "face",
  shades: "face",
  visor: "face",
  bandana: "face",
  scarf: "neck",
  lei: "neck",
};

/** Motif appliqué sur le corps (dessiné par-dessus, sans toucher au visage). */
export type Pattern = "none" | "panda" | "cracks" | "frost" | "galaxy" | "stripes" | "circuit" | "spots";
/** Effet d'ambiance autour du personnage (même à l'arrêt). */
export type AuraId = "none" | "leaves" | "embers" | "snow" | "sparkle" | "stars" | "bubbles" | "bolts" | "smoke" | "cosmos" | "petals" | "hearts";
export type EyeStyle = "normal" | "cartoon" | "glow";

export interface Palette {
  main: string; // couleur dominante (sert aussi d'identifiant visuel dans le HUD)
  dark: string; // ombres, pieds
  light: string; // ventre, museau, reflets
  accent: string; // détail signature (oreilles, bandeau, points…)
}

export interface CharacterDef {
  id: string;
  name: string;
  kind: BodyKind;
  tagline: string;
  /** phrase de présentation (écran Personnage) */
  bio: string;
  /** personnage à débloquer en boutique (sinon offert) */
  locked?: boolean;
  rarity?: Rarity;
  stats?: Partial<{ speed: number; bombs: number; range: number }>;
}

export interface SkinDef {
  id: string;
  characterId: string;
  name: string;
  /** thème (sert aux filtres et aux descriptions) */
  theme: string;
  rarity: Rarity;
  /** skin d'origine, offert */
  free?: boolean;
  /** prix forcé (sinon : prix de la rareté) */
  price?: number;
  palette: Palette;
  wear: Accessory[];
  pattern: Pattern;
  aura: AuraId;
  eyes?: EyeStyle;
  /** reflet doré qui balaie le corps / couleurs animées */
  special?: "shimmer" | "rainbow";
  desc?: string;
  /** personnage 3D : nom de la planche d'image (chars/<sprite>.webp) */
  sprite?: string;
  /** skin exclusif (non vendu en boutique) : comment il se débloque */
  exclusive?: "mastery";
}

/**
 * Personnages jouables. Les anciens (Flamme, Boulon, Rainette, Kage, Champi,
 * Bruno, Pingo) ont été retirés en 1.7.0 : leurs dessins restent dans
 * render/bodies.ts mais ils ne sont plus proposés (achats remboursés, meta/save.ts).
 */
export const CHARACTERS: CharacterDef[] = [
  { id: "blaze", name: "Blaze", kind: "blaze", tagline: "Bagarreur au bandeau", bio: "Le poing serré, le bandeau rouge, et toujours une bombe d'avance." },
  { id: "nova", name: "Nova", kind: "nova", tagline: "Hackeuse néon", bio: "Lunettes sur le front, baskets qui brillent : elle pirate l'arène à coups de bombes." },
  { id: "zoe", name: "Zoe", kind: "zoe", tagline: "Boxeuse étoile", bio: "Deux chignons, deux gants, zéro pitié : elle cogne aussi fort que ses bombes." },
  { id: "jax", name: "Jax", kind: "jax", tagline: "Fantôme de la rue", bio: "Capuche jaune, casquette à tête de mort : on ne voit jamais son visage, seulement ses bombes." },
];

const P = (main: string, dark: string, light: string, accent: string): Palette => ({ main, dark, light, accent });

// ------------------------------------------------------------ skins d'origine
interface BaseSkin {
  name: string;
  palette: Palette;
  wear?: Accessory[];
  aura?: AuraId;
  pattern?: Pattern;
}
const CLASSIC: Record<string, BaseSkin> = {
  blaze: { name: "Classique", palette: P("#e8343a", "#7a1418", "#ffd9b8", "#2a1d1d") },
  nova: { name: "Classique", palette: P("#ff3fb4", "#8a1460", "#ffe0ec", "#3fd8ff") },
  zoe: { name: "Classique", palette: P("#b44dff", "#5a1c8f", "#ffe9cc", "#ff4fd8") },
  jax: { name: "Classique", palette: P("#ffc61a", "#8a6200", "#fff3c4", "#1d1d1d") },
  renard: { name: "Classique", palette: P("#ff8a2b", "#c4520c", "#fff1df", "#3a2418"), aura: "leaves" },
  boulon: { name: "Classique", palette: P("#5aa0ff", "#2c5fb8", "#d6e8ff", "#ffd23f") },
  rainette: { name: "Classique", palette: P("#4fd46a", "#22893c", "#e8ffd0", "#1f6e33") },
  kage: { name: "Classique", palette: P("#3b3f6b", "#1e2140", "#ffd9b8", "#ff4b4b") },
  champi: { name: "Classique", palette: P("#ff4d4d", "#b81c2a", "#fff3e0", "#ffffff") },
  bruno: { name: "Classique", palette: P("#a8693a", "#6b3e1c", "#f2d2a8", "#3a2414") },
  pingo: { name: "Classique", palette: P("#2f3e5c", "#18223a", "#ffffff", "#ffb020"), wear: ["scarf"] },
};

/** Skins historiques (V1) : on les garde tous, avec leurs identifiants. */
const LEGACY: (BaseSkin & { id: string; characterId: string; rarity: Rarity })[] = [
  { id: "renard-arctique", characterId: "renard", name: "Arctique", rarity: "rare", palette: P("#e9f4ff", "#9cb8d6", "#ffffff", "#3e5f8a"), wear: ["scarf"], aura: "snow" },
  { id: "renard-ombre", characterId: "renard", name: "Ombre", rarity: "epic", palette: P("#5b3d8f", "#341f5c", "#d8c9ff", "#ff5fa2"), wear: ["glasses"], aura: "smoke" },
  { id: "boulon-rouille", characterId: "boulon", name: "Rouille", rarity: "rare", palette: P("#c8743f", "#7f4120", "#f2cfae", "#5fe0c0"), pattern: "spots" },
  { id: "boulon-neon", characterId: "boulon", name: "Néon", rarity: "epic", palette: P("#2a2a3d", "#141422", "#5d5d80", "#ff3fb4"), wear: ["headphones"], aura: "bolts" },
  { id: "rainette-tropic", characterId: "rainette", name: "Tropicale", rarity: "rare", palette: P("#2fb7ff", "#1470b8", "#fff27a", "#ff8a1f"), wear: ["flower"], aura: "bubbles" },
  { id: "rainette-lave", characterId: "rainette", name: "Lave", rarity: "epic", palette: P("#ff4b3a", "#a8180f", "#ffd06a", "#2a1010"), aura: "embers" },
  { id: "rainette-royale", characterId: "rainette", name: "Royale", rarity: "legend", palette: P("#9a5cff", "#5c2bb8", "#f0e2ff", "#ffcc33"), wear: ["crown"], aura: "sparkle" },
  { id: "kage-neige", characterId: "kage", name: "Neige", rarity: "rare", palette: P("#eef2f7", "#a9b4c4", "#ffd9b8", "#3fa2ff"), aura: "snow" },
  { id: "kage-sakura", characterId: "kage", name: "Sakura", rarity: "epic", palette: P("#ff86b8", "#c4467c", "#ffe0cc", "#ffffff"), wear: ["flower"], aura: "petals" },
  { id: "champi-cepe", characterId: "champi", name: "Cèpe", rarity: "rare", palette: P("#9a5a2c", "#5e3214", "#fff0d6", "#d9a76b"), aura: "leaves" },
  { id: "champi-lumi", characterId: "champi", name: "Lumi", rarity: "epic", palette: P("#3fe0e0", "#14808f", "#f2ffff", "#d8ff5a"), wear: ["glasses"], aura: "sparkle", },
  { id: "bruno-panda", characterId: "bruno", name: "Panda", rarity: "rare", palette: P("#f6f6f2", "#2b2b2b", "#ffffff", "#2b2b2b"), pattern: "panda", aura: "leaves" },
  { id: "bruno-polaire", characterId: "bruno", name: "Polaire", rarity: "epic", palette: P("#e8f6ff", "#9cc4dc", "#ffffff", "#2a3a4a"), wear: ["scarf"], aura: "snow" },
];

// ------------------------------------------------------------ thèmes
export interface ThemeDef {
  id: string;
  name: string;
  rarity: Rarity;
  desc: string;
  palette: Palette;
  /** ajustements par silhouette (ex. le ninja garde un visage clair) */
  perKind?: Partial<Record<BodyKind, Partial<Palette>>>;
  wear: Accessory[];
  pattern: Pattern;
  aura: AuraId;
  eyes?: EyeStyle;
  special?: SkinDef["special"];
}

export const THEMES: ThemeDef[] = [
  {
    id: "plage", name: "Plage", rarity: "common", desc: "Lunettes de soleil, collier de fleurs et bulles de mer.",
    palette: P("#2ec4b6", "#178a80", "#fff3c4", "#ff6b6b"), wear: ["shades", "lei"], pattern: "none", aura: "bubbles",
  },
  {
    id: "cartoon", name: "Cartoon", rarity: "common", desc: "Grands yeux, gros contours, zéro sérieux.",
    palette: P("#ff7eb6", "#d14f8a", "#ffffff", "#4cc9f0"), wear: ["bow"], pattern: "spots", aura: "hearts", eyes: "cartoon",
  },
  {
    id: "pirate", name: "Pirate", rarity: "rare", desc: "Tricorne, cache-œil et marinière. À l'abordage !",
    palette: P("#3d5a80", "#24344d", "#f4e1c1", "#e63946"), wear: ["pirate", "eyepatch"], pattern: "stripes", aura: "none",
  },
  {
    id: "ninja", name: "Ninja", rarity: "rare", desc: "Masque de l'ombre et nuage de fumée.",
    palette: P("#2b2d42", "#14151f", "#ffd9b8", "#e63946"), perKind: { ninja: { main: "#1a1a24", accent: "#9b5de5" } },
    wear: ["bandana"], pattern: "none", aura: "smoke",
  },
  {
    id: "robot", name: "Mécano", rarity: "rare", desc: "Carrosserie chromée et petits éclairs.",
    palette: P("#b8c4cf", "#6c7a89", "#eef3f7", "#00d4ff"), perKind: { robot: { main: "#ffb703", dark: "#b86e00" } },
    wear: ["helmet"], pattern: "circuit", aura: "bolts",
  },
  {
    id: "futur", name: "Futuriste", rarity: "epic", desc: "Visière néon et circuits lumineux venus de l'an 3000.",
    palette: P("#1b1f3b", "#0b0d1f", "#7df9ff", "#ff2bd6"), wear: ["visor"], pattern: "circuit", aura: "bolts", eyes: "glow",
  },
  {
    id: "volcan", name: "Volcan", rarity: "epic", desc: "Une peau de roche fissurée de lave… et des braises partout.",
    palette: P("#3a1c1c", "#1e0e0e", "#ffb347", "#ff4d00"), wear: ["horns"], pattern: "cracks", aura: "embers",
  },
  {
    id: "glace", name: "Glacé", rarity: "epic", desc: "Givré de la tête aux pieds. Attention, ça glisse.",
    palette: P("#bde0fe", "#7fa7d6", "#ffffff", "#3a86ff"), wear: ["beanie"], pattern: "frost", aura: "snow",
  },
  {
    id: "or", name: "Doré", rarity: "legend", desc: "Or massif, couronne et éclats scintillants.",
    palette: P("#ffcc33", "#c98a10", "#fff4c2", "#8a5a00"), wear: ["crown"], pattern: "none", aura: "sparkle", special: "shimmer",
  },
  {
    id: "galaxie", name: "Galaxie", rarity: "legend", desc: "Skin spécial : un ciel étoilé vivant et une auréole cosmique.",
    palette: P("#2a1b5c", "#120a2e", "#c8b6ff", "#ff7ad9"), wear: ["halo"], pattern: "galaxy", aura: "cosmos", eyes: "glow", special: "rainbow",
  },
];

/** Skins des personnages 3D (planches recolorées : scripts/sprites-3d/recolor.py). */
const SPRITE_SKINS: Record<string, { id: string; name: string; rarity: Rarity; main: string; desc: string }[]> = {
  blaze: [
    { id: "glace", name: "Glace", rarity: "rare", main: "#2f8fe0", desc: "Blaze version banquise : même fougue, tenue bleu glacier." },
    { id: "toxique", name: "Toxique", rarity: "epic", main: "#3ccf3c", desc: "Une tenue vert radioactif, à ne pas toucher." },
  ],
  nova: [
    { id: "menthe", name: "Menthe", rarity: "rare", main: "#2ee6c8", desc: "Nova en version menthe fraîche." },
    { id: "soleil", name: "Soleil", rarity: "epic", main: "#ffd23f", desc: "Toute dorée, elle brille comme le soleil." },
  ],
  zoe: [
    { id: "braise", name: "Braise", rarity: "rare", main: "#e8343a", desc: "Zoe se met au rouge braise." },
    { id: "ocean", name: "Océan", rarity: "epic", main: "#1fb5e0", desc: "Une tenue bleu lagon, fraîche comme l'océan." },
  ],
  jax: [
    { id: "ombre", name: "Ombre", rarity: "rare", main: "#6b6b75", desc: "Jax tout en gris : discret comme une ombre." },
    { id: "neon", name: "Néon", rarity: "epic", main: "#e040ff", desc: "Un sweat violet néon qui ne passe pas inaperçu." },
  ],
};

function buildSkins(): SkinDef[] {
  const out: SkinDef[] = [];
  for (const c of CHARACTERS) {
    const base = CLASSIC[c.id];
    out.push({
      id: c.id, characterId: c.id, name: base.name, theme: "classique", rarity: "common", free: true,
      palette: base.palette, wear: base.wear ?? [], pattern: base.pattern ?? "none", aura: base.aura ?? "none",
      desc: "La tenue d'origine.",
    });
    // personnage 3D : variantes de couleur du modèle (planches pré-rendues)
    if (isSpriteKind(c.kind)) {
      for (const v of SPRITE_SKINS[c.id] ?? []) {
        out.push({
          id: `${c.id}-${v.id}`, characterId: c.id, name: v.name, theme: v.id, rarity: v.rarity,
          palette: { ...base.palette, main: v.main }, wear: [], pattern: "none", aura: "none",
          desc: v.desc, sprite: `${c.kind}-${v.id}`,
        });
      }
      continue;
    }
    for (const l of LEGACY.filter((s) => s.characterId === c.id)) {
      out.push({
        id: l.id, characterId: c.id, name: l.name, theme: "collection", rarity: l.rarity, palette: l.palette,
        wear: l.wear ?? [], pattern: l.pattern ?? "none", aura: l.aura ?? "none", desc: "Édition originale.",
        special: l.rarity === "legend" ? "shimmer" : undefined,
      });
    }
    for (const t of THEMES) {
      out.push({
        id: `${c.id}-${t.id}`, characterId: c.id, name: t.name, theme: t.id, rarity: t.rarity,
        palette: { ...t.palette, ...(t.perKind?.[c.kind] ?? {}) }, wear: [...t.wear], pattern: t.pattern, aura: t.aura,
        eyes: t.eyes, special: t.special, desc: t.desc,
      });
    }
    // skin de maîtrise (niveau 30 du personnage) : ses couleurs + finitions or
    out.push({
      id: `${c.id}-maitre`, characterId: c.id, name: "Maître", theme: "maitrise", rarity: "legend",
      palette: { ...base.palette, accent: "#ffd23f" }, wear: ["crown"], pattern: "stripes", aura: "stars", eyes: "glow", special: "shimmer",
      desc: `Exclusif : atteins le niveau 30 de maîtrise avec ${c.name}.`, exclusive: "mastery",
    });
  }
  return out;
}

export const SKINS: SkinDef[] = buildSkins();

export function getCharacter(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

export function skinsOf(characterId: string): SkinDef[] {
  return SKINS.filter((s) => s.characterId === characterId);
}

/** Skin demandé s'il appartient bien au personnage, sinon son skin de base. */
export function getSkin(characterId: string, skinId?: string): SkinDef {
  const c = getCharacter(characterId);
  return SKINS.find((s) => s.id === skinId && s.characterId === c.id) ?? skinsOf(c.id)[0];
}

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "Commun",
  rare: "Rare",
  epic: "Épique",
  legend: "Légendaire",
};
export const RARITY_ORDER: Rarity[] = ["common", "rare", "epic", "legend"];
