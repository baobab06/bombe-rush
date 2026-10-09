/**
 * « Comment l'obtenir ? » pour chaque objet (collection) : on lit toutes
 * les tables de récompenses, rien n'est écrit à la main.
 */
import { CHARACTERS } from "../core/characters";
import { getItem } from "./catalog";
import { ACHIEVEMENTS, LEVEL_REWARDS, MASTERY_STEPS, RANKS, masteryRewards, type Reward } from "./progress-config";

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
  for (const r of RANKS) if (hasItem(r.reward, id)) return `Atteins le rang ${r.name}`;
  if (it.exclusive === "chest") return "Uniquement dans les coffres";
  if (it.kind === "character") return "Boutique";
  return "Boutique ou coffres";
}
