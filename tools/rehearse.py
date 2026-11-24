"""Measure actual Chromium animation frames on the local GPU, without stepping the presentation clock."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--browser')
    parser.add_argument('--headless',action='store_true',help='Use a headless window for unattended comparison')
    parser.add_argument('--slides', type=int, nargs='*')
    parser.add_argument('--seconds',type=int,default=30)
    parser.add_argument('--output',type=Path,required=True)
    options=parser.parse_args()
    deck=Path(__file__).resolve().parents[1]
    with sync_playwright() as driver:
        browser=driver.chromium.launch(executable_path=options.browser,headless=options.headless,args=['--disable-background-timer-throttling','--disable-renderer-backgrounding'])
        page=browser.new_page(viewport={'width':1920,'height':1080},device_scale_factor=1)
        events=[]
        page.on('console',lambda m:events.append(m.text) if m.type in ('warning','error') else None)
        page.on('pageerror',lambda e:events.append(str(e)))
        page.goto((deck/'index.html').as_uri(),wait_until='domcontentloaded')
        page.wait_for_selector('#loading.gone',state='attached',timeout=180000)
        page.keyboard.press('q')
        if page.evaluate('__pres.quality')!=1:page.keyboard.press('q')
        page.evaluate("""()=>{window.lateLinks=0;const fn=WebGL2RenderingContext.prototype.linkProgram;
          WebGL2RenderingContext.prototype.linkProgram=function(p){lateLinks++;return fn.call(this,p)};}""")
        gpu=page.evaluate("""()=>{const gl=document.querySelector('#gl').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)}""")
        results={'gpu':gpu,'visible_window':not options.headless,'seconds_per_slide':options.seconds,'samples':[],'messages':events}
        counts=page.evaluate('__pres.SLIDES.map(s=>s.beats)')
        for i,beats in enumerate(counts):
            if options.slides and i+1 not in options.slides: continue
            if options.slides and i > 0 and page.evaluate('__pres.state.si') != i - 1:
                page.evaluate('a=>{__pres.goSlide(a[0],a[1]);__pres.step(130,50,true);}',[i-1,counts[i-1]-1])
            sample=page.evaluate("""([slide,count,seconds])=>new Promise(resolve=>{
              const origin=performance.now(),longFrames=[];
              const observer=new PerformanceObserver(list=>{
                for(const e of list.getEntries())longFrames.push({at:Math.round(e.startTime-origin),duration:Math.round(e.duration),renderStart:Math.round(e.renderStart-e.startTime),scripts:e.scripts.map(s=>({invoker:s.invoker,duration:Math.round(s.duration),forcedLayout:Math.round(s.forcedStyleAndLayoutDuration)}))});
              });
              if(PerformanceObserver.supportedEntryTypes.includes('long-animation-frame'))observer.observe({type:'long-animation-frame'});
              __pres.goSlide(slide,0);let previous=null,first=null,beat=0,calls=0,triangles=0,hiddenFrames=0;const times=[];let worst={ms:0};
              function tick(now){
                if(first===null){first=previous=now;requestAnimationFrame(tick);return;}
                const elapsed=now-first;if(document.hidden)hiddenFrames++;const interval=now-previous;times.push(interval);if(interval>worst.ms)worst={ms:interval,elapsed,beat:__pres.state.bi+1,bridge:__pres.renderedBridge};previous=now;
                const target=Math.min(count-1,Math.floor(elapsed/(seconds*1000/count)));
                if(target>beat){__pres.next();beat++;}
                if(!__pres.renderedBridge){calls=Math.max(calls,__pres.renderInfo.calls);triangles=Math.max(triangles,__pres.renderInfo.triangles);}
                if(elapsed<seconds*1000){requestAnimationFrame(tick);return;}
                observer.disconnect();const n=times.length;times.sort((a,b)=>a-b);longFrames.sort((a,b)=>b.duration-a.duration);
                resolve({slide:slide+1,frames:n,fps:+(1000*n/elapsed).toFixed(1),median:times[n>>1],p95:times[Math.floor(n*.95)],p99:times[Math.floor(n*.99)],over34:times.filter(x=>x>=34).length,longFrames:longFrames.slice(0,4),worst,max:times[n-1],calls,triangles,hiddenFrames,lateLinks,quality:__pres.quality});
              }requestAnimationFrame(tick);
            })""",[i,beats,options.seconds])
            results['samples'].append(sample)
            options.output.write_text(json.dumps(results,indent=2,ensure_ascii=False),encoding='utf8')
            print(sample,flush=True)
        browser.close()
if __name__=='__main__':
    main()
