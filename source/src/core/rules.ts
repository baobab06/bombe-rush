/** Réglages de gameplay centralisés : on équilibre le jeu ici, nulle part ailleurs. */
export const RULES = {
  tickRate: 60,
  countdown: 3, // secondes avant le départ
  matchDuration: 150, // 2:30
  suddenDeathAt: 42, // secondes restantes au déclenchement de la mort subite
  suddenDeathInterval: 0.4,
  suddenDeathWarn: 0.7,
  endDelay: 1.0, // délai après le dernier mort (morts simultanées = égalité)

  baseSpeed: 3.4,
  speedPerLevel: 0.45,
  maxSpeedLevel: 5,

  startBombs: 1,
  maxBombs: 8,
  startRange: 1, // la bombe ne touche qu'une case autour d'elle au début
  maxRange: 8,

  bombFuse: 2.0, // délai avant explosion (s)
  fireDuration: 0.55,

  shieldDuration: 3,
  maxShieldCharges: 1,

  // cheminées volcaniques (map Volcan)
  ventPeriod: 9, // une éruption toutes les 9 s par cheminée
  ventStagger: 3, // décalage entre cheminées
  ventWarn: 1.6, // grondement d'alerte avant l'éruption

  /** tolérance de « glissement » dans les virages (fraction de case) */
  cornerAssist: 0.42,
} as const;

export const DT = 1 / RULES.tickRate;
