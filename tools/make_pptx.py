"""Condensed fallback PowerPoint: one key frame per idea (not per click); the notes of the skipped clicks are merged
into the key frame's notes. Title slide carries a link to the animated version.
With a clips dir, each key frame that has a clip {slide}.{beat}.mp4 (tools/record_clips.py) becomes a full-slide
video whose poster is its first frame (= where the previous slide left off); tools/pptx_autoplay.ps1 then makes them
start on their own.
Usage: python make_pptx.py meta.json fallback_dir out.pptx [clips_dir]"""
import json, re, subprocess, shutil, sys, tempfile
from pathlib import Path
from pptx import Presentation
from pptx.util import Emu, Inches, Pt
from pptx.dml.color import RGBColor
from lxml import etree

URL = 'https://project-q5rlq.vercel.app/'
# slide id -> list of (key beat, first beat covered[, last beat covered]); beats 1-based
PLAN = {
  'title': [(1, 1, 2)], 'measure': [(2, 1), (3, 3), (4, 4)], 'release': [(5, 1), (6, 6)],
  'marker': [(1, 1), (2, 2), (6, 3)], 'tissues': [(2, 1), (3, 3, 8)], 'intensity': [(3, 1), (4, 4)],
  'kinetics': [(4, 1), (7, 5)], 'pancreas': [(3, 1)], 'ck': [(1, 1), (4, 2), (6, 5)],
  'ldh': [(1, 1), (4, 2), (5, 5)], 'electro': [(3, 1), (5, 4)], 'infarct': [(2, 1), (4, 3), (6, 5)],
  'end': [(1, 1), (2, 2)], 'refs': [(1, 1)],
}
meta = json.load(open(sys.argv[1], encoding='utf8')); fb = Path(sys.argv[2]); out = sys.argv[3]
clips = Path(sys.argv[4]) if len(sys.argv) > 4 else None
tmp = Path(tempfile.mkdtemp())
prs = Presentation(); prs.slide_width = Emu(12192000); prs.slide_height = Emu(6858000)
blank = prs.slide_layouts[6]
P = '{http://schemas.openxmlformats.org/presentationml/2006/main}'
plain = lambda t: re.sub(r'\*\*(.+?)\*\*', r'\1', t)
n = 0
for si, s in enumerate(meta['slides'], 1):
    keys = [(k[0], k[1], k[2] if len(k) > 2 else k[0]) for k in PLAN[s['id']]]
    assert sorted(b for k, f, l in keys for b in range(f, l + 1)) == list(range(1, s['beats'] + 1)), s['id']
    for k, f, l in keys:
        sl = prs.slides.add_slide(blank)
        mp4 = clips / f'{si}.{k}.mp4' if clips else None
        if mp4 and mp4.exists():
            poster = tmp / f'{si}.{k}.jpg'
            subprocess.run([shutil.which('ffmpeg'), '-y', '-loglevel', 'error', '-i', str(mp4), '-frames:v', '1', '-q:v', '2', str(poster)], check=True)
            pic = sl.shapes.add_movie(str(mp4), 0, 0, prs.slide_width, prs.slide_height, poster_frame_image=str(poster), mime_type='video/mp4')
        else:
            pic = sl.shapes.add_picture(str(fb / f'{si}.{k}.jpg'), 0, 0, prs.slide_width, prs.slide_height)
        pic._element.nvPicPr.cNvPr.set('descr', s['title']); pic.name = f"{s['id']} {k}"
        ch = s['chapter']
        sub = next((p for p in meta['SUB'].get(s['id'], []) if p[2] <= k - 1 <= p[3]), None)
        head = (f"{ch + 1}. {meta['CHAPTERS'][ch]}" if ch >= 0 else 'Hasiera') + (f"  ·  {sub[0]} {sub[1]}" if sub else '')
        lines = [plain(meta['NOTES'][s['id']][b - 1]) for b in range(f, l + 1)]
        sl.notes_slide.notes_text_frame.text = head + f"\n{s['title']}\n\n" + '\n\n'.join(('• ' + l) if len(lines) > 1 else l for l in lines)
        if s['id'] == 'title':
            tb = sl.shapes.add_textbox(Inches(0.83), Inches(5.42), Inches(6.2), Inches(0.45)); tb.name = 'Bertsio animatua'
            tf = tb.text_frame; tf.margin_left = tf.margin_right = 0
            p = tf.paragraphs[0]
            r1 = p.add_run(); r1.text = 'Bertsio animatua  '; r1.font.size = Pt(13); r1.font.bold = True
            r1.font.color.rgb = RGBColor(0x33, 0x46, 0x5A); r1.font.name = 'Segoe UI'
            r2 = p.add_run(); r2.text = URL.replace('https://', '').rstrip('/'); r2.font.size = Pt(13)
            r2.font.color.rgb = RGBColor(0xA4, 0x54, 0x26); r2.font.name = 'Segoe UI'; r2.hyperlink.address = URL
        tr = etree.SubElement(sl._element, P + 'transition'); tr.set('spd', 'med'); etree.SubElement(tr, P + 'fade')
        root = sl._element; root.remove(tr)
        idx = [i for i, c in enumerate(root) if c.tag in (P + 'cSld', P + 'clrMapOvr')][-1]
        root.insert(idx + 1, tr)
        n += 1
prs.core_properties.title = 'Entzimen neurketaren balioa diagnostikoan'
prs.save(out); print(n, 'slides ->', out)
