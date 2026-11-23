// Theme: the single source of truth for colours (bright "daylight lab" look).
// CSS custom properties are written from PAL at boot (style.css only mirrors them as a fallback),
// lib3d's COL re-exports PAL, and SVG / inline styles should use the helper strings below instead of hex literals.
//
//   import { PAL, COL3, INK, MUTE, LINE, alpha, CARD_SHADOW, TEXT_HALO } from '../theme.js';
//   el('line', { stroke: LINE })           // hairline on the light background
//   `color:${PAL.coral}`                   // text-safe accent
//   proteinMat(COL3.coral)                 // slightly brighter variant for lit 3D surfaces (shading darkens them)
//   `background:${alpha(PAL.blue, .1)}`    // tinted fills

export const PAL = {
  bg0: '#E7EDF4', bg1: '#FBF9F5',                 // background edge / centre
  ink: '#142033', ink2: '#3A465C', mute: '#6B7690',
  amber: '#B8650A', red: '#D22F45', coral: '#E0503A', blue: '#1D6FD1', teal: '#0C9584', violet: '#6A4FD6',
  gold: '#856500', mint: '#1F9A63', orange: '#DB6E0B', lav: '#8462D9', pink: '#D23F78',
};
// 3D variants: same hues, a little lighter/more saturated so lit + shaded surfaces end up near the text tokens
export const COL3 = {
  ink: '#2A3850', amber: '#E08A1E', red: '#E33A52', coral: '#F0603F', blue: '#2F84E8', teal: '#14B39E', violet: '#7C62EA',
  gold: '#E2AE12', mint: '#2BB577', orange: '#F08220', lav: '#9677EC', pink: '#E5508C',
  glass: '#5D7A9E',    // glass edges: cool slate blue
  plasma: '#E9B949',   // straw-yellow serum
  membrane: '#D9573F', // cell membrane rim: deeper warm coral
  cyto: '#F6B79A',     // cytosol tint
};

export function alpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}

export const INK = PAL.ink, INK2 = PAL.ink2, MUTE = PAL.mute;
export const LINE = 'rgba(20,32,51,.12)';          // hairlines, card borders
export const LINE2 = 'rgba(20,32,51,.28)';         // dashed guides, axes that must be visible
export const AXIS = 'rgba(20,32,51,.62)';          // chart axes
export const CARD_BG = 'rgba(255,255,255,.8)';
export const CARD_SHADOW = '0 18px 50px rgba(30,45,80,.12)';
export const PAPER = '#FFFFFF';                    // stroke around dots/markers so they pop off curves
export const TEXT_HALO = '0 0 2px rgba(251,249,245,.95), 0 0 10px rgba(251,249,245,.9), 0 0 22px rgba(251,249,245,.7)';
export const SCRIM = (a = .78) => `radial-gradient(42% 50% at 50% 50%, rgba(251,249,245,${a}), rgba(251,249,245,0))`;

// write PAL to CSS custom properties so CSS and JS can never drift apart
export function applyTheme(root = document.documentElement) {
  for (const k in PAL) root.style.setProperty('--' + k, PAL[k]);
  root.style.setProperty('--line', LINE);
  root.style.setProperty('--card', CARD_BG);
  root.style.setProperty('--card-shadow', CARD_SHADOW);
  root.style.setProperty('--halo', TEXT_HALO);
}
