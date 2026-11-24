/**
 * « Comment l'obtenir ? » pour chaque objet (collection) : on lit toutes
 * les tables de récompenses, rien n'est écrit à la main.
 */
import { CHARACTERS } from "../core/characters";
import { getItem } from "./catalog";
import { ACHIEVEMENTS, LEVEL_REWARDS, MASTERY_STEPS, RANKS, masteryRewards, type Reward } from "./progress-config";
import { STEPS } from "./rank";
import { passTrack } from "./pass";

const hasItem = (list: Reward[] | undefined, id: string) => !!list?.some((r) => r.kind === "item" && r.id === id);

export function unlockText(id: string): string {
  const it = getItem(id);
  if (!it) return "";
  if (it.free) return "Offert";
  for (const [lvl, list] of Object.entries(LEVEL_REWARDS)) if (hasItem(list, id)) return `Atteins le niveau ${lvl}`;
  for (const c of CHARACTERS) {
    const tbl = masteryRewards(c.id);
    for (const s of MASTERY_STEPS) if (hasItem(tbl[s], id)) return `Maîtrise ${c.name} niveau ${s}`;
  }
  for (const a of ACHIEVEMENTS) if (hasItem(a.reward, id)) return `Succès « ${a.name} »`;
  for (const st of STEPS) if (hasItem(st.reward, id)) return `Atteins ${st.name} en Compétition`;
  for (const r of RANKS) if (hasItem(r.reward, id)) return `Atteins le rang ${r.name}`;
  if (it.exclusive === "adventure") return it.desc || "Mode Aventure";
  if (it.exclusive === "pass") {
    const t = passTrack();
    const hit = (r: Reward | null) => !!r && ((r.kind === "item" && r.id === id) || (r.kind === "theme" && it.kind === "skin" && it.theme === r.id));
    for (let n = 1; n < t.prem.length; n++) {
      if (hit(t.free[n])) return `Pass de saison, palier ${n}`;
      if (hit(t.prem[n])) return `Pass de saison Premium, palier ${n}`;
    }
    return "Pass de saison (saison terminée)";
  }
  if (it.exclusive === "chest") return "Uniquement dans les coffres";
  if (it.kind === "character") return "Boutique";
  return "Boutique ou coffres";
}

/** Palier de Compétition qui donne cet objet (« Diamant I »), sinon null. */
export function rankStepFor(id: string): string | null {
  return STEPS.find((st) => hasItem(st.reward, id))?.name ?? null;
}
