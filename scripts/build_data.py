#!/usr/bin/env python3
"""Build site/data.json from the CSV sources (garbage, medical) plus
snapshots of the route guide data (ferries) and the broadcast archive."""
import csv, json, re, os
from datetime import datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RG = os.path.expanduser('~/workspace/shinkamigoto-route-guide/data')
BC = os.path.expanduser('~/workspace/goals/goal-2/files/防災行政無線放送アーカイブ.md')
JST = timezone(timedelta(hours=9))

def rd(path):
    with open(path, newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))

hamlets = rd(f'{ROOT}/data/hamlets.csv')
categories = {r['category_id']: {'name': r['name'], 'rare': r['rare'] == '1',
                                 'bag': r['bag_note']}
              for r in rd(f'{ROOT}/data/categories.csv')}
events = {}
for r in rd(f'{ROOT}/data/collection_events.csv'):
    events.setdefault(r['version'], {}).setdefault(r['date'], []).append(r['category_id'])
items = rd(f'{ROOT}/data/items.csv')
facilities = rd(f'{ROOT}/data/facilities.csv')

# --- ferries from the route guide repo ---
ports = {r['port_id']: r['name'] for r in rd(f'{RG}/ports.csv')}
patterns = {r['pattern_id']: (r['valid_from'] or '0000-01-01', r['valid_to'] or '9999-12-31')
            for r in rd(f'{RG}/service_patterns.csv')}
routes = {r['route_id']: {'name': r['name'], 'vessel': r['vessel_type'],
                           'suspended': r['suspended'] == '1'}
          for r in rd(f'{RG}/routes.csv')}
trips = {r['trip_id']: r for r in rd(f'{RG}/trips.csv')}
stops = {}
for r in rd(f'{RG}/stop_times.csv'):
    stops.setdefault(r['trip_id'], []).append(r)
sailings = []
for tid, t in trips.items():
    rt = routes.get(t['route_id'])
    if not rt or rt['suspended']:
        continue
    vf, vt = patterns.get(t['pattern_id'], ('', ''))
    ss = sorted(stops.get(tid, []), key=lambda s: int(s['seq']))
    for i, a in enumerate(ss):
        if not a['departure']:
            continue
        for b in ss[i + 1:]:
            if b['arrival']:
                sailings.append({
                    'route': t['route_id'], 'route_name': rt['name'],
                    'vessel': rt['vessel'], 'ship': t['vessel_name'],
                    'from': a['port_id'], 'to': b['port_id'],
                    'dep': a['departure'], 'arr': b['arrival'],
                    'valid_from': vf, 'valid_to': vt})
port_list = [{'id': pid, 'name': nm} for pid, nm in ports.items()
             if any(s['from'] == pid or s['to'] == pid for s in sailings)]

# --- broadcasts from the archive markdown (latest 40) ---
bcs = []
try:
    text = open(BC, encoding='utf-8').read()
    for part in re.split(r'\n---\n', text):
        m = re.search(r'## (\d{4})年(\d{1,2})月(\d{1,2})日 (\d{1,2}:\d{2})｜(.+)', part)
        if not m:
            continue
        y, mo, d, tm, title = m.groups()
        body = part[m.end():].strip()
        bcs.append({'date': f'{int(y):04d}-{int(mo):02d}-{int(d):02d}', 'time': tm,
                    'title': title.strip(),
                    'body': ' '.join(l.strip() for l in body.splitlines() if l.strip())})
    bcs.sort(key=lambda b: (b['date'], b['time']), reverse=True)
    bcs = bcs[:40]
except FileNotFoundError:
    pass

data = {
    'meta': {'generated_at': datetime.now(JST).strftime('%Y-%m-%d %H:%M JST'),
             'town': '新上五島町'},
    'hamlets': hamlets, 'categories': categories, 'events': events,
    'items': items, 'facilities': facilities,
    'ports': port_list, 'sailings': sailings, 'broadcasts': bcs,
}
os.makedirs(f'{ROOT}/site', exist_ok=True)
with open(f'{ROOT}/site/data.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
print('data.json:', len(hamlets), 'hamlets,', len(items), 'items,',
      len(facilities), 'facilities,', len(sailings), 'sailings,', len(bcs), 'broadcasts,',
      round(os.path.getsize(f'{ROOT}/site/data.json') / 1024), 'KB')
