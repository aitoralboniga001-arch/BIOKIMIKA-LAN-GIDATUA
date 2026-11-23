// Line icons (64×64, currentColor) used on cards and organ tags.
const S = (body, extra = '') => `<svg viewBox="0 0 64 64" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;
export const ICON = {
  heart: S(`<path d="M32 55C15 43 7 33 8.5 22 10 13 20 9 27 14c2.3 1.7 3.9 3.8 5 6 1.1-2.2 2.7-4.3 5-6 7-5 17-1 18.5 8C57 33 49 43 32 55Z" fill="currentColor" fill-opacity=".16"/><path d="M24 12V5M30 13V6M40 12l4-6"/><path d="M33 30c-3 6-1 12 4 16" opacity=".6"/>`),
  brain: S(`<path d="M31 12c-3-4-10-4-13 1-6 0-9 6-7 11-4 3-4 10 1 13-1 6 5 11 11 9 2 3 6 4 8 2Z" fill="currentColor" fill-opacity=".16"/><path d="M33 12c3-4 10-4 13 1 6 0 9 6 7 11 4 3 4 10-1 13 1 6-5 11-11 9-2 3-6 4-8 2Z" fill="currentColor" fill-opacity=".16"/><path d="M20 22c3 0 5 2 5 5M17 34c3-2 7-1 8 2M44 22c-3 0-5 2-5 5M47 34c-3-2-7-1-8 2M24 45c1-3 4-4 6-3M40 45c-1-3-4-4-6-3"/>`),
  muscle: S(`<path d="M6 32h6M52 32h6"/><path d="M12 32C19 16 45 16 52 32 45 48 19 48 12 32Z" fill="currentColor" fill-opacity=".16"/><path d="M16 32h32M18 26c8-3 20-3 28 0M18 38c8 3 20 3 28 0"/>`),
  liver: S(`<path d="M7 27c2-10 22-15 49-11 4 2 3 8-3 12-9 6-20 16-31 18C13 45 5 37 7 27Z" fill="currentColor" fill-opacity=".16"/><path d="M33 17c-2 8-1 16 3 22"/>`),
  bone: S(`<path d="M18 22l24 20" stroke-width="7" opacity=".35"/><path d="M14 12a5 5 0 0 1 8 3 5 5 0 0 1 3 8l20 17a5 5 0 0 1 8 3 5 5 0 0 1-3 8 5 5 0 0 1-8-3 5 5 0 0 1-3-8L19 23a5 5 0 0 1-8-3 5 5 0 0 1 3-8Z" fill="currentColor" fill-opacity=".16"/>`),
  pancreas: S(`<path d="M7 37c0-8 10-11 18-7 8 4 18-4 28-6 4 0 5 6 1 8-10 4-18 12-30 12-10 1-17-2-17-7Z" fill="currentColor" fill-opacity=".16"/><path d="M14 38c10 1 22-4 36-10" opacity=".6"/>`),
  placenta: S(`<circle cx="32" cy="30" r="17" fill="currentColor" fill-opacity=".16"/><path d="M32 47v10M32 30l-8-6M32 30l9-5M32 30l-2 9M24 24l-5 2M41 25l3 6"/>`),
  bile: S(`<path d="M26 10v14c0 4-6 6-6 14a12 12 0 0 0 24 0c0-8-6-10-6-14V10" fill="currentColor" fill-opacity=".16"/><path d="M26 10h12"/>`),
  saliva: S(`<path d="M20 44c-6-6-6-18 2-24s20-6 24 2-2 20-12 24-10 2-14-2Z" fill="currentColor" fill-opacity=".16"/><path d="M30 30c2 4 6 6 10 6"/>`),
  rbc: S(`<ellipse cx="32" cy="32" rx="22" ry="16" fill="currentColor" fill-opacity=".2"/><ellipse cx="32" cy="32" rx="10" ry="6"/>`),
  clock: S(`<circle cx="32" cy="34" r="22" fill="currentColor" fill-opacity=".12"/><path d="M32 22v12l8 6M26 6h12M32 6v6"/>`),
  gauge: S(`<path d="M10 44a22 22 0 1 1 44 0" fill="currentColor" fill-opacity=".12"/><path d="M32 44l12-14"/><circle cx="32" cy="44" r="3" fill="currentColor"/><path d="M14 36h4M46 36h4M32 22v4"/>`),
  tissue: S(`<path d="M12 18l10-6 10 6v12l-10 6-10-6Z M32 18l10-6 10 6v12l-10 6-10-6Z M22 36l10-6 10 6v12l-10 6-10-6Z" fill="currentColor" fill-opacity=".14"/><circle cx="22" cy="24" r="2" fill="currentColor"/><circle cx="42" cy="24" r="2" fill="currentColor"/><circle cx="32" cy="42" r="2" fill="currentColor"/>`),
  patient: S(`<rect x="14" y="10" width="36" height="46" rx="5" fill="currentColor" fill-opacity=".12"/><path d="M24 10V6h16v4M22 26h20M22 34h20M22 42h12"/>`),
  tube: S(`<path d="M24 6h16M26 6v42a6 6 0 0 0 12 0V6" /><path d="M26 30h12v18a6 6 0 0 1-12 0Z" fill="currentColor" fill-opacity=".3"/>`),
  target: S(`<circle cx="32" cy="32" r="24"/><circle cx="32" cy="32" r="15"/><circle cx="32" cy="32" r="6"/>`),
};
export const icon = (name, size = 64, color = 'currentColor') => `<span style="display:inline-block;width:${size}px;height:${size}px;color:${color};vertical-align:middle">${ICON[name]}</span>`;
