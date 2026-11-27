// 13 · References. Quiet typographic page: authors in ink, the rest of the citation in a softer tone, hairline separators;
// a faint echo of the deck's motifs (the sample tube top-right, two schematic activity traces along the bottom).
import { add, THREE } from '../core.js';
import { makeScene, bloodTube, contactShadow } from '../lib3d.js';
import { COL3 } from '../theme.js';
import { alpha, PAL, LINE } from '../theme.js';
import { CamRig, V } from '../rig.js';
import { el, bell } from '../chart.js';

// the course bibliography entries marked "Atala: 1" (B.1), numbered as the citations in the written work and slides
// ([1] Devlin, [2] Newsholme & Leech, [3] Herrera, [4] González de Buitrago); the editions actually consulted are in the
// written work, section 10
const REFS = [
  'Devlin TM. <i>Bioquímica</i>. Reverté; 2004. 10. kap.',
  'Newsholme EA, Leech AR. <i>Bioquímica Médica</i>. Interamericana; 1986. 3. kap.',
  'Herrera E. <i>Bioquímica</i>. McGraw-Hill Interamericana; 1996. 7. kap.',
  'González de Buitrago JM. <i>Bioquímica clínica</i>. McGraw-Hill Interamericana; 1998. 5. eta 7. kap.',
];
// the author list is everything before the first ". " (the citation text itself is unchanged)
const split = r => { const k = r.indexOf('. '); return [r.slice(0, k + 1), r.slice(k + 1)]; };

const focus = new THREE.Vector3();
export default {
  bridgeIn: { focus() { return this.tb.group.localToWorld(focus.set(0,1.9,0)); } },
  id: 'refs', chapter: 4, beats: 1, title: 'Bibliografia', bloom: .5,
  build(layer) {
    const S = makeScene({ gx: .5, gy: .5, dust: 70 }); this.S = S; this.scene = S.scene; this.camera = S.camera;
    this.rig = new CamRig(this.camera, V(0, 0, 10), V(0, 0, 0), { fov: 40, drift: .06 });
    // the sample tube, small and calm in the top-right corner (beside the title, clear of the list)
    const tb = bloodTube({}); tb.group.scale.setScalar(.34); tb.group.position.set(5.30, 1.89, 0); tb.group.rotation.z = -.22; this.scene.add(tb.group); this.tb = tb;
    const sh = contactShadow({ size: 1.6, opacity: .12 }); sh.position.y = -.04; tb.group.add(sh);

    // faint schematic traces (the kinetics motif) along the bottom right, drawn in on entry
    const svg = el('svg', { class: 'chart', width: 1920, height: 1080, viewBox: '0 0 1920 1080' }); svg.style.left = '0px'; svg.style.top = '0px'; layer.appendChild(svg);
    const X0 = 1040, X1 = 1830, Y0 = 1000, HH = 150;
    el('line', { x1: X0, y1: Y0, x2: X1, y2: Y0, stroke: LINE, 'stroke-width': 1.5 }, svg);
    [[bell(1, .22, 3.2, .05), COL3.coral], [bell(.72, .42, 2.2, .05), COL3.blue]].forEach(([f, c], i) => {
      let d = ''; for (let k = 0; k <= 120; k++) { const u = k / 120; d += (k ? 'L' : 'M') + (X0 + u * (X1 - X0)).toFixed(1) + ' ' + (Y0 - f(u * 1.2) * HH).toFixed(1); }
      el('path', { d, fill: 'none', stroke: alpha(c, .32), 'stroke-width': 3, 'stroke-linecap': 'round', class: `draw slow fx fade d${i + 2}`, pathLength: 1, 'data-b': '0' }, svg);
    });

    add(layer, `<div class="eyebrow">Iturriak</div>`);
    add(layer, `<div class="h1">Bibliografia</div>`);
    const grid = add(layer, '<div class="reference-grid"></div>');
    REFS.forEach((ref,i) => {
      const [authors, details] = split(ref);
      add(grid, `<article class="reference-entry fx d${i+1}" data-b="0">
        <span class="ref-number">${String(i+1).padStart(2,'0')}</span>
        <div><h3>${authors}</h3><p>${details}</p></div></article>`);
    });
    add(layer, `<div class="reference-models abs fx d5" data-b="0">
      <b>3D egituren iturria</b> RCSB Protein Data Bank
      <span>CK-MM · 1I0E</span><span>LDH5 · 1I10</span></div>`);
    add(layer, `<div class="note fx fade d6" data-b="0" style="left:96px;top:912px;width:880px;font-size:22px;line-height:1.4">Irakasgaiaren bibliografia (B.1 atala). Kontsultatutako edizioak: lan idatziaren 10. atala.<br>Eskema guztiak egileenak dira, aipatutako iturrietan oinarrituak.</div>`);
  },
  enter() { this.rig.arrive(V(0, 0, 10), V(0, 0, 0), 40); },
  update(dt, t) {
    this.rig.update(t); this.S.dust.update(t);
    this.tb.group.rotation.y = -Math.PI * .25 + Math.sin(t * .3) * .3;
  },
};
