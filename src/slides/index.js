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

// chapters follow the talk script in the appendix: 1 + 3 + 3 + 2 (+1) minutes
export const CHAPTERS = ['Sarrera eta neurketa', 'Igoeraren jatorria eta intentsitatea', 'Agerpena eta iraupena', 'Isoentzimen ekarpena', 'Infartua eta ondorioak'];
export const SLIDES = [title, measure, release, marker, tissues, intensity, kinetics, pancreas, ck, ldh, electro, infarct, end, refs];
