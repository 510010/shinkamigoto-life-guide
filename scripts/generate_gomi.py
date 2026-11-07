#!/usr/bin/env python3
"""Generate garbage collection events for Kamigoto Kurashi Annai.

Source: Shinkamigoto Town official garbage calendar FY2026 (Reiwa 8),
A version (Apr 2026 - Mar 2027), read visually from the official PDFs
(A_2026-04_09.pdf / A_2026-10_2027-03.pdf) on 2026-11-07.

A-version rules (verified against all 12 monthly grids):
- Mon / Wed / Fri: burnable
- Tue, week 1 of month: hazardous + foam_tray
- Tue, weeks 2-5: cans_bottles_pet
- Thu, weeks 1 and 3: nonburnable
- Thu, weeks 2 and 5: cardboard_paper
- Thu, week 4: bulky_burnable
Exceptions (no collection, verified on the Dec/Jan grids):
- 2026-12-31 (Thu, would be cardboard_paper)
- 2027-01-01 (Fri, would be burnable)

B-version rules (verified against all 12 monthly grids of the B PDFs):
- Mon / Wed / Fri: burnable
- Tue, week 1: bulky_burnable
- Tue, weeks 2 and 4: nonburnable
- Tue, weeks 3 and 5: cardboard_paper
- Thu, week 3: hazardous + foam_tray
- Thu, weeks 1, 2, 4, 5: cans_bottles_pet
Exceptions (no collection): 2026-12-31 (Thu, would be cans_bottles_pet)
and 2027-01-01 (Fri, would be burnable) — same two days as A version.
"""
import csv
import datetime as dt
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "collection_events.csv"
START = dt.date(2026, 4, 1)
END = dt.date(2027, 3, 31)

NO_COLLECTION = {dt.date(2026, 12, 31), dt.date(2027, 1, 1)}


def week_of_month(d: dt.date) -> int:
    return (d.day - 1) // 7 + 1


def events_for_a(d: dt.date) -> list[str]:
    if d in NO_COLLECTION:
        return []
    wd = d.weekday()  # Mon=0
    w = week_of_month(d)
    if wd in (0, 2, 4):
        return ["burnable"]
    if wd == 1:  # Tue
        return ["hazardous", "foam_tray"] if w == 1 else ["cans_bottles_pet"]
    if wd == 3:  # Thu
        if w in (1, 3):
            return ["nonburnable"]
        if w in (2, 5):
            return ["cardboard_paper"]
        return ["bulky_burnable"]  # week 4
    return []  # Sat / Sun


def events_for_b(d: dt.date) -> list[str]:
    if d in NO_COLLECTION:
        return []
    wd = d.weekday()  # Mon=0
    w = week_of_month(d)
    if wd in (0, 2, 4):
        return ["burnable"]
    if wd == 1:  # Tue
        if w == 1:
            return ["bulky_burnable"]
        if w in (2, 4):
            return ["nonburnable"]
        return ["cardboard_paper"]  # weeks 3 and 5
    if wd == 3:  # Thu
        return ["hazardous", "foam_tray"] if w == 3 else ["cans_bottles_pet"]
    return []  # Sat / Sun


def main() -> None:
    rows = []
    d = START
    while d <= END:
        for cat in events_for_a(d):
            rows.append({"version": "A", "date": d.isoformat(), "category_id": cat})
        for cat in events_for_b(d):
            rows.append({"version": "B", "date": d.isoformat(), "category_id": cat})
        d += dt.timedelta(days=1)
    rows.sort(key=lambda r: (r["date"], r["version"], r["category_id"]))
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["version", "date", "category_id"])
        w.writeheader()
        w.writerows(rows)
    for ver in ("A", "B"):
        sub = [r for r in rows if r["version"] == ver]
        counts = Counter(r["category_id"] for r in sub)
        print(f"[{ver}] total events: {len(sub)}")
        for k, v in sorted(counts.items()):
            print(f"  {k}: {v}")
        # monthly check for rare categories: each must appear exactly once per month
        rare = ["hazardous", "foam_tray", "bulky_burnable"]
        by_month = Counter((r["date"][:7], r["category_id"]) for r in sub if r["category_id"] in rare)
        bad = {k: v for k, v in by_month.items() if v != 1}
        print(f"[{ver}] rare monthly anomalies:", bad if bad else "none")
        nb = Counter(r["date"][:7] for r in sub if r["category_id"] == "nonburnable")
        print(f"[{ver}] nonburnable per month: min={min(nb.values())} max={max(nb.values())} months={len(nb)}")


if __name__ == "__main__":
    main()
