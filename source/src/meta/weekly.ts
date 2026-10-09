/**
 * MISSIONS DE LA SEMAINE — 3 missions plus longues, renouvelées le lundi.
 */
import { trustedNow } from "./clock";
import { grantAll, type Granted } from "./grants";
import { WEEKLY_MISSIONS, WEEKLY_PER_WEEK, type Reward, type WeeklyDef, type WeeklyStat } from "./progress-config";
import type { Profile } from "./profile";
import { dayKey, seeded } from "./store";

/** Lundi de la semaine (AAAA-MM-JJ). */
export function weekKey(d: Date): string {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return dayKey(m);
}
/** Millisecondes avant le prochain lundi 0 h. */
export function weekLeft(d: Date): number {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7) + 7);
  return m.getTime() - d.getTime();
}

export const weeklyDef = (id: string) => WEEKLY_MISSIONS.find((m) => m.id === id);
export const weeklyLabel = (d: WeeklyDef) => d.label.replace("{n}", String(d.goal));
export function weeklyRewards(d: WeeklyDef): Reward[] {
  const r: Reward[] = [{ kind: "coins", amount: d.coins }, { kind: "xp", amount: d.xp }];
  if (d.chest) r.push({ kind: "chest", tier: d.chest });
  return r;
}

export function ensureWeekly(p: Profile, now?: Date) {
  const wk = weekKey(trustedNow(p, now));
  if (p.weekly.week === wk && p.weekly.list.length) return p.weekly.list;
  const rnd = seeded("weekly-" + wk + p.name);
  const pool = [...WEEKLY_MISSIONS];
  const list: Profile["weekly"]["list"] = [];
  while (list.length < WEEKLY_PER_WEEK && pool.length) {
    const d = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    if (list.some((m) => weeklyDef(m.id)?.stat === d.stat)) continue;
    list.push({ id: d.id, progress: 0, claimed: false });
  }
  p.weekly = { week: wk, list };
  return list;
}

export interface WeeklyFacts {
  won: boolean;
  place: number;
  kills: number;
  blocks: number;
  bonuses: number;
  hard: boolean;
  chaos: boolean;
  online: boolean;
}
export function progressWeekly(p: Profile, f: WeeklyFacts, now?: Date): WeeklyDef[] {
  const done: WeeklyDef[] = [];
  for (const m of ensureWeekly(p, now)) {
    const d = weeklyDef(m.id);
    if (!d || m.claimed) continue;
    const add: Record<WeeklyStat, number> = {
      played: 1,
      wins: f.won ? 1 : 0,
      kills: f.kills,
      blocks: f.blocks,
      bonuses: f.bonuses,
      top2: f.place <= 2 ? 1 : 0,
      hardwins: f.won && f.hard ? 1 : 0,
      chaos: f.chaos ? 1 : 0,
      online: f.online ? 1 : 0,
    };
    const before = m.progress;
    m.progress = Math.min(d.goal, m.progress + add[d.stat]);
    if (before < d.goal && m.progress >= d.goal) done.push(d);
  }
  return done;
}

export function claimWeekly(p: Profile, id: string): Granted[] | null {
  const m = p.weekly.list.find((x) => x.id === id);
  const d = weeklyDef(id);
  if (!m || !d || m.claimed || m.progress < d.goal) return null;
  m.claimed = true;
  p.stats.missionsClaimed++;
  return grantAll(p, weeklyRewards(d), [], "Mission de la semaine");
}

export function weeklyToClaim(p: Profile): number {
  return p.weekly.list.filter((m) => !m.claimed && m.progress >= (weeklyDef(m.id)?.goal ?? Infinity)).length;
}
