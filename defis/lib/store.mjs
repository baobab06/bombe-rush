// Persistance alpha : un fichier JSON, écrit de façon atomique (fichier temporaire + renommage).
// Suffisant pour quelques groupes d'amis ; à remplacer par une vraie base avant la v1.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const EMPTY = () => ({
  users: {}, groups: {}, challenges: {}, attempts: {}, trainings: {},
  rematches: {}, taunts: {}, notifications: {}, sent: {},
});

export class Store {
  /** @param {string|null} file  null = en mémoire seulement (tests) */
  constructor(file = null) {
    this.file = file;
    this.data = EMPTY();
    if (file && existsSync(file)) this.data = { ...EMPTY(), ...JSON.parse(readFileSync(file, "utf8")) };
    this.timer = null;
  }

  /** Demande une sauvegarde (regroupée, au plus une toutes les 500 ms). */
  save() {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => this.flush(), 500);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data));
    renameSync(tmp, this.file);
  }
}
