/* Tests de la progression (niveaux, maîtrise, missions, succès, coffres, rangs) : `bun tests/progress.test.ts` */
import { CATALOG, getItem } from "../src/meta/catalog";
import { achievementList, checkAchievements, claimAchievement } from "../src/meta/achievements";
import { setServerTime, trustedNow } from "../src/meta/clock";
import { addXp, chestPool, grant, openChest } from "../src/meta/grants";
import { addMastery, masteryOf } from "../src/meta/mastery";
import { defaultProfile } from "../src/meta/profile";
import { applyMatch, placeXp } from "../src/meta/progression";
import {
  ACHIEVEMENTS, CHESTS, CHEST_ORDER, LEVEL_MAX, LEVEL_REWARDS, LEVEL_UP_COINS, LOGIN_REWARDS, MASTERY_STEPS, RANKS, STREAK_BONUSES,
  WEEKLY_PER_WEEK, XP_BY_PLACE, levelXp, masteryXp,
} from "../src/meta/progress-config";
import { isRanked, rankDelta, rankIndex } from "../src/meta/rank";
import { settleAbandoned, beginMatch } from "../src/meta/rewards";
import { SaveSystem, memoryBackend, migrate } from "../src/meta/save";
import { buy, claimDaily, claimMission, dailyState, ensureMissions, equip, isEquipped, owns } from "../src/meta/store";
import { claimWeekly, ensureWeekly, weekKey } from "../src/meta/weekly";

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.log("  ✗ " + msg);
  } else console.log("  ✓ " + msg);
}
const day = (d: number, h = 12) => new Date(2026, 9, d, h); // octobre 2026 (5 = lundi)
const O = (place: number, o: Partial<{ won: boolean; draw: boolean; kills: number; characterId: string; modeId: string; players: number }> = {}) => ({
  won: o.won ?? place === 1, draw: o.draw ?? false, place, players: o.players ?? 4, kills: o.kills ?? 1, bombsPlaced: 10, blocksDestroyed: 20,
  bonusesPicked: 3, survivalTime: 70, modeId: o.modeId ?? "classic", characterId: o.characterId ?? "renard",
});
let mid = 0;
const C = (stake: "easy" | "normal" | "hard" | "expert" = "normal", online = false) => ({ matchId: `t${++mid}`, stake, modeId: "classic", online });

console.log("1. XP après chaque partie (selon la place)");
for (let place = 1; place <= 4; place++) {
  const p = defaultProfile();
  const s = applyMatch(p, O(place), C(), day(5))!;
  const want = XP_BY_PLACE[place - 1];
  check(s.lines[0].xp === want && (s.levelAfter > 1 || p.xp === want), `${place}e place → +${want} XP`);
}
check(placeXp(2, true) === 70, "égalité pour la 1re place → XP de 2e (70)");
check(XP_BY_PLACE.join() === "100,70,50,35", "barème 100 / 70 / 50 / 35");

console.log("2. Passage de niveau au bon seuil");
{
  const p = defaultProfile();
  addXp(p, levelXp(1) - 1);
  check(p.level === 1 && p.xp === levelXp(1) - 1, `${levelXp(1) - 1} XP : toujours niveau 1`);
  const c0 = p.coins;
  addXp(p, 1);
  check(p.level === 2 && p.xp === 0 && p.coins === c0 + LEVEL_UP_COINS, `+1 XP → niveau 2 pile, +${LEVEL_UP_COINS} pièces`);
  addXp(p, levelXp(2) + levelXp(3) + 5);
  check(p.level === 4 && p.xp === 5 && p.chests.common === 1, "plusieurs niveaux d'un coup : niveau 4, coffre du niveau 3 donné");
  const q = defaultProfile();
  addXp(q, 1e9);
  check(q.level === LEVEL_MAX && q.xp < levelXp(LEVEL_MAX), `plafond au niveau ${LEVEL_MAX}`);
  check(LEVEL_MAX >= 50, "au moins 50 niveaux");
  check(levelXp(2) < levelXp(10) && levelXp(10) < levelXp(40) && levelXp(40) / levelXp(1) > 10, `courbe : ${levelXp(1)} → ${levelXp(10)} → ${levelXp(40)} XP (rapide puis lente)`);
  let total = 0;
  for (let l = 1; l < 10; l++) total += levelXp(l);
  check(total / 60 < 50, `niveau 10 ≈ ${Math.round(total / 60)} parties`);
  check(q.coins >= (LEVEL_MAX - 1) * LEVEL_UP_COINS && q.owned.includes("title-legend") && q.owned.includes("title-centurion"), "récompenses de tous les niveaux données une fois");
  const before = q.coins;
  addXp(q, 1e6);
  check(q.coins === before, "aucune récompense de niveau donnée deux fois");
}

console.log("3. Maîtrise : seul le personnage joué progresse");
{
  const p = defaultProfile();
  applyMatch(p, O(1, { characterId: "kage", kills: 2 }), C(), day(5));
  check(masteryOf(p, "kage").games === 1 && masteryOf(p, "kage").xp + (masteryOf(p, "kage").level > 1 ? 1 : 0) > 0 && masteryOf(p, "kage").wins === 1 && masteryOf(p, "kage").kills === 2, "Kage : 1 partie, 1 victoire, 2 éliminations");
  check(masteryOf(p, "renard").games === 0 && !p.mastery.renard, "Flamme n'a pas bougé");
  const g = addMastery(p, "kage", 1e7, 0, false);
  check(masteryOf(p, "kage").level === 50 && p.owned.includes("kage-maitre") && p.owned.includes("title-m50-kage"), "paliers 5→50 : skin Maître et titres débloqués");
  check(g.granted.filter((x) => x.itemId === "kage-maitre").length === 1, "chaque palier donné une seule fois");
  check(!p.owned.includes("renard-maitre"), "rien pour les autres personnages");
  check(MASTERY_STEPS.join() === "5,10,15,20,30,40,50" && masteryXp(1) < masteryXp(30), "paliers 5/10/15/20/30/40/50");
  const br = buy(p, "renard-maitre", day(5));
  check(!br.ok && br.reason === "exclusive", "skin de maîtrise : impossible à acheter");
}

console.log("4-5. Missions du jour et de la semaine");
{
  const p = defaultProfile();
  ensureMissions(p, day(5));
  ensureWeekly(p, day(5));
  check(p.missions.list.length === 3 && p.weekly.list.length === WEEKLY_PER_WEEK, "3 missions du jour + 3 de la semaine");
  const s = applyMatch(p, O(1, { kills: 3 }), C(), day(5))!;
  check(p.missions.list.some((m) => m.progress > 0) && p.weekly.list.some((m) => m.progress > 0), "elles avancent après une partie");
  for (const m of p.missions.list) m.progress = 999;
  const id = p.missions.list[0].id;
  const c0 = p.coins;
  const lv0 = p.level * 1e6 + p.xp;
  const got = claimMission(p, id);
  check(!!got && p.coins > c0 && p.level * 1e6 + p.xp > lv0, "mission du jour : pièces + XP");
  check(claimMission(p, id) === null && p.coins === c0 + got!.reduce((a, g) => a + g.coins, 0), "jamais récupérée deux fois");
  check(claimMission(p, p.missions.list[1].id) !== null, "une autre mission terminée : OK");
  p.missions.list[2].progress = 0;
  check(claimMission(p, p.missions.list[2].id) === null, "mission en cours : impossible à récupérer");
  for (const m of p.weekly.list) m.progress = 999;
  const wid = p.weekly.list[0].id;
  check(!!claimWeekly(p, wid) && claimWeekly(p, wid) === null, "mission de la semaine : récupérée une seule fois");
  void s;
}

console.log("6. Renouvellement jour / semaine");
{
  const p = defaultProfile();
  ensureMissions(p, day(5, 23));
  const l1 = JSON.stringify(p.missions);
  ensureMissions(p, day(5, 23));
  check(JSON.stringify(p.missions) === l1, "même jour : mêmes missions (progression gardée)");
  ensureMissions(p, day(6, 1));
  check(p.missions.day === "2026-10-06" && p.missions.list.every((m) => m.progress === 0 && !m.claimed), "le lendemain : nouvelles missions");
  check(weekKey(day(5)) === weekKey(day(11)) && weekKey(day(11)) !== weekKey(day(12)), "semaine : du lundi au dimanche");
  ensureWeekly(p, day(7));
  const wk = p.weekly.week;
  p.weekly.list[0].progress = 5;
  ensureWeekly(p, day(10));
  check(p.weekly.week === wk && p.weekly.list[0].progress === 5, "même semaine : progression gardée");
  ensureWeekly(p, day(12, 8));
  check(p.weekly.week === "2026-10-12" && p.weekly.list.every((m) => m.progress === 0), "lundi suivant : nouvelles missions de la semaine");
  // horloge reculée
  const q = defaultProfile();
  claimDaily(q, day(8));
  check(claimDaily(q, day(7)) === null && !dailyState(q, day(7)).available, "reculer l'heure du téléphone ne rouvre pas la récompense du jour");
  check(trustedNow(q, day(1)).getTime() === day(8).getTime(), "l'heure de confiance ne recule jamais");
  const r = defaultProfile();
  setServerTime(r, day(5).getTime(), day(9).getTime());
  check(Math.abs(trustedNow(r, day(9)).getTime() - day(5).getTime()) < 1000, "heure du serveur prise en compte (téléphone avancé de 4 jours)");
}

console.log("7. Succès débloqués au bon moment");
{
  const p = defaultProfile();
  check(checkAchievements(p).length === 0, "nouveau profil : aucun succès");
  const s = applyMatch(p, O(2), C(), day(5))!;
  check(s.achievements.some((a) => a.id === "first-game") && !s.achievements.some((a) => a.id === "first-win"), "1re partie (2e place) : « Premier pas » seulement");
  const s2 = applyMatch(p, O(1), C(), day(5))!;
  check(s2.achievements.some((a) => a.id === "first-win"), "1re victoire : « Première victoire »");
  const c0 = p.coins;
  const g = claimAchievement(p, "first-win");
  check(!!g && p.coins === c0 + 100 && claimAchievement(p, "first-win") === null, "récompense récupérée une seule fois");
  check(claimAchievement(p, "wins-200") === null, "succès verrouillé : rien à récupérer");
  check(achievementList(p).find((a) => a.def.id === "wins-10")!.value === 1, "progression affichée (1 / 10)");
  check(ACHIEVEMENTS.length >= 30 && new Set(ACHIEVEMENTS.map((a) => a.id)).size === ACHIEVEMENTS.length, `${ACHIEVEMENTS.length} succès, identifiants uniques`);
  check(ACHIEVEMENTS.every((a) => a.reward.every((r) => r.kind !== "item" || !!getItem(r.id))), "toutes les récompenses de succès existent");
}

console.log("8. Connexion quotidienne");
{
  const p = defaultProfile();
  const got = [] as number[];
  for (let d = 5; d <= 11; d++) {
    const g = claimDaily(p, day(d))!;
    got.push(g[0].coins);
    check(claimDaily(p, day(d, 22)) === null, `jour ${d - 4} : une seule fois`);
  }
  check(got.slice(0, 6).join() === "50,75,100,100,150,200" && p.chests.rare === 1, "cycle 50/75/100/100/150/200 puis coffre rare");
  check(LOGIN_REWARDS.length === 7, "cycle de 7 jours");
  claimDaily(p, day(15));
  check(p.daily.streak === 8 && p.coins === 50 + 75 + 100 + 100 + 150 + 200 + 50, "jours ratés : on reprend le cycle (pas de punition)");
}

console.log("9. Coffres : contenu donné et sauvegardé");
{
  const p = defaultProfile();
  p.chests.epic = 1;
  const be = memoryBackend();
  const sv = new SaveSystem(be);
  let x = 0.37;
  const rnd = () => (x = (x * 9301 + 49297) % 233280 / 233280);
  const c0 = p.coins;
  const res = openChest(p, "epic", rnd)!;
  sv.save(p); // l'interface sauvegarde ICI, avant l'animation
  const back = sv.load();
  check(!!res && back.chests.epic === 0 && back.coins === p.coins && p.coins >= c0 + CHESTS.epic.coins[0], `coffre épique ouvert : +${res.coins} pièces, coffre retiré, sauvegardé`);
  check(res.items.length === CHESTS.epic.drops && res.items.every((g) => g.duplicate || owns(back, g.itemId!)), `${res.items.length} objets ajoutés à la collection`);
  check(openChest(p, "epic") === null, "plus de coffre : rien à ouvrir");
  // doublons → pièces
  const q = defaultProfile();
  q.ownedCharacters.push("pingo");
  for (const it of CATALOG) if (!it.free && it.kind !== "character" && (!it.exclusive || it.exclusive === "chest")) q.owned.push(it.id);
  q.chests.legend = 1;
  const before = q.coins;
  const r2 = openChest(q, "legend")!;
  check(r2.items.every((g) => g.duplicate && g.coins > 0) && q.coins === before + r2.coins + r2.items.reduce((a, g) => a + g.coins, 0), "tout possédé : doublons remplacés par des pièces");
  check(CHEST_ORDER.every((t) => Object.values(CHESTS[t].odds).reduce((a, b) => a + b, 0) === 100), "probabilités de chaque coffre = 100 %");
  check(chestPool(defaultProfile(), "epic").every((i) => !i.exclusive || i.exclusive === "chest") && !chestPool(defaultProfile(), "legend").some((i) => i.kind === "character"), "pas d'objets exclusifs ni de personnages dans les coffres");
  check(chestPool(defaultProfile(), "rare").every((i) => i.kind !== "skin" || i.characterId !== "pingo"), "pas de skin d'un personnage non débloqué");
  // statistiques sur 4000 tirages (rareté)
  const counts: Record<string, number> = {};
  const t = defaultProfile();
  t.chests.rare = 4000;
  for (let i = 0; i < 4000; i++) for (const g of openChest(t, "rare")!.items) counts[g.rarity!] = (counts[g.rarity!] ?? 0) + 1;
  check(Math.abs((counts.rare ?? 0) / 4000 - 0.45) < 0.04 && Math.abs((counts.common ?? 0) / 4000 - 0.4) < 0.04, `tirages conformes aux probabilités (rare ${Math.round(((counts.rare ?? 0) / 40))} %, commun ${Math.round(((counts.common ?? 0) / 40))} %)`);
}

console.log("10. Pièces cohérentes avec la boutique");
{
  const p = defaultProfile();
  p.coins = 600;
  check(buy(p, "boom-confetti", day(5)).ok && p.coins === 100 && owns(p, "boom-confetti"), "explosion achetée en boutique (500)");
  check(!buy(p, "title-champion", day(5)).ok, "titre de succès : pas en vente");
  grant(p, { kind: "item", id: "boom-confetti" });
  check(p.coins === 200 && p.owned.filter((x) => x === "boom-confetti").length === 1, "objet déjà acheté gagné à nouveau : remplacé par 100 pièces");
  p.coins = 5;
  applyMatch(p, O(4), C("expert"), day(5));
  check(p.coins >= 0, "jamais de solde négatif");
}

console.log("11. Équipement conservé après rechargement");
{
  const sv = new SaveSystem(memoryBackend());
  const p = sv.load();
  p.coins = 5000;
  buy(p, "boom-neon", day(5));
  equip(p, "boom-neon");
  grant(p, { kind: "item", id: "title-lucky" });
  equip(p, "title-lucky");
  sv.save(p);
  const b = sv.load();
  check(b.equipped.boom === "boom-neon" && b.equipped.title === "title-lucky" && isEquipped(b, "title-lucky"), "explosion et titre équipés relus");
}

console.log("12. Rang : vraie valeur calculée, pas inventée");
{
  const p = defaultProfile();
  check(p.rank.points === 0 && rankIndex(0) === 0, "départ : Bronze, 0 point");
  const s = applyMatch(p, O(1), C("normal"), day(5))!;
  check(s.tx.rank?.delta === 20 && p.rank.points === 20 && p.rank.history.length === 1, "1er en Normal à 4 : +20 points");
  const s2 = applyMatch(p, O(4), C("normal"), day(5))!;
  check(s2.tx.rank?.delta === 0 && s2.tx.rank.protected && p.rank.points === 20, "en Bronze, une défaite ne fait rien perdre");
  p.rank.points = 500;
  const s3 = applyMatch(p, O(4), C("hard"), day(5))!;
  check(s3.tx.rank?.delta === -15 && p.rank.points === 485, "en Or, 4e en Difficile : −15");
  const s4 = applyMatch(p, O(1), C("normal", true), day(5))!;
  check(!s4.tx.rank && p.rank.points === 485 && !isRanked(true), "partie privée en ligne : non classée");
  check(rankDelta(1, "normal", 2) === 7 && rankDelta(1, "normal", 4) === 20, "1 contre 1 : moins de points (+7)");
  const q = defaultProfile();
  q.rank.points = RANKS[1].min - 5;
  applyMatch(q, O(1), C("normal"), day(5));
  const chestsAfter = q.chests.rare;
  q.rank.points = RANKS[1].min - 5;
  applyMatch(q, O(1), C("normal"), day(5));
  check(chestsAfter >= 1 && q.chests.rare === chestsAfter, "récompense de rang donnée une seule fois");
  const ab = defaultProfile();
  ab.rank.points = 900;
  beginMatch(ab, { matchId: "ab", stake: "hard", modeId: "classic", players: 4 });
  settleAbandoned(ab);
  check(ab.rank.points === 885, "abandon : compté comme dernière place pour le rang aussi");
}

console.log("Séries de victoires");
{
  const p = defaultProfile();
  const bonus: number[] = [];
  for (let i = 1; i <= 11; i++) {
    const s = applyMatch(p, O(1), C("easy"), day(5))!;
    bonus.push(s.tx.streakBonus?.find((g) => g.reward.kind === "coins")?.coins ?? 0);
  }
  check(bonus[2] === STREAK_BONUSES[3].coins && bonus[4] === STREAK_BONUSES[5].coins && bonus[9] === STREAK_BONUSES[10].coins, "bonus à 3, 5 et 10 victoires d'affilée");
  check(bonus.filter((b) => b > 0).length === 3 && bonus[10] === 0, "pas d'autre bonus (pas de pièces en excès)");
  check(p.stats.bestWinStreak === 11, "record mémorisé");
  applyMatch(p, O(2), C("easy"), day(5));
  check(p.winStreak === 0 && p.stats.bestWinStreak === 11, "défaite : série remise à zéro, record gardé");
}

console.log("13. Ancienne sauvegarde migrée");
{
  const old = migrate({ version: 2 as never, coins: 900, level: 12, xp: 9999, wins: 30, played: 80, winStreak: 4, owned: ["acc-cap"], daily: { last: "2026-10-01", streak: 9 } } as never);
  check(old.coins === 900 && old.level === 12 && old.xp < levelXp(12) && owns(old, "acc-cap"), "pièces, niveau et achats gardés");
  check(old.levelRewardsUpTo === 12 && old.stats.bestWinStreak === 4 && old.equipped.boom === "boom-classic" && old.rank.points === 0, "nouveaux champs initialisés sans récompense rétroactive");
  check(LEVEL_REWARDS[10].length > 0, "table des récompenses de niveau");
}

console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert ✅");
(globalThis as unknown as { process: { exit(c: number): void } }).process.exit(failures ? 1 : 0);
