import { THREE, clamp, ease, rng } from '../core.js';
import { rbcGeo, rbcMat } from '../lib3d.js';

// Longitudinal teaching section. The opening faces the camera and exposes both cut lips.
function vesselLayer(inner, outer, color) {
  const edge = new THREE.Shape();
  const first = 1.08, last = 5.16;
  edge.absarc(0, 0, outer, first, last, false);
  edge.lineTo(inner*Math.cos(last), inner*Math.sin(last));
  edge.absarc(0, 0, inner, last, first, true);
  edge.closePath();
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(edge, {
    depth: 3.4, curveSegments: 28, bevelEnabled: false
  }), new THREE.MeshStandardMaterial({color, roughness:.49, side:THREE.DoubleSide}));
  mesh.geometry.translate(0, 0, -1.7);
  mesh.rotation.y = -Math.PI/2;
  return mesh;
}

export function coronarySection(scene) {
  const group=new THREE.Group(); scene.add(group);
  const wall=new THREE.Group(); group.add(wall);
  wall.add(vesselLayer(.46,.49,'#d9a083'),vesselLayer(.49,.58,'#a45b62'),vesselLayer(.58,.62,'#dec0a8'));
  const cells=new THREE.InstancedMesh(rbcGeo(.093,9,16),rbcMat(),24);
  const clot=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({
    color:'#823346',roughness:.66,vertexColors:false
  }),26);
  cells.frustumCulled=clot.frustumCulled=false;
  wall.add(clot,cells);
  const pose=new THREE.Object3D(), tone=new THREE.Color();
  // A contiguous wall-attached aggregate, broadly tapered towards the upstream face.
  for(let i=0;i<clot.count;i++){
    const a=i*2.39996, ring=Math.sqrt(i/25);
    pose.position.set(.40*ring*Math.cos(a),.46+.31*ring*Math.sin(a),.08*Math.sin(2*a));
    pose.scale.set(.21+.06*(1-ring),.21,.26+.045*Math.sin(a));pose.rotation.set(.3*i,a,.19*i);
    pose.updateMatrix();clot.setMatrixAt(i,pose.matrix);
    tone.setHSL(.974+.018*Math.sin(a),.30,.40+.12*Math.cos(a*1.7));clot.setColorAt(i,tone);
  }
  // Fibrous surface of the aggregate, following its curved outline in the open section.
  const strands = [];
  for (let i = 0; i < 22; i++) {
    const tilt = (i % 2 ? 1 : -1) * .55, offset = (Math.floor(i/2)-5)/6;
    let previous = null;
    for (let j=0;j<=24;j++) {
      const x=(j-12)/12, y=offset+tilt*x, radius=x*x+y*y;
      if (radius>.96) { previous=null; continue; }
      const current = [.47*x,.46+.40*y,.27*Math.sqrt(1-radius)+.028*Math.sin(i+j*.8)];
      if (previous) strands.push(...previous,...current);
      previous=current;
    }
  }
  const fibreGeo=new THREE.BufferGeometry();
  fibreGeo.setAttribute('position',new THREE.Float32BufferAttribute(strands,3));
  clot.add(new THREE.LineSegments(fibreGeo,new THREE.LineBasicMaterial({
    color:'#deaca1',transparent:true,opacity:.71,depthWrite:false
  })));
  clot.position.set(.06,-.46,0);
  // The tube is shown obliquely so the ring at each end and the three cut layers can be read.
  wall.rotation.set(-.13,.22,-.11);
  const random=rng(942);
  const streams=Array.from({length:cells.count},(_,i)=>{
    const angle=random()*2*Math.PI, radius=Math.sqrt(random())*.28;
    return {offset:(i+random()*.72)/cells.count, y:radius*Math.sin(angle), z:radius*Math.cos(angle),
      speed:1.11-.22*radius/.28, tilt:random()*2*Math.PI};
  });
  let travel=0;
  return function update(dt,time,occlusion,visibility) {
    group.visible=visibility>.004;
    if(!group.visible)return;
    group.position.set(2.02,-.04-.15*(1-visibility),0);
    group.scale.setScalar(1.04*visibility);
    const oc=ease.io(clamp(occlusion));
    clot.visible=oc>.015;clot.scale.set(.68+.32*oc,oc,.2+.8*oc);
    const open=1-oc;
    travel+=dt*(.66+.12*Math.cos(time*6.6))*open;
    for(let i=0;i<cells.count;i++){
      const stream=streams[i], f=(travel*.32*stream.speed+stream.offset)%1, freeX=-1.68+3.36*f;
      const lane=stream.tilt, gate=clamp((oc-.22)/.70);
      const x=freeX<0?Math.min(freeX,-.38*gate):freeX;
      const near=Math.exp(-Math.pow(x/.64,2));
      const distal=freeX>-.34?1-gate:1;
      const size=Math.min(1,12*f,12*(1-f))*distal;
      pose.position.set(x,stream.y+.035*Math.sin(lane+time*.7)+.16*near*oc,stream.z);
      pose.rotation.set(.68+.43*Math.sin(lane),time*.64+lane,.35*Math.cos(time*.29+lane));
      pose.scale.setScalar(Math.max(.0001,size));pose.updateMatrix();cells.setMatrixAt(i,pose.matrix);
    }
    cells.instanceMatrix.needsUpdate=true;
  };
}
