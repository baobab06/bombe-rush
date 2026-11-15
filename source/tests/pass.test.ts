/* Pass de saison. `bun tests/pass.test.ts` */
import { getItem } from "../src/meta/catalog";
import { defaultProfile } from "../src/meta/profile";
import { applyMatch } from "../src/meta/progression";
import { beginMatch } from "../src/meta/rewards";
import { migrate } from "../src/meta/save";
import { buy, claimMission, ensureMissions } from "../src/meta/store";
import { unlockText } from "../src/meta/unlocks";
import { chestPool } from "../src/meta/grants";
import { SKINS } from "../src/core/characters";
import {
  PASS_RULES, addPassStars, buyPremium, claimPass, ensurePass, passClaimable, passSeason, passSeasonEnd, passStarsFor, passTier, passTrack, premiumSummary,
} from "../src/meta/pass";

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; console.log("  ✗ " + msg); } else console.log("  ✓ " + msg);
}
const DEC = Date.UTC(2026, 11, 10);
const NOV = Date.UTC(2026, 10, 20);
const JAN = Date.UTC(2027, 0, 5);

console.log("1. Saisons");
check(passSeason(NOV).id === "hiver-2026" && passSeason(DEC).id === "hiver-2026", "saison Hiver : novembre et décembre 2026");
check(passSeasonEnd(DEC) === Date.UTC(2027, 0, 1), "fin de la saison Hiver : 1er janvier 2027");
check(passSeason(JAN).id === "s-2027-01" && passSeason(JAN).name === "Janvier", "mois sans saison prévue : saison « Janvier » générique");

console.log("2. Barème des 100 paliers");
{
  const t = passTrack(passSeason(DEC));
  check(t.prem.length === 101 && t.free.length === 101, "100 paliers");
  check(t.prem.slice(1).every(Boolean), "Premium : une récompense à chaque palier");
  check(t.free.slice(1).filter(Boolean).length === 50, "gratuit : un palier sur deux");
  const ids = t.prem.slice(1).filter((r) => r.kind === "item").map((r) => (r as { id: string }).id);
  check(["emo-snowman", "fx-frost", "boom-snowball", "title-winter"].every((id) => ids.includes(id)), "objets exclusifs Hiver dans la ligne Premium");
  check(t.prem[100].kind === "theme", "palier 100 Premium : skin Lutin pour tous les persos");
  const sum = premiumSummary(t);
  check(sum.bombers === 300, "300 bombers rendus par le Premium");
  check(sum.chests.legend === 2, "2 coffres légendaires");
  console.log(`     (Premium : ${sum.coins} pièces, coffres ${JSON.stringify(sum.chests)})`);
  for (const r of [...t.prem.slice(1), ...t.free.slice(1)]) {
    if (r && r.kind === "item" && !getItem(r.id)) { check(false, "objet inconnu " + r.id); }
  }
  const gen = passTrack(passSeason(JAN));
  check(gen.prem.every((r) => r.kind !== "item" && r.kind !== "theme"), "saison générique : pas d'objet exclusif manquant");
}

console.log("3. Étoiles");
{
  check(passStarsFor(1) === 30 && passStarsFor(2) === 20 && passStarsFor(3) === 10 && passStarsFor(4) === 10 && passStarsFor(1, true) === 20, "victoire 30, 2e 20, autres 10, égalité 20");
  const p = defaultProfile();
  ensurePass(p, DEC);
  const r = addPassStars(p, 120, DEC);
  check(r.before === 0 && r.after === 2 && passTier(p) === 2, "120 ⭐ = palier 2");
  addPassStars(p, 99999, DEC);
  check(passTier(p) === 100 && p.pass.stars === 5000, "plafond : palier 100");
  // une partie donne des étoiles
  const q = defaultProfile();
  const ctx = { matchId: "m-pass", stake: "normal" as const, modeId: "classic", players: 4 };
  beginMatch(q, ctx);
  const s = applyMatch(q, { place: 1, players: 4, won: true, kills: 2, bombsPlaced: 5, survivalTime: 60, draw: false, characterId: "renard" } as never, ctx, new Date(DEC))!;
  check(s.pass.stars === 30 && q.pass.stars === 30, "victoire : +30 ⭐ (résumé de fin de partie)");
  // mission réussie
  ensureMissions(q, new Date(DEC));
  const m = q.missions.list[0];
  m.progress = 999;
  const before = q.pass.stars;
  const got = claimMission(q, m.id);
  check(!!got && q.pass.stars === before + PASS_RULES.missionStars, "mission du jour : +50 ⭐");
}

console.log("4. Récupérer, Premium");
{
  const p = defaultProfile();
  ensurePass(p, DEC);
  addPassStars(p, 50 * 10, DEC); // palier 10
  check(passClaimable(p).length === 5, "palier 10 sans Premium : 5 récompenses gratuites");
  const coins0 = p.coins;
  const g = claimPass(p, "free", 2);
  check(g.length === 1 && p.coins > coins0 && p.pass.free.includes(2), "récupérer le palier 2");
  check(claimPass(p, "free", 2).length === 0, "pas deux fois");
  check(claimPass(p, "prem", 1).length === 0, "Premium verrouillé sans achat");
  const no = buyPremium(p);
  check(!no.ok && no.reason === "bombers", "pas assez de bombers");
  p.bombers = 500;
  check(buyPremium(p).ok && p.bombers === 50 && p.pass.premium, "Premium acheté : 450 bombers");
  check(!buyPremium(p).ok, "pas deux fois");
  check(passClaimable(p).filter((c) => c.line === "prem").length === 10, "paliers déjà atteints débloqués tout de suite");
  claimPass(p);
  check(passClaimable(p).length === 0 && p.owned.includes("emo-snowman"), "tout récupérer (emote Bonhomme de neige)");
  // palier 100 : skin pour tous les persos
  addPassStars(p, 99999, DEC);
  claimPass(p);
  const lutins = SKINS.filter((s) => s.theme === "lutin");
  check(lutins.length >= 12 && lutins.every((s) => p.owned.includes(s.id)), "palier 100 : skin Lutin pour les " + lutins.length + " persos");
  check(p.owned.includes("boom-snowball") && p.owned.includes("fx-frost") && p.owned.includes("title-winter") && p.owned.includes("title-frosty"), "tous les exclusifs Hiver obtenus");
}

console.log("5. Fin de saison");
{
  const p = defaultProfile();
  ensurePass(p, DEC);
  addPassStars(p, 50 * 6, DEC);
  p.bombers = 450;
  buyPremium(p);
  const end = ensurePass(p, JAN);
  check(!!end && end.ended === "hiver-2026" && end.granted.length === 9, "récompenses non récupérées données d'office (3 gratuites + 6 Premium)");
  check(p.pass.season === "s-2027-01" && p.pass.stars === 0 && !p.pass.premium, "nouvelle saison : remise à zéro (Premium à racheter)");
  check(ensurePass(p, JAN) === null, "une seule fois");
}

console.log("6. Objets exclusifs");
{
  for (const id of ["emo-snowman", "fx-frost", "boom-snowball", "title-winter", "renard-lutin"]) {
    const it = getItem(id);
    check(!!it && it.exclusive === "pass" && it.price === 0, `${id} : exclusif Pass, pas en vente`);
  }
  const p = defaultProfile();
  p.coins = 1e6;
  check(!buy(p, "boom-snowball").ok, "impossible à acheter en boutique");
  check(!chestPool(p, "legend").some((i) => i.exclusive === "pass") && !chestPool(p, "epic").some((i) => i.exclusive === "pass"), "jamais dans les coffres");
  check(unlockText("boom-snowball") === "Pass de saison Premium, palier 60", "texte de déblocage : palier 60 Premium");
  check(/palier 100/.test(unlockText("drako-lutin")), "skin Lutin : palier 100");
}

console.log("7. Ancienne sauvegarde");
{
  const old = defaultProfile() as unknown as Record<string, unknown>;
  delete old.pass;
  const p = migrate(JSON.parse(JSON.stringify(old)));
  check(!!p && p.pass.stars === 0 && Array.isArray(p.pass.free), "profil sans pass : pass vide");
  const bad = { ...defaultProfile(), pass: { season: 3, stars: "x", premium: "oui", free: [1, 1, 999, "a"], prem: null } };
  const q = migrate(JSON.parse(JSON.stringify(bad)))!;
  check(q.pass.stars === 0 && q.pass.premium === false && q.pass.free.length === 1 && q.pass.prem.length === 0, "données abîmées nettoyées");
}

console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert ✅");
(globalThis as unknown as { process: { exit(c: number): void } }).process.exit(failures ? 1 : 0);
