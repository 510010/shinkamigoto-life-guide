#!/usr/bin/env python3
"""items.csv に reading 列（品目名のカタカナ読み）を生成・更新する。

分別検索で「でんち」「ふとん」のような読み仮名検索を効かせるための列。
pykakasi が必要（無い場合は何もせず終了する）。
使い方: python3 scripts/gen_readings.py
"""
import csv
import os
import site
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(site.getusersitepackages())
try:
    import pykakasi
except ImportError:
    print('pykakasi が見つからないため、reading 列は生成しませんでした')
    sys.exit(0)

path = f'{ROOT}/data/items.csv'
rows = list(csv.DictReader(open(path, encoding='utf-8')))
fields = list(rows[0].keys())
if 'reading' not in fields:
    fields.append('reading')
kks = pykakasi.kakasi()
for r in rows:
    r['reading'] = ''.join(x['kana'] for x in kks.convert(r['name']))
with open(path, 'w', encoding='utf-8', newline='') as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    w.writerows(rows)
print(f'reading 列を生成しました: {len(rows)} 件')
