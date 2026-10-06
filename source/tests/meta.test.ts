/* Tests de l'économie, de la boutique et de la sauvegarde : `bun tests/meta.test.ts` */
import { CHARACTERS, SKINS, THEMES } from "../src/core/characters";
import { ACCESSORIES, EMOTES, TRAILS } from "../src/core/cosmetics";
import { CATALOG, getItem } from "../src/meta/catalog";
import { DAILY_REWARDS, NAME_CHANGE_PRICE, PRICES, STARTER_GIFT } from "../src/meta/economy";
import { defaultProfile } from "../src/meta/profile";
import { applyMatch } from "../src/meta/progression";
import { beginMatch, isSettled, maxLoss, settleAbandoned, settleMatch, stakeTable } from "../src/meta/rewards";
import { SaveSystem, memoryBackend, migrate } from "../src/meta/save";
import {
  buy, claimDaily, claimMission, countOwned, dailyState, ensureMissions, equip, equippedSkin, featured, grantStarterGift,
  isEquipped, owns, priceOf, rename, renameCost,
} from "../src/meta/store";

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.log("  ✗ " + msg);
  } else console.log("  ✓ " + msg);
}

console.log("Catalogue");
check(new Set(CATALOG.map((i) => i.id)).size === CATALOG.length, "identifiants uniques");
check(THEMES.length >= 10, `${THEMES.length} thèmes de skins`);
for (const c of CHARACTERS) check(SKINS.filter((s) => s.characterId === c.id).length >= 11, `${c.name} : ${SKINS.filter((s) => s.characterId === c.id).length} skins`);
check(["renard-or", "boulon-neon", "bruno-panda", "kage-sakura"].every((id) => !!getItem(id)), "skins V1 conservés (mêmes identifiants)");
check(getItem("renard-pirate")!.price === PRICES.rare, "prix d'un skin = prix de sa rareté");
check(CATALOG.filter((i) => i.kind === "skin" && i.free).length === CHARACTERS.length, "un skin offert par personnage");
check(ACCESSORIES.length >= 10 && TRAILS.length >= 10 && EMOTES.length >= 10, "accessoires, effets et emotes");
const rarities = new Set(CATALOG.map((i) => i.rarity));
check(["common", "rare", "epic", "legend"].every((r) => rarities.has(r as never)), "4 raretés utilisées");

console.log("Achat");
const p = defaultProfile();
check(p.coins === 0, "nouveau profil : 0 pièce");
check(grantStarterGift(p) === STARTER_GIFT && grantStarterGift(p) === 0, "cadeau de bienvenue donné une seule fois");
const fixed = new Date(2026, 9, 5, 12); // lundi
const sku = CATALOG.find((i) => i.kind === "skin" && i.rarity === "common" && !i.free && !priceOf(i.id, fixed).deal && i.characterId === "renard")!;
let r = buy(p, sku.id, fixed);
check(r.ok && p.coins === STARTER_GIFT - sku.price, `achat de « ${sku.name} » (${sku.price} 🪙)`);
check(owns(p, sku.id), "objet possédé après achat");
r = buy(p, sku.id, fixed);
check(!r.ok && r.reason === "owned", "impossible d'acheter deux fois");
const legend = CATALOG.find((i) => i.kind === "skin" && i.rarity === "legend" && !priceOf(i.id, fixed).deal)!;
const before = p.coins;
r = buy(p, legend.id, fixed);
check(!r.ok && r.reason === "coins" && r.missing === legend.price - before && p.coins === before, "pas assez de pièces : refus, rien n'est débité");
const pingoSkin = SKINS.find((s) => s.characterId === "pingo" && !s.free)!;
p.coins = 100000;
check(!buy(p, pingoSkin.id, fixed).ok, "skin d'un personnage verrouillé : refus");
check(buy(p, "chr-pingo", fixed).ok && p.ownedCharacters.includes("pingo"), "achat du personnage Pingo");
check(buy(p, pingoSkin.id, fixed).ok, "puis de son skin");

console.log("Équipement");
check(equip(p, sku.id) && equippedSkin(p, "renard") === sku.id && p.characterId === "renard", "équiper un skin change aussi de personnage");
check(!equip(p, legend.id), "impossible d'équiper un objet non possédé");
buy(p, "acc-crown", fixed);
check(equip(p, "acc-crown") && isEquipped(p, "acc-crown"), "accessoire équipé");
check(equip(p, "acc-crown", { toggle: true }) && p.equipped.accessory === null, "second appui : accessoire retiré");
buy(p, "fx-fire", fixed);
check(equip(p, "fx-fire") && p.equipped.trail === "fx-fire", "effet équipé");
for (const e of ["emo-lol", "emo-cool", "emo-fire"]) buy(p, e, fixed);
equip(p, "emo-lol");
equip(p, "emo-cool");
equip(p, "emo-fire");
check(p.equipped.emotes.length === 4 && p.equipped.emotes.includes("emo-fire"), "4 emotes maximum");

console.log("Promotion du jour");
const f = featured(fixed);
check(f.items.length === 4 && new Set(f.items.map((i) => i.id)).size === 4, "4 objets à la une");
const deal = priceOf(f.dealId, fixed);
check(deal.deal && deal.price < deal.full, `offre du jour : ${deal.full} → ${deal.price}`);
check(featured(fixed).dealId === featured(new Date(2026, 9, 5, 20)).dealId, "même sélection toute la journée");

console.log("Récompense quotidienne");
const q = defaultProfile();
const d1 = new Date(2026, 9, 5, 9);
check(dailyState(q, d1).available && claimDaily(q, d1) === DAILY_REWARDS[0], "jour 1 réclamé");
check(claimDaily(q, d1) === 0, "une seule fois par jour");
check(claimDaily(q, new Date(2026, 9, 6, 9)) === DAILY_REWARDS[1], "jour 2 consécutif : récompense suivante");
check(claimDaily(q, new Date(2026, 9, 9, 9)) === DAILY_REWARDS[0], "jour manqué : la série repart à zéro");

console.log("Missions et fin de partie");
const m = defaultProfile();
ensureMissions(m, fixed);
check(m.missions.list.length === 3, "3 missions du jour");
const W = (won: boolean) => ({ won, draw: false, place: won ? 1 : 4, players: 4, kills: won ? 2 : 0, bombsPlaced: 30, blocksDestroyed: 120, bonusesPicked: 12, survivalTime: 90, modeId: "classic" });
m.coins = 1000;
const sum = applyMatch(m, W(true), { matchId: "m1", stake: "normal", modeId: "classic" }, fixed)!;
check(!!sum && m.coins === 1100 && sum.tx.applied === 100, "1er en normal : +100 (une seule ligne de pièces)");
const done = m.missions.list.filter((x) => x.progress > 0);
check(done.length > 0, "les missions progressent");
const claimable = m.missions.list.find((x) => x.progress >= 1 && !x.claimed && sum.missionsDone.some((d) => d.id === x.id));
if (claimable) {
  const c1 = m.coins;
  const got = claimMission(m, claimable.id);
  check(got > 0 && m.coins === c1 + got && claimMission(m, claimable.id) === 0, "mission terminée : réclamée une seule fois");
}

console.log("Récompense selon le classement");
const P = (won: boolean, place: number, players = 4, draw = false) => ({ ...W(won), place, players, draw });
const TABLE: [string, number[]][] = [["easy", [50, 20, -10, -25]], ["normal", [100, 40, -15, -30]], ["hard", [175, 70, -25, -50]], ["expert", [300, 120, -50, -100]]];
for (const [st, row] of TABLE) {
  const got: number[] = [];
  for (let place = 1; place <= 4; place++) {
    const a = defaultProfile();
    a.coins = 1000;
    const v = applyMatch(a, P(place === 1, place), { matchId: `${st}-${place}`, stake: st as never, modeId: "classic" }, fixed)!;
    got.push(v.tx.applied);
    check(a.coins === 1000 + row[place - 1] && v.tx.place === place, `${st} ${place}e place → ${row[place - 1] > 0 ? "+" : ""}${row[place - 1]} (solde ${a.coins})`);
  }
}
check(stakeTable("hard", 4).map((x) => x.amount).join() === "175,70,-25,-50", "barème affiché = barème appliqué (4 joueurs)");
check(stakeTable("hard", 2).map((x) => x.amount).join() === "175,-50", "duel (2 joueurs) : 1er gros gain, 2e = perte maximale");
check(stakeTable("hard", 3).map((x) => x.amount).join() === "175,70,-50", "3 joueurs : 1er, 2e, puis perte maximale");
check(stakeTable("hard", 6).map((x) => x.amount).join() === "175,70,70,-25,-25,-50", "6 joueurs : prêt (1er, moitié haute, moitié basse, dernier)");
check(maxLoss("expert", 4) === 100 && maxLoss("easy", 2) === 25, "perte maximale (abandon) = dernière place");
const poor = defaultProfile();
poor.coins = 20;
const pl = applyMatch(poor, P(false, 4), { matchId: "poor", stake: "hard", modeId: "classic" }, fixed)!;
check(poor.coins === 0 && pl.tx.requested === -50 && pl.tx.applied === -20, "20 pièces, 4e en difficile → 0 (jamais −30)");
const zero = defaultProfile();
applyMatch(zero, P(false, 3), { matchId: "z", stake: "expert", modeId: "classic" }, fixed);
check(zero.coins === 0, "0 pièce, 3e en expert → reste à 0");
const dup = defaultProfile();
dup.coins = 100;
const c0 = { matchId: "same", stake: "expert" as const, modeId: "classic" };
applyMatch(dup, P(false, 2), c0, fixed);
const again = applyMatch(dup, P(true, 1), c0, fixed);
const lossAfter = settleMatch(dup, c0, { place: 4, players: 4 }, fixed);
check(again === null && lossAfter === null && dup.coins === 220 && dup.played === 1, "une partie = une seule transaction (2e règlement refusé)");
const ab = defaultProfile();
ab.coins = 500;
beginMatch(ab, { matchId: "run1", stake: "hard", modeId: "classic", players: 4 });
const abTx = settleAbandoned(ab);
check(!!abTx && abTx.outcome === "abandon" && ab.coins === 450 && ab.pending === null, "partie quittée en cours (rechargement / appli fermée) = dernière place −50");
check(settleAbandoned(ab) === null && applyMatch(ab, P(true, 1), { matchId: "run1", stake: "hard", modeId: "classic" }, fixed) === null && ab.coins === 450, "… et elle ne peut plus rien rapporter ensuite");
const ab2 = defaultProfile();
ab2.coins = 500;
beginMatch(ab2, { matchId: "duel", stake: "hard", modeId: "classic", players: 2 });
settleAbandoned(ab2);
check(ab2.coins === 450, "abandon d'un duel = perte maximale aussi");
const en = defaultProfile();
en.coins = 500;
beginMatch(en, { matchId: "end", stake: "hard", modeId: "classic", players: 4 });
en.pending!.ending = true;
settleAbandoned(en);
check(en.coins === 570, "rechargé pendant la seconde de fin, encore debout → égalité (colonne 2e, +70)");
const chaos = defaultProfile();
const ct = applyMatch(chaos, { ...P(true, 1), modeId: "chaos" }, { matchId: "c1", stake: "normal", modeId: "chaos" }, fixed)!;
check(ct.tx.applied === 150 && ct.tx.modifiers.length === 1, `événement Festival Chaos : 1er ×1,5 (+${ct.tx.applied}, une seule transaction)`);
const weekend = defaultProfile();
const wt = applyMatch(weekend, P(true, 1), { matchId: "we", stake: "easy", modeId: "classic" }, new Date(2026, 9, 10, 12))!;
check(wt.tx.applied === 100, "week-end en or : 1er en facile ×2 (+100)");
const w2 = applyMatch(weekend, P(false, 2), { matchId: "we2", stake: "easy", modeId: "classic" }, new Date(2026, 9, 10, 12))!;
check(w2.tx.applied === 40, "… 2e en facile ×2 (+40)");
const wl = applyMatch(weekend, P(false, 4), { matchId: "we3", stake: "easy", modeId: "classic" }, new Date(2026, 9, 10, 12))!;
check(wl.tx.applied === -25, "… les pertes ne sont pas multipliées (−25)");
const dr = defaultProfile();
dr.coins = 50;
const dt = applyMatch(dr, P(false, 1, 4, true), { matchId: "d", stake: "expert", modeId: "classic" }, fixed)!;
check(dr.coins === 170 && dt.tx.outcome === "draw", "égalité pour la 1re place : personne ne gagne, colonne 2e (+120)");
const vd = defaultProfile();
vd.coins = 50;
settleMatch(vd, { matchId: "v", stake: "expert", modeId: "classic" }, { place: 1, players: 4, void: true }, fixed);
check(vd.coins === 50 && isSettled(vd, "v"), "partie annulée (exclu par l'hôte) : ni gain ni perte");
const st1 = defaultProfile();
applyMatch(st1, P(true, 1), { matchId: "s1", stake: "easy", modeId: "classic" }, fixed);
applyMatch(st1, P(true, 1), { matchId: "s2", stake: "easy", modeId: "classic" }, fixed);
check(st1.winStreak === 2 && st1.wins === 2, "série de victoires comptée (prête pour un bonus)");
applyMatch(st1, P(false, 2), { matchId: "s3", stake: "easy", modeId: "classic" }, fixed);
check(st1.winStreak === 0, "… remise à zéro si on ne finit pas 1er");

console.log("Pseudo");
const n = defaultProfile();
check(renameCost(n, "Toto") === 0 && rename(n, "  Toto  ").ok && n.name === "Toto" && n.coins === 0, "premier pseudo gratuit");
check(NAME_CHANGE_PRICE === 300, "changer de pseudo coûte 300");
let rr = rename(n, "Titi");
check(!rr.ok && rr.reason === "coins" && rr.missing === 300 && n.name === "Toto", "pas assez de pièces : pseudo inchangé");
n.coins = 450;
rr = rename(n, "Titi");
check(rr.ok && rr.cost === 300 && n.coins === 150 && n.name === "Titi", "changement payé : 450 → 150");
check(!rename(n, "Titi").ok && n.coins === 150, "même pseudo : refusé, rien débité");
check(!rename(n, " a ").ok && n.name === "Titi", "pseudo trop court refusé");
check(rename(n, "x".repeat(30)).ok === false && n.coins === 150, "150 pièces : 2e changement refusé");
const EMO = EMOTES.filter((e) => e.taunt);
check(EMO.length >= 8 && EMO.every((e) => !e.free && getItem(e.id)?.price), `${EMO.length} emotes de moquerie en boutique`);

console.log("Sauvegarde");
const be = memoryBackend();
const save = new SaveSystem(be);
const s1 = save.load();
s1.coins = 1234;
buy(s1, "acc-cap", fixed);
equip(s1, "acc-cap");
save.save(s1);
const s2 = save.load();
check(s2.coins === s1.coins && owns(s2, "acc-cap") && s2.equipped.accessory === "acc-cap", "pièces, achats et équipement relus à l'identique");
const v1 = migrate({ version: 1 as never, coins: 320, ownedSkins: ["renard-or", "inconnu"], equippedSkins: { renard: "renard-or" }, characterId: "renard", name: "Guigui" } as never);
check(v1.coins === 320 && owns(v1, "renard-or") && !v1.owned.includes("inconnu") && equippedSkin(v1, "renard") === "renard-or", "profil V1 migré (skins achetés gardés)");
const bad = migrate({ coins: -5, equipped: { accessory: "acc-halo", trail: "fx-fire", emotes: ["emo-party"] } } as never);
check(bad.coins === 0 && bad.equipped.accessory === null && bad.equipped.trail === "fx-dust" && bad.equipped.emotes.length === 2, "sauvegarde trafiquée : remise d'aplomb");
check(countOwned(defaultProfile()).owned > 0, "compteur de collection");

console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert ✅");
(globalThis as unknown as { process: { exit(c: number): void } }).process.exit(failures ? 1 : 0);
