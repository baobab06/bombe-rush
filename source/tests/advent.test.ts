/* Noël : calendrier de l'Avent, cosmétiques, carte. `bun tests/advent.test.ts` */
import { ADVENT, adventInfo, claimAdvent } from "../src/meta/advent";
import { defaultProfile } from "../src/meta/profile";
import { migrate } from "../src/meta/save";
import { getItem as catalogItem } from "../src/meta/catalog";
import { getMap, mapsFor } from "../src/maps";
import { Match } from "../src/core/match";

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; console.log("  ✗ " + msg); } else console.log("  ✓ " + msg);
}
const D = (s: string) => new Date(s + "T12:00:00");

console.log("1. Calendrier");
{
  const p = defaultProfile();
  check(ADVENT.length === 24, "24 cases");
  const nov = adventInfo(p, D("2026-11-27"));
  check(nov.season && !nov.open && nov.startsIn === 4 && !nov.claimable.length, "27 novembre : saison de Noël, calendrier fermé (J-4)");
  check(!adventInfo(p, D("2026-11-10")).season, "10 novembre : pas encore Noël");
  const d3 = adventInfo(p, D("2026-12-03"));
  check(d3.open && d3.claimable.join() === "1,2,3", "3 décembre : cases 1 à 3 ouvrables (rattrapage)");
  check(!claimAdvent(p, 4, D("2026-12-03")), "case 4 fermée le 3 décembre");
  const coins = p.coins;
  const g = claimAdvent(p, 1, D("2026-12-03"));
  check(!!g && p.coins === coins + 100 && !claimAdvent(p, 1, D("2026-12-03")), "case 1 : +100 pièces, une seule fois");
  claimAdvent(p, 24, D("2026-12-28"));
  check(p.equippedSkins !== undefined && p.owned.includes("renard-pere-noel") && p.owned.includes("drako-pere-noel"), "case 24 : skin Père Noël pour tous les persos");
  check(adventInfo(p, D("2026-12-31")).claimable.length === 22, "31 décembre : on peut encore rattraper");
  check(!adventInfo(p, D("2027-01-02")).claimable.length && adventInfo(p, D("2027-01-02")).season, "janvier : calendrier fini, neige jusqu'au 6");
  check(adventInfo(p, D("2027-12-02")).claimable.join() === "1,2", "l'année suivante : nouveau calendrier");
  const re = migrate(JSON.parse(JSON.stringify({ ...p, advent: { year: 2026, days: [1, 99, 1, "3"] } })));
  check(re.advent.days.join() === "1,3", "sauvegarde nettoyée");
}
console.log("2. Objets et carte");
for (const id of ["acc-santa", "emo-xmas", "emo-santa", "boom-gift", "title-xmas", "renard-bonhomme", "kage-pere-noel"]) {
  const it = catalogItem(id);
  check(!!it && it.exclusive === "advent" && it.price === 0, `${id} : exclusif au calendrier, pas vendu`);
}
const xm = getMap("xmas");
check(xm.id === "xmas" && mapsFor("classic").includes(xm) && mapsFor("chaos").includes(xm), "Village de Noël en Classique et Chaos");
for (const n of [2, 4]) {
  const m = new Match({ seed: 5, map: xm, modeId: "classic", players: Array.from({ length: n }, (_, i) => ({ name: "P" + i, characterId: "renard", isBot: true, difficulty: "normal" as const })) });
  check(m.players.length === n, `Village de Noël : partie à ${n}`);
}
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert ✅");
(globalThis as unknown as { process: { exit(c: number): void } }).process.exit(failures ? 1 : 0);
