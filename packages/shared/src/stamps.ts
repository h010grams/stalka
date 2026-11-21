/**
 * Рисунок штампов на карте — один код для превью на сайте и картинки в Apple/Google Wallet.
 * Возвращает SVG-строку без текста (сервер не зависит от шрифтов).
 */

export const STAMP_SHAPES = ['circle', 'square', 'heart', 'star', 'hexagon'] as const;
export type StampShape = (typeof STAMP_SHAPES)[number];

export const STAMP_ICONS = [
  'check',
  'none',
  'heart',
  'star',
  'sparkles',
  'scissors',
  'coffee',
  'flower',
  'gem',
  'paw',
  'crown',
  'dumbbell',
] as const;
export type StampIcon = (typeof STAMP_ICONS)[number];

/** Значки — контуры Lucide (ISC), координаты 24×24. */
export const ICON_PATHS: Record<Exclude<StampIcon, 'none'> | 'gift', string> = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  heart:
    '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4"/><path d="M21 5h-4"/>',
  scissors:
    '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
  coffee:
    '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
  flower:
    '<circle cx="12" cy="12" r="3"/><path d="M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5"/><path d="M12 7.5V9"/><path d="M7.5 12H9"/><path d="M16.5 12H15"/><path d="M12 16.5V15"/>',
  gem: '<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>',
  paw: '<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/>',
  crown:
    '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
  dumbbell:
    '<path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/><path d="m21.5 21.5-1.4-1.4"/><path d="M3.9 3.9 2.5 2.5"/><path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
};

function starPoints(outer: number, inner: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outer : inner;
    pts.push(`${(Math.cos(a) * r).toFixed(3)},${(Math.sin(a) * r).toFixed(3)}`);
  }
  return pts.join(' ');
}

function hexPoints(r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    pts.push(`${(Math.cos(a) * r).toFixed(3)},${(Math.sin(a) * r).toFixed(3)}`);
  }
  return pts.join(' ');
}

/** Форма в единичных координатах (центр 0,0, «радиус» 1). */
function shapeEl(shape: StampShape, inset = 0): string {
  const k = 1 - inset;
  switch (shape) {
    case 'circle':
      return `<circle r="${k}"/>`;
    case 'square':
      return `<rect x="${-0.86 * k}" y="${-0.86 * k}" width="${1.72 * k}" height="${1.72 * k}" rx="${0.38 * k}"/>`;
    case 'heart':
      return `<path transform="scale(${k})" d="M0 0.92 C -0.22 0.74 -1.02 0.2 -1.02 -0.32 C -1.02 -0.74 -0.7 -0.98 -0.38 -0.98 C -0.16 -0.98 -0.04 -0.86 0 -0.7 C 0.04 -0.86 0.16 -0.98 0.38 -0.98 C 0.7 -0.98 1.02 -0.74 1.02 -0.32 C 1.02 0.2 0.22 0.74 0 0.92 Z"/>`;
    case 'star':
      return `<polygon points="${starPoints(1.08 * k, 0.55 * k)}"/>`;
    case 'hexagon':
      return `<polygon points="${hexPoints(1.02 * k)}"/>`;
  }
}

/** Где и какого размера значок внутри формы (в единицах радиуса). */
const ICON_BOX: Record<StampShape, { size: number; dy: number }> = {
  circle: { size: 1.05, dy: 0 },
  square: { size: 1.05, dy: 0 },
  heart: { size: 0.78, dy: -0.12 },
  star: { size: 0.62, dy: 0.08 },
  hexagon: { size: 0.95, dy: 0 },
};

function iconEl(icon: Exclude<StampIcon, 'none'> | 'gift', cx: number, cy: number, size: number, color: string, width = 2.6) {
  const s = size / 24;
  return `<g transform="translate(${(cx - size / 2).toFixed(2)} ${(cy - size / 2).toFixed(2)}) scale(${s.toFixed(4)})" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[icon]}</g>`;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const safe = (c: string, fallback: string) => (HEX.test(c) ? c : fallback);

export interface StampArt {
  bgColor: string;
  fgColor: string;
  labelColor: string;
  stampShape?: StampShape | string | null;
  stampIcon?: StampIcon | string | null;
}

/**
 * Полоса штампов W×H: заполненные — форма цвета текста со значком цвета фона,
 * пустые — контур, последняя (награда) — пунктир с подарком.
 */
export function stampStripSvg(art: StampArt, filled: number, total: number, W: number, H: number, background = true): string {
  const bg = safe(art.bgColor, '#1C1917');
  const fg = safe(art.fgColor, '#FFFFFF');
  const label = safe(art.labelColor, '#E7B9A8');
  const shape = (STAMP_SHAPES as readonly string[]).includes(art.stampShape ?? '') ? (art.stampShape as StampShape) : 'circle';
  const icon = (STAMP_ICONS as readonly string[]).includes(art.stampIcon ?? '') ? (art.stampIcon as StampIcon) : 'check';

  const rows = total <= 6 ? 1 : total <= 20 ? 2 : 3;
  const cols = Math.ceil(total / rows);
  const padX = W * 0.053;
  const padY = H * 0.105;
  const cellW = (W - padX * 2) / cols;
  const cellH = (H - padY * 2) / rows;
  const r = Math.min(cellW, cellH) * 0.38;
  const stroke = Math.max(W / 280, r * 0.12);
  const sw = (stroke / r).toFixed(4); // толщина контура в единицах формы
  const box = ICON_BOX[shape];

  const out: string[] = [];
  for (let i = 0; i < total; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    // последний ряд центрируем, если он неполный
    const inRow = row === rows - 1 ? total - cols * (rows - 1) : cols;
    const cx = padX + ((cols - inRow) * cellW) / 2 + cellW * col + cellW / 2;
    const cy = padY + cellH * row + cellH / 2;
    const at = `transform="translate(${cx.toFixed(2)} ${cy.toFixed(2)}) scale(${r.toFixed(3)})"`;
    const isLast = i === total - 1;
    if (i < filled) {
      out.push(`<g ${at} fill="${fg}">${shapeEl(shape)}</g>`);
      if (icon !== 'none') out.push(iconEl(icon, cx, cy + box.dy * r, box.size * r, bg));
    } else if (isLast) {
      out.push(
        `<g ${at} fill="none" stroke="${label}" stroke-width="${sw}" stroke-dasharray="${(2 * stroke) / r} ${(1.2 * stroke) / r}" stroke-linejoin="round">${shapeEl(shape, stroke / r / 2)}</g>`,
        iconEl('gift', cx, cy + box.dy * r, box.size * r * 0.85, label, 2.2),
      );
    } else {
      out.push(
        `<g ${at} fill="none" stroke="${fg}" stroke-opacity="0.45" stroke-width="${sw}" stroke-linejoin="round">${shapeEl(shape, stroke / r / 2)}</g>`,
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${
    background ? `<rect width="${W}" height="${H}" fill="${bg}"/>` : ''
  }${out.join('')}</svg>`;
}
