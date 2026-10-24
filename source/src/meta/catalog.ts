/**
 * Catalogue unique de tout ce qui se possède : skins, accessoires, effets,
 * emotes, personnages. La boutique et la collection lisent uniquement ceci.
 * Nouveau type d'objet = un `kind` de plus + une source de données.
 */
import { CHARACTERS, SKINS, type Rarity } from "../core/characters";
import { BOOMS, EMOTES, TITLES, TRAILS } from "../core/cosmetics";
import { BOMBER_CHARACTER_PRICES, BOMBER_EMOTE_PRICES, BOMBER_PRICES, CHARACTER_PRICES, EMOTE_PRICES, PRICES } from "./economy";

export type ItemKind = "skin" | "accessory" | "trail" | "emote" | "boom" | "title" | "character";
/** Objet exclusif : ne se vend pas, se gagne (maîtrise, succès, niveau, coffres, rang). */
export type ItemSource = "mastery" | "achievement" | "level" | "chest" | "rank";

export interface CatalogItem {
  id: string;
  kind: ItemKind;
  name: string;
  rarity: Rarity;
  price: number;
  /** prix en bombers (monnaie premium) ; 0 = pas vendu en bombers */
  bomberPrice: number;
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
  { id: "character", label: "Personnages", short: "Persos" },
  { id: "trail", label: "Effets", short: "Effets" },
  { id: "emote", label: "Emotes", short: "Emotes" },
  { id: "boom", label: "Bombes", short: "Bombes" },
  { id: "title", label: "Titres", short: "Titres" },
];

function build(): Omit<CatalogItem, "bomberPrice">[] {
  const out: Omit<CatalogItem, "bomberPrice">[] = [];
  for (const s of SKINS)
    out.push({
      id: s.id, kind: "skin", name: s.name, rarity: s.rarity, price: s.free || s.exclusive ? 0 : s.price ?? PRICES[s.rarity],
      desc: s.desc ?? "", free: !!s.free, characterId: s.characterId, theme: s.theme, exclusive: s.exclusive,
    });
  // accessoires retirés en 1.7.1 (invisibles sur les personnages 3D) : remboursés, voir meta/save.ts
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

/** Prix en bombers : table par rareté (economy.ts), ou prix en pièces ÷ 10 pour un prix sur mesure. */
function withBomberPrice(it: Omit<CatalogItem, "bomberPrice">): CatalogItem {
  let bomberPrice = 0;
  if (it.price > 0) {
    const table = it.kind === "emote" ? BOMBER_EMOTE_PRICES : BOMBER_PRICES;
    const standard = it.kind === "emote" ? EMOTE_PRICES[it.rarity] : PRICES[it.rarity];
    if (it.kind === "character") bomberPrice = BOMBER_CHARACTER_PRICES[it.characterId!] ?? Math.round(it.price / 10);
    else bomberPrice = it.price === standard ? table[it.rarity] : Math.max(5, Math.round(it.price / 50) * 5);
  }
  return { ...it, bomberPrice };
}

export const CATALOG: CatalogItem[] = build().map(withBomberPrice);
const byId = new Map(CATALOG.map((i) => [i.id, i]));

export function getItem(id: string | null | undefined): CatalogItem | undefined {
  return id ? byId.get(id) : undefined;
}

/** Vendu en boutique ? (les exclusifs se gagnent uniquement) */
export const isBuyable = (it: CatalogItem) => !it.free && !it.exclusive;

/** Objet « personnage » correspondant à un id de personnage. */
export const characterItemId = (characterId: string) => `chr-${characterId}`;
