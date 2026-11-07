#!/usr/bin/env python3
"""Parse the ごみ分別一覧表 (tebiki pp.22-31) into draft rows.

Grid-based: category from the ○ column (exact), notes from 摘要 column (exact),
name-area raw text runs for later name reconstruction.
Rotated frame: rx = H - top (horizontal in reading view), ry = x0 (vertical).
"""
import pdfplumber, bisect, csv, sys, re

PDF = sys.argv[1] if len(sys.argv) > 1 else 'source/gomi-guide/guide_tebiki.pdf'
CATS = ['burnable','nonburnable','hazardous','foam_tray','cans_bottles_pet',
        'cardboard_paper','bulky_nonb','bulky_burnable','not_collected']
CATNAMES = ['燃やせるごみ','燃やせないごみ','有害ごみ','トレー・発泡スチロール',
            '缶・びん・ペットボトル','段ボール・新聞紙・折込チラシ','粗大不燃ごみ',
            '粗大可燃ごみ','収集しないごみ']

def grid(pg):
    H = pg.height
    vxs = sorted(set(round(H - l['top']) for l in pg.lines
                     if abs(l['top'] - l['bottom']) < 1.5 and abs(l['x1'] - l['x0']) > 40))
    hys = sorted(set(round(l['x0']) for l in pg.lines
                     if abs(l['x0'] - l['x1']) < 1.5 and abs(l['bottom'] - l['top']) > 40))
    return vxs, hys

def runs(chars):
    """Group chars into horizontal runs by ry (tol 3), text sorted by rx."""
    out = []
    chars = sorted(chars, key=lambda c: (c[1], c[0]))
    cur = []
    for c in chars:
        if cur and abs(c[1] - cur[-1][1]) > 3:
            out.append(cur); cur = []
        cur.append(c)
    if cur: out.append(cur)
    res = []
    for r in cur and out or out:
        pass
    for r in out:
        txt = ''.join(t for _, _, t in sorted(r))
        res.append((min(x for x, _, _ in r), sum(y for _, y, _ in r) / len(r), txt))
    return res

with pdfplumber.open(PDF) as pdf:
    all_rows = []
    for pno in range(22, 32):
        pg = pdf.pages[pno - 1]
        H = pg.height
        vxs, hys = grid(pg)
        # columns: [name, 9 cats, note] x2 halves
        assert len(vxs) == 24, (pno, vxs)
        cells = {}
        namechars = {0: {}, 1: {}}
        for c in pg.chars:
            rx = H - (c['top'] + c['bottom']) / 2
            ry = (c['x0'] + c['x1']) / 2
            ci = bisect.bisect_right(vxs, rx) - 1
            ri = bisect.bisect_right(hys, ry) - 1
            if not (0 <= ci < 24 and 0 <= ri < len(hys) - 1):
                continue
            if ci in (0, 12) and ri >= 1:
                half = 0 if ci == 0 else 1
                namechars[half].setdefault(ri, []).append((rx, ry, c['text']))
            cells.setdefault((ci, ri), []).append(c['text'])
        for ri in range(1, len(hys) - 1):
            for half in (0, 1):
                base = half * 12
                cat = None
                for k in range(9):
                    txt = ''.join(cells.get((base + 1 + k, ri), []))
                    if '○' in txt:
                        cat = CATS[k]
                note = ''.join(cells.get((base + 10, ri), [])).strip()
                note = re.sub(r'\s+', '', note)
                nrs = runs(namechars[half].get(ri, []))
                nametext = ' / '.join(t for _, _, t in nrs)
                if cat or nametext:
                    all_rows.append(dict(page=pno, half=half, row=ri,
                                         name_raw=nametext, category=cat or '',
                                         note=note))
    with open('/tmp/draft_items.csv', 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['page','half','row','name_raw','category','note'])
        w.writeheader(); w.writerows(all_rows)
    print('rows:', len(all_rows))
    from collections import Counter
    print(Counter(r['category'] for r in all_rows))
