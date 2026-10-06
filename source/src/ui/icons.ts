/**
 * Icônes de l'interface (SVG en ligne, aucune image à charger).
 * Style : formes pleines et arrondies, lisibles en petit.
 */
const svg = (body: string, vb = "0 0 24 24") => `<svg class="ico" viewBox="${vb}" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  play: svg('<path d="M8 4.8c0-1.2 1.3-1.9 2.3-1.3l10 6.4c.9.6.9 2 0 2.6l-10 6.4c-1 .6-2.3-.1-2.3-1.3z" fill="currentColor"/>'),
  back: svg('<path d="M15 4.5 7.5 12l7.5 7.5" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>'),
  hero: svg(
    '<circle cx="12" cy="8.2" r="5.2" fill="currentColor"/><path d="M3.5 21.5c.6-4.6 4.1-7.3 8.5-7.3s7.9 2.7 8.5 7.3z" fill="currentColor"/><circle cx="10" cy="8" r="1" fill="#000" opacity=".35"/><circle cx="14" cy="8" r="1" fill="#000" opacity=".35"/>',
  ),
  shop: svg(
    '<path d="M4 9.5h16l-1.3 10.2a2 2 0 0 1-2 1.8H7.3a2 2 0 0 1-2-1.8z" fill="currentColor"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="9" cy="13.5" r="1.2" fill="#000" opacity=".3"/><circle cx="15" cy="13.5" r="1.2" fill="#000" opacity=".3"/>',
  ),
  collection: svg(
    '<rect x="2.5" y="5" width="11" height="15" rx="2.6" fill="currentColor" opacity=".55" transform="rotate(-10 8 12.5)"/><rect x="9.5" y="3.5" width="11.5" height="16" rx="2.6" fill="currentColor" transform="rotate(8 15 11.5)"/><path d="m15.2 8.6 1 2.2 2.3.2-1.8 1.5.6 2.3-2-1.3-2 1.2.6-2.2-1.8-1.6 2.4-.1z" fill="#000" opacity=".3"/>',
  ),
  gear: svg(
    '<path d="M10.3 2.5h3.4l.5 2.6a7.4 7.4 0 0 1 1.9 1.1l2.5-.9 1.7 2.9-2 1.7a7 7 0 0 1 0 2.2l2 1.7-1.7 2.9-2.5-.9a7.4 7.4 0 0 1-1.9 1.1l-.5 2.6h-3.4l-.5-2.6a7.4 7.4 0 0 1-1.9-1.1l-2.5.9-1.7-2.9 2-1.7a7 7 0 0 1 0-2.2l-2-1.7 1.7-2.9 2.5.9a7.4 7.4 0 0 1 1.9-1.1z" fill="currentColor"/><circle cx="12" cy="12" r="3.2" fill="#000" opacity=".35"/>',
  ),
  gift: svg(
    '<rect x="3" y="9" width="18" height="4.4" rx="1.3" fill="currentColor"/><rect x="4.5" y="13.4" width="15" height="7.6" rx="1.6" fill="currentColor" opacity=".85"/><rect x="10.6" y="9" width="2.8" height="12" fill="#000" opacity=".28"/><path d="M12 9c-1-3.6-5.6-5-6.3-2.6C5.1 8.3 8.4 9 12 9c3.6 0 6.9-.7 6.3-2.6C17.6 4 13 5.4 12 9z" fill="none" stroke="currentColor" stroke-width="2.2"/>',
  ),
  missions: svg(
    '<rect x="4" y="3" width="16" height="18.5" rx="3" fill="currentColor"/><path d="m7.6 8.6 1.5 1.5 2.7-2.9M7.6 14.6l1.5 1.5 2.7-2.9" fill="none" stroke="#000" stroke-opacity=".38" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="13.4" y="8" width="4" height="2" rx="1" fill="#000" opacity=".3"/><rect x="13.4" y="14" width="4" height="2" rx="1" fill="#000" opacity=".3"/>',
  ),
  lock: svg('<rect x="5" y="10.5" width="14" height="10.5" rx="2.6" fill="currentColor"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.6"/><circle cx="12" cy="15.6" r="1.6" fill="#000" opacity=".35"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>'),
  plus: svg('<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/>'),
  users: svg(
    '<circle cx="9" cy="8.5" r="4" fill="currentColor"/><path d="M1.8 20c.5-3.8 3.4-6 7.2-6s6.7 2.2 7.2 6z" fill="currentColor"/><circle cx="16.8" cy="9.4" r="3.1" fill="currentColor" opacity=".7"/><path d="M16 14.2c3.5-.4 5.8 1.7 6.2 5.3h-4.7" fill="currentColor" opacity=".7"/>',
  ),
  emote: svg('<circle cx="12" cy="12" r="9.5" fill="currentColor"/><circle cx="8.8" cy="10" r="1.5" fill="#000" opacity=".45"/><circle cx="15.2" cy="10" r="1.5" fill="#000" opacity=".45"/><path d="M7.6 14c1 2.2 2.6 3.2 4.4 3.2s3.4-1 4.4-3.2z" fill="#000" opacity=".45"/>'),
  pause: svg('<rect x="6" y="5" width="4.2" height="14" rx="1.6" fill="currentColor"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.6" fill="currentColor"/>'),
  trophy: svg(
    '<path d="M7 3.5h10v5.5a5 5 0 0 1-10 0z" fill="currentColor"/><path d="M7 5.5H4.2c0 3 1.2 4.7 3.3 5.2M17 5.5h2.8c0 3-1.2 4.7-3.3 5.2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="10.8" y="13" width="2.4" height="4" fill="currentColor"/><rect x="7.5" y="17" width="9" height="3.6" rx="1.2" fill="currentColor"/>',
  ),
  share: svg('<circle cx="18" cy="5.5" r="3" fill="currentColor"/><circle cx="6" cy="12" r="3" fill="currentColor"/><circle cx="18" cy="18.5" r="3" fill="currentColor"/><path d="m8.6 10.6 6.8-3.6M8.6 13.4l6.8 3.6" stroke="currentColor" stroke-width="2.2"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12.5" rx="2.6" fill="currentColor"/><path d="M5.5 15.5h-.3A1.7 1.7 0 0 1 3.5 13.8V5.2c0-1 .8-1.7 1.7-1.7h8.6c1 0 1.7.8 1.7 1.7v.3" fill="none" stroke="currentColor" stroke-width="2.2"/>'),
  sparkle: svg('<path d="M12 2.5c.7 4.7 2.8 6.8 7.5 7.5-4.7.7-6.8 2.8-7.5 7.5-.7-4.7-2.8-6.8-7.5-7.5 4.7-.7 6.8-2.8 7.5-7.5z" fill="currentColor"/><path d="M19 15c.3 2 1.1 2.8 3 3-1.9.3-2.7 1.1-3 3-.3-1.9-1.1-2.7-3-3 1.9-.2 2.7-1 3-3z" fill="currentColor" opacity=".7"/>'),
  bomb: svg('<circle cx="10.5" cy="14" r="7.5" fill="currentColor"/><path d="M15.5 8.5 17 7" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M18 6c.6-1.6 2-2.2 3.2-1.6" fill="none" stroke="#ffd23f" stroke-width="2" stroke-linecap="round"/><circle cx="7.6" cy="11" r="2" fill="#fff" opacity=".45"/>'),
  crown: svg('<path d="M3 8.5 7.5 12 12 5l4.5 7L21 8.5 19.4 18H4.6z" fill="currentColor"/><rect x="4.6" y="18.5" width="14.8" height="2.4" rx="1" fill="currentColor"/>'),
  sound: svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.6 8.6 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
};

export type IconName = keyof typeof ICONS;
export const icon = (n: IconName) => ICONS[n];

/** Remplace les <i data-icon="…"> du document par leur SVG. */
export function hydrateIcons(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-icon]").forEach((el) => {
    const n = el.dataset.icon as IconName;
    if (ICONS[n] && !el.firstElementChild) el.innerHTML = ICONS[n];
  });
}
