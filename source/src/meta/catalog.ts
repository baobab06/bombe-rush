/**
 * Catalogue unique de tout ce qui se possède : skins, accessoires, effets,
 * emotes, personnages. La boutique et la collection lisent uniquement ceci.
 * Nouveau type d'objet = un `kind` de plus + une source de données.
 */
import { CHARACTERS, SKINS, type Rarity } from "../core/characters";
import { ACCESSORIES, BOOMS, EMOTES, TITLES, TRAILS } from "../core/cosmetics";
import { CHARACTER_PRICES, EMOTE_PRICES, PRICES } from "./economy";

export type ItemKind = "skin" | "accessory" | "trail" | "emote" | "boom" | "title" | "character";
/** Objet exclusif : ne se vend pas, se gagne (maîtrise, succès, niveau, coffres, rang). */
export type ItemSource = "mastery" | "achievement" | "level" | "chest" | "rank";

export interface CatalogItem {
  id: string;
  kind: ItemKind;
  name: string;
  rarity: Rarity;
  price: number;
  desc: string;
  /** offert d'office (possédé sans achat) */
  free: boolean;
  /** skins : personnage concerné */
  characterId?: string;
  /** thème (filtres) */
  theme?: string;
  /** objet exclusif (pas en boutique) */
  exclusive?: ItemSource;
}

export const CATEGORIES: { id: ItemKind; label: string; short: string }[] = [
  { id: "skin", label: "Skins", short: "Skins" },
  { id: "accessory", label: "Accessoires", short: "Accessoires" },
  { id: "trail", label: "Effets", short: "Effets" },
  { id: "emote", label: "Emotes", short: "Emotes" },
  { id: "boom", label: "Explosions", short: "Explosions" },
  { id: "title", label: "Titres", short: "Titres" },
  { id: "character", label: "Personnages", short: "Persos" },
];

function build(): CatalogItem[] {
  const out: CatalogItem[] = [];
  for (const s of SKINS)
    out.push({
      id: s.id, kind: "skin", name: s.name, rarity: s.rarity, price: s.free || s.exclusive ? 0 : s.price ?? PRICES[s.rarity],
      desc: s.desc ?? "", free: !!s.free, characterId: s.characterId, theme: s.theme, exclusive: s.exclusive,
    });
  for (const a of ACCESSORIES) out.push({ id: a.id, kind: "accessory", name: a.name, rarity: a.rarity, price: PRICES[a.rarity], desc: a.desc, free: false });
  for (const t of TRAILS) out.push({ id: t.id, kind: "trail", name: t.name, rarity: t.rarity, price: t.free ? 0 : PRICES[t.rarity], desc: t.desc, free: !!t.free });
  for (const e of EMOTES) out.push({ id: e.id, kind: "emote", name: e.name, rarity: e.rarity, price: e.free ? 0 : EMOTE_PRICES[e.rarity], desc: e.taunt ? `Moquerie ${e.emoji} « ${e.name} »` : `Emote ${e.emoji}`, free: !!e.free });
  for (const b of BOOMS) out.push({ id: b.id, kind: "boom", name: b.name, rarity: b.rarity, price: b.free || b.exclusive ? 0 : PRICES[b.rarity], desc: b.desc, free: !!b.free, exclusive: b.exclusive });
  for (const t of TITLES) out.push({ id: t.id, kind: "title", name: t.name, rarity: t.rarity, price: 0, desc: t.desc, free: !!t.free, exclusive: t.exclusive ?? (t.free ? undefined : "chest") });
  for (const c of CHARACTERS)
    out.push({
      id: `chr-${c.id}`, kind: "character", name: c.name, rarity: c.rarity ?? "common", price: c.locked ? CHARACTER_PRICES[c.id] ?? PRICES.epic : 0,
      desc: c.bio, free: !c.locked, characterId: c.id,
    });
  return out;
}

export const CATALOG: CatalogItem[] = build();
const byId = new Map(CATALOG.map((i) => [i.id, i]));

export function getItem(id: string | null | undefined): CatalogItem | undefined {
  return id ? byId.get(id) : undefined;
}

/** Vendu en boutique ? (les exclusifs se gagnent uniquement) */
export const isBuyable = (it: CatalogItem) => !it.free && !it.exclusive;

/** Objet « personnage » correspondant à un id de personnage. */
export const characterItemId = (characterId: string) => `chr-${characterId}`;
