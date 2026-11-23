// Camera rig: eases between shots, adds a gentle hand-held drift.
import { THREE, Tw, ease } from './core.js';

export class CamRig {
  constructor(cam, pos, look, { drift = .05, fov } = {}) {
    this.cam = cam; this.drift = drift;
    this.p0 = pos.clone(); this.p1 = pos.clone(); this.l0 = look.clone(); this.l1 = look.clone();
    this.cp = pos.clone(); this.cl = look.clone();
    this.f0 = this.f1 = this.cf = fov || cam.fov; this.k = new Tw(1);
  }
  go(pos, look, d = 1.8, fov, e = ease.io) {
    this.p0.copy(this.cp); this.l0.copy(this.cl); this.f0 = this.cf;
    this.p1.copy(pos); this.l1.copy(look); if (fov) this.f1 = fov;
    this.k.set(0).to(1, d, e); return this;
  }
  jump(pos, look, fov) { this.p0.copy(pos); this.p1.copy(pos); this.l0.copy(look); this.l1.copy(look); if (fov) this.f0 = this.f1 = fov; this.k.set(1); this.cp.copy(pos); this.cl.copy(look); this.cf = this.f1; return this; }
  // arrive at a shot by flying in from slightly behind it
  arrive(pos, look, fov, back = 1.18, d = 2.2) {
    const from = look.clone().add(pos.clone().sub(look).multiplyScalar(back));
    this.jump(from, look, fov); return this.go(pos, look, d, fov, ease.out);
  }
  update(t) {
    const k = this.k.v;
    this.cp.lerpVectors(this.p0, this.p1, k); this.cl.lerpVectors(this.l0, this.l1, k); this.cf = this.f0 + (this.f1 - this.f0) * k;
    const c = this.cam; c.position.copy(this.cp);
    c.position.x += Math.sin(t * .23) * this.drift; c.position.y += Math.sin(t * .31 + 1) * this.drift * .7;
    c.lookAt(this.cl);
    if (Math.abs(c.fov - this.cf) > 1e-4) { c.fov = this.cf; c.updateProjectionMatrix(); }
  }
}
export const V = (x, y, z) => new THREE.Vector3(x, y, z);
