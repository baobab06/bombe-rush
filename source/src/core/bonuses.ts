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
  throw: {
    id: "throw",
    label: "Bombe à lancer",
    description: "Ta prochaine bombe peut être lancée à 3 cases (bouton 🎯).",
    apply(p) {
      // une seule capacité à la fois
      if (p.throwCharges >= 1) return false;
      p.throwCharges = 1;
      return true;
    },
  },
  big: {
    id: "big",
    label: "Grosse bombe",
    description: "Ta prochaine bombe explose beaucoup plus loin.",
    apply(p) {
      // une seule grosse bombe en réserve
      if (p.bigCharges >= 1) return false;
      p.bigCharges = 1;
      return true;
    },
  },
  elec: {
    id: "elec",
    label: "Bombe électrique",
    description: "Ta prochaine bombe paralyse les adversaires proches (1 s).",
    apply(p) {
      if (p.elecCharges >= 1) return false;
      p.elecCharges = 1;
      return true;
    },
  },
  freeze: {
    id: "freeze",
    label: "Bombe gelante",
    description: "Ta prochaine bombe ralentit les adversaires proches (−40 %, 2,5 s).",
    apply(p) {
      if (p.freezeCharges >= 1) return false;
      p.freezeCharges = 1;
      return true;
    },
  },
  toxic: {
    id: "toxic",
    label: "Bombe toxique",
    description: "Ta prochaine bombe laisse un nuage toxique pendant 3 s.",
    apply(p) {
      if (p.toxicCharges >= 1) return false;
      p.toxicCharges = 1;
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
