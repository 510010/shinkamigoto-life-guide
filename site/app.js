'use strict';
const $ = s => document.querySelector(s);
let DATA = null;
let settings = JSON.parse(localStorage.getItem('lg-settings') || 'null');
let dayOffset = 0;

const WD = ['日', '月', '火', '水', '木', '金', '土'];
// garbage category colors (shared hues between collection chips and search tags)
const CAT_COLORS = {
  burnable: '#c62828', nonburnable: '#1565c0', cans_bottles_pet: '#2e7d32',
  cardboard_paper: '#9e9d24', hazardous: '#7b1fa2', foam_tray: '#ef6c00',
  bulky_burnable: '#6d4c41',
};
const TABLE_COLORS = {
  '燃やせるごみ': '#c62828', '燃やせないごみ': '#1565c0', '粗大不燃ごみ': '#455a64',
  '粗大可燃ごみ': '#6d4c41', '缶・びん・ペットボトル': '#2e7d32', '有害ごみ': '#7b1fa2',
  'トレー・発泡スチロール': '#ef6c00', '段ボール・新聞・チラシ': '#9e9d24',
  '収集しないごみ': '#616161',
};
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
    const ids = DATA.events[h.version][ds] || [];
    const cats = ids.map(id => ({ id, ...DATA.categories[id] }));
    const rare = cats.some(c => c.rare);
    const body = cats.length
      ? cats.map(c => '<span class="gomi-item' + (c.rare ? ' rare-item' : '') + '" style="border-left:6px solid ' +
          (CAT_COLORS[c.id] || '#999') + '">' + c.name + '</span>').join(' ')
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

function clinicRow(f, d) {
  const st = clinicStatus(f, d);
  return '<div class="clinic-row"><div><div class="fname">' + f.name + '</div>' +
    '<div class="small">' + (f.departments || '') + '｜' + st.label + (f.hours_text ? '｜' + f.hours_text : '') +
    (f.address ? '｜' + f.address.replace('長崎県南松浦郡新上五島町', '') : '') + '</div></div>' +
    (f.phone ? '<a class="phone" href="tel:' + f.phone.replace(/-/g, '') + '">' + f.phone + '</a>'
             : '<span class="small">' + (f.contact_note || '') + '</span>') + '</div>';
}
function renderClinics() {
  const d = viewDate();
  const home = hamletOf(settings && settings.home);
  const district = home ? home.district : null;
  // hospitals / medical centers serve the whole town: always shown first
  const hospitals = DATA.facilities.filter(f => f.kind === '病院' || f.kind === '医療センター');
  const list = DATA.facilities.filter(f => !(f.kind === '病院' || f.kind === '医療センター') &&
    (!district || f.district === district));
  const open = [], other = [];
  for (const f of list) {
    const st = clinicStatus(f, d);
    (st.open === true ? open : other).push(clinicRow(f, d));
  }
  $('#clinicBody').innerHTML =
    '<div class="subhead">病院・医療センター（町全域）</div>' + hospitals.map(f => clinicRow(f, d)).join('') +
    '<div class="subhead">' + (district ? district + '地区の診療所' : '診療所（全地区）') + '</div>' +
    (open.length ? open.join('') : '<p class="small">この日に通常診療の施設はありません。</p>') +
    (other.length ? '<details><summary class="small">その他の施設（' + other.length + '件）</summary>' + other.join('') + '</details>' : '');
}

function renderFerries() {
  // Operation status (today only, from the latest capture) — ignores the day navigator.
  const ss = DATA.ship_status;
  if (!ss) {
    $('#ferryBody').innerHTML = '<p class="small">運航状況の取得データがまだありません。各船会社の公式発表をご確認ください。</p>';
    return;
  }
  const md = ss.date.slice(5).replace('-', '/');
  const cap = ss.captured_at.slice(11);
  const line = (name, s, fmt) => {
    if (!s || !s.total) return '<div class="status-row"><span class="tag">' + name + '</span> 状況不明</div>';
    if (s.cancel === 0 && !s.undecided)
      return '<div class="status-row"><span class="tag ok">' + name + '</span> <strong>通常運航</strong>（全' + s.total + '便）</div>';
    let h = '<div class="status-row"><span class="tag ng">' + name + '</span> <strong>欠航 ' + s.cancel + '便</strong>' +
      (s.undecided ? '・未定 ' + s.undecided + '便' : '') + '（全' + s.total + '便）</div>';
    h += s.cancelled.map(fmt).join('');
    return h;
  };
  $('#ferryBody').innerHTML =
    '<p class="small"><span class="tag" style="background:#ef6c00">試験表示</span> ' + md + ' の状況（' + cap + ' 時点の公式発表から自動取得。試験中のため公式発表と異なる場合があります）</p>' +
    line('九州商船', ss.kyushu, c =>
      '<div class="cancel-row">✕ ' + c.route + '｜' + c.vessel + ' ' + c.port + ' ' + c.time + ' 発' +
      (c.reason ? '（' + c.reason + '）' : '') + '</div>') +
    line('五島産業汽船', ss.goto, c =>
      '<div class="cancel-row">✕ ' + c.port + ' ' + c.time + ' 発' + (c.reason ? '（' + c.reason + '）' : '') + '</div>') +
    '<p class="small">野母商船・五島旅客船・崎戸商船の状況は自動取得の対象外です。<a href="https://smart-goto.jp/shinkamigoto/" target="_blank" rel="noopener">まちニュース（SmartGOTO）</a>や各社の公式発表でご確認ください。状況は変わることがあります。出発前に公式発表もご確認ください。</p>';
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
      '<span class="tag cat" style="background:' + (TABLE_COLORS[it.table_category] || '#616161') + '">' + it.table_category + '</span>' +
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
  const s = settings || {};
  return '<label>自宅の集落<select id="setHome"><option value="">選択してください</option>' + opts(s.home) + '</select></label>' +
    '<label>実家の集落（任意）<select id="setParents"><option value="">なし</option>' + opts(s.parents) + '</select></label>' +
    '<button id="saveSettings" class="primary">保存する</button>';
}
function bindSettings(scope) {
  const btn = scope.querySelector('#saveSettings');
  if (!btn) return;
  btn.addEventListener('click', () => {
    settings = {
      home: scope.querySelector('#setHome').value || null,
      parents: scope.querySelector('#setParents').value || null,
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
