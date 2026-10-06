/**
 * Thèmes visuels des maps. Une nouvelle map = un nouveau thème ici
 * (couleurs + fonctions de dessin des tuiles), sans toucher au moteur.
 */
export interface Theme {
  id: string;
  background: string; // fond derrière l'arène
  grassA: string;
  grassB: string;
  grassDetail: string;
  flowerColors: string[];
  shadow: string;
  /** contour des sprites (encre) */
  ink: string;
  stone: { top: string; side: string; light: string; moss: string };
  crate: { top: string; side: string; plank: string; band: string };
  bush: { top: string; side: string; light: string; berry: string };
  border: { trunk: string; leafDark: string; leafMid: string; leafLight: string };
}

export const THEMES: Record<string, Theme> = {
  forest: {
    id: "forest",
    background: "#1e3a24",
    grassA: "#7ccb4f",
    grassB: "#71c046",
    grassDetail: "#5eaa3a",
    flowerColors: ["#fff6d8", "#ffd84a", "#ff9ec4"],
    shadow: "rgba(18, 48, 20, 0.32)",
    ink: "#1d2a1f",
    stone: { top: "#a7b0b4", side: "#6f797f", light: "#cfd6d9", moss: "#5aa83a" },
    crate: { top: "#d9a05b", side: "#9c6230", plank: "#b97a3d", band: "#7a4a22" },
    bush: { top: "#2f9b48", side: "#1f6e33", light: "#4fc163", berry: "#ff5470" },
    border: { trunk: "#6b4426", leafDark: "#173f22", leafMid: "#22582e", leafLight: "#2f733a" },
  },
};

export function getTheme(id: string): Theme {
  return THEMES[id] ?? THEMES.forest;
}
