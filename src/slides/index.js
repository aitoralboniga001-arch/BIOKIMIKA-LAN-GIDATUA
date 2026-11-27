import title from './s00_title.js';
import measure from './s01_measure.js';
import release from './s02_release.js';
import marker from './s03_marker.js';
import tissues from './s04_tissues.js';
import intensity from './s05_intensity.js';
import kinetics from './s06_kinetics.js';
import pancreas from './s07_pancreas.js';
import ck from './s08_ck.js';
import ldh from './s09_ldh.js';
import electro from './s10_electro.js';
import infarct from './s11_infarct.js';
import end from './s12_end.js';
import refs from './s13_refs.js';

// chapters and scene order follow the talk script in the appendix (user's choice, 2026-11-27): part 3 shows figures 2
// and 5 (pancreatitis, then the infarct), part 4 the isoenzymes; the closing is a short fifth block. The infarct's
// headers carry no section number (the script cites it as figure 5), so no "9" appears before 7.1
export const CHAPTERS = ['Sarrera eta neurketa', 'Igoeraren jatorria eta intentsitatea', 'Agerpena eta iraupena', 'Isoentzimen ekarpena', 'Ondorioak'];
export const SLIDES = [title, measure, release, marker, tissues, intensity, kinetics, pancreas, infarct, ck, ldh, electro, end, refs]; // the order of the script appendix (gidoia)

// Sub-points of the talk script, so each scene says where it sits: [number, label, first beat, last beat].
// The engine writes the current one (and the chapter's full list as dots) into the slide's eyebrow.
export const SUBPOINTS = {   // [section of the written work, label, first beat, last beat]. Slides follow the SCRIPT order
  // in section order: 6 → 7.1 → 7.2 → 8 → 9.
  measure:   [['2', 'Entzima plasmatikoak: jatorria', 0, 1], ['2', 'Jarduera katalitikoa · U/L', 2, 2], ['1', 'Lau galdera · 1. helburua', 3, 3]],
  release:   [['3', 'Jarduera-aldaketen jatorria · 1. irudia', 0, 4], ['3', 'Igoera fisiologikoak', 5, 5]],
  marker:    [['3', 'Markatzaile erabilgarri baten ezaugarriak', 0, 5]],
  tissues:   [['4', 'Ehun-espezifikotasuna: ALT eta CK · 1. taula', 0, 7]],
  intensity: [['5', 'Lesioaren intentsitatea · 2. helburua', 0, 3]],
  kinetics:  [['6', 'Igoera, gailurra, jaitsiera', 0, 3], ['6', 'Lagin goiztiarra eta berantiarra', 4, 6]],
  pancreas:  [['6', 'Pankreatitis akutua: amilasa eta lipasa · 2. irudia', 0, 2]],
  infarct:   [['','Miokardioko infartua · 5. irudia',0,1],['','CKren eta LDHren bilakaera',2,3],['','Lagin goiztiarra eta berantiarra · 3. helburua',4,5]],
  ck:        [['7.1', 'CKren isoentzimak · 3. irudia', 0, 5]],
  ldh:       [['7.2', 'LDHren isoentzimak · 2. taula', 0, 4]],
  electro:   [['8', 'Elektroforesi bidezko identifikazioa · 4. irudia', 0, 2], ['8', 'Erabilera eta abantailak · 5. helburua', 3, 4]],
  refs:      [['10', 'Bibliografia', 0, 0]],
};
export const subpointAt = (id, b) => (SUBPOINTS[id] || []).find(p => b >= p[2] && b <= p[3]) || null;
