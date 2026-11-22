/* 메뉴: 크림 › 크림 보판 현황 (대표님 요청 2026-11-18)
   ① 크림 '내 보관판매'(신청·보관 중·종료) 목록을 읽어 → 크림 매입 줄의 보판신청일·창고입고일·판매일을 자동으로 채움 (비어 있을 때만)
      발송요청 남은 시간 24시간 이내면 텔레그램 알림
   ④ 정산완료 건 → 매출(쇼핑몰 '크림', 정산 확정)에 1건씩 기록 + 매입 때 예상 이익 vs 실제 이익 비교
   - 크림 읽기는 ‘로우나재고 크림 도우미’(통로 rownaS, v1.2.0 이상: 목록 2쪽 이후도 읽음) — 읽기만, 6~10초 간격
   - 크림 목록에는 판매가가 안 나와서 매출의 판매가 = 정산금액(수수료 뗀 금액)으로 기록
   - 매출 기록은 ERP 크림 매입 상품과 짝이 맞은 건만 (예전 정산 건 중복 방지) */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, esc = U.esc, won = U.won, num = U.num, v = ERP.view, KEY = "kream_sync", waits = {}, busy = false;
function on() { return document.documentElement.dataset.rownaStock === "1"; }
window.addEventListener("message", function (e) { var d = e.data; if (e.source !== window || !d || d.rownaS !== "res" || !waits[d.id]) return; var f = waits[d.id]; delete waits[d.id]; f(d); });
function ask(url, waitFor) {
  return new Promise(function (res, rej) {
    if (!on()) { rej(new Error("‘로우나재고 크림 도우미’가 꺼져 있어요")); return; }
    var id = U.uid(); waits[id] = function (d) { d.ok ? res(d.data) : rej(new Error(d.error || "실패")); };
    window.postMessage({ rownaS: "req", id: id, type: "page", url: url, waitFor: waitFor, minLen: 200 }, location.origin);
  });
}
var BLOCK_RE = /비정상적인 (접근|요청)|접근이 (차단|제한)|Access Denied|자동입력 방지|보안 문자|too many requests|잠시 후 다시 시도/i;
function D() { var d = S.SET[KEY]; if (!d || typeof d !== "object") d = {}; d.items = d.items || {}; d.sold = d.sold || {}; d.alerted = d.alerted || {}; return d; }
async function save(d) { var r = await S.sb.from("app_settings").upsert({ key: KEY, value: d }); if (r.error) { ERP.toast(ERP.errMsg(r.error)); return false; } S.SET[KEY] = d; return true; }

/* 크림 화면 구분: [탭, 상태, 이름, 단계]  단계 1=보판신청 2=창고 보관 3=정산완료 9=반송·회수 */
var ST = [["requested", "", "발송요청", 1], ["requested", "shipped", "발송완료", 1], ["requested", "warehouse_scanned", "입고대기", 1], ["requested", "in_warehouse", "입고완료", 1], ["requested", "authenticating", "검수 중", 1], ["requested", "authentication_done", "검수완료", 1], ["requested", "in_transit", "창고이동", 1],
  ["in_stock", "in_storage", "판매대기", 2], ["in_stock", "live", "판매 중", 2], ["in_stock", "sold", "판매완료", 2], ["in_stock", "expired", "보관만료", 9], ["in_stock", "retrieving", "회수 중", 9],
  ["finished", "", "정산완료", 3], ["finished", "return_on_failure", "불합격 반송", 9], ["finished", "retrieved", "회수완료", 9]];
var LABELS = ["사이즈", "정산금액", "정산일", "최근 거래가", "판매 희망가", "즉시 판매가", "보증금", "남은 시간"];
function url(tab, st) { return "https://kream.co.kr/my/inventory?tab=" + tab + (st ? "&status=" + st : ""); }
function counts(text) { var c = {}; ST.forEach(function (s) { var m = text.match(new RegExp(s[2].replace(/\s/g, "\\s?") + "\\s*(\\d+)")); if (m) c[s[2]] = +m[1]; }); return c; }
function parse(text, stName) {
  var L = String(text || "").split("\n").map(function (x) { return x.trim(); }).filter(Boolean), out = [], idx = [];
  L.forEach(function (x, i) { if (/^I-[A-Z]{2}\d+-\d+$/.test(x)) idx.push(i); });
  idx.forEach(function (i, n) {
    var end = n + 1 < idx.length ? idx[n + 1] - 2 : L.length, it = { id: L[i], model: L[i - 2] || "", name: L[i - 1] || "", st: stName };
    for (var k = i + 1; k < end; k++) if (LABELS.indexOf(L[k]) >= 0 && k + 1 < L.length) { it[L[k]] = L[k + 1]; k++; }
    out.push(it);
  });
  return out;
}
function stInfo(name) { return ST.find(function (s) { return s[2] === name; }) || [0, 0, name, 0]; }
function d8(x) { var m = String(x || "").match(/(\d{2})\/(\d{2})\/(\d{2})/); return m ? "20" + m[1] + "-" + m[2] + "-" + m[3] : ""; }
/* 최신순: 크림 보관번호(I-XX13745936-1)의 숫자가 클수록 최근 신청. 정산완료·반송·회수 끝난 건은 맨 아래 (대표님 2026-11-18) */
function inum(it) { var m = String(it.id || "").match(/I-[A-Z]{2}(\d+)-(\d+)/); return m ? +m[1] * 100 + (+m[2]) : 0; }
function done(it) { var s = stInfo(it.st)[3]; return s === 3 || s === 9; }
function newest(a, b) { return (done(a) - done(b)) || (inum(b) - inum(a)); }
function hoursLeft(x) { var m = String(x || "").match(/(\d+):(\d{2}):(\d{2})/); return m ? +m[1] + (+m[2]) / 60 : null; }

/* 짝짓기: 품번(크림 모델번호의 / 나눈 각각) + 사이즈 */
function nk(x) { return String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function nz(x) { var s = String(x || "").toUpperCase().replace(/\s/g, ""); if (/^(F|FREE|UNI|OS|ONESIZE|TU|ONE)$/.test(s) || /^ONESIZE/.test(s)) return "ONE"; return s.replace(/^(EU|US|UK|KR|JP)/, "").replace(/W$/, ""); }
function skuHit(row, model) { var a = [row.sku, ((row.extra || {}).kream || {}).model].map(nk).filter(function (x) { return x.length >= 4; }), b = String(model || "").split("/").map(nk).filter(Boolean); return a.some(function (x) { return b.some(function (y) { return x === y || (x.length >= 8 && y.length >= 8 && (x.indexOf(y) >= 0 || y.indexOf(x) >= 0)); }); }); }
function sizeHit(row, sz) { var a = nz(row.size), b = nz(sz); return a === "ONE" || b === "ONE" || a === b || (/^\d/.test(a) && a === b.replace(/[^\d.]/g, "")); }
function buyRows() { return ERP.list("kream_wholesale").filter(function (x) { return x.decision === "매입" && (x.extra || {}).buyDate; }); }
function qty(r) { return num((r.extra || {}).buyQty) || num(r.qty) || 1; }
function assign(items) {
  var R = buyRows().sort(function (a, b) { return String(a.extra.buyDate).localeCompare(String(b.extra.buyDate)); }), cap = {}, by = {}, prev = {};
  R.forEach(function (r) { cap[r.id] = qty(r); by[r.id] = []; ((r.extra.kreamSync || {}).ids || []).forEach(function (id) { prev[id] = r.id; }); });
  var rest = [];
  items.forEach(function (it) { var rid = prev[it.id]; if (rid && by[rid]) { by[rid].push(it); cap[rid]--; } else rest.push(it); });
  rest.forEach(function (it) { var r = R.find(function (r) { return cap[r.id] > 0 && skuHit(r, it.model) && sizeHit(r, it["사이즈"]); }); if (r) { by[r.id].push(it); cap[r.id]--; it.row = r.id; } });
  items.forEach(function (it) { Object.keys(by).forEach(function (rid) { if (by[rid].indexOf(it) >= 0) it.row = rid; }); });
  return { R: R, by: by };
}

/* ---------- 읽기 ---------- */
async function readAll() {
  var all = [], seenTab = {};
  for (var t = 0; t < 3; t++) {
    var tab = ["requested", "in_stock", "finished"][t], defs = ST.filter(function (s) { return s[0] === tab; }), first = defs[0];
    ERP.toast("크림 보관판매 읽는 중: " + (["신청", "보관 중", "종료"][t]));
    var p = await ask(url(tab, first[1]), "I-[A-Z]{2}\\d+-\\d+|" + first[2] + "\\s*0");
    var txt = (p && p.text) || ""; if (BLOCK_RE.test(txt.slice(0, 3000))) throw new Error("차단·경고 화면이 보여서 멈췄어요");
    if (!/보관판매/.test(txt)) throw new Error("크림 로그인이 풀린 것 같아요 (내 보관판매 화면이 안 보여요)");
    var c = counts(txt); seenTab[tab] = c;
    var pages = (p.inv && p.inv.pages) || [txt]; pages.forEach(function (x) { all = all.concat(parse(x, first[2])); });
    for (var j = 1; j < defs.length; j++) {
      var s = defs[j]; if (!c[s[2]]) continue;
      ERP.toast("크림 보관판매 읽는 중: " + s[2] + " " + c[s[2]] + "건");
      var q = await ask(url(tab, s[1]), "I-[A-Z]{2}\\d+-\\d+"), qt = (q && q.text) || ""; if (BLOCK_RE.test(qt.slice(0, 3000))) throw new Error("차단·경고 화면이 보여서 멈췄어요");
      ((q.inv && q.inv.pages) || [qt]).forEach(function (x) { all = all.concat(parse(x, s[2])); });
    }
  }
  var u = {}; all.forEach(function (it) { u[it.id] = it; });   /* 같은 상품번호는 마지막(뒤 단계) 기준 */
  return { items: Object.keys(u).map(function (k) { return u[k]; }), counts: seenTab };
}

/* ---------- 반영 ---------- */
async function apply(res) {
  var A = assign(res.items), today = U.today(), changed = 0, sales = 0, d = D(), alerts = [];
  for (var i = 0; i < A.R.length; i++) {
    var r = A.R[i], L = A.by[r.id]; if (!L.length && !(r.extra.kreamSync)) continue;
    var n = {}, settled = 0, sn = 0, last = ""; L.forEach(function (it) { n[it.st] = (n[it.st] || 0) + 1; if (it.st === "정산완료") { settled += num(it["정산금액"]); sn++; var dd = d8(it["정산일"]); if (dd > last) last = dd; } });
    var ks = { at: new Date().toISOString(), ids: L.map(function (it) { return it.id; }), n: n, settled: settled, settledN: sn };
    await ERP.kbSetEx(r, { kreamSync: ks }); r = ERP.DATA.kream_wholesale.get(r.id) || r;
    var stg = L.map(function (it) { return stInfo(it.st)[3]; });
    if (L.length && !r.extra.boDate) { await ERP.kbSetDate(r, "boDate", today); changed++; r = ERP.DATA.kream_wholesale.get(r.id) || r; }
    if (stg.some(function (x) { return x === 2 || x === 3; }) && !r.extra.whDate) { await ERP.kbSetDate(r, "whDate", today); changed++; r = ERP.DATA.kream_wholesale.get(r.id) || r; }
    if (sn && sn >= qty(r) && !r.extra.soldDate) { await ERP.kbSetDate(r, "soldDate", last || today); changed++; }
    /* ④ 매출: 정산완료 1건 = 매출 1줄 */
    var plat = S.PLATS.find(function (p) { return /크림|kream/i.test(p.name); });
    for (var k = 0; k < L.length; k++) {
      var it = L[k]; if (it.st !== "정산완료" || d.sold[it.id] || !plat) continue;
      if (ERP.list("sales").some(function (s) { return (s.extra || {}).kreamItem === it.id; })) { d.sold[it.id] = 1; continue; }
      await ERP.save("sales", { id: U.uid(), date: d8(it["정산일"]) || today, orderTime: "", platformId: plat.id, productName: [r.brand, it.name || r.name, it["사이즈"]].filter(Boolean).join(" "), itemCode: r.sku || it.model, brand: r.brand || "", category: "", salePrice: num(it["정산금액"]), cost: num(r.wholesalePrice), settledAmount: num(it["정산금액"]), settleStatus: "확정", adjustment: 0, shippingFee: 0, etcAmount: 0, source: "kream_sync", memo: "크림 보관판매 정산 " + it.id + " · 판매가 칸 = 정산금액(크림 목록에 판매가 없음)", extra: { kreamItem: it.id, kwId: r.id, supplier: r.supplier || "" } });
      d.sold[it.id] = 1; sales++;
    }
  }
  /* 발송 기한 알림 (24시간 이내, 한 번만) */
  res.items.forEach(function (it) { var h = hoursLeft(it["남은 시간"]); if (it.st === "발송요청" && h != null && h <= 24 && !d.alerted[it.id]) { alerts.push(it); d.alerted[it.id] = 1; } });
  if (alerts.length && ERP.tgSend) { var g = {}; alerts.forEach(function (it) { var k = it.model + " " + (it["사이즈"] || ""); g[k] = (g[k] || 0) + 1; }); ERP.tgSend("⏰ 크림 보판 발송 기한 24시간 이내 " + alerts.length + "건\n" + Object.keys(g).map(function (k) { return "· " + k + " × " + g[k]; }).join("\n") + "\n크림 → 보관판매 → 발송요청에서 송장 입력하세요"); }
  d.items = {}; res.items.forEach(function (it) { d.items[it.id] = it; }); d.counts = res.counts; d.at = new Date().toISOString(); d.lastChanged = changed; d.lastSales = sales;
  await save(d);
  return { changed: changed, sales: sales, alerts: alerts.length, plat: !!S.PLATS.find(function (p) { return /크림|kream/i.test(p.name); }) };
}
async function sync(auto) {
  if (busy) return; if (!on()) { if (!auto) ERP.toast("‘로우나재고 크림 도우미’를 켜 주세요 (v1.2.0 이상)"); return; }
  busy = true; ERP.render();
  try { var res = await readAll(), r = await apply(res); ERP.toast("✔ 크림 보판 현황 " + res.items.length + "건 읽음 · 날짜 " + r.changed + "칸 · 매출 " + r.sales + "건 기록" + (r.alerts ? " · 발송 기한 알림 " + r.alerts + "건" : "") + (r.plat ? "" : " · ⚠ 쇼핑몰 ‘크림’이 없어 매출은 못 넣음")); }
  catch (e) { ERP.toast("⚠ " + e.message); var d = D(); d.err = e.message; d.errAt = new Date().toISOString(); await save(d); }
  busy = false; ERP.render();
}
/* 자동: ERP가 켜져 있고 도우미가 켜져 있으면 6시간마다 */
setInterval(function () { try { if (busy || !on() || !S.SET || !S.profile) return; var d = D(); if (!d.at || Date.now() - new Date(d.at).getTime() > 6 * 3600e3) sync(true); } catch (e) {} }, 10 * 60e3);

/* ---------- 화면 ---------- */
function render() {
  var d = D(), I = Object.keys(d.items).map(function (k) { return d.items[k]; }), A = assign(I.slice()), rows = buyRows(), ROW = {}; rows.forEach(function (r) { ROW[r.id] = r; });
  var c = d.counts || {}, cc = {}; Object.keys(c).forEach(function (t) { Object.assign(cc, c[t]); });
  var h = '<div class="head"><div><h1>크림 보판 현황</h1><p>크림 ‘내 보관판매’를 읽어 크림 매입의 보판신청·창고입고·판매일을 채우고, 정산완료 건은 매출(크림)로 기록해요 · ' + (on() ? '<span class="pill p-good">로우나재고 크림 도우미 켜짐' + (document.documentElement.dataset.rownaStockV ? ' v' + document.documentElement.dataset.rownaStockV : ' (구버전)') + '</span>' : '<span class="pill p-crit">로우나재고 크림 도우미 꺼짐 (v1.2.0 필요)</span>') + (d.at ? " · 마지막 " + esc(new Date(d.at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })) : "") + '</p></div><div class="tools"><button class="btn pri" data-act="kssync"' + (busy ? " disabled" : "") + ">" + (busy ? "읽는 중…" : "↻ 지금 읽기") + '</button><button class="btn" data-act="ksexport"' + (Object.keys(d.items).length ? "" : " disabled") + '>📥 세무사용 엑셀</button></div></div>';
  if (d.err) h += '<div class="panel"><small class="neg">마지막 오류 (' + esc(new Date(d.errAt).toLocaleString("ko-KR")) + "): " + esc(d.err) + "</small></div>";
  h += '<div class="panel"><div style="display:flex;gap:6px;flex-wrap:wrap">' + ST.map(function (s) { var n = cc[s[2]] || 0; return '<span class="pill ' + (n ? (s[3] === 9 ? "p-crit" : s[3] === 3 ? "p-good" : "p-acc") : "") + '">' + esc(s[2]) + " " + n + "</span>"; }).join("") + "</div></div>";
  /* 발송 기한 */
  var due = I.filter(function (it) { return it.st === "발송요청"; }).sort(function (a, b) { return (hoursLeft(a["남은 시간"]) || 999) - (hoursLeft(b["남은 시간"]) || 999); });
  if (due.length) { var g = {}; due.forEach(function (it) { var k = it.model + "|" + it.name + "|" + (it["사이즈"] || ""); g[k] = g[k] || { n: 0, h: hoursLeft(it["남은 시간"]), it: it }; g[k].n++; }); h += '<div class="panel"><h2>📦 발송요청 ' + due.length + '건 (보낼 것)</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>모델번호</th><th>상품</th><th>사이즈</th><th class="r">수량</th><th>남은 시간</th></tr></thead><tbody>' + Object.keys(g).map(function (k) { var x = g[k]; return "<tr><td>" + esc(x.it.model) + "</td><td>" + esc(x.it.name) + "</td><td>" + esc(x.it["사이즈"] || "") + '</td><td class="r num">' + x.n + '</td><td class="' + (x.h != null && x.h <= 24 ? "neg" : "") + '">' + esc(x.it["남은 시간"] || "") + "</td></tr>"; }).join("") + "</tbody></table></div></div>"; }
  /* ④ 예상 vs 실제 (도매처별) */
  var sup = {}; rows.forEach(function (r) { var ks = r.extra.kreamSync || {}, n = num(ks.settledN); if (!n) return; var s = sup[r.supplier || "열무"] = sup[r.supplier || "열무"] || { n: 0, real: 0, est: 0, noEst: 0 }; s.n += n; s.real += num(ks.settled) - num(r.wholesalePrice) * n; if (r.extra.buyEst != null) s.est += num(r.extra.buyEst) * n; else s.noEst += n; });
  h += '<div class="panel"><h2>💰 정산완료 · 예상 이익 vs 실제 이익</h2>' + (Object.keys(sup).length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>도매처</th><th class="r">정산 수량</th><th class="r">매입 때 예상 이익</th><th class="r">실제 이익 (정산금액 − 도매가)</th><th class="r">차이</th></tr></thead><tbody>' + Object.keys(sup).map(function (k) { var s = sup[k], df = s.real - s.est; return "<tr><td>" + esc(k) + '</td><td class="r num">' + s.n + '</td><td class="r num">' + won(s.est) + (s.noEst ? '<small class="muted">예상 없는 ' + s.noEst + "개</small>" : "") + '</td><td class="r num"><b>' + won(s.real) + '</b></td><td class="r num ' + (df < 0 ? "neg" : "") + '">' + (df >= 0 ? "+" : "") + won(df) + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<p class="muted">아직 크림 매입 상품 중 정산완료된 게 없어요.</p>') + '<p class="note">실제 이익 = 크림 정산금액(수수료 뗀 금액) − 도매가. 정산완료 1건마다 매출(쇼핑몰 ‘크림’, 정산 확정)에 1줄씩 들어가요 · 지금까지 ' + Object.keys(d.sold).length + "건</p></div>";
  /* 크림 매입 줄별 진행 */
  var mine = rows.filter(function (r) { return (A.by[r.id] || []).length; }).sort(function (a, b) { return String(b.extra.buyDate).localeCompare(String(a.extra.buyDate)) || Math.max.apply(null, A.by[b.id].map(inum)) - Math.max.apply(null, A.by[a.id].map(inum)); });
  h += '<div class="panel"><h2>크림 매입 상품 진행 (' + mine.length + '줄)</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>매입일</th><th>도매처</th><th>품번 · 사이즈</th><th class="r">수량</th><th class="r">매입가</th><th>크림 단계</th><th>보판신청</th><th>창고입고</th><th>판매</th><th class="r">정산</th><th class="r">수익</th></tr></thead><tbody>' + (mine.map(function (r) { var L = A.by[r.id], n = {}; L.forEach(function (it) { n[it.st] = (n[it.st] || 0) + 1; }); var e = r.extra, ks = e.kreamSync || {}; var q = qty(r); var wp = num(r.wholesalePrice); var totalCost = wp * q; var realProfit = ks.settledN ? (num(ks.settled) - wp * num(ks.settledN)) : null; var profitCls = realProfit == null ? "" : realProfit < 0 ? "neg" : "p-good"; return '<tr><td class="num">' + esc(e.buyDate.slice(5)) + "</td><td>" + esc(r.supplier || "") + "</td><td>" + esc((r.brand || "") + " " + (r.sku || "")) + " <small>" + esc(r.size || "") + '</small></td><td class="r num">' + q + '</td><td class="r num"><b>' + won(wp) + '</b><small class="muted">총 ' + won(totalCost) + '</small></td><td>' + Object.keys(n).map(function (k) { return '<span class="pill">' + esc(k) + " " + n[k] + "</span>"; }).join(" ") + '</td><td class="num">' + esc((e.boDate || "").slice(5)) + '</td><td class="num">' + esc((e.whDate || "").slice(5)) + '</td><td class="num">' + esc((e.soldDate || "").slice(5)) + '</td><td class="r num">' + (ks.settledN ? won(ks.settled) + "<small>" + ks.settledN + "개</small>" : "") + '</td><td class="r num ' + profitCls + '"><b>' + (realProfit != null ? ((realProfit >= 0 ? "+" : "") + won(realProfit)) : "") + '</b></td></tr>'; }).join("") || '<tr><td colspan="11" class="empty">' + (I.length ? "짝이 맞은 크림 매입 상품이 없어요" : "‘지금 읽기’를 눌러 주세요") + "</td></tr>") + "</tbody></table></div></div>";
  /* 짝 안 맞은 것 */
  var un = I.filter(function (it) { return !it.row; }).sort(newest), ug = {}; un.forEach(function (it) { var k = it.st + "|" + it.model + "|" + it.name + "|" + (it["사이즈"] || ""); ug[k] = (ug[k] || 0) + 1; });
  if (un.length) h += '<div class="panel"><h2>크림 매입과 짝 안 맞은 보판 (' + un.length + '건)</h2><p class="muted">로우나 재고에서 보낸 것이거나 품번·사이즈 표기가 달라요. 크림 매입 상품이면 열무 크림도매에서 품번을 크림 모델번호와 같게 고쳐 주세요.</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>단계</th><th>모델번호</th><th>상품</th><th>사이즈</th><th class="r">수량</th></tr></thead><tbody>' + Object.keys(ug).map(function (k) { var a = k.split("|"); return "<tr><td>" + esc(a[0]) + "</td><td>" + esc(a[1]) + "</td><td>" + esc(a[2]) + "</td><td>" + esc(a[3]) + '</td><td class="r num">' + ug[k] + "</td></tr>"; }).join("") + "</tbody></table></div></div>";
  h += '<p class="note">자동: ERP가 켜져 있고 도우미가 켜져 있으면 6시간마다 읽어요. 날짜는 비어 있을 때만 채워요(직접 넣은 날짜는 그대로). 창고입고일은 크림 ‘보관 중’에서 처음 본 날로 들어가요.</p>';
  return h;
}
ERP.acts.kssync = function () { sync(false); };
/* 아침 9시 텔레그램 보고 (대표님 2026-11-18): 보판 발송 기한 · 새 정산 · 크림 매입 손익. 하루 한 번(app_settings morning_tg), 텔레그램 봇이 켜진 PC에서만 */
async function morning() {
  var day = U.today(), st = S.SET.morning_tg || {}; if (st.day === day) return;
  if (new Date().getHours() < 9 || !ERP.tgOn || !ERP.tgOn() || !ERP.tgSend) return;
  st = { day: day, at: new Date().toISOString() }; var w = await S.sb.from("app_settings").upsert({ key: "morning_tg", value: st }); if (w.error) return; S.SET.morning_tg = st;
  var d = D(), I = Object.keys(d.items).map(function (k) { return d.items[k]; }), out = ["☀️ <b>로우나 아침 보고</b> " + day.slice(5)];
  var due = I.filter(function (it) { return it.st === "발송요청"; }), hs = due.map(function (it) { return hoursLeft(it["남은 시간"]); }).filter(function (x) { return x != null; });
  if (d.at) { var age = Math.round((Date.now() - new Date(d.at).getTime()) / 3600e3); out.push("📦 크림 발송요청 " + due.length + "건" + (hs.length ? " · 가장 급한 건 약 " + Math.max(0, Math.round(Math.min.apply(null, hs) - age)) + "시간 남음" : "") + " (" + age + "시간 전 확인)"); }
  var yd = new Date(day + "T00:00:00"); yd.setDate(yd.getDate() - 1); var y = yd.getFullYear() + "-" + ("0" + (yd.getMonth() + 1)).slice(-2) + "-" + ("0" + yd.getDate()).slice(-2), nw = I.filter(function (it) { return it.st === "정산완료" && d8(it["정산일"]) >= y; });
  if (nw.length) out.push("💰 어제·오늘 크림 정산 " + nw.length + "건 · " + won(nw.reduce(function (a, it) { return a + num(it["정산금액"]); }, 0)) + "원");
  var R = buyRows().filter(function (r) { return !r.extra.soldDate && r.kreamPrice; }), tot = 0, est = 0, bad = [];
  R.forEach(function (r) { var c = ERP.kreamCalc ? ERP.kreamCalc(r) : null; if (!c) return; var q = qty(r); tot += c.real * q; if (r.extra.buyEst != null) est += num(r.extra.buyEst) * q; if (c.real < 0) bad.push((r.brand || "") + " " + (r.sku || "") + " " + (r.size || "") + " " + won(Math.round(c.real)) + "원×" + q); });
  if (R.length) out.push("📈 크림 매입 미판매 " + R.length + "줄 · 지금 시세로 팔면 " + won(Math.round(tot)) + "원" + (est ? " (매입 때 예상 " + won(Math.round(est)) + "원)" : ""));
  if (bad.length) out.push("⚠ 지금 팔면 손해 " + bad.length + "줄\n· " + bad.slice(0, 6).join("\n· "));

  /* 2026-11-22 대표님 요청: 보관중·판매중 보판 중 "희망가 < 매입가" (손해가격 설정) 상품 즉시 알림 */
  var live = I.filter(function (it) { return /^(판매 중|보관|창고|입고|검수|발송|신청)/.test(it.st || ""); });
  var feeRate = num(S.SET.kream_fee_rate) || 0.06;
  var usedKw = {}, usedLots = {};
  function nkl(x) { return String(x || "").toLowerCase().replace(/[-\s.]/g, ""); }
  function mhit(a, b) { var A = nkl(a); if (A.length < 4) return false; return String(b || "").split("/").map(nkl).filter(Boolean).some(function (B) { return A === B || (A.length >= 5 && B.indexOf(A) === 0) || (B.length >= 5 && A.indexOf(B) === 0); }); }
  function shit(a, b) { var A = String(a || "").replace(/[\s\-()]/g, "").toLowerCase(), B = String(b || "").replace(/[\s\-()]/g, "").toLowerCase(); if (!A || !B) return true; return A === B || A.indexOf(B) >= 0 || B.indexOf(A) >= 0; }
  function findCost(it) {
    var kwList = ERP.list("kream_wholesale").filter(function (r) { return r.decision === "매입" && mhit(r.sku || r.model || "", it.model) && (!r.size || shit(r.size, it["사이즈"])); }).sort(function (a, b) { return String((a.extra || {}).buyDate || "").localeCompare(String((b.extra || {}).buyDate || "")); });
    var kwAvail = kwList.find(function (r) { return !usedKw[r.id]; });
    if (kwAvail) { usedKw[kwAvail.id] = true; return num(kwAvail.wholesalePrice); }
    var INV = (S.SET.stock_inventory || {}).items || {};
    var sk = Object.keys(INV).find(function (k) { return mhit(INV[k].model, it.model) && shit(INV[k].opt || "", it["사이즈"]); });
    if (sk) {
      var s = INV[sk], lots = (s.lots || []).map(function (l, i) { return { lot: l, idx: i }; }).filter(function (x) { return !x.lot.out && num(x.lot.price); });
      lots.sort(function (a, b) { return String(a.lot.date || "").localeCompare(String(b.lot.date || "")); });
      usedLots[sk] = usedLots[sk] || {};
      var picked = lots.find(function (x) { return !usedLots[sk][x.idx]; });
      if (picked) { usedLots[sk][picked.idx] = true; return num(picked.lot.price); }
    }
    return 0;
  }
  var risky = [];
  live.forEach(function (it) {
    var cost = findCost(it), hope = num(it["판매 희망가"]); if (!cost || !hope) return;
    var fee = Math.floor(hope * feeRate) + 2500, settleEst = hope - fee;
    if (settleEst < cost) risky.push({ name: (it.name || "").slice(0, 25), size: it["사이즈"] || "", cost: cost, hope: hope, loss: cost - settleEst });
  });
  if (risky.length) out.push("🚨 보판 손해가격 설정 " + risky.length + "건 (지금 팔리면 손해!)\n" + risky.slice(0, 5).map(function (x) { return "· " + x.name + " " + x.size + " · 매입 " + won(x.cost) + " · 희망 " + won(x.hope) + " · 손해 " + won(x.loss); }).join("\n") + "\n크림 앱에서 희망가 올리세요");

  out.push("ERP: 크림 › 크림 보판 현황 / 크림 매입 / 크림 보판 수익");
  ERP.tgSend(out.join("\n"));
}
setInterval(function () { try { if (S.SET && S.profile) morning(); } catch (e) {} }, 5 * 60e3);
/* 세무사용 엑셀 (대표님 2026-11-18): 크림 보관판매 전체를 최신순으로, 매입가(크림 매입 = 도매가, 로우나 재고 = 재고실사 매입가) 붙여서 */
/* 재고실사 품번은 짧게(AS3260, 1143954, 5125-그레이) 적힌 경우가 많음 → 크림 모델번호가 재고 품번으로 시작하면 같은 상품으로 봄(한글 색상은 빼고 비교).
   옵션은 '블랙/은장', 'Black /XXL', 'US 8'처럼 색상+사이즈 → 마지막 사이즈 같은 글자만 뽑아 비교, 사이즈가 없으면 사이즈 무관 (대표님 2026-11-18) */
function modelHit(sm, km) { var a = nk(sm); if (a.length < 4) return false; return String(km || "").split("/").map(nk).filter(Boolean).some(function (b) { return a === b || (a.length >= 5 && b.indexOf(a) === 0) || (b.length >= 5 && a.indexOf(b) === 0) || (a.length >= 8 && b.length >= 8 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0)); }); }
var SZ_RE = /^(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|\d{1,3}(\.5)?W?|(US|EU|UK|KR|JP)\s?\d{1,3}(\.5)?W?|ONE\s?SIZE|F|FREE|OS|TU)$/i;
function sizeOf(opt) { var parts = String(opt || "").split("/").map(function (x) { return x.trim(); }).filter(Boolean); for (var i = parts.length - 1; i >= 0; i--) { if (SZ_RE.test(parts[i])) return parts[i]; var w = parts[i].split(/\s+/), t = w[w.length - 1], t2 = w.slice(-2).join(" "); if (SZ_RE.test(t2)) return t2; if (SZ_RE.test(t)) return t; } return ""; }
function stockCost(it) {
  var I = (S.SET.stock_inventory || {}).items || {}, best = null;
  Object.keys(I).forEach(function (k) { var s = I[k]; if (!s || !modelHit(s.model, it.model)) return; var sz = sizeOf(s.opt); if (sz && it["사이즈"] && !sizeHit({ size: sz }, it["사이즈"])) return; var sc = (nk(s.model).length) + (sz ? 100 : 0); if (!best || sc > best.sc) best = { s: s, sc: sc, k: k }; });
  if (!best) return null;
  var L = (best.s.lots || []), K = L.filter(function (x) { return String(x.loc || "").toUpperCase() === "KREAM"; }), use = (K.length ? K : L).map(function (x) { return num(x.price); }).filter(function (x) { return x > 0; });
  return { cost: use.length ? Math.round(use.reduce(function (a, b) { return a + b; }, 0) / use.length) : null, code: best.s.code || best.k };
}
ERP.acts.ksexport = function () {
  var d = D(), I = Object.keys(d.items).map(function (k) { return d.items[k]; }), A = assign(I.slice()), ROW = {}; A.R.forEach(function (r) { ROW[r.id] = r; });
  var rows = I.sort(newest).map(function (it, i) {
    var r = it.row && ROW[it.row], sc = r ? null : stockCost(it), cost = r ? num(r.wholesalePrice) : sc && sc.cost;
    return { "순서": i + 1, "크림 보관번호": it.id, "단계": it.st, "모델번호": it.model, "상품명": it.name, "사이즈": it["사이즈"] || "", "출처": r ? "크림 도매 매입 (" + (r.supplier || "") + ")" : sc ? "로우나 재고" : "확인 필요", "매입일": r ? r.extra.buyDate : "", "입금일": r ? (r.extra.payDate || "") : "", "매입가(개당, VAT 포함)": cost || "", "재고코드": sc ? sc.code : (r && r.extra.stockCode) || "", "보판신청일": r ? (r.extra.boDate || "") : "", "정산금액": it["정산금액"] ? num(it["정산금액"]) : "", "정산일": d8(it["정산일"]), "보증금": it["보증금"] ? num(it["보증금"]) : "" };
  });
  var sum = {}; rows.forEach(function (x) { var k = x["단계"]; sum[k] = sum[k] || { "단계": k, "수량": 0, "매입가 합계": 0, "정산금액 합계": 0 }; sum[k]["수량"]++; sum[k]["매입가 합계"] += num(x["매입가(개당, VAT 포함)"]); sum[k]["정산금액 합계"] += num(x["정산금액"]); });
  ERP.downloadBlob("크림보관판매_" + U.today() + ".xlsx", ERP.xlsxBlob([{ name: "보관판매 전체(최신순)", rows: rows }, { name: "단계별 합계", rows: ST.map(function (s) { return sum[s[2]]; }).filter(Boolean) }]));
};
ERP.page({ id: "kream-sync", title: "크림 보판 현황", wide: true, roles: ["owner", "accountant", "staff", "ai"], render: render, bind: function () {} });
})();
