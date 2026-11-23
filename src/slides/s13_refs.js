// 13 · References. Quiet typographic page: authors in ink, the rest of the citation in a softer tone, hairline separators;
// a faint echo of the deck's motifs (the sample tube top-right, two schematic activity traces along the bottom).
import { add } from '../core.js';
import { makeScene, bloodTube, contactShadow } from '../lib3d.js';
import { COL3 } from '../theme.js';
import { alpha, PAL, LINE } from '../theme.js';
import { CamRig, V } from '../rig.js';
import { el, bell } from '../chart.js';

const REFS = [
  'York JL. Enzimas: clasificación, cinética y control. In: Devlin TM, ed. <i>Bioquímica: libro de texto con aplicaciones clínicas</i>. 4. arg. Barcelona: Reverté; 2015. 10. kap.',
  'Newsholme EA, Leech TR. <i>Functional Biochemistry in Health and Disease</i>. Chichester: Wiley-Blackwell; 2010. 3. eta 11. kap.',
  'Herrera E, Ramos MP, Roca P, Viana M. <i>Bioquímica básica: base molecular de los procesos fisiológicos</i>. Barcelona: Elsevier España; 2014. 3. kap.',
  'Pérez Ruiz L, Bobillo López H, Ramos Cedeño AM, et al. <i>Bioquímica clínica para tecnologías de la salud</i>. La Habana: Editorial Ciencias Médicas; 2012. 7. eta 14. kap.',
];
// the author list is everything before the first ". " (the citation text itself is unchanged)
const split = r => { const k = r.indexOf('. '); return [r.slice(0, k + 1), r.slice(k + 1)]; };

export default {
  id: 'refs', chapter: 4, beats: 1, title: 'Bibliografia', bloom: .5,
  build(layer) {
    const S = makeScene({ gx: .5, gy: .5, dust: 70 }); this.S = S; this.scene = S.scene; this.camera = S.camera;
    this.rig = new CamRig(this.camera, V(0, 0, 10), V(0, 0, 0), { fov: 40, drift: .06 });
    // the sample tube, small and calm in the top-right corner (beside the title, clear of the list)
    const tb = bloodTube({}); tb.group.scale.setScalar(.52); tb.group.position.set(5.25, .85, 0); tb.group.rotation.z = -.22; this.scene.add(tb.group); this.tb = tb;
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
    add(layer, `<div class="abs fx fade d1" data-b="0" style="left:96px;top:196px;width:120px;height:3px;border-radius:2px;background:${PAL.amber}"></div>`);
    add(layer, `<div class="abs" style="left:96px;top:262px;width:1400px">${REFS.map((r, i) => { const [au, rest] = split(r);
      return `<div class="fx d${i + 1}" data-b="0" style="display:flex;gap:30px;align-items:baseline;padding:26px 0 28px;border-top:1px solid ${i ? LINE : 'transparent'}">
      <span style="font:italic 400 48px/1 var(--serif);color:${PAL.amber};min-width:40px;text-align:right">${i + 1}</span>
      <span style="font:400 29px/1.5 var(--sans);color:var(--ink2)"><span style="font-weight:600;color:var(--ink)">${au}</span>${rest}</span></div>`; }).join('')}</div>`);
    add(layer, `<div class="note fx fade d6" data-b="0" style="left:96px;top:930px;font-size:22px">Eskema guztiak egileenak dira, aipatutako iturrietan oinarrituak.</div>`);
  },
  enter() { this.rig.arrive(V(0, 0, 10), V(0, 0, 0), 40); },
  update(dt, t) {
    this.rig.update(t); this.S.dust.update(t);
    this.tb.group.rotation.y = -Math.PI * .25 + Math.sin(t * .3) * .3;
  },
};
