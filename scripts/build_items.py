#!/usr/bin/env python3
"""Reconstruct (name, variant) for tebiki 一覧表 draft rows (v2).

Per half-page, scan entry rows in order:
- strip chars: 1-char runs at rx 66..90 in the name column (vertical names)
- horizontal runs are split into bag part / material-name tokens
- blocks are formed by gap-grouping around named entries
"""
import pdfplumber, bisect, csv, re

PDF = 'source/gomi-guide/guide_tebiki.pdf'
BAG_RE = re.compile(r'袋に入(らない|る)')
MAT_END = ('製', '部分', 'あり', 'なし')
KNOWN_VARIANT = re.compile(r'(金属製|木製|プラスチック製|布製|ビニール製|皮革製|象牙・黒水牛製|陶器等|発泡スチロール製|紙製|金属|プラス|チック製|部分|の部分|網の部分|縁の部分|布部分|骨部分|鉄の部分|木の部分|スプリング部分|分解していない場合)')

def classify_token(tok):
    if not tok: return None
    if KNOWN_VARIANT.search(tok) or tok.endswith('部分') or tok in ('金属', 'なし', 'あり'):
        return 'variant'
    return 'name'

with pdfplumber.open(PDF) as pdf:
    pages = {}
    for pno in range(22, 32):
        pg = pdf.pages[pno - 1]
        H = pg.height
        vxs = sorted(set(round(H - l['top']) for l in pg.lines
                         if abs(l['top'] - l['bottom']) < 1.5 and abs(l['x1'] - l['x0']) > 40))
        hys = sorted(set(round(l['x0']) for l in pg.lines
                         if abs(l['x0'] - l['x1']) < 1.5 and abs(l['bottom'] - l['top']) > 40))
        namechars = {0: {}, 1: {}}
        for c in pg.chars:
            rx = H - (c['top'] + c['bottom']) / 2
            ry = (c['x0'] + c['x1']) / 2
            ci = bisect.bisect_right(vxs, rx) - 1
            ri = bisect.bisect_right(hys, ry) - 1
            if ci in (0, 12) and 1 <= ri < len(hys) - 1:
                half = 0 if ci == 0 else 1
                namechars[half].setdefault(ri, []).append((rx, ry, c['text']))
        pages[pno] = namechars

def row_tokens(chars):
    chars = sorted(chars, key=lambda c: (round(c[1] / 3), c[0]))
    groups = []
    for c in chars:
        if groups and abs(c[1] - groups[-1][-1][1]) <= 3:
            groups[-1].append(c)
        else:
            groups.append([c])
    name_toks, var_toks, bags, strips = [], [], [], []
    for g in groups:
        if len(g) == 1:
            rx, ry, t = g[0]
            if 66 <= rx <= 90:
                strips.append(t)
            else:
                name_toks.append(t)
            continue
        txt = ''.join(t for _, _, t in sorted(g))
        m = BAG_RE.search(txt)
        if m:
            bags.append(m.group(0))
            txt = (txt[:m.start()] + txt[m.end():]).strip('・')
        if not txt:
            continue
        (var_toks if classify_token(txt) == 'variant' else name_toks).append(txt)
    return name_toks, var_toks, bags, strips

draft = list(csv.DictReader(open('/tmp/draft_items.csv')))
by_key = {}
for r in draft:
    by_key.setdefault((int(r['page']), int(r['half'])), []).append(r)

out = []
for (pno, half), rows in sorted(by_key.items()):
    rows.sort(key=lambda r: int(r['row']))
    namechars = pages[pno][half]
    info = {}
    for r in rows:
        ri = int(r['row'])
        info[ri] = row_tokens(namechars.get(ri, []))
    # strip name assembly: consecutive rows with strip chars
    strip_name = {}
    seq = []
    def flush(seq):
        if seq:
            txt = ''.join(t for _, t in seq)
            for ri, _ in seq:
                strip_name[ri] = txt
    prev = None
    for r in rows:
        ri = int(r['row'])
        st = info[ri][3]
        if st and (prev is None or ri - prev <= 1):
            seq += [(ri, t) for t in st]
        else:
            flush(seq); seq = [(ri, t) for t in st] if st else []
        prev = ri if st else prev
    flush(seq)
    # raw name per row
    raw_name = {}
    for r in rows:
        ri = int(r['row'])
        if ri in strip_name:
            raw_name[ri] = strip_name[ri]
        elif info[ri][0]:
            raw_name[ri] = ''.join(info[ri][0])
    # continuation merge: row with name tok + bag, prev row also name tok + bag
    # (e.g. アコーディオン + カーテン): handled by gap-grouping below if the
    # two rows are adjacent and both have bags: merge names.
    merged = {}
    ris = [int(r['row']) for r in rows]
    for a, b in zip(ris, ris[1:]):
        if b - a == 1 and a in raw_name and b in raw_name \
           and info[a][2] and info[b][2] and a not in strip_name and b not in strip_name:
            merged[b] = raw_name[a] + raw_name[b]
            merged[a] = merged[b]
    for k, v in merged.items():
        raw_name[k] = v
    # gap-grouping: groups of consecutive rows separated by named rows
    groups = []
    cur = []
    for r in rows:
        ri = int(r['row'])
        cur.append(ri)
        if ri in raw_name:
            groups.append(cur); cur = []
    if cur:
        groups.append(cur)
    final_name = {}
    last = ''
    for g in groups:
        named = [raw_name[ri] for ri in g if ri in raw_name]
        nm = named[-1] if named else last
        for ri in g:
            final_name[ri] = nm
        if nm: last = nm
    for r in rows:
        ri = int(r['row'])
        _, var_toks, bags, _ = info[ri]
        variant = '・'.join(var_toks + bags)
        out.append(dict(page=pno, half=half, row=ri, name=final_name.get(ri, ''),
                        variant=variant, category=r['category'], note=r['note'],
                        name_raw=r['name_raw']))
with open('/tmp/items_named.csv', 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=['page','half','row','name','variant','category','note','name_raw'])
    w.writeheader(); w.writerows(out)
print('written', len(out))
for r in out:
    if r['page'] == 22:
        print(r['half'], r['row'], r['name'], '|', r['variant'], '=>', r['category'], '|', r['note'])
