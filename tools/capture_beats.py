"""Capture the actual composed stage, including DOM labels, for offline playback.
Run from the deck directory: python tools/capture_beats.py [--browser PATH]
Requires playwright and a Chromium browser with WebGL2.
"""
import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright

def capture():
    args = argparse.ArgumentParser()
    args.add_argument('--browser')
    args.add_argument('--slides', type=int, nargs='*')
    args.add_argument('--width', type=int, default=1600)
    options = args.parse_args()
    deck = Path(__file__).resolve().parents[1]
    output = deck / 'fallback'
    output.mkdir(exist_ok=True)
    failures = []
    with sync_playwright() as driver:
        browser = driver.chromium.launch(executable_path=options.browser, args=['--disable-background-timer-throttling'])
        page = browser.new_page(viewport={'width':options.width,'height':options.width*9//16})
        page.on('pageerror',lambda e: failures.append(str(e)))
        page.on('console',lambda m: failures.append(m.text) if m.type in ('error','warning') else None)
        page.goto((deck/'index.html').as_uri(),wait_until='domcontentloaded')
        page.wait_for_selector('#loading.gone',state='attached',timeout=180000)
        page.add_style_tag(content='*{transition-duration:0s!important;transition-delay:0s!important}#loading,.time-hint{display:none!important}.subpt{animation:none!important}')
        page.keyboard.press('q')
        if page.evaluate('__pres.quality')!=1: page.keyboard.press('q')
        # Choose a representative instant for mechanisms whose end state conceals the action.
        seconds={(3,3):2.4,(4,2):1.35,(4,3):4.15,(4,4):4.65,(4,5):4.65,(12,3):2.10,(12,4):3.55,(8,1):3.2,(10,5):3.4,(11,1):2.65,(11,2):3.6,(11,3):4.8,(12,2):4.3}
        counts=page.evaluate('()=>__pres.SLIDES.map(s=>s.beats)')
        for i,count in enumerate(counts,1):
            if options.slides and i not in options.slides: continue
            page.evaluate('i=>__pres.goSlide(i-1,0)',i)
            page.evaluate('()=>__pres.step(1,50)')
            page.wait_for_timeout(65)
            for b in range(1,count+1):
                if b>1: page.evaluate('()=>__pres.next()')
                page.evaluate('n=>__pres.step(n,50,true)',round(seconds.get((i,b),5.8)*20))
                page.wait_for_function('p=>__pres.state.si===p[0] && __pres.state.bi===p[1] && !__pres.bridge',arg=[i-1,b-1])
                if failures: raise RuntimeError('\n'.join(failures)[:3500])
                page.screenshot(path=str(output/f'{i}.{b}.jpg'),type='jpeg',quality=89)
            print(f'{i}: {count} beats',flush=True)
        browser.close()
if __name__=='__main__':
    capture()
