// Warm, food-friendly palette — tints recipe cards by category.
// ponytail: colors are derived from the category NAME (stable hash), not stored.
// If users should pick/edit category colors, add a `color` column on categories
// + a picker in the category manager, then read that here instead of hashing.
export const CATEGORY_PALETTE = [
  '#e05c4b', // tomato
  '#e67e22', // brand orange
  '#e0a82e', // honey
  '#8a9a4f', // olive
  '#5a9b6b', // herb green
  '#4fa3a0', // teal
  '#a25b8a', // plum
  '#9c6b4a', // cocoa
];

// Tiny PNG-style transparency checkerboard — the "no color" swatch / dot.
export const CHECKERBOARD = {
  backgroundColor: '#fff',
  backgroundImage:
    'linear-gradient(45deg,#cbc6bd 25%,transparent 25%),linear-gradient(-45deg,#cbc6bd 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#cbc6bd 75%),linear-gradient(-45deg,transparent 75%,#cbc6bd 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
};

// Marbled blend of a recipe's category colors for the color spine.
// 0 colors → null (no spine), 1 → solid, 2+ → soft diagonal strokes of each color.
export function marbleBackground(colors) {
  const c = (colors || []).filter(Boolean)
  if (c.length === 0) return null
  if (c.length === 1) return c[0]
  // Two overlapping diagonal gradients give a marbled (not banded) feel.
  const stops = c.map((color, i) => `${color} ${Math.round((i / (c.length - 1)) * 100)}%`).join(', ')
  const rev = [...c].reverse().map((color, i) => `${color}99 ${Math.round((i / (c.length - 1)) * 100)}%`).join(', ')
  return `linear-gradient(150deg, ${stops}), linear-gradient(300deg, ${rev})`
}

export function categoryColor(name) {
  if (!name) return null;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CATEGORY_PALETTE[h % CATEGORY_PALETTE.length];
}
