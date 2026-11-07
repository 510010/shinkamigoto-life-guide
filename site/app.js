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
  // week ahead (from today): compact 7-column strip, one per household
  const SHORT = { burnable: '燃', nonburnable: '不燃', cans_bottles_pet: '缶びん', cardboard_paper: '段ボール', hazardous: '有害', foam_tray: '発泡', bulky_burnable: '粗大' };
  const strip = h => {
    if (!h) return '';
    let cells = '';
    for (let i = 1; i <= 7; i++) {
      const d2 = new Date(); d2.setDate(d2.getDate() + i);
      const ids = DATA.events[h.version][dstr(d2)] || [];
      cells += '<div class="wk-cell"><div class="wk-d">' + (d2.getMonth() + 1) + '/' + d2.getDate() +
        '<span class="wk-w">(' + WD[d2.getDay()] + ')</span></div>' +
        (ids.length ? ids.map(id => '<div class="wk-c" style="border-left:4px solid ' + (CAT_COLORS[id] || '#999') + '">' +
          (SHORT[id] || DATA.categories[id].name) + '</div>').join('')
                    : '<div class="wk-c none">なし</div>') + '</div>';
    }
    return '<div class="wk-strip">' + cells + '</div>';
  };
  $('#weekGomi').innerHTML = home
    ? '<div class="wk-label">自宅（' + home.version + '版）</div>' + strip(home) +
      (par ? '<div class="wk-label">実家（' + par.version + '版）</div>' + strip(par) : '')
    : '<p class="small">設定で自宅の集落を選んでください。</p>';
}

function clinicStatus(f, d) {
  // returns {open: true/false/null, label}
  const dow = d.getDay(); // 0 Sun
  const wd = [7, 1, 2, 3, 4, 5, 6][dow]; // Mon=1..Sun=7
  const pt = f.pattern_type, txt = f.pattern_text || '';
  // explicit nth-weekday closures in closed_text (e.g. 第3土曜日休診)
  const cm = (f.closed_text || '').match(/第(\d)([月火水木金土日])曜/);
  if (cm && WD[dow] === cm[2] && Math.floor((d.getDate() - 1) / 7) + 1 === Number(cm[1])) {
    return { open: false, label: txt + '（第' + cm[1] + cm[2] + '曜は休診）' };
  }
  if (pt === 'custom' && f.open_days) {
    return { open: f.open_days.includes(String(wd)), label: txt };
  }
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

function parseDeptDays(f) {
  if (!f.dept_days) return null;
  return f.dept_days.split(';').filter(Boolean).map(e => {
    const i = e.indexOf(':');
    return { name: e.slice(0, i), days: e.slice(i + 1) };
  });
}
function deptDaysLabel(dd) {
  const names = { 1: '月', 2: '火', 3: '水', 4: '木', 5: '金', 6: '土', 7: '日' };
  const m = dd.match(/^([0-9]+)(\((.*)\))?$/);
  if (!m) return dd;
  return m[1].split('').map(c => names[c]).join('・') + (m[3] ? '（' + m[3] + '）' : '');
}
function todaysDepts(f, d) {
  const list = parseDeptDays(f);
  if (!list) return null;
  const wd = String([7, 1, 2, 3, 4, 5, 6][d.getDay()]);
  return list.filter(e => {
    const m = e.days.match(/^[0-9]+/);
    return m && m[0].includes(wd);
  }).map(e => e.name);
}
function facilityCard(f, d) {
  const st = clinicStatus(f, d);
  const chip = st.open === true ? '<span class="stchip st-open">本日診療あり</span>'
    : st.open === false ? '<span class="stchip st-closed">本日は休診</span>'
    : '<span class="stchip st-unknown">要確認</span>';
  const isFav = settings && (settings.favs || []).includes(f.facility_id);
  const td = todaysDepts(f, d);
  const faceSub = td !== null
    ? (st.open === true
        ? '<div class="small">今日の診療科：' + (td.length ? td.join('・') : 'なし（科の診療日ではありません）') + '</div>'
        : '<div class="small">' + (f.departments || '') + '</div>')
    : '<div class="small">' + (f.departments || '') + '</div>';
  const links = (f.links || '').split(';').filter(Boolean).map(p => {
    const [label, url] = p.split('|');
    return '<a class="flink" href="' + url + '" target="_blank" rel="noopener">' + label + '</a>';
  }).join('');
  const det = [];
  det.push('診療日：' + st.label);
  const ddl = parseDeptDays(f);
  if (ddl) det.push('診療科と曜日：' + ddl.map(e => e.name + '（' + deptDaysLabel(e.days) + '）').join('、'));
  if (f.hours_text) det.push('受付：' + f.hours_text);
  if (f.closed_text) det.push('休診：' + f.closed_text);
  if (f.address) det.push('住所：' + f.address.replace('長崎県南松浦郡新上五島町', ''));
  if (f.contact_note) det.push('問い合わせ：' + f.contact_note);
  if (f.extra_note) det.push(f.extra_note);
  if (f.notes) det.push('備考：' + f.notes);
  return '<div class="fcard"><div class="fcard-head"><div><div class="fname">' + f.name +
    ' <button class="favbtn" data-fav="' + f.facility_id + '" title="かかりつけに登録">' + (isFav ? '★' : '☆') + '</button></div>' +
    faceSub + '</div>' + chip + '</div>' +
    '<div class="fcard-actions">' +
    (f.phone ? '<a class="phone" href="tel:' + f.phone.replace(/-/g, '') + '">📞 ' + f.phone + '</a>'
             : '<span class="small">' + (f.contact_note || '') + '</span>') +
    '<details class="fdet"><summary>詳細を見る</summary><div class="small fdet-body">' +
    det.map(x => '<div>' + x + '</div>').join('') + (links ? '<div class="flinks">' + links + '</div>' : '') +
    '</div></details></div></div>';
}
function renderClinics() {
  const d = viewDate();
  const home = hamletOf(settings && settings.home);
  const district = home ? home.district : null;
  const favIds = (settings && settings.favs) || [];
  const rank = f => clinicStatus(f, d).open === true ? 0 : clinicStatus(f, d).open === false ? 2 : 1;
  const byRank = arr => arr.slice().sort((a, b) => rank(a) - rank(b));
  const favs = byRank(DATA.facilities.filter(f => favIds.includes(f.facility_id)));
  // hospitals / medical centers serve the whole town: always shown
  const hospitals = DATA.facilities.filter(f => (f.kind === '病院' || f.kind === '医療センター') && !favIds.includes(f.facility_id));
  const list = byRank(DATA.facilities.filter(f => !(f.kind === '病院' || f.kind === '医療センター') &&
    !favIds.includes(f.facility_id) && (!district || f.district === district)));
  $('#clinicBody').innerHTML =
    (favs.length ? '<div class="subhead">かかりつけ</div>' + favs.map(f => facilityCard(f, d)).join('') : '') +
    '<div class="subhead">病院・医療センター（町全域）</div>' + hospitals.map(f => facilityCard(f, d)).join('') +
    '<div class="subhead">' + (district ? district + '地区の診療所' : '診療所（全地区）') + '</div>' +
    (list.length ? list.map(f => facilityCard(f, d)).join('') : '<p class="small">この地区の施設データがありません。</p>') +
    (favs.length ? '' : '<p class="small">カードの ☆ を押すか、設定で「かかりつけ」を選ぶと、その施設が常にここへ出ます。</p>');
  document.querySelectorAll('[data-fav]').forEach(btn => btn.addEventListener('click', () => {
    const id = btn.dataset.fav;
    settings = settings || {};
    settings.favs = settings.favs || [];
    settings.favs = settings.favs.includes(id)
      ? settings.favs.filter(x => x !== id) : [...settings.favs, id];
    localStorage.setItem('lg-settings', JSON.stringify(settings));
    renderClinics();
  }));
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
  const favs = s.favs || [];
  const favBox = (title, arr) => arr.length
    ? '<div class="favgroup"><div class="small"><strong>' + title + '</strong></div>' + arr.map(f =>
        '<label class="favitem"><input type="checkbox" name="favClinic" value="' + f.facility_id + '"' +
        (favs.includes(f.facility_id) ? ' checked' : '') + '> ' + f.name + '</label>').join('') + '</div>'
    : '';
  const hosp = DATA.facilities.filter(f => f.kind === '病院' || f.kind === '医療センター');
  const byDist = {};
  for (const f of DATA.facilities) {
    if (f.kind === '病院' || f.kind === '医療センター') continue;
    (byDist[f.district] = byDist[f.district] || []).push(f);
  }
  const favHtml = '<fieldset class="favset"><legend>かかりつけの診療所（常に表示されます）</legend>' +
    favBox('病院・医療センター', hosp) +
    Object.entries(byDist).map(([dist, arr]) => favBox(dist + '地区', arr)).join('') + '</fieldset>';
  return '<label>自宅の集落<select id="setHome"><option value="">選択してください</option>' + opts(s.home) + '</select></label>' +
    '<label>実家の集落（任意）<select id="setParents"><option value="">なし</option>' + opts(s.parents) + '</select></label>' +
    favHtml +
    '<button id="saveSettings" class="primary">保存する</button>';
}
function bindSettings(scope) {
  const btn = scope.querySelector('#saveSettings');
  if (!btn) return;
  btn.addEventListener('click', () => {
    settings = {
      home: scope.querySelector('#setHome').value || null,
      parents: scope.querySelector('#setParents').value || null,
      favs: [...scope.querySelectorAll('input[name="favClinic"]:checked')].map(x => x.value),
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
