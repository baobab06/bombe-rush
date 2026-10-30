import { RULES } from "./rules";
import type { PlayerState } from "./types";
import { SPECIALS, refuseReason } from "./specials";

/**
 * Registre des bonus. Ajouter un bonus = ajouter une entrée ici
 * (+ son dessin dans render/sprites.ts). La simulation ne connaît
 * aucun bonus en dur.
 */
export interface BonusDef {
  id: string;
  label: string;
  description: string;
  /** capacité de bombe (système commun specials.ts) */
  special?: boolean;
  /** retourne false si le bonus n'a eu aucun effet (déjà au max) */
  apply(p: PlayerState): boolean;
}

const SPECIAL_TEXT: Record<string, string> = {
  throw: "Ta prochaine bombe peut être lancée à 3 cases (bouton LANCER).",
  big: "Ta prochaine bombe explose beaucoup plus loin.",
  elec: "Ta prochaine bombe paralyse les adversaires proches (1 s).",
  freeze: "Ta prochaine bombe ralentit les adversaires proches (−40 %, 2,5 s).",
  toxic: "Ta prochaine bombe laisse un nuage toxique pendant 3 s.",
  chain: "Ta prochaine bombe fait sauter en cascade les bombes proches.",
  remote: "Ta prochaine bombe saute quand tu veux (bouton BOUM).",
};

/** Capacités : une réserve de chaque, règles communes (specials.ts). */
const SPECIAL_BONUSES: Record<string, BonusDef> = Object.fromEntries(
  SPECIALS.map((sp) => [
    sp.id,
    {
      id: sp.id,
      label: sp.label,
      description: SPECIAL_TEXT[sp.id] ?? sp.label,
      special: true,
      apply(p: PlayerState) {
        if (refuseReason(p, sp.id)) return false; // jamais de remplacement silencieux
        p[sp.field] = 1;
        return true;
      },
    } as BonusDef,
  ]),
);

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
  ...SPECIAL_BONUSES,
};
