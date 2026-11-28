/**
 * Extraction des textes affichés du jeu (en français) → src/i18n/strings.json
 *   bun scripts/i18n-extract.ts          (écrit la liste)
 *   bun scripts/i18n-extract.ts --check  (liste les textes sans traduction)
 *
 * Les traductions sont indexées par le texte français lui-même : le jeu reste écrit en
 * français, et la couche src/i18n traduit au moment de l'affichage (DOM et canvas).
 * Une partie variable « ${…} » d'un gabarit devient {0}, {1}… dans la clé.
 */
import ts from "typescript";
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "fs";
import { join, relative } from "path";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "src");
const HOLE = "";

// appels dont les chaînes ne s'affichent jamais
const SKIP_CALLS = new Set([
  "querySelector", "querySelectorAll", "getElementById", "closest", "matches", "addEventListener", "removeEventListener",
  "getAttribute", "setAttribute", "removeAttribute", "hasAttribute", "toggleAttribute", "getItem", "setItem", "removeItem", "fetch",
  "createElement", "log", "warn", "error", "debug", "info", "startsWith", "endsWith", "indexOf", "split", "padStart", "padEnd",
  "postMessage", "getPropertyValue", "setProperty", "createLinearGradient", "toLocaleString", "toLocaleDateString", "toLocaleTimeString",
  "load", "require", "Symbol", "on", "off", "emit", "track", "loadSound", "play", "sfx", "music", "icon", "Image", "Audio", "RegExp",
]);
const SKIP_IN_CALLEE_OBJ = new Set(["classList", "dataset", "style", "console", "localStorage", "sessionStorage", "JSON", "crypto"]);

export type Entry = { k: string; f: string[] };

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== "i18n") walk(p, out); } else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

const ENT: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&times;": "×", "&middot;": "·", "&hellip;": "…", "&thinsp;": " ", "&#8239;": " " };
const decode = (s: string) => s.replace(/&[#\w]+;/g, (m) => ENT[m] ?? m);
export const norm = (s: string) => s.replace(/[\s  ]+/g, " ").trim();

/** est-ce un texte à lire (et pas un identifiant, une classe CSS, une clé…) ? */
const JUNK = [
  /sans-serif|system-ui|"Baloo|"Dela|Emoji"/, /^\(.*:.*\)$/, /\b(class|data-[\w-]+|style|id)=/, /^#.*#$/, /^ca-app-pub/, /^[-:&][\w-]*$/, /^&\w+=/,
  /^\d-digit$/, /^Bearer\b/, /^[A-Z0-9]{16,}$/, /\w+\([\d.]+\)/, /^(I|II|III|IV|V|XL|BANK|GOLD|HOTEL|SALOON|GG|ZQSD)$/,
];
const STOP = /^(de|du|des|la|le|les|un|une|et|ou|en|dans|sur|sous|avec|sans|pour|par|à|au|aux|ton|ta|tes|ma|mon|mes|son|sa|ses|se|te|tu|il|elle|on|ne|pas|plus|toi|moi|qui|que|est|a)$/;
function isText(s: string, sure = false): boolean {
  const t = s.replace(new RegExp(HOLE + "\\w+" + HOLE, "g"), " ").trim();
  // « {0} sur {1} », « malus dans {0} s » : un mot à côté d'une partie variable, séparé par une espace
  const proseHole = new RegExp(`${HOLE}\\w+${HOLE} [A-Za-zÀ-ÿ]{2}|[A-Za-zÀ-ÿ]{2} ${HOLE}`).test(s);
  if (!/[A-Za-zÀ-ÿŒœ]{2}/.test(t)) return false;
  if (JUNK.some((r) => r.test(t))) return false;
  if (/^https?:|^data:|^\.{0,2}\/|^#[\w-]+$|\.(png|jpe?g|json|mp3|ogg|webp|svg|html|js|css)$/i.test(t)) return false;
  if (/(^|[\s;{])[a-z-]+\s*:\s*[^;]+;|\b\d+(px|cqh|cqw|vh|vw|em|ms|deg)\b|rgba?\(|hsla?\(|var\(--|^[\d.]+(px|s|ms|%)$/.test(t)) return false;
  if (/^\d+px\s/.test(t) || /\b(bold|italic)\s+[\d.]+(px|em)\b/.test(t)) return false; // ctx.font
  if (proseHole && /[A-Za-zÀ-ÿ]{2}/.test(t) && !/[=<>{}]/.test(t)) return true;
  // texte entre deux balises HTML : il s'affiche forcément (« zone libre »)
  if (sure) return !/^[a-z]+(-[a-z]+)+$/.test(t);
  if (!/\s/.test(t)) {
    // un seul mot : identifiant en minuscules / kebab / camel → non ; mot accentué ou en capitales → oui
    if (/^[a-z][A-Za-z0-9_\-.:/]*$/.test(t)) return false;
    if (/^[A-Z][a-z]+[A-Z]\w*$/.test(t)) return false; // DOMContentLoaded, ArrowUp…
    if (/^(GET|POST|PUT|DELETE|OK|JSON|UTF-8|HTML|CSS|URL|API|ID|SFX|HUD|FPS|AdMob|Google|Android|iOS|BOMBE|RUSH|KO|K\.O\.|VS|XP|PvP|MVP|AI|Escape|Enter|Space|Tab|Backspace|Shift|Control|Alt|Meta)$/.test(t)) return false;
  }
  if (/^[a-z0-9-]+(\s+[a-z0-9-]+)+$/.test(t) && !t.split(/\s+/).some((w) => STOP.test(w))) return false; // liste de classes CSS
  return true;
}

// ---------------------------------------------------------------- HTML
type El = { tag: string; kids: (El | string)[] };
const VOID = new Set(["br", "img", "input", "hr", "meta", "link", "source", "wbr", "col", "area"]);
/** balises « de mise en forme » : une phrase avec <b>…</b> se traduit d'un bloc (voir src/i18n/i18n.ts) */
export const INLINE = new Set(["b", "strong", "i", "em", "u", "small", "span", "kbd"]);
const HOLE_RE = new RegExp(HOLE + "\\w+" + HOLE, "g");

function parse(src: string): El {
  const root: El = { tag: "#root", kids: [] };
  const st = [root];
  for (const m of src.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<\/?([a-zA-Z][\w-]*)\b[^>]*>|[^<]+|</g)) {
    const tok = m[0];
    if (tok.startsWith("</")) {
      const tag = m[1].toLowerCase();
      for (let i = st.length - 1; i > 0; i--) if (st[i].tag === tag) { st.length = i; break; }
    } else if (tok.length > 1 && tok.startsWith("<") && m[1]) {
      const el: El = { tag: m[1].toLowerCase(), kids: [] };
      st[st.length - 1].kids.push(el);
      if (!VOID.has(el.tag) && !tok.endsWith("/>")) st.push(el);
    } else st[st.length - 1].kids.push(tok);
  }
  return root;
}

/** « Pose ton <b>pouce</b> n'importe où » : texte + balises de mise en forme (qui ne contiennent que du texte) */
function richOf(el: El): string | null {
  let out = "", inl = 0, txt = false;
  for (const k of el.kids) {
    if (typeof k === "string") { if (/[A-Za-zÀ-ÿ]{2}/.test(k.replace(HOLE_RE, " "))) txt = true; out += decode(k); }
    else if (INLINE.has(k.tag) && k.kids.every((c) => typeof c === "string")) { inl++; out += `<${k.tag}>${decode((k.kids as string[]).join(""))}</${k.tag}>`; }
    else return null;
  }
  return inl && txt ? norm(out) : null;
}

/** morceaux de texte d'un gabarit (comme le navigateur en fera des nœuds texte) + phrases mises en forme */
export const SURE = "\uE001"; // préfixe : morceau de texte pris entre deux balises
function fragments(src: string, allFrags = false): { frags: string[]; rich: string[] } {
  const frags: string[] = [], rich: string[] = [];
  // attributs lisibles
  for (const m of src.matchAll(/\b(?:title|placeholder|aria-label|alt|data-tip|data-label|data-tr)\s*=\s*"([^"]*)"/g)) frags.push(m[1]);
  if (src.includes("<")) {
    const all = (el: El) => { for (const k of el.kids) typeof k === "string" ? frags.push(SURE + k) : all(k); };
    const walkEl = (el: El, root: boolean) => {
      const r = richOf(el);
      if (r) {
        rich.push(r);
        // au niveau du gabarit lui-même, on ne sait pas où il sera inséré : morceaux en secours
        if (root || allFrags) all(el);
        return;
      }
      for (const k of el.kids) typeof k === "string" ? frags.push(el.tag === "#root" ? k : SURE + k) : walkEl(k, false);
    };
    walkEl(parse(src), true);
  } else {
    frags.push(src);
    // texte brut sur plusieurs lignes (message à partager, notification) : chaque ligne aussi
    if (/\n/.test(src)) for (const l of src.split(/\n+/)) frags.push(l);
  }
  return { frags: frags.map((p) => (p.startsWith(SURE) ? SURE : "") + norm(decode(p.replace(SURE, "")))).filter((p) => p.replace(SURE, "")), rich };
}

/** phrase mise en forme avec trous → clé « Il te manque <b>{0}</b> pièces » */
function richKey(r: string): string | null {
  if (!isText(r.replace(/<[^>]*>/g, " "))) return null;
  let i = 0;
  return r.replace(HOLE_RE, () => `{${i++}}`);
}

/** morceau avec trous → clé « {0} pièces », et ses bouts fixes en secours */
function keys(raw: string): string[] {
  const sure = raw.startsWith(SURE), frag = raw.replace(SURE, "");
  const holes = frag.match(new RegExp(HOLE + "\\w+" + HOLE, "g")) ?? [];
  if (!holes.length) return isText(frag, sure) ? [frag] : [];
  const res: string[] = [];
  let i = 0;
  const k = frag.replace(new RegExp(HOLE + "\\w+" + HOLE, "g"), () => `{${i++}}`);
  if (isText(frag, sure) && k.replace(/\{\d+\}/g, "").trim()) res.push(norm(k));
  for (const part of frag.split(new RegExp(HOLE + "\\w+" + HOLE))) {
    const p = norm(part);
    if (p && isText(p, sure) && /[A-Za-zÀ-ÿ]{2,}/.test(p) && p !== k) res.push(p);
  }
  return res;
}

function calleeInfo(n: ts.Node): { name?: string; obj?: string } {
  if (ts.isIdentifier(n)) return { name: n.text };
  if (ts.isPropertyAccessExpression(n)) {
    const obj = n.expression;
    const on = ts.isIdentifier(obj) ? obj.text : ts.isPropertyAccessExpression(obj) ? obj.name.text : undefined;
    return { name: n.name.text, obj: on };
  }
  return {};
}

function skipNode(node: ts.Node): boolean {
  let p = node.parent;
  if (!p) return false;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)) return true;
  if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p)) && p.name === node) return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
  if (ts.isLiteralTypeNode(p)) return true;
  if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.InKeyword].includes(p.operatorToken.kind)) return true;
  if (ts.isCaseClause(p)) return true;
  // remonte les ?: / || / + pour trouver l'appel englobant
  let c: ts.Node = node;
  while (p && (ts.isConditionalExpression(p) || ts.isParenthesizedExpression(p) || (ts.isBinaryExpression(p) && p.operatorToken.kind !== ts.SyntaxKind.EqualsToken))) { c = p; p = p.parent; }
  if (p && ts.isCallExpression(p) && p.arguments.includes(c as ts.Expression)) {
    const { name, obj } = calleeInfo(p.expression);
    if (obj && SKIP_IN_CALLEE_OBJ.has(obj)) return true;
    if (name && SKIP_CALLS.has(name)) {
      // setAttribute("title", "texte") : le 2e argument s'affiche
      if ((name === "setAttribute") && p.arguments.indexOf(c as ts.Expression) === 1) return false;
      return true;
    }
  }
  if (p && ts.isNewExpression(p)) { const { name } = calleeInfo(p.expression); if (name && SKIP_CALLS.has(name)) return true; }
  return false;
}

export const contexts: { file: string; ctx: string; keys: string[] }[] = [];
const holesOf = (raw: string) => raw.replace(/\{([a-z]\w*)\}/g, (_, w) => HOLE + w + HOLE);
export function extract(): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  const add = (k: string, file: string) => { if (!found.has(k)) found.set(k, new Set()); found.get(k)!.add(file); };
  const take = (raw: string, rel: string, allFrags = false) => {
    const ks: string[] = [];
    const { frags, rich } = fragments(holesOf(raw), allFrags);
    for (const r of rich) { const k = richKey(r); if (k) { add(k, rel); ks.push(k); } }
    for (const fr of frags) for (const k of keys(fr)) { add(k, rel); ks.push(k); }
    if (ks.length) contexts.push({ file: rel, ctx: norm(decode(raw.replace(/<!--[\s\S]*?-->/g, "").replace(/<\/?(b|strong|em|i|u|kbd)\b[^>]*>/g, "‹").replace(/<[^>]*>/g, " ¦ ").replace(new RegExp(HOLE + "\\w+" + HOLE, "g"), "{…}"))), keys: ks });
  };
  for (const file of walk(SRC)) {
    const rel = relative(ROOT, file);
    const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      let raw: string | undefined;
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) raw = node.text;
      else if (ts.isTemplateExpression(node)) {
        raw = node.head.text + node.templateSpans.map((s, i) => `${HOLE}${i}${HOLE}${s.literal.text}`).join("");
      }
      if (raw !== undefined && !skipNode(node)) take(raw, rel);
      // les gabarits imbriqués sont visités aussi (leurs morceaux de texte comptent)
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  // messages d'erreur envoyés par le serveur (affichés tels quels par le jeu)
  for (const file of walk(join(ROOT, "server"))) {
    const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && /^(error|message)$/.test(node.name.text)) {
        const v = node.initializer;
        if (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) take(v.text, relative(ROOT, file));
        else if (ts.isBinaryExpression(v)) for (const x of [v.left, v.right]) if (ts.isStringLiteral(x)) take(x.text, relative(ROOT, file));
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  // page HTML
  const html = readFileSync(join(SRC, "ui/index.html"), "utf8").replace(/<style>[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, "");
  // page statique : le code y remplace souvent des valeurs → morceaux en secours partout
  take(html, "src/ui/index.html", true);
  // textes ajoutés à la main (annonces envoyées par le serveur…)
  const extra = join(SRC, "i18n/extra.json");
  if (existsSync(extra)) for (const k of JSON.parse(readFileSync(extra, "utf8")) as string[]) add(norm(k), "src/i18n/extra.json");
  return found;
}

/** identifiant court et stable d'un texte (FNV-1a) */
export function idOf(k: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36).padStart(7, "0");
}

if (import.meta.main) {
  const found = extract();
  const list: Entry[] = [...found].map(([k, f]) => ({ k, f: [...f].sort() })).sort((a, b) => a.f[0].localeCompare(b.f[0]) || a.k.localeCompare(b.k));
  if (process.argv.includes("--check")) {
    // textes sans traduction, langue par langue (hors keep.txt : noms propres, faux positifs)
    const dir = join(SRC, "i18n/lang");
    const ids = (f: string) => new Set(readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t")[0].trim()));
    const keep = existsSync(join(SRC, "i18n/keep.txt")) ? ids(join(SRC, "i18n/keep.txt")) : new Set<string>();
    const langs = new Map<string, Set<string>>();
    for (const n of existsSync(dir) ? readdirSync(dir) : []) {
      if (!n.endsWith(".tsv")) continue;
      const l = n.split(".")[0];
      if (!langs.has(l)) langs.set(l, new Set());
      for (const id of ids(join(dir, n))) langs.get(l)!.add(id);
    }
    let bad = 0;
    for (const [l, have] of langs) {
      const miss = list.filter((e) => !have.has(idOf(e.k)) && !keep.has(idOf(e.k)));
      if (!miss.length) continue;
      bad++;
      console.log(`${l} : ${miss.length} texte(s) sans traduction`);
      for (const e of miss.slice(0, 40)) console.log(`   ${idOf(e.k)}\t${e.k}\t← ${e.f.join(", ")}`);
    }
    console.log(bad ? "" : "Toutes les langues sont complètes.");
  } else if (process.argv.includes("--work")) {
    // liste de travail pour traduire : chaque texte avec son contexte (phrase complète)
    const seen = new Set<string>();
    const out: string[] = [];
    let file = "";
    for (const c of contexts) {
      const ks = c.keys.filter((k) => !seen.has(k));
      if (!ks.length) continue;
      if (c.file !== file) { file = c.file; out.push(`## ${file}`); }
      const multi = c.keys.length > 1 && c.ctx.replace(/[¦‹]/g, "").trim() !== ks[0];
      if (multi) out.push(`> ${c.ctx}`);
      for (const k of ks) { seen.add(k); out.push(`${idOf(k)}\t${k}`); }
    }
    out.push("## index.html / extra");
    for (const e of list) if (!seen.has(e.k)) { seen.add(e.k); out.push(`${idOf(e.k)}\t${e.k}`); }
    writeFileSync(process.argv[process.argv.indexOf("--work") + 1], out.join("\n"));
    console.log(seen.size, "textes");
  } else {
    writeFileSync(join(SRC, "i18n/strings.json"), JSON.stringify(list, null, 1));
    const ids = new Map<string, string>();
    for (const e of list) { const id = idOf(e.k); if (ids.has(id)) throw new Error(`collision ${id}: ${e.k} / ${ids.get(id)}`); ids.set(id, e.k); }
    console.log(list.length, "textes");
  }
}
