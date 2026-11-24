import { THREE, clamp, ease } from '../core.js';
import { Pts, C } from '../lib3d.js';

// Deterministically sample each lane's existing isoenzyme distribution. Every particle
// stays registered to the same moving band and diffusion width as the gel shader.
export function migrationTracers(gel, lanes, shares) {
  const perLane=110, dots=new Pts(perLane*lanes.length), particles=[];
  gel.add(dots.mesh);
  const ink=C('#503684');
  for(let lane=0;lane<lanes.length;lane++){
    const weights=shares[lane];let species=0,end=weights[0];
    for(let j=0;j<perLane;j++){
      while((j+.5)/perLane>end && species<weights.length-1)end+=weights[++species];
      const phase=(j*2.399963+lane)*2;
      particles.push({lane,species,phase,
        dx:.82*(Math.sin(j*7.12)+Math.sin(j*1.93)),dz:.30*Math.sin(phase),
        size:.033+.016*(.5+.5*Math.cos(phase))});
    }
  }
  return function update(active,run,time,uniforms){
    dots.mesh.visible=active&&run<.999;
    if(!dots.mesh.visible)return;
    const opacity=.76*Math.sin(Math.PI*Math.min(1,run*3)/2)*(1-ease.io(clamp((run-.81)/.19)));
    for(let i=0;i<particles.length;i++){
      const p=particles[i],j=p.species,sigma=uniforms.uS.value[j];
      dots.set(i,uniforms.uX.value[j]+sigma*(p.dx+.17*Math.cos(time*2+p.phase)),
        .123+.017*Math.sin(p.phase+time),lanes[p.lane].z+p.dz+.019*Math.sin(time*1.4+p.phase),
        p.size,ink,opacity);
    }
    dots.commit();
  };
}

export function scannerOptics(scanner,lanes) {
  const housing=new THREE.MeshStandardMaterial({color:'#546c78',roughness:.36,metalness:.20});
  const bar=new THREE.Mesh(new THREE.BoxGeometry(.10,.095,3.4),housing);bar.position.y=.52;scanner.add(bar);
  for(const z of [-1.63,1.63]){
    const foot=new THREE.Mesh(new THREE.BoxGeometry(.13,.52,.09),housing);
    foot.position.set(0,.25,z);scanner.add(foot);
  }
  const lamps=lanes.map(({z})=>{
    const head=new THREE.Mesh(new THREE.CylinderGeometry(.11,.073,.13,14),housing);
    head.position.set(0,.43,z);scanner.add(head);
    const light=new THREE.Mesh(new THREE.PlaneGeometry(.42,.40),new THREE.MeshBasicMaterial({
      color:'#54bfae',transparent:true,opacity:.2,depthWrite:false,side:THREE.DoubleSide
    }));
    light.rotation.y=Math.PI/2;light.position.set(0,.21,z);scanner.add(light);
    const aperture=new THREE.Mesh(new THREE.SphereGeometry(.054,12,8),new THREE.MeshBasicMaterial({color:'#78ffdc'}));
    aperture.position.set(.054,.48,z);scanner.add(aperture);
    return {light,aperture};
  });
  return (a,b)=>{
    for(let i=0;i<lamps.length;i++){
      const transmitted=Math.exp(-1.45*(i?b:a)), lamp=lamps[i];
      lamp.light.material.opacity=.10+.27*transmitted;
      lamp.aperture.material.color.setRGB(.05+.21*transmitted,.15+.70*transmitted,.13+.47*transmitted);
    }
  };
}
