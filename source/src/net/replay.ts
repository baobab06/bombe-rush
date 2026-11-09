/**
 * PARTIES CLASSÉES VÉRIFIABLES (classement mondial).
 *
 * La simulation est déterministe : avec la même graine, la même carte, les
 * mêmes personnages et les mêmes commandes, elle donne exactement la même
 * partie. Le jeu enregistre donc les commandes du joueur (compressées) et
 * le serveur REJOUE la partie pour établir lui-même la place : impossible
 * d'envoyer un faux résultat.
 *
 * Partagé par le jeu (enregistrement) et le serveur (vérification).
 */
import { BotBrain } from "../ai/bot";
import { CHARACTERS } from "../core/characters";
import { Match } from "../core/match";
import { MODES } from "../core/modes";
import { DT } from "../core/rules";
import type { Difficulty, InputCmd, PlayerSlot } from "../core/types";
import { MAPS, getMap, mapAllows } from "../maps";

/** Précision du joystick enregistré : 1/32 (valeurs exactes en virgule flottante). */
const Q = 32;

/** Commande arrondie : c'est elle que la simulation reçoit, donc rejouable à l'identique. */
export function quantize(c: InputCmd): InputCmd {
  const mx = Math.max(-Q, Math.min(Q, Math.round((Number.isFinite(c.mx) ? c.mx : 0) * Q))) / Q;
  const my = Math.max(-Q, Math.min(Q, Math.round((Number.isFinite(c.my) ? c.my : 0) * Q))) / Q;
  return { mx, my, bomb: !!c.bomb, ability: !!c.ability, throw: !!c.throw, remote: !!c.remote };
}

const flagsOf = (c: InputCmd) => (c.bomb ? 1 : 0) | (c.ability ? 2 : 0) | (c.throw ? 4 : 0) | (c.remote ? 8 : 0);

/** Journal des commandes : suites [répétitions, mx×32, my×32, appuis]. */
export class InputRecorder {
  readonly log: number[] = [];
  ticks = 0;
  /** Arrondit, enregistre et renvoie la commande à donner à la simulation. */
  record(raw: InputCmd): InputCmd {
    const c = quantize(raw);
    const x = Math.round(c.mx * Q);
    const y = Math.round(c.my * Q);
    const f = flagsOf(c);
    const L = this.log;
    const n = L.length;
    if (n && L[n - 3] === x && L[n - 2] === y && L[n - 1] === f && L[n - 4] < 65535) L[n - 4]++;
    else L.push(1, x, y, f);
    this.ticks++;
    return c;
  }
}

/** Ce qu'il faut pour reconstruire la partie à l'identique. */
export interface RankedSpec {
  seed: number;
  mapId: string;
  modeId: string;
  /** joueur 0 = l'humain ; les autres = bots */
  players: { characterId: string; isBot: boolean; difficulty?: Difficulty }[];
}

export const RANKED_MODES = ["classic", "chaos", "koth"];
export const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard", "expert"];
/** au-delà, la partie est refusée (aucune partie normale ne dure si longtemps) */
export const MAX_TICKS = 60 * 60 * 8;

/** Contrôle la forme de la partie envoyée (null = valide). */
export function checkSpec(s: RankedSpec, expect?: { modeId: string; stake: string; bots: number }): string | null {
  if (!s || typeof s !== "object") return "partie illisible";
  if (!Number.isInteger(s.seed) || s.seed < 0 || s.seed > 2 ** 31) return "graine";
  if (!RANKED_MODES.includes(s.modeId) || !MODES.some((m) => m.id === s.modeId && !m.hidden)) return "mode";
  const map = MAPS.find((m) => m.id === s.mapId);
  if (!map || !mapAllows(map, s.modeId)) return "carte";
  const ps = s.players;
  if (!Array.isArray(ps) || ps.length < 2 || ps.length > 4) return "joueurs";
  if (s.modeId === "koth" && ps.length !== 4) return "joueurs";
  const ids = new Set<string>();
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (!p || !CHARACTERS.some((c) => c.id === p.characterId) || ids.has(p.characterId)) return "personnages";
    ids.add(p.characterId);
    if (p.isBot !== i > 0) return "joueurs";
    if (i > 0 && !DIFFICULTIES.includes(p.difficulty as Difficulty)) return "difficulté";
    if (i > 0 && p.difficulty !== ps[1].difficulty) return "difficulté";
  }
  if (expect) {
    if (expect.modeId !== s.modeId) return "mode";
    if (expect.stake !== ps[1].difficulty) return "difficulté";
    if (expect.bots !== ps.length - 1) return "joueurs";
  }
  return null;
}

export function specSlots(s: RankedSpec): PlayerSlot[] {
  return s.players.map((p) => ({ name: p.isBot ? "bot" : "joueur", characterId: p.characterId, isBot: p.isBot, difficulty: p.isBot ? p.difficulty : undefined }));
}

export interface ReplayOutcome {
  /** l'issue était connue à la fin du journal (sinon : partie abandonnée) */
  complete: boolean;
  place: number;
  players: number;
  won: boolean;
  draw: boolean;
  ticks: number;
}

/** Issue de la partie pour le joueur `me`, exactement comme l'écran de résultats du jeu. */
export function outcomeOf(m: Match, me: number): Omit<ReplayOutcome, "complete" | "ticks"> {
  const st = m.standings();
  const place = st.find((r) => r.id === me)?.place ?? m.players.length;
  const won = m.phase === "over" && m.winnerId >= 0 && (m.winnerId === me || m.sameTeam(m.winnerId, me));
  return { place, players: m.players.length, won, draw: place === 1 && !won };
}

/**
 * Rejoue une partie par morceaux (pour ne pas bloquer le serveur) :
 * `run(n)` avance d'au plus n images et renvoie l'issue quand c'est fini.
 */
export class Replay {
  readonly match: Match;
  private bots: BotBrain[] = [];
  private i = 0;
  private left = 0;
  private cmd: InputCmd = { mx: 0, my: 0, bomb: false, ability: false };
  ticks = 0;
  error: string | null = null;

  constructor(
    spec: RankedSpec,
    private log: number[],
  ) {
    const players = specSlots(spec);
    this.match = new Match({ seed: spec.seed, map: getMap(spec.mapId), modeId: spec.modeId, players });
    players.forEach((p, i) => {
      if (p.isBot) this.bots.push(new BotBrain(i, p.difficulty ?? "normal", spec.seed + i));
    });
    if (!Array.isArray(log) || log.length % 4 !== 0 || log.length > 4 * MAX_TICKS) this.error = "journal";
    else {
      let total = 0;
      for (let k = 0; k < log.length; k += 4) {
        const [n, x, y, f] = [log[k], log[k + 1], log[k + 2], log[k + 3]];
        if (![n, x, y, f].every(Number.isInteger) || n < 1 || n > 65535 || Math.abs(x) > Q || Math.abs(y) > Q || f < 0 || f > 15) {
          this.error = "journal";
          break;
        }
        total += n;
      }
      if (total > MAX_TICKS) this.error = "partie trop longue";
    }
  }

  /** null = pas fini ; sinon l'issue. */
  run(maxSteps: number): ReplayOutcome | null {
    if (this.error) return { complete: false, place: this.match.players.length, players: this.match.players.length, won: false, draw: false, ticks: this.ticks };
    const m = this.match;
    for (let s = 0; s < maxSteps; s++) {
      if (this.left === 0) {
        if (this.i >= this.log.length) return this.finish();
        const L = this.log;
        this.left = L[this.i];
        const f = L[this.i + 3];
        this.cmd = { mx: L[this.i + 1] / Q, my: L[this.i + 2] / Q, bomb: !!(f & 1), ability: !!(f & 2), throw: !!(f & 4), remote: !!(f & 8) };
        this.i += 4;
      }
      this.left--;
      const inputs: InputCmd[] = m.players.map(() => ({ mx: 0, my: 0, bomb: false, ability: false }));
      inputs[0] = this.cmd;
      for (const b of this.bots) inputs[b.playerId] = b.update(m, DT);
      m.step(inputs);
      this.ticks++;
    }
    return null;
  }

  private finish(): ReplayOutcome {
    const m = this.match;
    const me = m.players[0];
    // même condition que le jeu pour afficher le résultat
    const complete = (!me.alive && !m.hill) || m.phase === "over";
    return { complete, ticks: this.ticks, ...outcomeOf(m, 0) };
  }
}

/** Rejoue d'un coup (tests). */
export function replayAll(spec: RankedSpec, log: number[]): ReplayOutcome {
  const r = new Replay(spec, log);
  let out: ReplayOutcome | null = null;
  while (!out) out = r.run(100000);
  return out;
}
