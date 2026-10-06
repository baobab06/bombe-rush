/**
 * Cosmétiques hors skins : accessoires, effets (traînées) et emotes.
 * Uniquement des données ; le rendu vit dans render/, les prix dans
 * meta/economy.ts. Ajouter un objet = ajouter une ligne ici.
 */
import type { Accessory, Rarity } from "./characters";

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

export const getAccessory = (id: string | null | undefined) => ACCESSORIES.find((a) => a.id === id);
export const getTrail = (id: string | null | undefined) => TRAILS.find((t) => t.id === id) ?? TRAILS[0];
export const getEmote = (id: string | null | undefined) => EMOTES.find((e) => e.id === id);
export const DEFAULT_TRAIL = "fx-dust";
export const DEFAULT_EMOTES = ["emo-hello", "emo-gg"];
export const EMOTE_SLOTS = 4;
