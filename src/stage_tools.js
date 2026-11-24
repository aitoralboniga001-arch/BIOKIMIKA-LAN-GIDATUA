// Presentation coordinates always refer to the fitted 1920 × 1080 stage.
export class StageTools {
  constructor(stage, slides, chapters, getState, navigate, getPlot, transitioning, getRig) {
    this.stage = stage;
    this.getPlot = getPlot;
    this.transitioning = transitioning;
    this.pointer = document.createElement('div');
    this.pointer.className = 'stage-pointer';
    stage.append(this.pointer);
    this.map = document.createElement('dialog');
    this.map.className = 'talk-map';
    this.map.setAttribute('aria-label','Aurkezpenaren mapa');
    document.body.append(this.map);
    const heading = document.createElement('header');
    heading.innerHTML = '<h2>Aurkezpenaren mapa</h2><button type="button" aria-label="Itxi">Itxi · Esc</button>';
    heading.lastChild.onclick = () => this.map.close();
    this.map.append(heading);
    this.showMap = () => {
      if (this.map.open) { this.map.close(); return; }
      this.clearGesture();
      if (!this.map.querySelector('section')) {
        chapters.forEach((name, chapter) => {
          const section = document.createElement('section');
          const title = document.createElement('h3');
          title.textContent = name; section.append(title);
          slides.forEach((slide, si) => {
            if (Math.max(0,slide.chapter) !== chapter) return;
            const row = document.createElement('div'); row.className = 'map-row';
            const label = document.createElement('h4'); label.textContent = slide.title; row.append(label);
            for (let bi = 0; bi < slide.beats; bi++) {
              const button = document.createElement('button');
              const id = (si+1)+'.'+(bi+1);
              button.dataset.beat=id; button.setAttribute('aria-label',slide.title+' · '+id);
              button.innerHTML = '<img loading="lazy" alt="" src="fallback/'+id+'.jpg"><span>'+id+'</span>';
              button.onclick = () => { this.map.close(); navigate(si,bi,si < getState().si ? -1 : 1); };
              row.append(button);
            }
            section.append(row);
          });
          this.map.append(section);
        });
      }
      const {si,bi} = getState();
      this.map.querySelector('[aria-current]')?.removeAttribute('aria-current');
      const active=this.map.querySelector('[data-beat="'+(si+1)+'.'+(bi+1)+'"]');
      active.setAttribute('aria-current','step');
      this.map.showModal(); active.focus({preventScroll:true}); active.scrollIntoView({block:'center'});
    };
    this.ink=document.createElementNS('http://www.w3.org/2000/svg','svg');
    this.ink.setAttribute('viewBox','0 0 1920 1080');this.ink.setAttribute('class','stage-ink');
    this.ink.setAttribute('aria-hidden','true');stage.append(this.ink);
    this.mode = ''; this.point(.5,.5);
    stage.addEventListener('pointermove', e => {
      const p=this.coords(e);
      if (this.mode) this.point(p.x,p.y);
      const g=this.gesture;
      if (!g || e.pointerId !== g.id) return;
      if(g.path){
        const x=p.x*1920,y=p.y*1080;
        if(Math.hypot(x-g.x,y-g.y)<2)return;
        g.d+=' Q'+g.x.toFixed(1)+' '+g.y.toFixed(1)+' '+((g.x+x)/2).toFixed(1)+' '+((g.y+y)/2).toFixed(1);
        g.path.setAttribute('d',g.d+' L'+x.toFixed(1)+' '+y.toFixed(1));
        g.x=x;g.y=y;return;
      }
      if(g.rig){
        const dx=p.x-g.x,dy=p.y-g.y;
        g.moved ||= Math.abs(dx)+Math.abs(dy)>.006;
        g.rig.inspectTarget.set(Math.max(-.37,Math.min(.37,-dx*1.45)),Math.max(-.25,Math.min(.25,dy*1.0)));
        return;
      }
      if (!g.moved && Math.abs(e.clientX-g.start) < 5) return;
      g.moved=true;
      g.chart.scrub=Math.min(1,Math.max(0,(p.x*1920-g.chart.x)/g.chart.w));
      stage.classList.add('sampling-time');
    });
    stage.addEventListener('pointerdown', e => {
      this.clearHeldSample();
      this.blockClick=false;
      if (e.button!==0 || !e.isPrimary || this.map.open || transitioning()) return;
      const chart=this.getPlot(), p=this.coords(e);
      if(this.mode==='d'){
        const x=p.x*1920,y=p.y*1080,path=document.createElementNS(this.ink.namespaceURI,'path');
        const d='M'+x.toFixed(1)+' '+y.toFixed(1);
        path.setAttribute('d',d+' l.1 0');this.ink.append(path);
        this.gesture={id:e.pointerId,path,d,x,y,moved:true};
        stage.setPointerCapture(e.pointerId);return;
      }
      if(e.altKey){
        const rig=getRig();
        if(rig){e.preventDefault();this.gesture={id:e.pointerId,rig,x:p.x,y:p.y,moved:false};stage.setPointerCapture(e.pointerId);}
        return;
      }
      if (!chart || p.x*1920<chart.x || p.x*1920>chart.x+chart.w ||
          p.y*1080<chart.y || p.y*1080>chart.y+chart.h) return;
      this.gesture={chart,id:e.pointerId,start:e.clientX,moved:false};
      stage.setPointerCapture(e.pointerId);
    });
    for (const event of ['pointerup','pointercancel','lostpointercapture'])
      stage.addEventListener(event,e=>{if(this.gesture?.id===e.pointerId)this.clearGesture();});
    window.addEventListener('keyup',e=>{if(e.key==='Alt' && this.gesture?.rig)this.clearGesture();});
    window.addEventListener('blur',()=>this.clearGesture());
    stage.addEventListener('click',e=>{
      if(this.blockClick){this.blockClick=false;e.stopImmediatePropagation();}
    },true);
  }
  coords(e) {
    const r=this.stage.getBoundingClientRect();
    return {x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};
  }
  point(x,y) {
    this.pointer.style.setProperty('--px',(100*Math.max(0,Math.min(1,x)))+'%');
    this.pointer.style.setProperty('--py',(100*Math.max(0,Math.min(1,y)))+'%');
  }
  toggle(mode) {
    this.clearGesture();
    this.mode=this.mode===mode?'':mode;
    this.pointer.dataset.mode=this.mode;
    this.stage.classList.toggle('pen-active',this.mode==='d');
  }
  nudge(direction) {
    const chart=this.getPlot();
    if(!chart || this.transitioning() || this.map.open || this.gesture)return;
    this.heldChart=chart;
    chart.scrub=Math.min(1,Math.max(0,chart.sampleTime+direction*.05));
    this.stage.classList.add('sampling-time');
  }
  clearHeldSample() {
    if(!this.heldChart)return;
    this.heldChart.scrub=null;this.heldChart=null;
    this.stage.classList.remove('sampling-time');
  }
  clearGesture() {
    this.clearHeldSample();
    const g=this.gesture;
    if(!g)return;
    this.gesture=null; this.blockClick=g.moved;
    if(g.chart)g.chart.scrub=null;
    if(g.rig)g.rig.inspectTarget.set(0,0);
    this.stage.classList.remove('sampling-time');
    if(this.stage.hasPointerCapture(g.id))this.stage.releasePointerCapture(g.id);
  }
}
