/**
 * Langues : dictionnaire complet et cohérent, traduction des textes affichés.
 *   bun tests/i18n.test.ts
 */
import DICT from "../src/i18n/dict.gen.json";
import { loadLang, tr, t, LANGS } from "../src/i18n/i18n";

let fails = 0;
const ok = (name: string, cond: boolean, info = "") => {
  console.log(`  ${cond ? "✓" : "✗"} ${name}${cond ? "" : "  " + info}`);
  if (!cond) fails++;
};
const d = DICT as unknown as Record<string, string[]>;

console.log("Dictionnaire");
for (const { id } of LANGS) {
  if (id === "fr") continue;
  const vals = d[id] ?? [];
  const missing = d.keys.filter((_, i) => !vals[i]);
  ok(`${id} : chaque texte a sa traduction (${d.keys.length})`, missing.length === 0, missing.slice(0, 5).join(" | "));
  const bad = d.keys.filter((k, i) => {
    const want = new Set(k.match(/\{\d+\}/g) ?? []);
    return (vals[i]?.match(/\{\d+(?:\|[^}]*)?\}/g) ?? []).some((h) => !want.has(h.replace(/\|.*\}/, "}")));
  });
  ok(`${id} : parties variables cohérentes`, bad.length === 0, bad.slice(0, 5).join(" | "));
  const tags = d.keys.filter((k, i) => {
    const tg = (x: string) => (x.match(/<\/?\w+>/g) ?? []).sort().join();
    return k.includes("</") && tg(k) !== tg(vals[i] ?? "");
  });
  ok(`${id} : mêmes balises dans les phrases mises en forme`, tags.length === 0, tags.slice(0, 5).join(" | "));
}

console.log("Traduction (anglais)");
loadLang("en");
ok("texte exact", tr("Boutique") === "Shop");
ok("espaces autour gardés", tr("  Boutique ") === "  Shop ");
ok("gabarit avec nombre", tr("Il te manque 120 pièces") === "You need 120 more coins", String(tr("Il te manque 120 pièces")));
ok("pluriel : 1", tr("Joue 1 parties") === "Play 1 match", String(tr("Joue 1 parties")));
ok("pluriel : 5", tr("Joue 5 parties") === "Play 5 matches", String(tr("Joue 5 parties")));
ok("morceau variable traduit lui aussi", tr("🎯 Mission du jour terminée : Casse 30 caisses") === "🎯 Daily mission complete: Break 30 crates", String(tr("🎯 Mission du jour terminée : Casse 30 caisses")));
ok("emoji et ponctuation autour", tr("🎲 Aléatoire") === "🎲 Random" && tr("Victoire !") === "Victory!", `${tr("🎲 Aléatoire")} / ${tr("Victoire !")}`);
ok("majuscules", tr("BOUTIQUE") === "SHOP");
ok("division de rang", tr("Argent II") === "Silver II", String(tr("Argent II")));
ok("le nom du jeu ne change pas", tr("BOMBE") === null && tr("RUSH") === null);
ok("phrase mise en forme", tr("Il te restera <b>12</b> pièces.") === "You'll have <b>12</b> coins left.", String(tr("Il te restera <b>12</b> pièces.")));
ok("texte inconnu : rien", tr("Guigui") === null && t("Guigui") === "Guigui");
ok("déjà traduit : pas retraduit", tr("Shop") === null);
ok("place (ordinal)", tr("2e place") === "2nd place", String(tr("2e place")));

console.log("Traduction (allemand)");
loadLang("de");
ok("pluriel allemand", tr("🎁 3 cadeaux à ouvrir !") === "🎁 3 Geschenke zum Öffnen!", String(tr("🎁 3 cadeaux à ouvrir !")));
ok("pluriel avec le « s » français", tr("victoires d'affilée") === "Siege in Folge" && tr("victoire d'affilée") === "Sieg in Folge", `${tr("victoires d'affilée")} / ${tr("victoire d'affilée")}`);

loadLang("fr");
ok("français : rien n'est touché", tr("Boutique") === null);

console.log(fails ? `\n${fails} échec(s)` : "\nTout est vert ✅");
if (fails) process.exit(1);
