"""Capture a short visible-window Chrome trace around individual slide or beat changes."""
import argparse
from pathlib import Path
import json
from playwright.sync_api import sync_playwright


def profile(page, session, start, finish):
    page.evaluate('p => { __pres.goSlide(p[0]-1,p[1]-1); __pres.step(160,50,true); }', start)
    page.wait_for_timeout(350)
    events = []
    completed = []
    def collect(batch):
        events.extend(batch['value'])
    def complete(_):
        completed.append(True)
    session.on('Tracing.dataCollected', collect)
    session.on('Tracing.tracingComplete', complete)
    session.send('Tracing.start', {'categories':'devtools.timeline,v8,gpu,cc,blink,renderer.scheduler', 'transferMode':'ReportEvents'})
    page.keyboard.press('ArrowRight')
    page.wait_for_timeout(2300)
    session.send('Tracing.end')
    for _ in range(120):
        if completed:
            break
        page.wait_for_timeout(100)
    session.remove_listener('Tracing.dataCollected', collect)
    session.remove_listener('Tracing.tracingComplete', complete)
    if not completed:
        raise RuntimeError('Incomplete Chrome trace')
    if page.evaluate('()=>[__pres.state.si+1,__pres.state.bi+1]') != list(finish):
        raise RuntimeError(f'Unexpected destination for {finish}')
    names = {e['tid']: e.get('args', {}).get('name','') for e in events if e['name']=='thread_name'}
    # Nested trace events overlap in time. Report maxima per event, never add durations.
    detail={}
    for event in events:
        if event.get('ph')!='X':
            continue
        name=event['name']
        if name in ('FireAnimationFrame','FunctionCall','Layout','Paint','PrePaint','UpdateLayoutTree','MinorGC','MajorGC','RasterTask','RasterizerTaskImpl::RunOnWorkerThread','RasterDecoderImpl::DoEndRasterCHROMIUM::Flush','GPUTask'):
            key=names.get(event['tid'],'')+' / '+name
            detail[key]=max(detail.get(key,0),round(event.get('dur',0)/1000,2))
    return {'from':start,'to':finish,'max_ms_by_event':dict(sorted(detail.items(),key=lambda kv:-kv[1]))}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--browser',required=True)
    parser.add_argument('--output',required=True,type=Path)
    opts=parser.parse_args()
    root=Path(__file__).resolve().parents[1]
    phases=[((2,4),(3,1)),((3,2),(3,3)),((3,5),(3,6)),((3,6),(4,1)),((4,1),(4,2)),((4,2),(4,3)),((6,4),(7,1)),((7,3),(7,4)),((7,7),(8,1)),((8,1),(8,2)),((8,3),(9,1)),((9,2),(9,3))]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=opts.browser,headless=False)
        page=browser.new_page(viewport={'width':1920,'height':1080})
        page.goto((root/'index.html').as_uri())
        page.wait_for_selector('#loading.gone',state='attached',timeout=180000)
        page.keyboard.press('q')
        if page.evaluate('__pres.quality')!=1:
            page.keyboard.press('q')
        session=page.context.new_cdp_session(page)
        results=[]
        for start,finish in phases:
            results.append(profile(page,session,start,finish))
            opts.output.write_text(json.dumps(results,indent=2),encoding='utf8')
        browser.close()


if __name__=='__main__':
    main()
