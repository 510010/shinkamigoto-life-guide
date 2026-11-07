#!/usr/bin/env python3
"""Merge grid-parser draft + manual name overrides -> data/items.csv."""
import csv, sys, re
sys.path.insert(0, 'scripts')
from overrides import OV, SKIP_ROWS, MERGE_INTO, NOTE_OVERRIDE

CATMAP = {  # table category -> (collection category_id, table_category label)
 'burnable': ('burnable', '燃やせるごみ'),
 'nonburnable': ('nonburnable', '燃やせないごみ'),
 'hazardous': ('hazardous', '有害ごみ'),
 'foam_tray': ('foam_tray', 'トレー・発泡スチロール'),
 'cans_bottles_pet': ('cans_bottles_pet', '缶・びん・ペットボトル'),
 'cardboard_paper': ('cardboard_paper', '段ボール・新聞紙・折込チラシ'),
 'bulky_nonb': ('nonburnable', '粗大不燃ごみ'),
 'bulky_burnable': ('bulky_burnable', '粗大可燃ごみ'),
 'not_collected': ('not_collected', '収集しないごみ'),
}
BAG = {
 'burnable': '町指定袋（燃やせるごみ用）',
 'nonburnable': '町指定袋（燃やせないごみ用）',
 'hazardous': '中身の見える透明袋（発泡・トレーと袋は分ける）',
 'foam_tray': '中身の見える透明袋（有害ごみと袋は分ける）',
 'cans_bottles_pet': '中身の見える透明袋',
 'cardboard_paper': 'ひもで縛る 又は中身の見える透明袋',
 'bulky_burnable': '粗大ごみ処理券を貼る',
 'not_collected': '',
}

def norm_note(s):
    s = s.replace('４０', '40').replace('㎝', 'cm').replace('１ｍ', '1m').replace('１m', '1m')
    s = s.replace('　', '').strip()
    return s

draft = list(csv.DictReader(open('/tmp/draft_items.csv')))
by_key = {(int(r['page']), int(r['half']), int(r['row'])): r for r in draft}
missing = []
out = []
for key, r in sorted(by_key.items()):
    if key in SKIP_ROWS:
        continue
    src = by_key[MERGE_INTO[key]] if key in MERGE_INTO else r
    cat = src['category']
    note = NOTE_OVERRIDE.get(key, src['note'])
    if key not in OV:
        missing.append(key)
        continue
    name, variant = OV[key]
    cid, tcat = CATMAP[cat]
    bag = '粗大ごみ処理券を貼る' if cat == 'bulky_nonb' else BAG[cid]
    out.append(dict(name=name, variant=variant, category_id=cid,
                    table_category=tcat, bag=bag, note=norm_note(note)))
if missing:
    print('MISSING OVERRIDES:', missing)
    sys.exit(1)
with open('data/items.csv', 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=['name','variant','category_id','table_category','bag','note'])
    w.writeheader(); w.writerows(out)
from collections import Counter
print('items:', len(out))
print(Counter(r['table_category'] for r in out))
