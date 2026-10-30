/* 메뉴: 재고실사 (바코드) — 데이터는 app_settings.stock_inventory 한 곳에 저장 */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, esc = U.esc, norm = U.norm;
var KEY = "stock_inventory";
var BRANDS = [["CH", "샤넬"], ["HM", "에르메스"], ["AI", "알파인더스트리"], ["MC", "몽클레어"], ["CL", "셀린느"], ["CO", "끌로에"], ["MM", "미우미우"], ["HK", "호카"], ["AM", "아미"], ["MK", "메종키츠네"], ["PB", "파라부트"], ["TB", "톰브라운"], ["VW", "비비안웨스트우드"], ["LV", "루이비통"], ["DI", "디올"], ["GC", "구찌"], ["PR", "프라다"], ["BV", "보테가베네타"], ["YS", "생로랑"], ["FE", "펜디"], ["BA", "발렌시아가"], ["LO", "로에베"], ["BB", "버버리"], ["MA", "메종마르지엘라"], ["ET", "기타"]];
/* 기본 브랜드 + 직접 추가한 브랜드(stock_inventory.brands)를 가나다순으로, 기타는 맨 끝 */
function allBrands() {
  /* 직접 추가한 브랜드: 목록(brands) + 상품에 같이 저장한 이름(brandLabel) — 목록이 날아가도 상품에서 되살림 */
  var extra = (D().brands || []).slice();
  Object.values(D().items || {}).forEach(function (it) { if (it.brandLabel && it.brand) extra.push([it.brand, it.brandLabel]); });
  var L = BRANDS.slice();
  extra.forEach(function (b) { if (b && b[0] && b[1] && !L.some(function (x) { return x[0] === b[0]; })) L.push([b[0], b[1]]); });
  return L.sort(function (a, b) { if (a[0] === "ET") return 1; if (b[0] === "ET") return -1; return a[1].localeCompare(b[1], "ko"); });
}
var v = ERP.view; v.stMode = v.stMode || "실사"; v.stQ = v.stQ || ""; v.stAge = v.stAge || ""; v.stLoc = v.stLoc || ""; v.stMsg = v.stMsg || "";
var LAST = null;
function D() {
  var d = S.SET[KEY];
  /* 실시간 반영으로 들어온 값이 내가 방금 저장한 것보다 예전이면 내 것을 유지 */
  if (LAST && d !== LAST && (!d || (Number(d._rev) || 0) < (Number(LAST._rev) || 0))) { d = LAST; S.SET[KEY] = d; }
  if (!d || !d.items) { d = { items: {}, seq: {}, count: null, locs: "A-01~A-05" }; S.SET[KEY] = d; }
  LAST = d; return d;
}
var saveT = null, saveQ = Promise.resolve(), lastSavedAt = "";
/* ---------- 데이터 지키기 ----------
   1) 저장할 때마다 서버의 최신 값을 먼저 읽어 와서 '상품 단위로 합친 뒤' 저장 → 다른 PC·다른 탭이 저장해도 서로 지우지 않음
   2) 삭제는 기록(deleted)으로 남겨서 합칠 때 되살아나지 않게
   3) 저장할 때마다 이 브라우저에 최근 20개 백업, 하루 1번 서버에도 날짜별 백업(권한이 있으면) */
function newer(a, b) { return String(a || "") >= String(b || ""); }
function mergeInv(srv, loc) {
  srv = srv && srv.items ? srv : { items: {} }; loc = loc && loc.items ? loc : { items: {} };
  var out = Object.assign({}, srv, loc), del = Object.assign({}, srv.deleted || {});
  Object.keys(loc.deleted || {}).forEach(function (k) { if (!del[k] || newer(loc.deleted[k], del[k])) del[k] = loc.deleted[k]; });
  var items = {};
  [srv.items, loc.items].forEach(function (src) { Object.keys(src || {}).forEach(function (k) { var x = src[k]; if (!x) return; if (!items[k] || newer(x.at, items[k].at)) items[k] = x; }); });
  Object.keys(del).forEach(function (k) { if (items[k] && newer(del[k], items[k].at)) delete items[k]; });
  out.items = items; out.deleted = del;
  var b = {}; (srv.brands || []).concat(loc.brands || []).forEach(function (x) { if (x && x[0]) b[x[0]] = x; }); out.brands = Object.values(b);
  var sq = Object.assign({}, srv.seq || {}); Object.keys(loc.seq || {}).forEach(function (k) { sq[k] = Math.max(Number(sq[k]) || 0, Number(loc.seq[k]) || 0); }); out.seq = sq;
  if ((Number(srv.countAt) || 0) > (Number(loc.countAt) || 0)) { out.count = srv.count || null; out.countAt = srv.countAt; }
  out._rev = Math.max(Number(srv._rev) || 0, Number(loc._rev) || 0);
  return out;
}
function localBackup(val) {
  try { var k = "rowna-stock-backup", L = JSON.parse(localStorage.getItem(k) || "[]"); L.unshift({ at: new Date().toISOString(), n: Object.keys(val.items || {}).length, value: val }); localStorage.setItem(k, JSON.stringify(L.slice(0, 20))); } catch (e) {}
}
async function serverBackup(val) {
  var day = U.today(), k = "stock_bak_done";
  try { if (localStorage.getItem(k) === day) return; } catch (e) {}
  var r = await S.sb.from("app_settings").upsert({ key: KEY + "_bak_" + day, value: val }).select("key");
  if (!r.error && r.data && r.data.length) { try { localStorage.setItem(k, day); } catch (e) {} }
}
function save(now) {
  clearTimeout(saveT);
  var run = function () {
    saveQ = saveQ.then(async function () {
      var loc = D(); loc._rev = Math.max(Number(loc._rev) || 0, Date.now());
      var g = await S.sb.from("app_settings").select("value").eq("key", KEY).maybeSingle();
      if (g.error) { var m0 = "서버 값을 읽지 못해서 저장을 멈췄어요 (덮어쓰기 방지): " + ERP.errMsg(g.error); ERP.toast("재고 저장 실패: " + m0); return m0; }
      var merged = mergeInv(g.data && g.data.value, loc);
      merged._rev = Math.max(merged._rev, Date.now());
      var r = await S.sb.from("app_settings").upsert({ key: KEY, value: merged }).select("key");
      var msg = r.error ? (ERP.errMsg(r.error) + " [" + (r.error.code || "") + " " + (r.error.message || "") + "]") : (!r.data || !r.data.length ? "DB에 저장되지 않았어요 (권한 정책에 막힌 것 같아요)" : "");
      if (msg) { console.error("[재고저장]", r.error || "0 rows", r.status); ERP.toast("재고 저장 실패: " + msg); return msg; }
      /* 화면 데이터를 합쳐진 값으로 바꿈 (다른 PC에서 넣은 상품도 같이 보이게) */
      Object.keys(merged).forEach(function (k) { loc[k] = merged[k]; }); Object.keys(loc).forEach(function (k) { if (!(k in merged)) delete loc[k]; });
      S.SET[KEY] = loc; LAST = loc;
      lastSavedAt = new Date().toTimeString().slice(0, 5);
      localBackup(merged); serverBackup(merged).catch(function () {});
      var el = document.getElementById("st-saved"); if (el) el.textContent = "✔ 저장됨 " + lastSavedAt + " · 상품 " + Object.keys(merged.items).length + "개";
      return "";
    });
    return saveQ;
  };
  if (now) return run(); saveT = setTimeout(run, 700);
}
function items() { return Object.values(D().items); }
/* ---------- 입고 내역(1개 = 1줄) — 같은 바코드·품번이라도 매입처·날짜·매입가가 다를 수 있어서 개별로 기록 ---------- */
function mkLot(t) { t = t || {}; return { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), vendor: String(t.vendor || "").trim(), date: t.date || "", price: t.price === "" || t.price == null ? "" : Math.max(0, Number(t.price) || 0), loc: String(t.loc || "").toUpperCase(), at: new Date().toISOString() }; }
function lotsOf(it) {
  if (!Array.isArray(it.lots)) { it.lots = []; for (var i = 0; i < (Number(it.qty) || 0); i++) it.lots.push(mkLot({ vendor: it.vendor, date: it.buyDate, price: it.buyPrice, loc: it.loc })); }
  return it.lots;
}
function fifo(L) { return L.slice().sort(function (a, b) { return (a.date || "9999").localeCompare(b.date || "9999") || (a.at || "").localeCompare(b.at || ""); }); }
/* 보유 중 = out 없음. 출고된 1개는 지우지 않고 out(출고일)을 남겨서 회전율 계산에 씀 */
function active(it) { return lotsOf(it).filter(function (x) { return !x.out; }); }
function lastLot(it) { var L = lotsOf(it); return L.length ? L[L.length - 1] : { vendor: it.vendor, date: it.buyDate, price: it.buyPrice }; }
function addLots(it, n, tpl) { var L = lotsOf(it); for (var i = 0; i < n; i++) L.push(mkLot(tpl)); it.qty = active(it).length; }
function takeLots(it, n, type) { var A = fifo(active(it)); for (var i = 0; i < n && i < A.length; i++) { A[i].out = U.today(); A[i].outType = type || "출고"; } it.qty = active(it).length; }
function setCount(it, n) { var q = active(it).length; if (n > q) { var t = lastLot(it); addLots(it, n - q, { vendor: t.vendor, date: t.date, price: t.price, loc: it.loc }); } else if (n < q) takeLots(it, q - n, "실사차이"); }
/* ---------- 회전율 ---------- */
function dayNum(d) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : null; }
function lotIn(x) { return x.date || (x.at || "").slice(0, 10); }
function heldDays(x) { var a = dayNum(lotIn(x)), b = dayNum(x.out || U.today()); return a == null || b == null ? null : Math.max(0, Math.round(b - a)); }
function oldestDays(it) { var m = null; active(it).forEach(function (x) { var d = heldDays(x); if (d != null && (m == null || d > m)) m = d; }); return m; }
var LONG = 90;
function turnover() {
  var T = dayNum(U.today()), cost = 0, nAct = 0, sumDays = 0, nDays = 0, longN = 0, longCost = 0, soldCost = 0, soldN = 0, soldDays = 0, noPrice = 0;
  items().forEach(function (it) { lotsOf(it).forEach(function (x) {
    var pr = x.price === "" || x.price == null ? null : Number(x.price), d = heldDays(x);
    if (!x.out) { nAct++; if (pr == null) noPrice++; else cost += pr; if (d != null) { sumDays += d; nDays++; if (d >= LONG) { longN++; longCost += pr || 0; } } }
    else if (x.outType === "출고" && dayNum(x.out) != null && T - dayNum(x.out) <= 90) { soldN++; soldCost += pr || 0; if (d != null) soldDays += d; }
  }); });
  return { cost: cost, n: nAct, avgDays: nDays ? Math.round(sumDays / nDays) : null, longN: longN, longCost: longCost, soldN: soldN, soldCost: soldCost, soldAvgDays: soldN ? Math.round(soldDays / soldN) : null, rate: cost ? soldCost / cost * (365 / 90) : null, noPrice: noPrice };
}
function won(n) { return Number(n).toLocaleString("ko-KR"); }
function buySummary(it) {
  var L = active(it), P = L.filter(function (x) { return x.price !== "" && x.price != null; }).map(function (x) { return Number(x.price); });
  var vs = {}; L.forEach(function (x) { if (x.vendor) vs[x.vendor] = 1; }); var vk = Object.keys(vs);
  if (!P.length) return { main: "", sub: vk.join(", ") };
  var mn = Math.min.apply(null, P), mx = Math.max.apply(null, P), avg = Math.round(P.reduce(function (a, b) { return a + b; }, 0) / P.length);
  return { main: mn === mx ? won(mn) : "평균 " + won(avg), sub: (mn === mx ? "" : won(mn) + "~" + won(mx) + " · ") + (vk.length === 1 ? vk[0] : vk.length ? "매입처 " + vk.length + "곳" : "") + (P.length < L.length ? " · 매입가 미입력 " + (L.length - P.length) + "개" : ""), avg: avg, min: mn, max: mx };
}
function brandName(c) { var b = allBrands().find(function (x) { return x[0] === c; }); return b ? b[1] : (c || ""); }
function vendors() { var o = { "오케이몰(렉스몬드)": 1 }; items().forEach(function (it) { if (it.vendor) o[it.vendor] = 1; (it.lots || []).forEach(function (x) { if (x.vendor) o[x.vendor] = 1; }); }); return Object.keys(o).sort(function (a, b) { return a.localeCompare(b, "ko"); }); }
function isLoc(code) { return /^LOC-/i.test(code); }

/* ---------- 바코드 SVG (Code128) ---------- */
function barcodeSvg(code, h) {
  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try { window.JsBarcode(svg, code, { format: "CODE128", width: 2, height: h || 50, margin: 0, displayValue: false }); } catch (e) { return ""; }
  return svg.outerHTML;
}

/* ---------- 스캔 처리 ---------- */
/* 키보드가 한글 상태에서 스캔하면 'ㅣㅐㅊ-ㅁ1'처럼 들어옴 → 영문 자판으로 되돌림 */
var KO = { "ㄱ":"r","ㄲ":"R","ㄴ":"s","ㄷ":"e","ㄸ":"E","ㄹ":"f","ㅁ":"a","ㅂ":"q","ㅃ":"Q","ㅅ":"t","ㅆ":"T","ㅇ":"d","ㅈ":"w","ㅉ":"W","ㅊ":"c","ㅋ":"z","ㅌ":"x","ㅍ":"v","ㅎ":"g",
  "ㅏ":"k","ㅐ":"o","ㅑ":"i","ㅒ":"O","ㅓ":"j","ㅔ":"p","ㅕ":"u","ㅖ":"P","ㅗ":"h","ㅘ":"hk","ㅙ":"ho","ㅚ":"hl","ㅛ":"y","ㅜ":"n","ㅝ":"nj","ㅞ":"np","ㅟ":"nl","ㅠ":"b","ㅡ":"m","ㅢ":"ml","ㅣ":"l",
  "ㄳ":"rt","ㄵ":"sw","ㄶ":"sg","ㄺ":"fr","ㄻ":"fa","ㄼ":"fq","ㄽ":"ft","ㄾ":"fx","ㄿ":"fv","ㅀ":"fg","ㅄ":"qt" };
var CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ", JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ", JONG = ["", "ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
function fixKo(s) {
  if (!/[ㄱ-ㅣ가-힣]/.test(s)) return s;
  var out = "";
  for (var i = 0; i < s.length; i++) {
    var ch = s[i], n = ch.charCodeAt(0) - 0xAC00;
    if (n >= 0 && n < 11172) { out += KO[CHO[Math.floor(n / 588)]] + KO[JUNG[Math.floor((n % 588) / 28)]] + (n % 28 ? KO[JONG[n % 28]] : ""); }
    else out += KO[ch] || ch;
  }
  return out.toUpperCase();
}
function onScan(raw) {
  var code = fixKo(String(raw || "").trim()); if (!code) return; v.stLast = code;
  var d = D();
  if (isLoc(code)) { v.stLoc = code.toUpperCase().replace(/^LOC-/, ""); v.stMsg = "📍 위치 " + v.stLoc + " — 이제 찍는 상품은 이 위치로 기록돼요"; ERP.render(); return; }
  var it = d.items[code];
  if (!it) { v.stMsg = "새 바코드 " + code + " — 상품 정보를 등록해 주세요"; open(null, code); return; }
  if (v.stLoc) it.loc = v.stLoc;
  var m = v.stMode;
  if (m === "실사") { d.countAt = Date.now(); if (!d.count) d.count = { at: new Date().toISOString(), scans: {} }; d.count.scans[code] = (d.count.scans[code] || 0) + 1; v.stMsg = "✔ " + label(it) + " — 실사 " + d.count.scans[code] + "개째";
    /* 찍은 개수가 장부 재고보다 많아지면 = 새로 들어온 1개 → 매입가를 넣을 수 있게 창을 띄움 */
    if (d.count.scans[code] > active(it).length) { v.stMsg = "＋ " + label(it) + " — 재고보다 1개 더 찍혔어요. 이 1개의 매입가를 확인하고 저장하세요"; it.at = new Date().toISOString(); save(); open(it, null, { add: 1 }); return; } }
  else if (m === "입고") { v.stMsg = "＋ 입고 " + label(it) + " — 이 1개의 매입가를 확인하고 저장하세요"; open(it, null, { add: 1 }); return; }
  else if (m === "입고_old") { var t = lastLot(it); addLots(it, 1, { vendor: t.vendor, date: t.date, price: t.price, loc: v.stLoc || it.loc }); v.stMsg = "＋ 입고 " + label(it) + " → 재고 " + it.qty + " (매입정보는 직전 입고와 같게 들어갔어요 — 다르면 줄을 눌러 고쳐 주세요)"; }
  else if (m === "출고") { takeLots(it, 1, "출고"); v.stMsg = "－ 출고 " + label(it) + " → 재고 " + it.qty + " (먼저 들어온 것부터 빠져요)"; }
  else { v.stMsg = "🔎 " + label(it) + " · 재고 " + (it.qty || 0) + " · 위치 " + (it.loc || "-"); }
  it.at = new Date().toISOString(); save(); ERP.render();
}
function label(it) { return brandName(it.brand) + " " + (it.name || it.model || it.code) + (it.name && it.model ? " · " + it.model : ""); }

/* ---------- 화면 ---------- */
function render() {
  var d = D(), w = ERP.canWrite("stock"), cnt = d.count, q = norm(v.stQ);
  var L = items().filter(function (it) { return !q || norm([it.code, brandName(it.brand), it.name, it.model, it.serial, it.opt, it.loc].join(" ")).indexOf(q) !== -1; })
    .filter(function (it) { return v.stAge !== "long" || (oldestDays(it) || 0) >= LONG; })
    .sort(v.stAge ? function (a, b) { return (oldestDays(b) || -1) - (oldestDays(a) || -1); } : function (a, b) { return (a.loc || "~").localeCompare(b.loc || "~") || a.code.localeCompare(b.code); });
  var tot = 0; items().forEach(function (it) { tot += Number(it.qty) || 0; });
  var h = '<div class="head"><div><h1>재고실사</h1><p>바코드를 찍으면 재고가 맞춰져요 · 위치 바코드(LOC-)를 먼저 찍으면 위치도 기록돼요</p></div><div class="tools">' +
    (w ? '<button class="btn pri" data-act="stnew">+ 자체 바코드 발급</button>' : "") +
    '<button class="btn" data-act="stlabel">상품 라벨 출력</button><button class="btn" data-act="stloclabel">위치 라벨 출력</button><button class="btn" data-act="stxls">엑셀 다운로드</button><button class="btn" data-act="stsabang">사방넷 대조</button><button class="btn" data-act="strestore">백업에서 되살리기</button></div></div>';
  h += '<div class="panel" style="padding:16px;margin-bottom:12px"><div class="tools filters" style="margin-bottom:10px">' + ERP.chips("data-stmode", v.stMode, [["실사", "실사(개수 세기)"], ["입고", "입고 +1"], ["출고", "출고 −1"], ["조회", "조회만"]]) +
    '<span class="pill ' + (v.stLoc ? "p-acc" : "p-mute") + '">위치: ' + esc(v.stLoc || "없음") + "</span>" + (v.stLoc ? '<button class="btn sm" data-act="stlocclear">위치 해제</button>' : "") + "</div>" +
    '<input class="ctl" id="st-scan" autocomplete="off" placeholder="여기를 누르고 바코드를 찍으세요 (직접 입력 후 Enter도 가능)" style="width:100%;font-size:20px;padding:14px" aria-label="바코드 입력">' +
    '<div id="st-msg" role="status" style="margin-top:10px;font-size:15px;min-height:22px">' + (v.stLast ? '<b>✔ 방금 읽은 바코드: ' + esc(v.stLast) + "</b><br>" : "") + esc(v.stMsg) + '</div><div id="st-saved" class="muted" style="margin-top:6px;font-size:12.5px">' + (lastSavedAt ? "✔ 저장됨 " + lastSavedAt + " · 상품 " + items().length + "개" : "상품 " + items().length + "개 · 저장할 때마다 서버 최신 값과 합쳐서 저장해요") + "</div></div>";
  if (cnt) {
    var scanned = 0; Object.values(cnt.scans).forEach(function (n) { scanned += n; });
    h += '<div class="panel" style="padding:14px;margin-bottom:12px;border-left:4px solid #851b00"><b>실사 진행 중</b> · ' + esc(cnt.at.slice(0, 16).replace("T", " ")) + " 시작 · 찍은 수량 " + scanned + "개 " +
      (w ? '<button class="btn sm pri" data-act="stfinish" style="margin-left:8px">실사 마감 · 차이 보기</button><button class="btn sm" data-act="stcancel">실사 취소</button>' : "") + "</div>";
  }
  h += '<div class="tiles">' + ERP.tile("상품(SKU)", items().length + "개") + ERP.tile("총 수량", tot + "개") + ERP.tile("자체 바코드", items().filter(function (it) { return it.own; }).length + "개", "RW-브랜드-번호") + "</div>";
  var TO = turnover();
  h += '<div class="tiles">' + ERP.tile("재고 원가", (TO.cost ? won(TO.cost) + "원" : "-"), TO.noPrice ? "매입가 미입력 " + TO.noPrice + "개 제외" : "보유 중 " + TO.n + "개") +
    ERP.tile("평균 보유일수", TO.avgDays == null ? "-" : TO.avgDays + "일", "입고일부터 오늘까지") +
    ERP.tile("장기재고 " + LONG + "일+", TO.longN + "개", TO.longCost ? won(TO.longCost) + "원 묶임" : "") +
    ERP.tile("회전율 (최근 90일)", TO.rate == null ? "-" : "연 " + TO.rate.toFixed(1) + "회", TO.soldN ? "출고 " + TO.soldN + "개 · 평균 " + TO.soldAvgDays + "일 만에 판매" : "출고 −1로 찍어야 계산돼요") + "</div>";
  h += '<div class="tools filters"><input class="ctl" data-search="stQ" value="' + esc(v.stQ) + '" placeholder="검색: 코드·브랜드·상품명·품번·시리얼·위치" style="min-width:320px">' + ERP.chips("data-stage", v.stAge, [["", "위치순"], ["old", "오래된 재고순"], ["long", LONG + "일+ 장기재고만"]]) + '</div>';
  var body = L.map(function (it) {
    var c = cnt ? (cnt.scans[it.code] || 0) : null, diff = cnt ? c - (Number(it.qty) || 0) : 0;
    return '<tr class="click" data-stedit="' + esc(it.code) + '" tabindex="0"><td><input type="checkbox" data-stpick="' + esc(it.code) + '" aria-label="라벨 선택"></td><td>' + (it.photo ? '<img src="' + it.photo + '" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:6px">' : "") + '</td><td class="num">' + esc(it.code) + (it.own ? ' <span class="pill p-acc">자체</span>' : "") + '</td><td class="num">' + esc(it.model || "") + (it.serial ? "<small>S/N " + esc(it.serial) + "</small>" : "") + "</td><td>" + esc(brandName(it.brand)) + '</td><td class="name">' + esc(it.name || "") + (it.opt ? "<small>" + esc(it.opt) + "</small>" : "") + '</td><td>' + esc(it.loc || "") + '</td><td class="r num">' + (function () { var b = buySummary(it); return esc(b.main) + (b.sub ? "<small>" + esc(b.sub) + "</small>" : ""); })() + '</td><td class="r num' + ((oldestDays(it) || 0) >= LONG ? " neg" : "") + '">' + (oldestDays(it) == null ? "" : oldestDays(it) + "일") + '</td><td class="r num">' + (Number(it.qty) || 0) + "</td>" +
      (cnt ? '<td class="r num">' + c + '</td><td class="r num ' + (diff ? "neg" : "") + '">' + (diff > 0 ? "+" : "") + diff + "</td>" : "") + "</tr>";
  }).join("");
  h += L.length ? '<div class="table-wrap"><table><thead><tr><th><input type="checkbox" data-stpickall aria-label="전체 선택"></th><th>사진</th><th>바코드</th><th>품번</th><th>브랜드</th><th>상품명</th><th>위치</th><th class="r">매입</th><th class="r">보유일</th><th class="r">재고</th>' + (cnt ? '<th class="r">실사</th><th class="r">차이</th>' : "") + "</tr></thead><tbody>" + body + "</tbody></table></div>"
    : '<div class="panel empty"><b>아직 등록된 재고가 없어요</b>위 칸을 누르고 브랜드 택 바코드를 찍거나, 자체 바코드를 발급하세요.</div>';
  return h;
}
function bind(root) {
  var inp = root.querySelector("#st-scan");
  if (inp) { if (!ERP.drawer()) inp.focus(); inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); var x = inp.value; inp.value = ""; onScan(x); } }); }
  root.querySelectorAll("[data-stage]").forEach(function (b) { b.onclick = function () { v.stAge = b.dataset.stage; ERP.render(); }; });
  root.querySelectorAll("[data-stmode]").forEach(function (b) { b.onclick = function () { v.stMode = b.dataset.stmode; if (v.stMode === "실사" && !D().count && (D().countAt = Date.now()) && ERP.canWrite("stock")) { D().count = { at: new Date().toISOString(), scans: {} }; save(); } ERP.render(); }; });
  root.querySelectorAll("[data-stedit]").forEach(function (tr) { var go = function (e) { if (e && e.target.closest("input")) return; open(D().items[tr.dataset.stedit]); }; tr.addEventListener("click", go); tr.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); }); });
  var all = root.querySelector("[data-stpickall]"); if (all) all.onchange = function () { root.querySelectorAll("[data-stpick]").forEach(function (c) { c.checked = all.checked; }); };
}
function picked() { var L = Array.from(document.querySelectorAll("[data-stpick]:checked")).map(function (c) { return D().items[c.dataset.stpick]; }).filter(Boolean); return L; }

/* ---------- 등록·수정 ---------- */
function open(it, code, opt) {
  opt = opt || {};
  var isNew = !it || !it.code, fd = ERP.fd;
  it = it ? Object.assign({}, it) : { code: code || "", own: !code, brand: code ? "ET" : "CH", name: "", model: "", serial: "", opt: "", loc: v.stLoc || "", qty: 0, photo: "", memo: "" };
  var f = '<div class="fg">' +
    (it.own && isNew ? '<div class="fd full"><label>바코드</label><div style="padding:8px 0">저장하면 <b>RW-' + esc(it.brand) + '-번호</b>로 자동 발급돼요</div></div>' : fd("바코드", "code", "text", it.code, "full", isNew ? "" : " readonly")) +
    fd("품번 (넣고 Enter → 브랜드·상품명 자동)", "model", "text", it.model) + fd("사이즈·컬러 (Enter → 저장)", "opt", "text", it.opt) +
    '<div class="fd full" id="st-found" role="status" style="font-size:13px;color:#666;min-height:18px"></div>' +
    ERP.sel("브랜드", "brand", allBrands(), it.brand) + (ERP.canWrite("stock") ? '<div class="fd" style="justify-content:flex-end"><button type="button" class="btn sm" id="st-addbrand">+ 브랜드 추가</button></div>' : "") + fd("상품명 (짧게, 라벨에 찍혀요)", "name", "text", it.name) +
    fd("시리얼·보증카드 번호", "serial", "text", it.serial) + fd("위치", "loc", "text", it.loc) +
    (isNew ? "" : lotTable(it)) +
    (isNew ? '<div class="fd full" style="font-weight:700;margin-top:6px">입고 정보 (같은 입고일·매입가로 들어온 개수만큼 1개씩 기록돼요)</div><div class="fd full" style="display:contents">'
      : '<details class="fd full" id="st-addbox"' + (opt.add ? " open" : "") + ' style="border:1px dashed currentColor;border-radius:10px;padding:10px 12px"><summary style="cursor:pointer;font-weight:700">+ 같은 상품 더 입고 (입고일·매입가가 다른 것) — 기존 것 수정은 위 표에서</summary><div class="fg" style="margin-top:10px">') +
    fd(isNew ? "수량" : "추가 수량", "addQty", "number", isNew ? (v.stMode === "출고" ? 0 : 1) : (opt.add || 0)) +
    fd("매입처", "vendor", "text", isNew ? "" : (lastLot(it).vendor || ""), "", ' list="st-vendors" autocomplete="off"') + '<datalist id="st-vendors">' + vendors().map(function (x) { return '<option value="' + esc(x) + '">'; }).join("") + "</datalist>" +
    fd("입고일 (매입일)", "buyDate", "date", U.today()) + fd("매입금액 (1개, 원)", "buyPrice", "number", !isNew && opt.add ? (lastLot(it).price === "" || lastLot(it).price == null ? "" : lastLot(it).price) : "") +
    (isNew ? "</div>" : "</div></details>") +
    fd("메모", "memo", "text", it.memo, "full") +
    '<div class="fd full"><label for="st-photo">사진 (라벨이 떨어져도 찾을 수 있게)</label><input id="st-photo" type="file" accept="image/*" capture="environment"><div id="st-pv" style="margin-top:8px">' + (it.photo ? '<img src="' + it.photo + '" alt="상품 사진" style="width:120px;border-radius:8px">' : "") + "</div></div>" +
    (isNew ? "" : '<div class="fd full"><label>바코드 미리보기</label><div style="background:#fff;padding:8px;width:240px">' + barcodeSvg(it.code, 40) + '</div><button type="button" class="btn sm" id="st-reprint" style="margin-top:8px">🖨 이 라벨 다시 출력 (같은 바코드)</button></div>') + "</div>";
  if (opt.add) it._focusPrice = true;
  ERP.openDrawer(isNew ? (it.own ? "자체 바코드 발급" : "새 바코드 상품 등록") : (opt.add ? "같은 상품 1개 더 — 매입가 확인 후 저장" : "재고 상품 수정"), f, "stock", it, isNew, { saveLabel: isNew && it.own ? "발급하고 저장" : "저장" });
}
function lotTable(it) {
  var L = fifo(active(it)), sold = lotsOf(it).length - L.length;
  if (!L.length) return '<div class="fd full"><label>입고 내역</label><div class="muted">재고 0개</div></div>';
  var rows = L.map(function (x, i) {
    return '<tr data-lot="' + esc(x.id) + '"><td class="num">' + (i + 1) + '</td><td><input type="date" data-lk="date" value="' + esc(x.date || "") + '" style="width:130px"></td><td><input data-lk="vendor" list="st-vendors" value="' + esc(x.vendor || "") + '" style="width:120px"></td><td><input type="number" inputmode="numeric" data-lk="price" value="' + esc(x.price === "" || x.price == null ? "" : x.price) + '" style="width:100px"></td><td><input data-lk="loc" value="' + esc(x.loc || "") + '" style="width:60px"></td><td class="num' + ((heldDays(x) || 0) >= LONG ? " neg" : "") + '">' + (heldDays(x) == null ? "" : heldDays(x) + "일") + '</td><td><input type="checkbox" data-lk="del" aria-label="' + (i + 1) + '번 삭제"></td></tr>';
  }).join("");
  return '<div class="fd full"><label>보유 중 ' + L.length + '개' + (sold ? " · 출고 완료 " + sold + "개(엑셀에 기록)" : "") + ' — 먼저 들어온 순, 1개 = 1줄. 입고일·매입처·매입가를 여기서 바로 고치세요</label><div class="table-wrap" style="max-height:260px;overflow:auto"><table style="min-width:0"><thead><tr><th>#</th><th>입고일</th><th>매입처</th><th>매입가</th><th>위치</th><th>보유</th><th>잘못 등록 삭제</th></tr></thead><tbody>' + rows + "</tbody></table></div></div>";
}
function shrink(file) {
  return new Promise(function (res, rej) {
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () { var s = 240 / Math.max(img.width, img.height), c = document.createElement("canvas"); c.width = Math.round(img.width * Math.min(1, s)); c.height = Math.round(img.height * Math.min(1, s)); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.6)); };
    img.onerror = rej; img.src = url;
  });
}
ERP.forms.stock = {
  open: open,
  afterOpen: function (body, rec) {
    var mi = body.querySelector('[name="model"]'), oi = body.querySelector('[name="opt"]'), fo = body.querySelector("#st-found");
    var run = function () {
      var r = lookup(mi.value); if (!mi.value.trim()) return;
      if (!r) { fo.textContent = "ERP 기록에서 이 품번을 못 찾았어요 — 브랜드·상품명을 직접 넣어 주세요"; return; }
      var bs = body.querySelector('[name="brand"]'), nm = body.querySelector('[name="name"]');
      if (r.code && bs) bs.value = r.code;
      if (nm && !nm.value) nm.value = r.name;
      fo.textContent = "✔ 찾았어요 (" + r.src + "): " + (r.brandText || "") + " " + r.name;
    };
    if (rec._focusPrice) { var bp = body.querySelector('[name="buyPrice"]'); if (bp) setTimeout(function () { bp.focus(); bp.select(); }, 60); }
    if (bp) bp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); var sv = document.getElementById("d-save"); if (sv) sv.click(); } });
    if (mi) { if (!rec.model && !rec.own && !rec._focusPrice) setTimeout(function () { mi.focus(); }, 50);
      mi.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); run(); if (oi) oi.focus(); } });
      mi.addEventListener("change", run);
      /* 크림 즐겨찾기 버튼(크림→ERP)으로 복사한 내용을 품번 칸에 붙여넣으면 칸별로 나눠 채움 */
      mi.addEventListener("paste", function (e) {
        var t = (e.clipboardData || window.clipboardData).getData("text") || "";
        if (t.indexOf("KREAM\t") !== 0) return;
        e.preventDefault();
        var f = t.split("\t"), sku = (f[1] || "").trim(), kr = (f[2] || "").trim(), en = (f[3] || "").trim(), col = (f[4] || "").trim();
        mi.value = sku;
        var code = brandCode(en + " " + kr), bs = body.querySelector('[name="brand"]'), nm = body.querySelector('[name="name"]');
        if (bs && code) bs.value = code;
        var bn = code && code !== "ET" ? brandName(code).replace(/\s+/g, "") : "", words = kr.split(/\s+/), cut = 0, acc = "";
        if (bn) for (var i = 0; i < words.length; i++) { acc += words[i]; if (acc === bn) { cut = i + 1; break; } if (bn.indexOf(acc) !== 0) break; }
        if (nm) nm.value = words.slice(cut).join(" ") || kr;
        if (oi && !oi.value && col) oi.value = col;
        fo.textContent = "✔ 크림에서 가져왔어요: " + (code && code !== "ET" ? brandName(code) : en) + " · " + kr + " · " + sku + (col ? " · " + col : "") + (code === "ET" ? " — 브랜드가 목록에 없어요. + 브랜드 추가로 넣어 주세요" : "");
        if (oi) oi.focus();
      }); }
    if (oi) oi.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); var sv = document.getElementById("d-save"); if (sv) sv.click(); } });
    var ab = body.querySelector("#st-addbrand");
    if (ab) ab.onclick = function () {
      var nm = (window.prompt("추가할 브랜드 이름 (한글, 예: 메종마르지엘라)") || "").trim(); if (!nm) return;
      var L = allBrands(), ex = L.find(function (x) { return x[1].replace(/\s/g, "") === nm.replace(/\s/g, ""); });
      var bs = body.querySelector('[name="brand"]');
      if (ex) { bs.value = ex[0]; ERP.toast("이미 있는 브랜드예요: " + ex[1]); return; }
      var cd = (window.prompt("자체 바코드에 들어갈 영문 약자 2글자 (예: 메종마르지엘라 → MA)\n자체 바코드는 RW-약자-번호로 만들어져요") || "").trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(cd)) { ERP.toast("약자는 영문 2글자로 넣어 주세요."); return; }
      var dup = L.find(function (x) { return x[0] === cd; }); if (dup) { ERP.toast(cd + "는 이미 " + dup[1] + "에 쓰고 있어요. 다른 약자를 넣어 주세요."); return; }
      var d = D(); d.brands = (d.brands || []).concat([[cd, nm]]); save(true);
      bs.innerHTML = allBrands().map(function (x) { return '<option value="' + esc(x[0]) + '">' + esc(x[1]) + "</option>"; }).join(""); bs.value = cd;
      ERP.toast("브랜드를 추가했어요: " + nm + " (" + cd + ")");
    };
    var box = body.querySelector("#st-addbox"), aq = body.querySelector('[name="addQty"]');
    if (box && aq) box.addEventListener("toggle", function () { if (box.open && !(Number(aq.value) > 0)) aq.value = 1; if (!box.open) aq.value = 0; });
    var rp = body.querySelector("#st-reprint");
    if (rp) rp.onclick = function () { var x = D().items[rec.code] || rec; printLabels([x]); };
    var ph = body.querySelector("#st-photo");
    ph.onchange = async function () { if (!ph.files[0]) return; rec._photo = await shrink(ph.files[0]); body.querySelector("#st-pv").innerHTML = '<img src="' + rec._photo + '" alt="상품 사진" style="width:120px;border-radius:8px">'; };
  },
  commit: async function (body, o, st) {
    var d = D(), rec = st.rec;
    if (rec.own && st.isNew) { var b = o.brand || "ET"; d.seq[b] = (d.seq[b] || 0) + 1; o.code = "RW-" + b + "-" + String(d.seq[b]).padStart(4, "0"); while (d.items[o.code]) { d.seq[b]++; o.code = "RW-" + b + "-" + String(d.seq[b]).padStart(4, "0"); } }
    o.code = String(o.code || "").trim(); if (!o.code) throw new Error("바코드를 입력해 주세요.");
    if (st.isNew && d.items[o.code]) throw new Error("이미 등록된 바코드예요: " + o.code);
    var loc = String(o.loc || "").toUpperCase();
    var lots = st.isNew ? [] : lotsOf(Object.assign({}, d.items[o.code] || rec)).map(function (x) { return Object.assign({}, x); });
    body.querySelectorAll("[data-lot]").forEach(function (tr) {
      var x = lots.find(function (l) { return l.id === tr.dataset.lot; }); if (!x) return;
      if (tr.querySelector('[data-lk="del"]').checked) { x._del = true; return; }
      var g = function (k) { return tr.querySelector('[data-lk="' + k + '"]').value; };
      x.date = g("date"); x.vendor = g("vendor").trim(); x.loc = g("loc").trim().toUpperCase(); var pv = g("price"); x.price = pv === "" ? "" : Math.max(0, Number(pv) || 0);
    });
    lots = lots.filter(function (x) { return !x._del; });
    var add = Math.max(0, Math.floor(Number(o.addQty) || 0)); if (add > 500) throw new Error("한 번에 500개까지만 추가할 수 있어요.");
    for (var i = 0; i < add; i++) lots.push(mkLot({ vendor: o.vendor, date: o.buyDate, price: o.buyPrice, loc: loc }));
    var custom = !BRANDS.some(function (x) { return x[0] === o.brand; });
    var it = { code: o.code, own: !!rec.own, brand: o.brand, brandLabel: custom ? brandName(o.brand) : undefined, name: String(o.name || "").trim(), model: String(o.model || "").trim(), serial: String(o.serial || "").trim(), opt: String(o.opt || "").trim(), loc: loc, lots: lots, qty: lots.filter(function (x) { return !x.out; }).length, photo: rec._photo || rec.photo || "", memo: o.memo, at: new Date().toISOString() };
    d.items[it.code] = it;
    if (st.isNew && v.stMode === "실사") { d.countAt = Date.now(); if (!d.count) d.count = { at: new Date().toISOString(), scans: {} }; } if (st.isNew && d.count && v.stMode === "실사") d.count.scans[it.code] = (d.count.scans[it.code] || 0) + 1;
    var err = await save(true);
    if (err) throw new Error("저장이 안 됐어요 — 이 화면을 캡처해서 알려 주세요: " + err);
    v.stMsg = (st.isNew ? "등록했어요: " : "수정했어요: ") + it.code + " " + label(it);
    if (st.isNew && it.own) setTimeout(function () { printLabels([it]); }, 300);
    return true;
  },
  remove: async function (rec) { var d = D(); delete d.items[rec.code]; d.deleted = d.deleted || {}; d.deleted[rec.code] = new Date().toISOString(); var err = await save(true); if (err) throw new Error(err); return true; }
};

/* ---------- 품번으로 ERP 기록(매입·소싱·매출·재고)에서 브랜드·상품명 찾기 ---------- */
function brandCode(t) {
  t = String(t || "").toLowerCase().replace(/\s+/g, ""); if (!t) return "";
  var KO2 = { MC: "몽클레르", AI: "알파", VW: "비비안", MK: "키츠네" };
  var EN = { MA: "margiela", CH: "chanel", HM: "hermes", LV: "louis", DI: "dior", GC: "gucci", PR: "prada", BV: "bottega", CL: "celine", YS: "saintlaurent", TB: "thom", MM: "miu", FE: "fendi", BA: "balenciaga", LO: "loewe", BB: "burberry", MC: "moncler", AI: "alpha", CO: "chlo", HK: "hoka", AM: "amiparis", MK: "kitsune", PB: "paraboot", VW: "vivienne" };
  var BL = allBrands(); for (var i = 0; i < BL.length; i++) { var c = BL[i][0]; if (c === "ET") continue; if (t.indexOf(BL[i][1].toLowerCase().replace(/\s+/g, "")) !== -1 || (EN[c] && t.indexOf(EN[c]) !== -1) || (KO2[c] && t.indexOf(KO2[c]) !== -1)) return c; }
  return "ET";
}
function lookup(model) {
  var an = function (x) { return String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); };
  var k = an(model); if (k.length < 4) return null;
  var hit = function (x) { var n = an(x); return n && (n === k || (n.length >= 6 && n.indexOf(k) !== -1) || (k.length >= 6 && k.indexOf(n) !== -1 && n.length >= 6)); };
  var clean = function (t) { return String(t || "").replace(/\[[^\]]*\]/g, "").replace(/\([^)]*\)\s*$/, "").replace(/\s+/g, " ").trim().slice(0, 40); };
  var mk = function (b, name, src) { var bt = b || ""; return { code: brandCode(bt + " " + name), brandText: bt, name: clean(name), src: src }; };
  var own = items().find(function (it) { return hit(it.model) && it.name; }); if (own) return { code: own.brand, brandText: brandName(own.brand), name: own.name, src: "재고" };
  var pi = ERP.DATA.price_items ? ERP.list("price_items").find(function (r) { return hit(r.sku) || hit(r.name && (r.name.match(/[A-Z0-9][A-Z0-9-]{5,}/i) || [""])[0]); }) : null;
  if (pi) return mk(pi.brand, (pi.extra && pi.extra.nameOverride) || pi.name || pi.sku, "소싱");
  var pu = ERP.list("purchases").find(function (r) { return hit(r.itemCode); }); if (pu && (pu.productName || (pu.extra && pu.extra.name))) return mk(pu.brand, pu.productName || pu.extra.name, "매입");
  var sa = ERP.list("sales").filter(function (r) { return hit(r.itemCode) || (k.length >= 6 && an(r.productName).indexOf(k) !== -1); }).pop();
  if (sa) return mk(sa.brand, sa.productName, "매출");
  if (pu) return mk(pu.brand, pu.brand || "", "매입");
  return null;
}

/* ---------- 라벨 출력 (40×20mm) ---------- */
/* PC의 '라벨 도우미'(127.0.0.1:17777)가 켜져 있으면 4B-2054N으로 바로 출력, 꺼져 있으면 화면 인쇄로 */
var HELPER = "http://127.0.0.1:17777";
async function helperPrint(L, locs) {
  var labels = L.map(function (it) { return { code: it.code, sub: locs ? "LOCATION" : [it.model, it.opt].filter(Boolean).join(" ") }; });
  try {
    var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, 4000);
    var r = await fetch(HELPER + "/print", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ labels: labels }), signal: ctl.signal });
    clearTimeout(tm);
    var j = await r.json();
    if (j.ok) { ERP.toast("🖨 라벨 " + j.count + "장 출력했어요 (" + j.printer + ")"); return true; }
    ERP.toast("라벨 도우미 오류: " + (j.error || r.status) + " — 화면 인쇄로 열게요"); return false;
  } catch (e) { return false; }
}
async function printLabels(L, locs) {
  if (await helperPrint(L, locs)) return;
  ERP.toast("라벨 도우미가 꺼져 있어서 화면 인쇄로 열어요 (도우미: 다운로드\\로우나_AI작업\\프로그램\\라벨도우미)");
  printLabelsWindow(L, locs);
}
function printLabelsWindow(L, locs) {
  var cells = L.map(function (it) {
    return '<div class="lb"><div class="bc">' + barcodeSvg(it.code, 40) + '</div><div class="cd">' + esc(it.code) + '</div><div class="nm">' + esc((locs ? "보관 위치" : brandName(it.brand) + " " + (it.name || it.model || "")).slice(0, 22)) + "</div></div>";
  }).join("");
  var w = window.open("", "_blank");
  if (!w) { ERP.toast("팝업이 막혔어요. 주소창 오른쪽에서 팝업을 허용해 주세요."); return; }
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>라벨 출력</title><style>@page{size:40mm 20mm;margin:0}*{box-sizing:border-box}body{margin:0;font-family:"Malgun Gothic",sans-serif}' +
    '.lb{width:40mm;height:20mm;padding:1.2mm 2mm;page-break-after:always;overflow:hidden;display:flex;flex-direction:column;align-items:center}' +
    '.bc svg{width:36mm;height:9mm;display:block}.cd{font-size:8pt;font-weight:700;letter-spacing:.3px;margin-top:.6mm}.nm{font-size:6.5pt;white-space:nowrap;overflow:hidden;max-width:36mm}' +
    '@media screen{body{background:#eee;padding:10px}.lb{background:#fff;margin:0 0 6px;outline:1px dashed #aaa}.tip{font:13px sans-serif;margin-bottom:10px}}@media print{.tip{display:none}}</style></head><body>' +
    '<div class="tip">인쇄 설정: 프린터 4B-2054N · 용지 40×20mm · 여백 없음 · 배율 100% (기본값). ' + L.length + '장</div>' + cells + "<script>setTimeout(function(){print()},400)<\/script></body></html>");
  w.document.close();
}
function expandLocs(txt) {
  var out = [];
  String(txt || "").split(/[,\s]+/).forEach(function (part) {
    var m = part.toUpperCase().match(/^([A-Z]+)-(\d+)~(?:[A-Z]+-)?(\d+)$/);
    if (m) { for (var i = +m[2]; i <= +m[3] && out.length < 300; i++) out.push(m[1] + "-" + String(i).padStart(m[2].length, "0")); }
    else if (part.trim()) out.push(part.trim().toUpperCase());
  });
  return out;
}

/* ---------- 버튼 ---------- */
ERP.acts.stnew = function () { open(); };
ERP.acts.stlocclear = function () { v.stLoc = ""; v.stMsg = "위치를 해제했어요"; ERP.render(); };
ERP.acts.stlabel = function () { var L = picked(); if (!L.length) { ERP.toast("표에서 라벨을 뽑을 상품에 체크해 주세요."); return; } printLabels(L); };
ERP.acts.stloclabel = function () {
  var d = D(), t = window.prompt("출력할 위치를 적어 주세요 (예: A-01~A-05, B-01~B-03)", d.locs || "A-01~A-05"); if (t == null) return;
  var L = expandLocs(t); if (!L.length) return; d.locs = t; save();
  printLabels(L.map(function (x) { return { code: "LOC-" + x }; }), true);
};
ERP.acts.stfinish = function () {
  var d = D(), c = d.count; if (!c) return;
  var diffs = items().map(function (it) { return { it: it, n: c.scans[it.code] || 0 }; }).filter(function (x) { return x.n !== (Number(x.it.qty) || 0); });
  var rows = diffs.map(function (x) { var df = x.n - (Number(x.it.qty) || 0); return "<tr><td>" + esc(x.it.code) + "</td><td>" + esc(label(x.it)) + '</td><td class="r num">' + (x.it.qty || 0) + '</td><td class="r num">' + x.n + '</td><td class="r num neg">' + (df > 0 ? "+" : "") + df + "</td></tr>"; }).join("");
  var html = '<p>' + (diffs.length ? "장부와 실물이 다른 상품 <b>" + diffs.length + "개</b>예요. 실사에서 0개인 상품은 찍지 못한(없는) 상품이에요." : "장부와 실물이 모두 같아요 👍") + "</p>" +
    (diffs.length ? '<div class="table-wrap"><table><thead><tr><th>바코드</th><th>상품</th><th class="r">장부</th><th class="r">실사</th><th class="r">차이</th></tr></thead><tbody>' + rows + "</tbody></table></div>" : "");
  ERP.openDrawer("실사 마감", html, "stockfin", c, true, { saveLabel: "실사 수량으로 재고 반영" });
};
ERP.forms.stockfin = { open: function () {}, commit: async function () { var d = D(), c = d.count; var nowIso = new Date().toISOString(); items().forEach(function (it) { var q0 = active(it).length; setCount(it, c.scans[it.code] || 0); if (active(it).length !== q0) it.at = nowIso; }); d.countAt = Date.now(); d.lastCount = c.at; d.count = null; v.stMode = "조회"; await save(true); v.stMsg = "실사 결과를 재고에 반영했어요."; return true; } };
ERP.acts.strestore = function () {
  var L = []; try { L = JSON.parse(localStorage.getItem("rowna-stock-backup") || "[]"); } catch (e) {}
  if (!L.length) { ERP.toast("이 브라우저에 저장된 백업이 아직 없어요."); return; }
  var cur = D(), list = L.map(function (b, i) { var miss = Object.keys(b.value.items || {}).filter(function (k) { return !cur.items[k] && !(cur.deleted || {})[k]; }).length; return (i + 1) + ") " + b.at.slice(0, 16).replace("T", " ") + " · 상품 " + b.n + "개" + (miss ? " · 지금 없는 상품 " + miss + "개" : ""); }).join("\n");
  var pick = window.prompt("되살릴 백업 번호를 넣어 주세요. 지금 목록에 없는 상품만 추가돼요 (있는 상품은 그대로).\n\n" + list, "1"); if (pick == null) return;
  var b = L[(parseInt(pick, 10) || 0) - 1]; if (!b) { ERP.toast("번호를 다시 확인해 주세요."); return; }
  var now = new Date().toISOString(), n = 0;
  Object.keys(b.value.items || {}).forEach(function (k) { if (!cur.items[k]) { cur.items[k] = Object.assign({}, b.value.items[k], { at: now }); if (cur.deleted) delete cur.deleted[k]; n++; } });
  (b.value.brands || []).forEach(function (x) { cur.brands = cur.brands || []; if (!cur.brands.some(function (y) { return y[0] === x[0]; })) cur.brands.push(x); });
  if (!n) { ERP.toast("되살릴 상품이 없어요 — 지금 목록에 다 있어요."); return; }
  save(true).then(function (err) { if (!err) { v.stMsg = "백업에서 상품 " + n + "개를 되살렸어요."; ERP.render(); } });
};
ERP.acts.stcancel = function () { D().count = null; D().countAt = Date.now(); v.stMode = "조회"; save(); v.stMsg = "실사를 취소했어요 (재고는 그대로)."; ERP.render(); };
ERP.acts.stxls = function () {
  var A = [["바코드", "자체발급", "브랜드", "상품명", "품번", "시리얼", "사이즈·컬러", "위치", "재고", "평균매입가", "최저매입가", "최고매입가", "메모", "수정일"]];
  items().forEach(function (it) { A.push([it.code, it.own ? "Y" : "", brandName(it.brand), it.name, it.model, it.serial, it.opt, it.loc, Number(it.qty) || 0, (buySummary(it).avg != null ? buySummary(it).avg : ""), (buySummary(it).min != null ? buySummary(it).min : ""), (buySummary(it).max != null ? buySummary(it).max : ""), it.memo, (it.at || "").slice(0, 10)]); });
  var B = [["바코드", "품번", "브랜드", "상품명", "사이즈·컬러", "입고일", "매입처", "매입금액", "위치", "상태", "출고일", "출고구분", "보유일수", "기록일"]];
  items().forEach(function (it) { fifo(lotsOf(it)).forEach(function (x) { B.push([it.code, it.model, brandName(it.brand), it.name, it.opt, lotIn(x), x.vendor, x.price === "" ? "" : Number(x.price), x.loc || it.loc, x.out ? "출고" : "보유", x.out || "", x.outType || "", heldDays(x), (x.at || "").slice(0, 10)]); }); });
  var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(A), "실물재고"); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(B), "입고내역(1개씩)"); XLSX.writeFile(wb, "로우나_실물재고_" + U.today() + ".xlsx");
};
ERP.acts.stsabang = function () {
  var sk = S.SET.sabang_skus;
  if (!sk || !sk.skus) { ERP.toast("네이버 자동소싱 메뉴에서 사방넷 파일을 먼저 올려 주세요."); return; }
  var set = {}; sk.skus.forEach(function (x) { set[norm(x)] = 1; });
  var inS = [], notS = [];
  items().forEach(function (it) { var k = norm(it.model); (k && (set[k] || Object.keys(set).some(function (s) { return k.length >= 6 && s.indexOf(k) !== -1; })) ? inS : notS).push(it); });
  var li = function (L) { return L.map(function (it) { return "<li>" + esc(it.code + " · " + label(it) + (it.model ? " · " + it.model : " · 품번 없음")) + " · 재고 " + (it.qty || 0) + "</li>"; }).join(""); };
  var html = "<p>사방넷 파일: " + esc(sk.file || "") + " (" + esc((sk.at || "").slice(0, 10)) + ")</p><h3>사방넷에 있는 상품 " + inS.length + "개</h3><ul>" + li(inS) + "</ul><h3>사방넷에 없는 상품 " + notS.length + "개 — 판매 등록 필요</h3><ul>" + li(notS) + "</ul><p><small>품번으로 대조해요. 품번이 비어 있으면 '없음'으로 나와요.</small></p>";
  ERP.openDrawer("사방넷 대조", html, "stockview", {}, true, { saveLabel: "닫기" });
};
ERP.forms.stockview = { open: function () {}, commit: async function () { return true; } };

ERP.page({ id: "stock", title: "재고실사", wide: true, render: render, bind: bind,
  live: function () { var ae = document.activeElement; if (ae && ae.matches && ae.matches("input:not(#st-scan),select")) return; if (!ERP.drawer()) ERP.render(); },
  badge: function () { return D().count ? "실사중" : ""; } });
})();
