/**
 * 🎄 Calendrier de l'Avent : un cadeau par jour du 1er au 24 décembre.
 * Les jours ratés se rattrapent jusqu'au 31 décembre.
 * Saison de Noël (neige au menu, musique, bouton du calendrier) :
 * du 25 novembre au 6 janvier.
 */
import { grantAll, type Granted } from "./grants";
import type { Profile } from "./profile";
import type { Reward } from "./progress-config";

export const ADVENT: Reward[] = [
  { kind: "coins", amount: 100 }, // 1
  { kind: "chest", tier: "rare" }, // 2
  { kind: "item", id: "emo-xmas" }, // 3
  { kind: "coins", amount: 150 }, // 4
  { kind: "bombers", amount: 5 }, // 5
  { kind: "item", id: "boom-gift" }, // 6
  { kind: "coins", amount: 200 }, // 7
  { kind: "chest", tier: "rare" }, // 8
  { kind: "item", id: "acc-santa" }, // 9
  { kind: "coins", amount: 250 }, // 10
  { kind: "bombers", amount: 10 }, // 11
  { kind: "theme", id: "bonhomme" }, // 12
  { kind: "coins", amount: 300 }, // 13
  { kind: "chest", tier: "epic" }, // 14
  { kind: "item", id: "emo-santa" }, // 15
  { kind: "coins", amount: 300 }, // 16
  { kind: "bombers", amount: 15 }, // 17
  { kind: "item", id: "title-xmas" }, // 18
  { kind: "coins", amount: 400 }, // 19
  { kind: "chest", tier: "epic" }, // 20
  { kind: "coins", amount: 500 }, // 21
  { kind: "bombers", amount: 25 }, // 22
  { kind: "chest", tier: "legend" }, // 23
  { kind: "theme", id: "pere-noel" }, // 24
];

export interface AdventState {
  /** année du calendrier (les cases cochées repartent à zéro chaque année) */
  year: number;
  days: number[];
}
export const defaultAdvent = (): AdventState => ({ year: 0, days: [] });

export interface AdventInfo {
  /** saison de Noël (neige, musique, bouton) */
  season: boolean;
  /** calendrier ouvert (décembre) */
  open: boolean;
  year: number;
  /** jour de décembre (1..31), 0 avant le 1er */
  day: number;
  /** jours avant l'ouverture (avant le 1er décembre) */
  startsIn: number;
  /** cases qu'on peut ouvrir maintenant */
  claimable: number[];
}

export function adventInfo(p: Profile, now = new Date()): AdventInfo {
  const m = now.getMonth();
  const d = now.getDate();
  // saison : 25 nov → 6 janv ; le calendrier est celui de l'année de décembre
  const season = (m === 10 && d >= 25) || m === 11 || (m === 0 && d <= 6);
  const year = m === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const open = m === 11;
  const day = open ? d : 0;
  const startsIn = m === 10 ? 31 - d : 0;
  const got = p.advent.year === year ? p.advent.days : [];
  const claimable = open ? Array.from({ length: Math.min(24, day) }, (_, i) => i + 1).filter((n) => !got.includes(n)) : [];
  return { season, open, year, day, startsIn, claimable };
}

export function adventOpened(p: Profile, year: number): number[] {
  return p.advent.year === year ? p.advent.days : [];
}

/** Ouvre une case (si elle est ouvrable) : renvoie ce qu'elle donne. */
export function claimAdvent(p: Profile, n: number, now = new Date()): Granted[] | null {
  const info = adventInfo(p, now);
  if (!info.claimable.includes(n)) return null;
  if (p.advent.year !== info.year) p.advent = { year: info.year, days: [] };
  p.advent.days.push(n);
  const got: Granted[] = [];
  grantAll(p, [ADVENT[n - 1]], got, "advent");
  return got;
}
