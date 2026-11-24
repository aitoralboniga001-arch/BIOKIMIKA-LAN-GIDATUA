import { THREE } from '../core.js';
import { organMat } from '../optics.js';

const surface = color => organMat({color,roughness:.56});
function body(group, geometry, material, x=0, y=0, z=0) {
  const mesh=new THREE.Mesh(geometry,material);
  mesh.position.set(x,y,z);
  group.add(mesh);
  return mesh;
}
function vessel(group,points,r,color) {
  const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  return body(group,new THREE.TubeGeometry(path,18,r,7,false),surface(color));
}
function ellipsoid(group,color,x,y,z,a,b,c) {
  const mesh=body(group,new THREE.SphereGeometry(1,22,14),surface(color),x,y,z);
  mesh.scale.set(a,b,c); return mesh;
}
function repeats(group,geometry,material,count,pose) {
  const mesh=new THREE.InstancedMesh(geometry,material,count), o=new THREE.Object3D();
  for(let i=0;i<count;i++){pose(o,i);o.updateMatrix();mesh.setMatrixAt(i,o.matrix);}
  group.add(mesh);return mesh;
}
export function specimen(kind) {
  const g=new THREE.Group();
  if(kind==='muscle'){
    // Longitudinal cut with parallel fibres and a transected end facing the audience.
    const material=surface('#a74f48');
    const shaft=new THREE.CylinderGeometry(.27,.25,1.10,24);
    const fascicle=body(g,shaft,material);fascicle.rotation.z=1.30;fascicle.rotation.x=.41;
    const axis=new THREE.Group();axis.rotation.copy(fascicle.rotation);g.add(axis);
    repeats(axis,new THREE.CylinderGeometry(.05,.047,.96,7),surface('#c97568'),13,(o,i)=>{
      const a=i*2.4,r=.22*Math.sqrt(i/13);o.position.set(r*Math.cos(a),.1,r*Math.sin(a));
    });
    repeats(axis,new THREE.TorusGeometry(.261,.009,5,28),surface('#d99281'),11,(o,i)=>{
      o.rotation.x=Math.PI/2;o.position.set(0,-.44+i*.082,0);
    });
  }else if(kind==='placenta'){
    ellipsoid(g,'#924e56',0,0,0,.62,.45,.19);
    repeats(g,new THREE.IcosahedronGeometry(1,1),surface('#ad626b'),19,(o,i)=>{
      const f=Math.sqrt((i+.5)/19),a=i*2.4;o.position.set(.49*f*Math.cos(a),.34*f*Math.sin(a),.18*Math.sqrt(1-f*f)+.03);
      o.scale.set(.145,.12,.057);o.rotation.z=a;
    });
    vessel(g,[[-.08,.0,-.16],[-.45,.16,-.16],[-.55,.36,-.07],[-.33,.53,.03],[-.08,.54,.07],[.10,.71,.05]],.052,'#c6959a');
    g.rotation.z=-.13;
  }else if(kind==='bone'){
    body(g,new THREE.CapsuleGeometry(.14,.77,5,18),surface('#d7bf90'));
    for(const y of [-.46,.46])for(const x of [-.095,.095])ellipsoid(g,'#d9cba9',x,y,0,.16,.15,.16);
    const plate=ellipsoid(g,'#3fb59e',0,.352,.025,.215,.036,.16);
    plate.material.emissive.set('#388b74');plate.material.emissiveIntensity=.22;g.rotation.z=-.19;
  }else if(kind==='liver'){
    const shape=new THREE.Shape();shape.moveTo(-.64,.08);
    shape.bezierCurveTo(-.64,.40,-.28,.49,.04,.39);shape.bezierCurveTo(.25,.34,.45,.22,.68,.18);
    shape.bezierCurveTo(.52,-.03,.26,-.08,.07,-.10);shape.bezierCurveTo(-.14,-.28,-.36,-.43,-.50,-.30);shape.quadraticCurveTo(-.68,-.15,-.64,.08);
    body(g,new THREE.ExtrudeGeometry(shape,{depth:.15,bevelEnabled:true,bevelSegments:3,bevelSize:.055,bevelThickness:.055,curveSegments:12}),surface('#9a5344'));
    vessel(g,[[.03,.37,.206],[.01,.27,.215],[-.034,.12,.223],[-.09,-.08,.214]],.018,'#d7a78a');
  }else if(kind==='heart'){
    const m=ellipsoid(g,'#a85552',0,-.05,0,.37,.43,.27);
    const p=m.geometry.attributes.position;
    for(let i=0;i<p.count;i++){const y=p.getY(i),f=.69+.31*y;p.setX(i,p.getX(i)*f-.36*y);p.setZ(i,p.getZ(i)*f);}
    m.geometry.computeVertexNormals();
    vessel(g,[[-.07,.2,0],[-.12,.44,0],[.04,.54,-.025],[.18,.39,-.08]],.07,'#ac5e50');
    vessel(g,[[.06,.14,.14],[.13,.32,.11],[.23,.36,.06]],.076,'#738398');
    vessel(g,[[-.16,.13,.19],[.01,.06,.217],[.035,-.12,.18],[.073,-.29,.12]],.022,'#d8a18a');
  }
  return g;
}
