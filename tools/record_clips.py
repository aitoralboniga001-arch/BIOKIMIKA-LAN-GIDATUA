"""Record one short real-time clip per PPTX key frame (CDP screencast -> H.264 mp4).
Usage: python tools/record_clips.py deck outdir [only:i.k,...]  (key frames come from tools/make_pptx.py PLAN)"""
import sys, json, base64, subprocess, shutil, time
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).parent))
deck = Path(sys.argv[1]); out = Path(sys.argv[2]); out.mkdir(exist_ok=True, parents=True)
only = set(sys.argv[3].split(',')) if len(sys.argv) > 3 else None
import importlib.util
spec = importlib.util.spec_from_file_location('mp', deck / 'tools' / 'make_pptx.py')
src = open(deck / 'tools' / 'make_pptx.py', encoding='utf8').read()
PLAN = eval(src[src.index('PLAN = {') + 7: src.index('}\n', src.index('PLAN = {')) + 1])
SECS = {(3,3):2.4,(4,2):1.35,(4,3):4.15,(4,4):4.65,(4,5):4.65,(9,3):2.10,(9,4):3.55,(8,1):3.2,(11,5):3.4,(12,1):2.65,(12,2):3.6,(12,3):4.8,(9,2):4.3}
FF = shutil.which('ffmpeg')
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe', args=['--disable-background-timer-throttling', '--disable-renderer-backgrounding'])
    pg = b.new_page(viewport={'width': 1600, 'height': 900})
    pg.goto((deck / 'index.html').as_uri(), wait_until='domcontentloaded')
    pg.wait_for_selector('#loading.gone', state='attached', timeout=180000)
    pg.add_style_tag(content='#loading,.time-hint{display:none!important}')
    pg.keyboard.press('q')
    if pg.evaluate('__pres.quality') != 1: pg.keyboard.press('q')
    ids = pg.evaluate('()=>__pres.SLIDES.map(s=>s.id)')
    cdp = pg.context.new_cdp_session(pg)
    frames = []
    def on_frame(e):
        frames.append((e['metadata']['timestamp'], e['data'])); cdp.send('Page.screencastFrameAck', {'sessionId': e['sessionId']})
    cdp.on('Page.screencastFrame', on_frame)
    for i, sid in enumerate(ids, 1):
        for key in PLAN[sid]:
            k = key[0]; tag = f'{i}.{k}'
            if only and tag not in only: continue
            dur = min(max(SECS.get((i, k), 5.8), 2.5), 6.5) + .6
            # park on the previous beat (or a neighbouring slide) so the clip shows the step itself
            if i == 1: continue  # cover keeps its still (it carries the link)
            if k > 1: pg.evaluate('a=>__pres.goSlide(a[0],a[1])', [i - 1, k - 2])
            else: pg.evaluate('a=>__pres.goSlide(a,__pres.SLIDES[a].beats-1)', i - 2); dur += 3.2
            pg.wait_for_timeout(2500)
            frames.clear()
            cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 88, 'maxWidth': 1600, 'maxHeight': 900, 'everyNthFrame': 1})
            pg.wait_for_timeout(120)
            pg.evaluate('()=>__pres.next()')
            pg.wait_for_timeout(int(dur * 1000))
            cdp.send('Page.stopScreencast'); pg.wait_for_timeout(150)
            fr = sorted(frames)
            d = out / f'f_{tag}'; shutil.rmtree(d, ignore_errors=True); d.mkdir()
            lines = []
            for j, (ts, data) in enumerate(fr):
                (d / f'{j:05d}.jpg').write_bytes(base64.b64decode(data))
                nxt = fr[j + 1][0] if j + 1 < len(fr) else ts + .04
                lines += [f"file '{(d / f'{j:05d}.jpg').as_posix()}'", f'duration {max(nxt - ts, .001):.4f}']
            lines.append(f"file '{(d / f'{len(fr) - 1:05d}.jpg').as_posix()}'")
            (d / 'list.txt').write_text('\n'.join(lines))
            mp4 = out / f'{tag}.mp4'
            subprocess.run([FF, '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', str(d / 'list.txt'),
                            '-vf', 'fps=30,scale=1600:900:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23',
                            '-movflags', '+faststart', '-an', str(mp4)], check=True)
            shutil.rmtree(d)
            print(tag, len(fr), 'frames', f'{fr[-1][0] - fr[0][0]:.1f}s' if fr else '', f'{mp4.stat().st_size // 1024} KB', flush=True)
    b.close()
