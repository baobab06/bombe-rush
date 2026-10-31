/* Partie EN LIGNE simulée : le vrai serveur (GameRunner) + deux clients miroirs
 * qui ne reçoivent que les messages du serveur. `bun tests/online.test.ts` */
import { GameRunner } from "../server/game";
import { Match } from "../src/core/match";
import { MAPS } from "../src/maps";
import { applySnapshot } from "../src/net/snapshot";
import type { InputCmd, SimEvent } from "../src/core/types";

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; console.log("  ✗ " + msg); } else console.log("  ✓ " + msg);
}

type Msg = { t: string; [k: string]: unknown };
const inbox = new Map<string, Msg[]>([["A", []], ["B", []]]);
const runner = new GameRunner(
  [{ token: "A", name: "A", characterId: "pip" }, { token: "B", name: "B", characterId: "renard" }],
  { mapId: "factory", modeId: "koth", fillBots: true, maxPlayers: 4 },
  (token, msg) => inbox.get(token)!.push(JSON.parse(JSON.stringify(msg))),
  () => {},
);
const r = runner as unknown as { tick(): void };
const m = runner.match;
runner.sendStart("A"); runner.sendStart("B");
// clients miroirs (comme dans le navigateur)
const mirrors = new Map<string, { match: Match; events: SimEvent[] }>();
const pump = () => {
  for (const [tok, msgs] of inbox) {
    for (const msg of msgs) {
      if (msg.t === "matchStart") {
        const map = MAPS.find((mp) => mp.id === msg.mapId)!;
        mirrors.set(tok, { match: new Match({ seed: msg.seed as number, map, modeId: msg.modeId as string, players: msg.slots as never }), events: [] });
      }
      if (msg.t === "snap") {
        const mi = mirrors.get(tok)!;
        const s = msg.s as { events: SimEvent[] };
        applySnapshot(mi.match, s as never);
        mi.events.push(...s.events);
      }
    }
    msgs.length = 0;
  }
};
pump();
check(mirrors.size === 2 && mirrors.get("A")!.match.players.length === 4, "deux joueurs connectés, partie Domination 2 contre 2 (bots en renfort)");
let seq = 0;
const send = (tok: string, cmd: Partial<InputCmd> & Record<string, unknown>) => runner.input(tok, ++seq, { mx: 0, my: 0, bomb: false, ability: false, ...cmd } as InputCmd);
const ticks = (n: number, tok?: string, cmd?: Partial<InputCmd>) => { for (let i = 0; i < n; i++) { if (tok) send(tok, cmd ?? {}); r.tick(); } pump(); };
while (m.phase === "countdown") r.tick();
m.specials.disabled = true;
const me = m.players[0];
me.x = 2.5; me.y = 6.5; me.faceX = 1; me.faceY = 0; me.shieldTime = 60;
for (const p of m.players) p.shieldTime = 60;
ticks(3);
// télécommandée : pose, visible chez les deux, BOUM
me.remoteCharges = 1;
ticks(1, "A", { bomb: true });
ticks(6);
const remoteA = [...mirrors.get("A")!.match.bombs.values()].find((b) => b.remote);
const remoteB = [...mirrors.get("B")!.match.bombs.values()].find((b) => b.remote);
check(!!remoteA && !!remoteB, "bombe télécommandée posée : visible (avec son antenne) chez les deux joueurs");
me.x = 1.5; me.y = 1.5;
ticks(20);
ticks(1, "A", { remote: true });
ticks(6);
check(mirrors.get("B")!.events.some((e) => e.t === "remoteDetonate") && ![...m.bombs.values()].some((b) => b.remote), "BOUM envoyé par le client A : le serveur fait sauter la bombe, B voit la détonation");
// capacité inexistante / entrées bizarres : ignorées, pas d'erreur
const before = m.bombs.size;
ticks(1, "A", { throw: true, remote: true });
const pB = m.players[1];
const x0 = pB.x, y0 = pB.y;
send("B", { throw: "oui" as unknown as boolean, remote: 1 as unknown as boolean, hack: true, mx: 99, my: -99 });
r.tick();
const q = (runner as unknown as { lastCmd: InputCmd[] }).lastCmd[1] as InputCmd & { hack?: unknown };
ticks(2);
const step = Math.hypot(pB.x - x0, pB.y - y0);
check(m.bombs.size === before && q.mx === 1 && q.my === -1 && q.throw === true && q.remote === true && q.hack === undefined && step <= pB.speed * 3 / 60 * 1.5 + 1e-6, "entrées sans capacité ou trafiquées (valeurs folles, champs inconnus) : nettoyées, rien ne se passe");
// lancer + toxique + gel : l'état en ligne suit
me.x = 2.5; me.y = 6.5; me.faceX = 1; me.faceY = 0;
me.throwCharges = 1; me.toxicCharges = 1;
ticks(30);
ticks(1, "A", { throw: true });
ticks(2);
check([...mirrors.get("B")!.match.bombs.values()].some((b) => b.flight && b.toxic), "bombe toxique lancée : B la voit en vol");
ticks(60 * 3);
check(mirrors.get("A")!.match.toxicZones.length === 1 && mirrors.get("B")!.match.toxicZones.length === 1, "nuage toxique visible chez les deux joueurs");
ticks(60 * 3.5);
check(mirrors.get("B")!.match.toxicZones.length === 0, "le nuage disparaît aussi chez les clients");
// paralysie/gel visibles côté client
m.stun(m.players[1], 0, 1);
m.slow(m.players[1], 0, 2.5);
ticks(3);
const pb = mirrors.get("B")!.match.players[1];
check(pb.stunTime > 0 && pb.slowTime > 0, "paralysie et gel recopiés chez le joueur concerné");
// la partie va au bout
for (const p of m.players) p.shieldTime = 0;
let g = 0;
while (m.phase !== "over" && g++ < 60 * 200) r.tick();
pump();
check(m.phase === "over" && mirrors.get("A")!.match.phase === "over", "fin de partie reçue par les clients");
check(mirrors.get("A")!.match.bonuses.size === 0 && mirrors.get("A")!.match.toxicZones.length === 0, "fin de partie : rien ne reste chez les clients");
runner.stop();
console.log(failures ? `\n${failures} échec(s)` : "\nTout est vert.");
(globalThis as unknown as { process: { exit(c: number): void } }).process.exit(failures ? 1 : 0);
