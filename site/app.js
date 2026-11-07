'use strict';
const $ = s => document.querySelector(s);
let DATA = null;
let settings = JSON.parse(localStorage.getItem('lg-settings') || 'null');
let dayOffset = 0;

const WD = ['日', '月', '火', '水', '木', '金', '土'];
function dstr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function viewDate() { const d = new Date(); d.setDate(d.getDate() + dayOffset); return d; }
function daysUntil(dateStr, from) {
  const a = new Date(dateStr + 'T00:00:00'), b = new Date(dstr(from) + 'T00:00:00');
  return Math.round((a - b) / 86400000);
}
function hamletOf(key) {
  if (!key) return null;
  const [district, hamlet] = key.split('|');
  return DATA.hamlets.find(h => h.district === district && h.hamlet === hamlet) || null;
}
function nextCollection(version, categoryId, from) {
  const ev = DATA.events[version] || {};
  const dates = Object.keys(ev).filter(d => d >= dstr(from) && ev[d].includes(categoryId)).sort();
  return dates[0] || null;
}

function renderGomi() {
  const d = viewDate(), ds = dstr(d);
  const home = hamletOf(settings && settings.home);
  const par = hamletOf(settings && settings.parents);
  let html = '';
  const block = (label, h) => {
    if (!h) return '';
    const cats = (DATA.events[h.version][ds] || []).map(c => DATA.categories[c]);
    const rare = cats.some(c => c.rare);
    const body = cats.length
      ? cats.map(c => '<span class="gomi-item' + (c.rare ? ' rare-item' : '') + '">' + c.name + '</span>').join(' ')
      : '<span class="none">収集なし</span>';
    return '<div class="gomi-row' + (rare ? ' rare-row' : '') + '"><span class="tag">' + label + ' ' + h.version + '版</span>' + body + '</div>';
  };
  html += block('自宅（' + (home ? home.hamlet : '') + '）', home);
  html += block('実家（' + (par ? par.hamlet : '') + '）', par);
  if (!home) html = '<p class="small">設定で自宅の集落を選んでください。</p>';
  $('#gomiToday').innerHTML = html;
  // rare countdown (home, from today regardless of view offset)
  const today = new Date();
  const cd = [];
  if (home) {
    for (const cid of ['hazardous', 'foam_tray', 'bulky_burnable']) {
      const nd = nextCollection(home.version, cid, today);
      if (!nd) continue;
      const n = daysUntil(nd, today);
      const label = DATA.categories[cid].name;
      cd.push('<div class="cd"><div class="n">' + (n === 0 ? '今日' : n + '日') + '</div><div class="l">' +
        label + '<br>' + nd.slice(5).replace('-', '/') + '</div></div>');
    }
  }
  $('#rareCountdown').innerHTML = cd.join('') || '<p class="small">—</p>';
}

function clinicStatus(f, d) {
  // returns {open: true/false/null, label}
  const dow = d.getDay(); // 0 Sun
  const wd = [7, 1, 2, 3, 4, 5, 6][dow]; // Mon=1..Sun=7
  const pt = f.pattern_type, txt = f.pattern_text || '';
  if (pt === 'hospital') return { open: wd <= 5, label: '平日は外来あり（診療科ごとに異なるため公式サイトで確認を）' };
  if (pt === 'weekday_set') return { open: wd <= 5, label: txt };
  if (pt === 'weekly') {
    const m = txt.match(/毎週([月火水木金土日])曜日/);
    if (m) return { open: WD[dow] === m[1], label: txt };
    return { open: null, label: txt };
  }
  if (pt === 'monthly_nth') {
    const m = txt.match(/第(\d)([月火水木金土日])曜日/);
    if (m) {
      const nth = Math.floor((d.getDate() - 1) / 7) + 1;
      return { open: WD[dow] === m[2] && nth === Number(m[1]), label: txt };
    }
    return { open: null, label: txt };
  }
  return { open: null, label: txt };
}

function renderClinics() {
  const d = viewDate();
  const home = hamletOf(settings && settings.home);
  const district = home ? home.district : null;
  const list = DATA.facilities.filter(f => !district || f.district === district);
  const open = [], other = [];
  for (const f of list) {
    const st = clinicStatus(f, d);
    const row = '<div class="clinic-row"><div><div class="fname">' + f.name + '</div>' +
      '<div class="small">' + (f.departments || '') + '｜' + st.label + (f.hours_text ? '｜' + f.hours_text : '') + '</div></div>' +
      (f.phone ? '<a class="phone" href="tel:' + f.phone.replace(/-/g, '') + '">' + f.phone + '</a>'
               : '<span class="small">' + (f.contact_note || '') + '</span>') + '</div>';
    (st.open === true ? open : other).push(row);
  }
  $('#clinicBody').innerHTML =
    (district ? '' : '<p class="small">全地区を表示中（設定で自宅を選ぶと地区で絞ります）。</p>') +
    (open.length ? open.join('') : '<p class="small">この日に通常診療の施設はありません。</p>') +
    (other.length ? '<details><summary class="small">その他の施設（' + other.length + '件）</summary>' + other.join('') + '</details>' : '');
}

function renderFerries() {
  const d = viewDate(), ds = dstr(d);
  const s = settings || {};
  if (!s.from || !s.to) {
    $('#ferryBody').innerHTML = '<p class="small">設定で「よく使う航路」を選ぶと、その航路の時刻表が出ます。</p>';
    return;
  }
  const list = DATA.sailings.filter(x => x.from === s.from && x.to === s.to && x.valid_from <= ds && ds <= x.valid_to)
    .sort((a, b) => a.dep.localeCompare(b.dep));
  const pname = id => (DATA.ports.find(p => p.id === id) || {}).name || id;
  $('#ferryBody').innerHTML = '<div class="ferry-head">' + pname(s.from) + ' → ' + pname(s.to) + '</div>' +
    (list.length ? list.map(x =>
      '<div class="ferry-row"><span class="tag">' + x.vessel + (x.ship ? ' ' + x.ship : '') + '</span>' +
      '<span class="ftime">' + x.dep + '</span> 発 → <span class="ftime">' + x.arr + '</span> 着</div>').join('')
    : '<p class="small">この日の便はありません（ダイヤ対象外の可能性があります）。</p>');
}

function renderBroadcasts() {
  const items = DATA.broadcasts.slice(0, 5);
  $('#broadcastBody').innerHTML = items.map((b, i) =>
    '<div class="bc"><div><span class="when">' + b.date.slice(5).replace('-', '/') + ' ' + b.time + '</span> ' + b.title + '</div>' +
    '<div class="small bcbody" id="bc' + i + '" hidden>' + b.body + '</div>' +
    '<button class="linkbtn" data-bc="' + i + '">本文を読む</button></div>').join('') ||
    '<p class="small">まだ蓄積がありません。</p>';
  document.querySelectorAll('[data-bc]').forEach(btn => btn.addEventListener('click', () => {
    const el = $('#bc' + btn.dataset.bc);
    el.hidden = !el.hidden;
    btn.textContent = el.hidden ? '本文を読む' : '閉じる';
  }));
}

function doSearch() {
  const q = $('#searchInput').value.trim();
  const box = $('#searchResults');
  if (!q) { box.innerHTML = '<p class="small">品目名を入力してください。</p>'; return; }
  const hits = DATA.items.filter(it => (it.name + it.variant).includes(q)).slice(0, 30);
  const home = hamletOf(settings && settings.home);
  const today = new Date();
  if (!hits.length) {
    box.innerHTML = '<p>「' + q + '」は一覧表に見つかりませんでした。環境課（0959-53-1161）へお問い合わせください。</p>';
    return;
  }
  box.innerHTML = hits.map(it => {
    let next = '';
    if (it.category_id === 'not_collected') next = '<div class="next">町では収集しません</div>';
    else if (home) {
      const nd = nextCollection(home.version, it.category_id, today);
      if (nd) {
        const n = daysUntil(nd, today);
        next = '<div class="next">あなたの地区（' + home.version + '版）の次回は <strong>' +
          nd.slice(5).replace('-', '/') + (n === 0 ? '（今日）' : n === 1 ? '（明日）' : '（あと' + n + '日）') + '</strong></div>';
      }
    }
    return '<div class="result"><div class="rname">' + it.name +
      (it.variant ? '（' + it.variant + '）' : '') + '</div>' +
      '<span class="tag cat">' + it.table_category + '</span>' +
      (it.bag ? '<div class="small">出し方：' + it.bag + '</div>' : '') +
      (it.note ? '<div class="small">注意：' + it.note + '</div>' : '') + next + '</div>';
  }).join('');
}

function settingsFormHTML() {
  const groups = {};
  for (const h of DATA.hamlets) (groups[h.district] = groups[h.district] || []).push(h);
  const opts = sel => Object.entries(groups).map(([dist, hs]) =>
    '<optgroup label="' + dist + '地区">' + hs.map(h =>
      '<option value="' + dist + '|' + h.hamlet + '"' + (sel === dist + '|' + h.hamlet ? ' selected' : '') + '>' +
      h.hamlet + '（' + h.version + '版）</option>').join('') + '</optgroup>').join('');
  const popts = sel => DATA.ports.map(p =>
    '<option value="' + p.id + '"' + (sel === p.id ? ' selected' : '') + '>' + p.name + '</option>').join('');
  const s = settings || {};
  return '<label>自宅の集落<select id="setHome"><option value="">選択してください</option>' + opts(s.home) + '</select></label>' +
    '<label>実家の集落（任意）<select id="setParents"><option value="">なし</option>' + opts(s.parents) + '</select></label>' +
    '<label>よく使う航路（任意）<div class="routeSel"><select id="setFrom"><option value="">出発港</option>' + popts(s.from) + '</select>' +
    '<span>→</span><select id="setTo"><option value="">到着港</option>' + popts(s.to) + '</select></div></label>' +
    '<button id="saveSettings" class="primary">保存する</button>';
}
function bindSettings(scope) {
  const btn = scope.querySelector('#saveSettings');
  if (!btn) return;
  btn.addEventListener('click', () => {
    settings = {
      home: scope.querySelector('#setHome').value || null,
      parents: scope.querySelector('#setParents').value || null,
      from: scope.querySelector('#setFrom').value || null,
      to: scope.querySelector('#setTo').value || null,
    };
    localStorage.setItem('lg-settings', JSON.stringify(settings));
    renderAll();
  });
}
function renderChips() {
  const home = hamletOf(settings && settings.home);
  const par = hamletOf(settings && settings.parents);
  $('#settingChips').innerHTML =
    (home ? '<span class="chip">自宅 <b>' + home.district + '・' + home.hamlet + '（' + home.version + '版）</b></span>' : '') +
    (par ? '<span class="chip">実家 <b>' + par.district + '・' + par.hamlet + '（' + par.version + '版）</b></span>' : '');
  $('#setupCard').hidden = !!home;
  if (!home) { $('#setupForm').innerHTML = settingsFormHTML(); bindSettings($('#setupForm')); }
}

function renderAll() {
  const d = viewDate();
  $('#dateLabel').textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日（' + WD[d.getDay()] + '）' +
    (dayOffset === 0 ? ' の情報' : dayOffset === 1 ? '（明日）の情報' : dayOffset === -1 ? '（昨日）の情報' : ' の情報');
  document.querySelectorAll('.dayword').forEach(e => e.textContent = dayOffset === 0 ? '今日' : dayOffset === 1 ? '明日' : dayOffset === -1 ? '昨日' : (d.getMonth() + 1) + '/' + d.getDate());
  renderChips();
  renderGomi();
  renderClinics();
  renderFerries();
}

fetch('data.json').then(r => r.json()).then(data => {
  DATA = data;
  $('#genAt').textContent = data.meta.generated_at;
  renderBroadcasts();
  renderAll();
  $('#searchInput').addEventListener('input', doSearch);
  $('#prevDay').addEventListener('click', () => { dayOffset--; renderAll(); });
  $('#nextDay').addEventListener('click', () => { dayOffset++; renderAll(); });
  $('#todayBtn').addEventListener('click', () => { dayOffset = 0; renderAll(); });
  $('#openSettings').addEventListener('click', () => {
    const p = $('#settingsPanel');
    p.hidden = !p.hidden;
    if (!p.hidden) { p.innerHTML = settingsFormHTML(); bindSettings(p); }
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
});
