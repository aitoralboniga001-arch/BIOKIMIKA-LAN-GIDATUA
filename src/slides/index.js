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

// chapters follow the talk script in the appendix (1 + 3 + 3 + 2 min); part 3 shows figures 2 and 5, so the
// infarct example sits there, after the pancreatitis one; the closing is a short fifth block
export const CHAPTERS = ['Sarrera eta neurketa', 'Igoeraren jatorria eta intentsitatea', 'Agerpena eta iraupena', 'Isoentzimen ekarpena', 'Ondorioak'];
export const SLIDES = [title, measure, release, marker, tissues, intensity, kinetics, pancreas, infarct, ck, ldh, electro, end, refs];

// Sub-points of the talk script, so each scene says where it sits: [number, label, first beat, last beat].
// The engine writes the current one (and the chapter's full list as dots) into the slide's eyebrow.
export const SUBPOINTS = {
  measure:   [['1.1', 'Entzimak plasman eta zeluletan', 0, 1], ['1.2', 'Zer neurtzen da · U/L', 2, 2], ['1.3', 'Lau galdera · 1. helburua', 3, 3]],
  release:   [['2.1', 'Askapena eta eliminazioa · 1. irudia', 0, 4], ['2.2', 'Igoera fisiologikoak', 5, 5]],
  marker:    [['2.3', 'Markatzaile on baten ezaugarriak', 0, 5]],
  tissues:   [['2.4', 'Ehun-jatorria: ALT eta CK · 1. taula', 0, 7]],
  intensity: [['2.5', 'Lesioaren intentsitatea · 2. helburua', 0, 3]],
  kinetics:  [['3.1', 'Igoera, gailurra, jaitsiera', 0, 3], ['3.2', 'Lagin goiztiarra eta berantiarra', 4, 6]],
  pancreas:  [['3.3', 'Pankreatitisa: amilasa eta lipasa · 2. irudia', 0, 2]],
  infarct:   [['3.4', 'Infartua: CK osoa eta LDH · 5. irudia', 0, 3], ['3.5', 'Lagin goiztiarra eta berantiarra · 3. helburua', 4, 5]],
  ck:        [['4.1', 'CK osoa eta CK-MB · 3. irudia', 0, 5]],
  ldh:       [['4.2', 'LDHren isoentzimak · 2. taula', 0, 4]],
  electro:   [['4.3', 'Elektroforesia · 4. irudia', 0, 2], ['4.4', 'Erabilera eta mugak · 5. helburua', 3, 4]],
};
export const subpointAt = (id, b) => (SUBPOINTS[id] || []).find(p => b >= p[2] && b <= p[3]) || null;
