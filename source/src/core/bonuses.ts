import { RULES } from "./rules";
import type { PlayerState } from "./types";

/**
 * Registre des bonus. Ajouter un bonus = ajouter une entrée ici
 * (+ son dessin dans render/sprites.ts). La simulation ne connaît
 * aucun bonus en dur.
 */
export interface BonusDef {
  id: string;
  label: string;
  description: string;
  /** retourne false si le bonus n'a eu aucun effet (déjà au max) */
  apply(p: PlayerState): boolean;
}

export const BONUSES: Record<string, BonusDef> = {
  bomb: {
    id: "bomb",
    label: "Bombe +1",
    description: "Une bombe de plus en même temps.",
    apply(p) {
      if (p.maxBombs >= RULES.maxBombs) return false;
      p.maxBombs++;
      return true;
    },
  },
  flame: {
    id: "flame",
    label: "Flamme +1",
    description: "Portée d'explosion augmentée.",
    apply(p) {
      if (p.range >= RULES.maxRange) return false;
      p.range++;
      return true;
    },
  },
  speed: {
    id: "speed",
    label: "Vitesse",
    description: "Tu cours plus vite (permanent).",
    apply(p) {
      if (p.speedLevel >= RULES.maxSpeedLevel) return false;
      p.speedLevel++;
      p.speed = RULES.baseSpeed + p.speedLevel * RULES.speedPerLevel;
      return true;
    },
  },
  shield: {
    id: "shield",
    label: "Bouclier",
    description: "Charge un bouclier : bouton 🛡️ pour 3 s d'invincibilité.",
    apply(p) {
      if (p.shieldCharges >= RULES.maxShieldCharges) return false;
      p.shieldCharges++;
      return true;
    },
  },
};
