/**
 * Assemble les traductions : src/i18n/lang/<langue>.tsv (« id<TAB>traduction ») → src/i18n/dict.gen.json
 *   bun scripts/i18n-build.ts
 * L'id vient du texte français (voir i18n-extract.ts) : `bun scripts/i18n-extract.ts --work liste.txt`
 * donne la liste à traduire avec son contexte.
 */
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { extract, idOf } from "./i18n-extract";

const DIR = join(import.meta.dir, "../src/i18n");
const LANGS = ["en", "es", "de", "it", "pt"];
const found = extract();
const byId = new Map<string, string>();
for (const k of found.keys()) byId.set(idOf(k), k);

const tr: Record<string, Map<string, string>> = {};
let warn = 0;
for (const l of LANGS) {
  const m = new Map<string, string>();
  const files = readdirSync(join(DIR, "lang")).filter((f) => f === `${l}.tsv` || (f.startsWith(`${l}.`) && f.endsWith(".tsv"))).sort();
  for (const f of files) for (const [n, line] of readFileSync(join(DIR, "lang", f), "utf8").split("\n").entries()) {
    if (!line.trim() || line.startsWith("#")) continue;
    const tab = line.indexOf("\t");
    const id = line.slice(0, tab).trim(), v = line.slice(tab + 1).trim();
    if (tab < 0 || !v) { console.warn(`${f}:${n + 1} ligne illisible`); warn++; continue; }
    const k = byId.get(id);
    if (!k) continue; // texte disparu du jeu
    const want = new Set(k.match(/\{\d+\}/g) ?? []);
    for (const h of v.match(/\{\d+(?:\|[^}]*)?\}/g) ?? []) {
      const base = h.replace(/\|.*\}/, "}");
      if (!want.has(base)) { console.warn(`${l} ${id} : ${h} n'existe pas dans « ${k} »`); warn++; }
    }
    m.set(k, v);
  }
  tr[l] = m;
}
const keys = [...found.keys()].filter((k) => LANGS.some((l) => tr[l].has(k))).sort();
const out: Record<string, string[]> = { keys };
for (const l of LANGS) out[l] = keys.map((k) => tr[l].get(k) ?? "");
writeFileSync(join(DIR, "dict.gen.json"), JSON.stringify(out));
for (const l of LANGS) console.log(`${l} : ${tr[l].size}/${found.size}`);
if (warn) console.log(warn, "avertissement(s)");
