/**
 * Cosmétiques hors skins : accessoires, effets (traînées) et emotes.
 * Uniquement des données ; le rendu vit dans render/, les prix dans
 * meta/economy.ts. Ajouter un objet = ajouter une ligne ici.
 */
import { CHARACTERS, type Accessory, type Rarity } from "./characters";

export interface AccessoryDef {
  id: string; // identifiant boutique (préfixe acc-)
  wear: Exclude<Accessory, "none">;
  name: string;
  rarity: Rarity;
  desc: string;
}

export const ACCESSORIES: AccessoryDef[] = [
  { id: "acc-cap", wear: "cap", name: "Casquette", rarity: "common", desc: "Visière vers l'avant, comme un pro." },
  { id: "acc-shades", wear: "shades", name: "Lunettes de soleil", rarity: "common", desc: "Trop cool pour regarder les explosions." },
  { id: "acc-scarf", wear: "scarf", name: "Écharpe", rarity: "common", desc: "Toute douce, elle flotte quand tu cours." },
  { id: "acc-bow", wear: "bow", name: "Gros nœud", rarity: "common", desc: "Mignon. Dangereux." },
  { id: "acc-beanie", wear: "beanie", name: "Bonnet", rarity: "common", desc: "Avec un pompon qui rebondit." },
  { id: "acc-flower", wear: "flower", name: "Fleur", rarity: "common", desc: "Une petite fleur qui tourne au vent." },
  { id: "acc-headphones", wear: "headphones", name: "Casque audio", rarity: "rare", desc: "Le son des bombes, en stéréo." },
  { id: "acc-pirate", wear: "pirate", name: "Tricorne", rarity: "rare", desc: "Le chapeau du capitaine." },
  { id: "acc-lei", wear: "lei", name: "Collier hawaïen", rarity: "rare", desc: "Aloha… BOUM." },
  { id: "acc-tophat", wear: "tophat", name: "Haut-de-forme", rarity: "epic", desc: "Pour exploser avec classe." },
  { id: "acc-horns", wear: "horns", name: "Cornes", rarity: "epic", desc: "Un petit air de démon." },
  { id: "acc-visor", wear: "visor", name: "Visière néon", rarity: "epic", desc: "Elle brille dans le noir." },
  { id: "acc-halo", wear: "halo", name: "Auréole", rarity: "legend", desc: "Un ange… qui pose des bombes." },
  { id: "acc-crown", wear: "crown", name: "Couronne", rarity: "legend", desc: "Réservée aux rois de l'arène." },
];

/** Effets : traînée en courant + éclat quand on pose une bombe. */
export type TrailKind = "dust" | "sparks" | "leaves" | "bubbles" | "snow" | "hearts" | "fire" | "bolts" | "notes" | "rainbow" | "stardust";
export interface TrailDef {
  id: string; // préfixe fx-
  kind: TrailKind;
  name: string;
  rarity: Rarity;
  desc: string;
  /** couleurs principales (aperçus, éclats) */
  colors: string[];
  /** offert d'office */
  free?: boolean;
}

export const TRAILS: TrailDef[] = [
  { id: "fx-dust", kind: "dust", name: "Poussière", rarity: "common", desc: "Le petit nuage classique.", colors: ["#e8dcc4", "#cbbd9f"], free: true },
  { id: "fx-sparks", kind: "sparks", name: "Étincelles", rarity: "common", desc: "Des étincelles à chaque pas.", colors: ["#ffe066", "#ff9f1c"] },
  { id: "fx-leaves", kind: "leaves", name: "Feuilles", rarity: "common", desc: "Un tourbillon de feuilles.", colors: ["#7bd389", "#3fa34d", "#c9e265"] },
  { id: "fx-bubbles", kind: "bubbles", name: "Bulles", rarity: "rare", desc: "Des bulles de savon qui flottent.", colors: ["#a0e7ff", "#ffffff"] },
  { id: "fx-snow", kind: "snow", name: "Flocons", rarity: "rare", desc: "Il neige sur ton passage.", colors: ["#ffffff", "#cfe8ff"] },
  { id: "fx-hearts", kind: "hearts", name: "Cœurs", rarity: "rare", desc: "Tout le monde t'aime (sauf tes ennemis).", colors: ["#ff5d8f", "#ffb3c6"] },
  { id: "fx-fire", kind: "fire", name: "Flammes", rarity: "epic", desc: "Tes pas laissent des flammèches.", colors: ["#ffcf4a", "#ff6a1f", "#ff2e2e"] },
  { id: "fx-bolts", kind: "bolts", name: "Éclairs", rarity: "epic", desc: "Électrique !", colors: ["#7df9ff", "#ffffff", "#4361ee"] },
  { id: "fx-notes", kind: "notes", name: "Musique", rarity: "epic", desc: "Tu danses en esquivant.", colors: ["#c77dff", "#ffd60a", "#4cc9f0"] },
  { id: "fx-rainbow", kind: "rainbow", name: "Arc-en-ciel", rarity: "legend", desc: "Une traînée arc-en-ciel éclatante.", colors: ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#6a4c93"] },
  { id: "fx-stardust", kind: "stardust", name: "Poussière d'étoiles", rarity: "legend", desc: "Des étoiles filantes te suivent.", colors: ["#fff3b0", "#ffd60a", "#ffffff"] },
];

export interface EmoteDef {
  id: string; // préfixe emo-
  emoji: string;
  name: string;
  rarity: Rarity;
  anim: "pop" | "bounce" | "shake" | "spin" | "party" | "laugh" | "dance";
  free?: boolean;
  /** emote de moquerie : affiche aussi son texte au-dessus de la bulle */
  taunt?: boolean;
}

export const EMOTES: EmoteDef[] = [
  { id: "emo-hello", emoji: "👋", name: "Salut !", rarity: "common", anim: "shake", free: true },
  { id: "emo-gg", emoji: "👍", name: "GG", rarity: "common", anim: "bounce", free: true },
  { id: "emo-lol", emoji: "😂", name: "MDR", rarity: "common", anim: "bounce" },
  { id: "emo-cool", emoji: "😎", name: "Trop facile", rarity: "common", anim: "pop" },
  { id: "emo-angry", emoji: "😡", name: "Grrr !", rarity: "common", anim: "shake" },
  { id: "emo-cry", emoji: "😭", name: "Snif…", rarity: "common", anim: "bounce" },
  { id: "emo-love", emoji: "😍", name: "Trop beau", rarity: "rare", anim: "pop" },
  { id: "emo-bomb", emoji: "💣", name: "Attention !", rarity: "rare", anim: "shake" },
  { id: "emo-ghost", emoji: "👻", name: "Bouh !", rarity: "rare", anim: "spin" },
  { id: "emo-fire", emoji: "🔥", name: "En feu", rarity: "epic", anim: "bounce" },
  { id: "emo-crown", emoji: "👑", name: "Le roi", rarity: "epic", anim: "spin" },
  { id: "emo-party", emoji: "🎉", name: "La fête !", rarity: "legend", anim: "party" },
  // ---- moqueries (le texte s'affiche au-dessus de la bulle)
  { id: "emo-tongue", emoji: "😜", name: "Nananère !", rarity: "common", anim: "shake", taunt: true },
  { id: "emo-missed", emoji: "🤭", name: "Raté !", rarity: "common", anim: "laugh", taunt: true },
  { id: "emo-snail", emoji: "🐌", name: "Trop lent !", rarity: "rare", anim: "bounce", taunt: true },
  { id: "emo-clown", emoji: "🤡", name: "Le clown !", rarity: "rare", anim: "laugh", taunt: true },
  { id: "emo-yawn", emoji: "🥱", name: "Je m'ennuie…", rarity: "rare", anim: "pop", taunt: true },
  { id: "emo-chicken", emoji: "🐔", name: "Poule mouillée !", rarity: "epic", anim: "shake", taunt: true },
  { id: "emo-baby", emoji: "🍼", name: "Petit joueur", rarity: "epic", anim: "spin", taunt: true },
  { id: "emo-dance", emoji: "🕺", name: "Danse de la victoire", rarity: "legend", anim: "dance", taunt: true },
];

// --------------------------------------------------- effets d'explosion
/** Couleurs des explosions de TES bombes (cosmétique uniquement). */
export interface BoomDef {
  id: string; // préfixe boom-
  name: string;
  rarity: Rarity;
  desc: string;
  /** étincelles, fumée, onde de choc, éclair central */
  spark: string[];
  smoke: string[];
  ring: string;
  glow: string;
  /** petites formes en plus (confettis, flocons, étoiles…) */
  extra?: "confetti" | "snow" | "stars" | "hearts" | "bubbles";
  free?: boolean;
  /** objet exclusif (non vendu) : comment il se débloque */
  exclusive?: "mastery" | "achievement" | "level" | "chest" | "rank";
}
export const BOOMS: BoomDef[] = [
  { id: "boom-classic", name: "Classique", rarity: "common", desc: "La bonne vieille explosion orange.", spark: ["#ffe066", "#ff8a2a"], smoke: ["#e9e2d6", "#bdb4a6"], ring: "#ffb347", glow: "#fffbe0", free: true },
  { id: "boom-confetti", name: "Confettis", rarity: "common", desc: "Boum… et c'est la fête !", spark: ["#ff5d8f", "#ffd60a", "#4cc9f0", "#8ac926"], smoke: ["#fff0f6", "#e8e2ff"], ring: "#ff9ec4", glow: "#ffffff", extra: "confetti" },
  { id: "boom-toxic", name: "Toxique", rarity: "rare", desc: "Un nuage vert qui pique les yeux.", spark: ["#b8ff3a", "#4cd137"], smoke: ["#9be15d", "#5f8f3a"], ring: "#7bff6a", glow: "#eaffd0", extra: "bubbles" },
  { id: "boom-ice", name: "Givre", rarity: "rare", desc: "Une explosion glaciale pleine de flocons.", spark: ["#ffffff", "#9ad7ff"], smoke: ["#e6f4ff", "#b6d4ee"], ring: "#8fd3ff", glow: "#f2fbff", extra: "snow" },
  { id: "boom-love", name: "Coup de cœur", rarity: "epic", desc: "Ça explose… d'amour.", spark: ["#ff5d8f", "#ffb3c6"], smoke: ["#ffe0ea", "#ffc2d4"], ring: "#ff5d8f", glow: "#fff0f5", extra: "hearts" },
  { id: "boom-neon", name: "Néon", rarity: "epic", desc: "Rose et bleu électrique, comme en boîte.", spark: ["#ff3fb4", "#3ff0ff"], smoke: ["#3a2a5c", "#25204a"], ring: "#ff3fb4", glow: "#d6fbff" },
  { id: "boom-cosmic", name: "Cosmique", rarity: "legend", desc: "Une supernova en miniature.", spark: ["#c77dff", "#ffd60a", "#ffffff"], smoke: ["#2a1b5c", "#4b2a8f"], ring: "#c77dff", glow: "#fff3b0", extra: "stars" },
  // exclusifs
  { id: "boom-gold", name: "Pluie d'or", rarity: "legend", desc: "Réservé aux meilleurs : une explosion en or massif.", spark: ["#ffd23f", "#fff4c2", "#c98a10"], smoke: ["#fff1c4", "#e8c56a"], ring: "#ffd23f", glow: "#fffbe0", extra: "stars", exclusive: "rank" },
  { id: "boom-veteran", name: "Vétéran", rarity: "epic", desc: "Pour ceux qui ont joué des centaines de parties.", spark: ["#ff6a1f", "#ffcf4a", "#ffffff"], smoke: ["#5a5a5a", "#3a3a3a"], ring: "#ff6a1f", glow: "#fff0d0", exclusive: "achievement" },
];
export const DEFAULT_BOOM = "boom-classic";
export const getBoom = (id: string | null | undefined) => BOOMS.find((b) => b.id === id) ?? BOOMS[0];

// ------------------------------------------------------------------ titres
/** Titre affiché sous ton pseudo (menu, profil, fin de partie). */
export interface TitleDef {
  id: string; // préfixe title-
  name: string;
  rarity: Rarity;
  desc: string;
  free?: boolean;
  exclusive?: "mastery" | "achievement" | "level" | "chest" | "rank";
}
export const TITLES: TitleDef[] = [
  { id: "title-rookie", name: "Petit nouveau", rarity: "common", desc: "Tout le monde commence quelque part.", free: true },
  { id: "title-artificer", name: "Artificier", rarity: "rare", desc: "Atteins le niveau 10.", exclusive: "level" },
  { id: "title-veteran", name: "Vétéran", rarity: "epic", desc: "Atteins le niveau 25.", exclusive: "level" },
  { id: "title-legend", name: "Légende de l'arène", rarity: "legend", desc: "Atteins le niveau 50.", exclusive: "level" },
  { id: "title-centurion", name: "Centurion", rarity: "legend", desc: "Atteins le niveau 100.", exclusive: "level" },
  { id: "title-regular", name: "Habitué", rarity: "common", desc: "Joue 100 parties.", exclusive: "achievement" },
  { id: "title-champion", name: "Champion", rarity: "epic", desc: "Gagne 50 parties.", exclusive: "achievement" },
  { id: "title-unbeatable", name: "Invincible", rarity: "legend", desc: "Gagne 200 parties.", exclusive: "achievement" },
  { id: "title-demolisher", name: "Démolisseur", rarity: "rare", desc: "Détruis 5 000 blocs.", exclusive: "achievement" },
  { id: "title-hunter", name: "Chasseur", rarity: "rare", desc: "Élimine 250 adversaires.", exclusive: "achievement" },
  { id: "title-unstoppable", name: "Inarrêtable", rarity: "epic", desc: "Gagne 10 parties d'affilée.", exclusive: "achievement" },
  { id: "title-expert", name: "Expert", rarity: "epic", desc: "Gagne 10 parties en Expert.", exclusive: "achievement" },
  { id: "title-collector", name: "Collectionneur", rarity: "epic", desc: "Possède 60 objets.", exclusive: "achievement" },
  { id: "title-jack", name: "Touche-à-tout", rarity: "rare", desc: "Joue avec les 7 personnages.", exclusive: "achievement" },
  { id: "title-elite", name: "Élite", rarity: "legend", desc: "Atteins le rang Élite.", exclusive: "rank" },
  { id: "title-diamond", name: "Diamant brut", rarity: "epic", desc: "Atteins le rang Diamant.", exclusive: "rank" },
  { id: "title-lucky", name: "Chanceux", rarity: "rare", desc: "Trouvé uniquement dans les coffres.", exclusive: "chest" },
  { id: "title-boom", name: "Boum Boum", rarity: "common", desc: "Trouvé uniquement dans les coffres.", exclusive: "chest" },
  { id: "title-chaos", name: "Agent du chaos", rarity: "epic", desc: "Trouvé uniquement dans les coffres.", exclusive: "chest" },
  { id: "title-king", name: "Roi de la mèche", rarity: "legend", desc: "Trouvé uniquement dans les coffres.", exclusive: "chest" },
  // maîtrise : 3 titres par personnage
  ...CHARACTERS.flatMap((c): TitleDef[] => [
    { id: `title-m10-${c.id}`, name: `${c.name} confirmé`, rarity: "rare", desc: `Maîtrise ${c.name} niveau 10.`, exclusive: "mastery" },
    { id: `title-m20-${c.id}`, name: `As de ${c.name}`, rarity: "epic", desc: `Maîtrise ${c.name} niveau 20.`, exclusive: "mastery" },
    { id: `title-m50-${c.id}`, name: `Maître ${c.name}`, rarity: "legend", desc: `Maîtrise ${c.name} niveau 50.`, exclusive: "mastery" },
  ]),
];
export const DEFAULT_TITLE = "title-rookie";
export const getTitle = (id: string | null | undefined) => TITLES.find((t) => t.id === id);

export const getAccessory = (id: string | null | undefined) => ACCESSORIES.find((a) => a.id === id);
export const getTrail = (id: string | null | undefined) => TRAILS.find((t) => t.id === id) ?? TRAILS[0];
export const getEmote = (id: string | null | undefined) => EMOTES.find((e) => e.id === id);
export const DEFAULT_TRAIL = "fx-dust";
export const DEFAULT_EMOTES = ["emo-hello", "emo-gg"];
export const EMOTE_SLOTS = 4;
