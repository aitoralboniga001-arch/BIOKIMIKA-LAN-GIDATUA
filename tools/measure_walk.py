"""Run the Plan B readback harness on all beats and bridges in both directions and qualities."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

def main():
    args=argparse.ArgumentParser()
    args.add_argument('--browser')
    args.add_argument('--output',type=Path,required=True)
    options=args.parse_args()
    folder=Path(__file__).resolve().parent
    harness=(folder/'walk.js').read_text(encoding='utf-8-sig')
    results={}
    with sync_playwright() as driver:
        browser=driver.chromium.launch(executable_path=options.browser,args=['--disable-background-timer-throttling','--disable-renderer-backgrounding'])
        page=browser.new_page(viewport={'width':1920,'height':1080})
        messages=[]
        page.on('pageerror',lambda e:messages.append(str(e)))
        page.on('console',lambda m:messages.append(m.text) if m.type in ('warning','error') else None)
        page.goto((folder.parent/'index.html').as_uri(),wait_until='domcontentloaded')
        page.wait_for_selector('#loading.gone',state='attached',timeout=180000)
        page.evaluate(harness)
        page.keyboard.press('q')  # manual selection keeps auto-Q out of the timing comparison
        for mode,level in [('normal',1),('Q',0)]:
            if page.evaluate('__pres.quality')!=level:
                page.keyboard.press('q')
            for label,direction in [('forward',1),('backward',-1)]:
                page.evaluate('d=>__H.walk(d,12)',direction)
                result=page.evaluate('__H.sum()')
                result['framesByBeat']=page.evaluate('__H.rows')
                results[f'{mode}_{label}']=result
                print(mode,label,result['n'],result['links'],result['maxCpu'],result['steadyGpuMed'],flush=True)
                options.output.write_text(json.dumps(dict(results,messages=messages),indent=2),encoding='utf8')
        browser.close()
if __name__=='__main__':
    main()
