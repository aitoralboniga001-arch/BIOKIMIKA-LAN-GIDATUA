import { THREE, Label } from '../core.js';
import { specimen } from './specimens.js';
import { glassMat, liquidMat } from '../optics.js';
import { markerResponse } from '../sim.js';
import { COL3 } from '../theme.js';

export function markerBench(scene, layer) {
  const group = new THREE.Group(),
    bio = new THREE.Group(),
    targets = new THREE.Group();
  group.position.set(2.05, -0.5, 0);
  scene.add(group);
  group.add(bio, targets);
  const stations = ['liver','heart','muscle'].map((kind,i)=>{
    const station=new THREE.Group();station.position.x=(i-1)*1.47;
    bio.add(station);
    const organ=specimen(kind);organ.position.y=.82;organ.scale.setScalar(.89);station.add(organ);
    const fills=[],r=.156,height=.94;
    const shell=new THREE.CylinderGeometry(r,r,height,24,1,true);
    const liquid=new THREE.CylinderGeometry(r*.89,r*.89,1,24);
    const labels=[];
    for(let j=0;j<2;j++){
      const x=(j-.5)*.49;
      const tube=new THREE.Mesh(shell,glassMat('#9fb8c6'));tube.position.set(x,-.61,0);station.add(tube);
      const fill=new THREE.Mesh(liquid,liquidMat(j?COL3.blue:COL3.teal));tube.add(fill);fills.push(fill);
      for(const [text,b] of [[j?'LDH':'ALT','1-1'],[j?'B':'A','2-2']]){
        const label=new Label(layer,text,{anchor:new THREE.Vector3(x,.05,0),obj:station,b,color:j?COL3.blue:COL3.teal});
        label.el.querySelector('.t').style.fontSize='22px';labels.push(label);
      }
    }
    const dash=new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-.45,-.62,.18),new THREE.Vector3(.45,-.62,.18)]),
      new THREE.LineDashedMaterial({color:'#53657d',dashSize:.045,gapSize:.026}));
    dash.computeLineDistances();station.add(dash);
    const halo=new THREE.Mesh(new THREE.RingGeometry(.52,.553,40),new THREE.MeshBasicMaterial({color:'#bc6b41',transparent:true,depthWrite:false}));
    halo.position.set(0,.82,-.16);station.add(halo);
    return {fills,dash,halo,labels};
  });
  const boards = [0, 1].map((i) => {
    const board = new THREE.Group();
    board.position.x = i ? 1.05 : -1.05;
    board.rotation.set(-.19, i ? -.33 : .28, i ? .045 : -.045);
    const backing=new THREE.Mesh(new THREE.CylinderGeometry(.93,.94,.19,48),new THREE.MeshStandardMaterial({color:'#516578',roughness:.45}));
    backing.rotation.x=Math.PI/2;backing.position.z=-.10;board.add(backing);
    targets.add(board);
    for (let j = 0; j < 5; j++) {
      const ring = new THREE.Mesh(
        new THREE.CircleGeometry(0.89 - j * 0.17, 48),
        new THREE.MeshStandardMaterial({
          color: ['#b0c2ce', '#f4f4ec', '#82a1b5', '#eff5ef', '#c4654e'][j],
          roughness: 0.7,
        }),
      );
      ring.position.z = j * 0.006;
      board.add(ring);
    }
    const pins = new THREE.InstancedMesh(
      new THREE.ConeGeometry(.058,.32,9),
      new THREE.MeshStandardMaterial({ color: i ? '#985422' : '#0b6358' }),
      12,
    );
    board.add(pins);
    return pins;
  });
  const pin = new THREE.Object3D();
  pin.rotation.x = -Math.PI / 2;
  const levels = [0, 0];
  const tissueLabels = ['gibela', 'bihotza', 'muskulua'].map(name => 'Kaltetutako ehuna · ' + name);

  let lastBeat=-1, enteredAt=0;
  return (b, t, caption, camera) => {
    if(b!==lastBeat){enteredAt=t;lastBeat=b;}
    t-=enteredAt;
    for(const station of stations) for(const label of station.labels) label.update(camera);
    group.visible = b >= 1 && b <= 4;
    if (!group.visible) return;
    bio.visible = b < 3;
    targets.visible = !bio.visible;
    const phase = t % 3,
      source = Math.floor(t / 3) % 3;
    if (b < 3) {
      markerResponse(b, source, phase, levels);
      stations.forEach((station,i)=>{
        station.halo.visible=i===source;
        station.halo.material.opacity=.4+.35*Math.exp(-phase*1.7);
        station.dash.visible=b===2;
        station.fills.forEach((m,j)=>{
          const level=i===source?levels[j]:.12;
          m.scale.y=level*.91;m.position.y=-.46+m.scale.y/2;
          m.material.uniforms.uC.value.set(j?COL3.blue:(b===1?COL3.gold:COL3.teal));
        });
      });
      const line =
        b === 1
          ? tissueLabels[source]
          : 'A · sentikorra     /     B · sentikortasun txikiagoa';
      if (caption.textContent !== line) caption.textContent = line;
    } else {
      boards.forEach((pins, i) => {
        const launch=(t%6)*2.8;
        pins.count=Math.min(12,Math.floor(launch)+1);
        const spread = b === 3 && i === 1 ? 0.58 : 0.15,
          offset = b === 4 && i === 1 ? 0.43 : 0;
        for (let j = 0; j < 12; j++) {
          const angle = j * 2.4,
            rad = spread * Math.sqrt((j + 0.5) / 12);
          const phase=Math.max(0,launch-j),flight=Math.max(0,1-phase/.70);
          const settle=phase<.7?0:Math.exp(-9*(phase-.7))*Math.sin(26*(phase-.7));
          pin.position.set(offset+Math.cos(angle)*rad+flight*.34,Math.sin(angle)*rad+flight*.65,.14+flight*1.9+.055*settle);
          pin.rotation.set(-1.30+.2*flight,0,-.18+flight*.24);
          pin.updateMatrix();
          pins.setMatrixAt(j, pin.matrix);
        }
        pins.instanceMatrix.needsUpdate = true;
      });

      const line = b === 3
          ? 'A · errepikagarria     /     B · sakabanatua'
          : 'A · zentratua     /     B · desbideratua';
      if (caption.textContent !== line) caption.textContent = line;
    }
  };
}
