import { BotBrain } from "../ai/bot";
import { Match, type MatchConfig } from "../core/match";
import { DT } from "../core/rules";
import type { InputCmd } from "../core/types";

/**
 * Une session de jeu fournit la simulation à l'écran de jeu.
 * - LocalSession : tout tourne sur le téléphone (solo contre bots). ✅
 * - OnlineSession : enverra les entrées au serveur et appliquera ses
 *   instantanés. À implémenter quand le serveur existera (voir protocol.ts).
 * L'écran de jeu ne dépend que de cette interface.
 */
export interface GameSession {
  readonly match: Match;
  readonly localPlayer: number;
  step(localInput: InputCmd): void;
  dispose(): void;
}

export class LocalSession implements GameSession {
  readonly match: Match;
  readonly localPlayer: number;
  private bots: BotBrain[] = [];

  constructor(config: MatchConfig, localPlayer: number) {
    this.match = new Match(config);
    this.localPlayer = localPlayer;
    config.players.forEach((slot, i) => {
      if (slot.isBot) this.bots.push(new BotBrain(i, slot.difficulty ?? "normal", config.seed + i));
    });
  }

  step(localInput: InputCmd): void {
    const inputs: InputCmd[] = this.match.players.map(() => ({ mx: 0, my: 0, bomb: false, ability: false }));
    inputs[this.localPlayer] = localInput;
    for (const b of this.bots) inputs[b.playerId] = b.update(this.match, DT);
    this.match.step(inputs);
  }

  dispose(): void {
    this.bots = [];
  }
}
