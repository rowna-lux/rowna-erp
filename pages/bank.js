/* 메뉴: 통장 (미라클럭스 농협) — 은행 거래내역 엑셀을 끌어다 놓으면 정리하고, 크림 매입 송금과 짝지어 입금일을 넣어 줌 (2026-11-17)
   데이터: app_settings.bank_tx = { rows:[{id,date,time,in,out,bal,memo,match}], files:[…] } */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, esc = U.esc, won = U.won, num = U.num, v = ERP.view, KEY = "bank_tx";
function D() { var d = S.SET[KEY]; if (!d || typeof d !== "object") d = { rows: [], files: [] }; d.rows = d.rows || []; d.files = d.files || []; return d; }
async function save(d) { var r = await S.sb.from("app_settings").upsert({ key: KEY, value: d }); if (r.error) { ERP.toast(ERP.errMsg(r.error)); return false; } S.SET[KEY] = d; return true; }
function n(x) { return Number(String(x == null ? "" : x).replace(/[^\d.-]/g, "")) || 0; }
function normDate(x) { if (x instanceof Date) return x.toISOString().slice(0, 10); if (typeof x === "number" && x > 30000 && x < 60000) { var d = new Date(Math.round((x - 25569) * 86400000)); return d.toISOString().slice(0, 10); } var s = String(x || "").trim(), m = s.match(/(20\d{2})[.\-\/년\s]*(\d{1,2})[.\-\/월\s]*(\d{1,2})/); return m ? m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2) : ""; }
function timeOf(x) { var m = String(x || "").match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/); return m ? ("0" + m[1]).slice(-2) + ":" + m[2] + (m[3] ? ":" + m[3] : "") : ""; }
/* 은행마다 칸 이름이 달라서 머리줄을 찾아 칸을 맞춤 (농협: 거래일시·출금금액·입금금액·거래후잔액·거래내용·거래기록사항·거래점 등) */
function parse(a) {
  var hi = -1, H = [];
  for (var i = 0; i < Math.min(a.length, 30); i++) { var r = a[i].map(function (c) { return String(c).replace(/\s/g, ""); }); if (r.some(function (c) { return /거래일|일자|일시/.test(c); }) && r.some(function (c) { return /출금|찾으신|지급|입금|맡기신/.test(c); })) { hi = i; H = r; break; } }
  if (hi < 0) throw new Error("거래내역 머리줄(거래일·입금·출금)을 못 찾았어요");
  var col = function (re, not) { for (var j = 0; j < H.length; j++) if (re.test(H[j]) && !(not && not.test(H[j]))) return j; return -1; };
  var cD = col(/거래일|일자|일시/), cT = col(/^시간$|거래시간/), cO = col(/출금|찾으신|지급/), cI = col(/입금|맡기신/, /후|잔액/), cB = col(/잔액/), memoCols = []; H.forEach(function (h, j) { if (/내용|기록|적요|메모|받는분|보낸분|의뢰인|수취인|거래점|비고/.test(h)) memoCols.push(j); });
  var out = [];
  for (var k = hi + 1; k < a.length; k++) { var r = a[k], dt = normDate(r[cD]); if (!dt) continue; var o = cO >= 0 ? n(r[cO]) : 0, ii = cI >= 0 ? n(r[cI]) : 0; if (!o && !ii) continue;
    var memo = memoCols.map(function (j) { return String(r[j] || "").trim(); }).filter(Boolean).join(" · "), tm = cT >= 0 ? timeOf(r[cT]) : timeOf(r[cD]), bal = cB >= 0 ? n(r[cB]) : null;
    out.push({ id: [dt, tm, o, ii, bal, memo].join("|"), date: dt, time: tm, out: o, in: ii, bal: bal, memo: memo }); }
  return out;
}
async function importFiles(files) {
  var d = D(), have = {}, add = 0, skip = 0; d.rows.forEach(function (r) { have[r.id] = 1; });
  for (var i = 0; i < files.length; i++) { try { var wb = XLSX.read(await files[i].arrayBuffer(), { cellDates: true }), a = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: true }), R = parse(a);
      R.forEach(function (r) { if (have[r.id]) { skip++; return; } have[r.id] = 1; d.rows.push(r); add++; }); d.files.push({ name: files[i].name, at: new Date().toISOString(), n: R.length }); } catch (e) { ERP.toast("⚠ " + files[i].name + ": " + e.message); } }
  d.rows.sort(function (x, y) { return (y.date + y.time).localeCompare(x.date + x.time); });
  if (await save(d)) ERP.toast("거래 " + add + "건 넣었어요" + (skip ? " · 이미 있던 " + skip + "건은 건너뜀" : "")); ERP.render();
}
/* 크림 매입 짝짓기: 출금액 = 매입일·도매처 묶음의 매입 합계(±1,000원), 날짜 = 매입일 ~ 7일 뒤 */
function kreamGroups() { var G = {}; ERP.list("kream_wholesale").forEach(function (x) { var e = x.extra || {}; if (x.decision !== "매입" || !e.buyDate) return; var k = e.buyDate + "|" + (x.supplier || "열무"), q = num(e.buyQty) || num(x.qty); var g = G[k] = G[k] || { key: k, day: e.buyDate, sup: x.supplier || "열무", sum: 0, paid: 0, n: 0 }; g.sum += q * num(x.wholesalePrice); g.n++; if (e.payDate) g.paid++; }); return Object.keys(G).map(function (k) { return G[k]; }); }
/* 2026-11-19 대표님: 통장 출금 한 건마다 그 돈으로 산 크림 매입 상품을 펼쳐 보기 — 입금내역별 매입 관리 */
function kreamItemsFor(r) {
  if (!r.out) return [];
  var vend = /밀라노|밀라노크리처/.test(r.memo) ? "열무" : /하이엔드|부티크|수고개/.test(r.memo) ? "수고개" : "";
  return ERP.list("kream_wholesale").filter(function (x) {
    var e = x.extra || {}; if (x.decision !== "매입" || !e.buyDate) return false;
    if (e.payDate === r.date && (!vend || (x.supplier || "열무") === vend)) return true;
    if (!e.payDate && vend && (x.supplier || "열무") === vend) { var dd = (new Date(r.date) - new Date(e.buyDate)) / 86400000; if (dd >= -1 && dd <= 7) return true; }
    return false;
  });
}
function itemsPanel(items, r) {
  if (!items.length) return "";
  var sum = 0, qsum = 0; items.forEach(function (x) { var q = num((x.extra || {}).buyQty) || num(x.qty) || 1; sum += q * num(x.wholesalePrice); qsum += q; });
  var diff = sum - r.out, byDay = {};
  items.forEach(function (x) { var d = x.extra.buyDate; byDay[d] = byDay[d] || []; byDay[d].push(x); });
  var rows = Object.keys(byDay).sort().map(function (d) {
    return byDay[d].map(function (x) {
      var q = num((x.extra || {}).buyQty) || num(x.qty) || 1, w = num(x.wholesalePrice);
      return '<tr><td class="num">' + esc(d.slice(5)) + "</td><td>" + esc(x.brand || "") + " " + esc((x.sku || "").slice(0, 20)) + " <small>" + esc(x.size || "") + '</small></td><td class="r num">' + q + '</td><td class="r num">' + won(w) + '</td><td class="r num">' + won(q * w) + "</td></tr>";
    }).join("");
  }).join("");
  return '<tr class="bk-items"><td colspan="5" style="background:rgba(127,127,127,.06);padding:8px 12px"><div style="font-weight:600;margin-bottom:4px">📦 이 송금으로 산 상품 ' + items.length + '종 ' + qsum + '개 · 매입 합계 ' + won(sum) + "원" + (diff !== 0 ? ' <span class="' + (diff > 0 ? "neg" : "p-good") + '">(' + (diff > 0 ? "-" : "+") + won(Math.abs(diff)) + "원 " + (diff > 0 ? "덜 보냄·할인" : "더 보냄") + ")</span>" : "") + '</div><table class="tbl" style="width:auto;min-width:500px"><thead><tr><th>매입일</th><th>상품</th><th class="r">수량</th><th class="r">도매가</th><th class="r">합계</th></tr></thead><tbody>' + rows + "</tbody></table></td></tr>";
}
function suggest(r, G) { if (!r.out || r.match) return null; return G.filter(function (g) { var dd = (new Date(r.date) - new Date(g.day)) / 86400000; return g.paid < g.n && (Math.abs(g.sum - r.out) <= 1000 || (r.out < g.sum && g.sum - r.out <= Math.max(1000, g.sum * 0.01))) && dd >= -1 && dd <= 7; })[0] || null; }
/* ---------- 카드 할부·고정 지출·월별 나갈 돈 (대표님 요청 2026-11-18) ----------
   app_settings.card_plan = { cards:[{id,name,payDay}], items:[{id,card,date,memo,amount,months,first}], fixed:[{id,name,amount,day,until}] }
   할부: 금액 ÷ 개월 (원 단위 나머지는 첫 달), 첫 청구월 기본 = 구매 다음 달 (카드마다 결제일·마감일이 달라 직접 고칠 수 있음). 할부 이자는 넣지 않음(무이자 기준) */
var CK = "card_plan";
function CP() { var d = S.SET[CK]; if (!d || typeof d !== "object") d = {}; d.cards = d.cards || []; d.items = d.items || []; d.fixed = d.fixed || []; return d; }
async function saveCP(d) { var r = await S.sb.from("app_settings").upsert({ key: CK, value: d }); if (r.error) { ERP.toast(ERP.errMsg(r.error)); return false; } S.SET[CK] = d; return true; }
function addM(ym, k) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + k; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + "-" + ("0" + (m + 1)).slice(-2); }
function firstM(it) { return it.first || addM(String(it.date || U.today()).slice(0, 7), 1); }
function sched(it) { var A = num(it.amount), N = Math.max(1, num(it.months) || 1), per = Math.floor(A / N), out = {}; for (var i = 0; i < N; i++) out[addM(firstM(it), i)] = per + (i === 0 ? A - per * N : 0); return out; }
function cardName(id) { var c = CP().cards.find(function (x) { return x.id === id; }); return c ? c.name : "(카드 없음)"; }
function monthPlan(ym) {
  var d = CP(), byCard = {}, tot = 0, list = [];
  d.items.forEach(function (it) { var a = sched(it)[ym]; if (!a) return; byCard[it.card] = (byCard[it.card] || 0) + a; tot += a; var k = Object.keys(sched(it)).sort(), i = k.indexOf(ym); list.push({ it: it, a: a, nth: (i + 1) + "/" + k.length }); });
  var fx = 0; d.fixed.forEach(function (f) { if (f.until && f.until < ym) return; fx += num(f.amount); });
  return { byCard: byCard, card: tot, fixed: fx, total: tot + fx, list: list };
}
function lastBal() { var r = D().rows.filter(function (x) { return x.bal != null; })[0]; return r ? { bal: r.bal, date: r.date } : null; }
function renderCard() {
  var d = CP(), w = ERP.canWrite("purchases"), now = U.today().slice(0, 7), lb = lastBal();
  var M = [0, 1, 2, 3, 4, 5].map(function (k) { var ym = addM(now, k); return { ym: ym, p: monthPlan(ym) }; });
  var h = '<div class="tiles">' + ERP.tile("이번 달 나갈 돈", won(M[0].p.total) + "원", "카드 " + won(M[0].p.card) + " · 고정 " + won(M[0].p.fixed), "hl") + ERP.tile("다음 달 나갈 돈", won(M[1].p.total) + "원", "카드 " + won(M[1].p.card) + " · 고정 " + won(M[1].p.fixed)) + ERP.tile("통장 잔액", lb ? won(lb.bal) + "원" : "–", lb ? lb.date + " 기준 (통장 탭 엑셀)" : "통장 엑셀을 올리면 보여요") + ERP.tile("잔액 − 이번 달", lb ? won(lb.bal - M[0].p.total) + "원" : "–", "남는 돈(크림 정산 예정 제외)") + "</div>";
  h += '<div class="panel"><h2>📅 앞으로 6개월 나갈 돈</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>월</th>' + d.cards.map(function (c) { return '<th class="r">' + esc(c.name) + (c.payDay ? "<br><small>" + esc(c.payDay) + "일 결제</small>" : "") + "</th>"; }).join("") + '<th class="r">카드 합계</th><th class="r">고정 지출</th><th class="r">합계</th></tr></thead><tbody>' +
    M.map(function (m) { return "<tr" + (m.ym === now ? ' style="font-weight:600"' : "") + "><td>" + m.ym + "</td>" + d.cards.map(function (c) { return '<td class="r num">' + (m.p.byCard[c.id] ? won(m.p.byCard[c.id]) : "") + "</td>"; }).join("") + '<td class="r num">' + won(m.p.card) + '</td><td class="r num">' + won(m.p.fixed) + '</td><td class="r num"><b>' + won(m.p.total) + "</b></td></tr>"; }).join("") + "</tbody></table></div></div>";
  var opt = function (sel) { return d.cards.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === sel ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join(""); };
  h += '<div class="panel"><h2>💳 할부·카드 결제 (' + d.items.length + '건)</h2>' + (w ? '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px"><select class="ctl" id="cp-card">' + (opt() || '<option value="">카드를 먼저 추가하세요</option>') + '</select><input class="ctl" type="date" id="cp-date" value="' + U.today() + '"><input class="ctl" id="cp-memo" placeholder="내용 (예: 열무 매입)" style="width:180px"><input class="ctl num" type="number" id="cp-amt" placeholder="결제 금액" style="width:120px"><select class="ctl" id="cp-mon">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24].map(function (k) { return "<option value=\"" + k + "\">" + (k === 1 ? "일시불" : k + "개월") + "</option>"; }).join("") + '</select><button class="btn pri" data-act="cpadd">＋ 추가</button></div>' : "") +
    '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>구매일</th><th>카드</th><th>내용</th><th class="r">금액</th><th class="r">개월</th><th>첫 청구월</th><th class="r">월 납부</th><th>남은 회차</th><th></th></tr></thead><tbody>' +
    (d.items.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).map(function (it) { var sc = sched(it), ks = Object.keys(sc).sort(), left = ks.filter(function (k) { return k >= now; }).length, leftAmt = ks.filter(function (k) { return k >= now; }).reduce(function (a, k) { return a + sc[k]; }, 0);
      return "<tr" + (left ? "" : ' style="opacity:.5"') + '><td class="num">' + esc(it.date || "") + "</td><td>" + (w ? '<select class="cell-in" data-cpf="' + esc(it.id) + '|card">' + opt(it.card) + "</select>" : esc(cardName(it.card))) + "</td><td>" + esc(it.memo || "") + '</td><td class="r num">' + won(num(it.amount)) + '</td><td class="r">' + (num(it.months) > 1 ? num(it.months) + "개월" : "일시불") + "</td><td>" + (w ? '<input class="cell-in" type="month" data-cpf="' + esc(it.id) + '|first" value="' + esc(firstM(it)) + '">' : esc(firstM(it))) + '</td><td class="r num">' + won(sc[ks[ks.length - 1]]) + "</td><td>" + (left ? left + "회 · " + won(leftAmt) + "원" : "끝") + "</td><td>" + (w ? '<button class="btn sm" data-cpdel="' + esc(it.id) + '">삭제</button>' : "") + "</td></tr>"; }).join("") || '<tr><td colspan="9" class="empty">아직 없어요. 할부로 결제한 매입을 위에서 추가하세요.</td></tr>') + "</tbody></table></div></div>";
  h += '<div class="panel"><h2>카드 · 고정 지출</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px"><div><b>카드</b><table class="tbl"><tbody>' + d.cards.map(function (c) { return "<tr><td>" + esc(c.name) + '</td><td class="r">' + (c.payDay ? esc(c.payDay) + "일 결제" : "") + "</td><td>" + (w ? '<button class="btn sm" data-cpcdel="' + esc(c.id) + '">삭제</button>' : "") + "</td></tr>"; }).join("") + "</tbody></table>" + (w ? '<div style="display:flex;gap:6px;margin-top:6px"><input class="ctl" id="cp-cn" placeholder="카드 이름 (예: 우리 517)"><input class="ctl num" type="number" id="cp-cd" placeholder="결제일" style="width:80px"><button class="btn" data-act="cpcard">＋ 카드</button></div>' : "") + "</div>" +
    '<div><b>매달 나가는 돈 (대출 상환·임대료·구독 등)</b><table class="tbl"><tbody>' + d.fixed.map(function (f) { return "<tr><td>" + esc(f.name) + '</td><td class="r num">' + won(num(f.amount)) + "</td><td>" + (f.day ? esc(f.day) + "일" : "") + (f.until ? " ~" + esc(f.until) : "") + "</td><td>" + (w ? '<button class="btn sm" data-cpfdel="' + esc(f.id) + '">삭제</button>' : "") + "</td></tr>"; }).join("") + "</tbody></table>" + (w ? '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"><input class="ctl" id="cp-fn" placeholder="이름"><input class="ctl num" type="number" id="cp-fa" placeholder="월 금액" style="width:110px"><input class="ctl num" type="number" id="cp-fd" placeholder="일" style="width:60px"><input class="ctl" type="month" id="cp-fu" title="끝나는 달 (비우면 계속)"><button class="btn" data-act="cpfix">＋ 추가</button></div>' : "") + "</div></div>" +
    '<p class="note">할부는 무이자 기준으로 금액 ÷ 개월로 나눠요(나머지 원 단위는 첫 달). 첫 청구월은 구매 다음 달로 잡혀요 — 카드 명세서와 다르면 칸을 고쳐 주세요. 카드사 이용내역 엑셀 자동 불러오기는 샘플 파일을 받으면 붙일게요.</p></div>';
  return h;
}
ERP.acts.cpcard = async function () { var nm = (U.$("cp-cn") || {}).value || ""; if (!nm.trim()) return; var d = CP(); d.cards.push({ id: "c" + Date.now().toString(36), name: nm.trim(), payDay: num((U.$("cp-cd") || {}).value) || "" }); await saveCP(d); ERP.render(); };
ERP.acts.cpfix = async function () { var nm = (U.$("cp-fn") || {}).value || "", a = num((U.$("cp-fa") || {}).value); if (!nm.trim() || !a) { ERP.toast("이름과 월 금액을 넣어 주세요"); return; } var d = CP(); d.fixed.push({ id: "f" + Date.now().toString(36), name: nm.trim(), amount: a, day: num((U.$("cp-fd") || {}).value) || "", until: (U.$("cp-fu") || {}).value || "" }); await saveCP(d); ERP.render(); };
ERP.acts.cpadd = async function () { var d = CP(), c = (U.$("cp-card") || {}).value, a = num((U.$("cp-amt") || {}).value); if (!c) { ERP.toast("카드를 먼저 추가하세요 (아래 ‘카드 · 고정 지출’)"); return; } if (!a) { ERP.toast("결제 금액을 넣어 주세요"); return; } d.items.push({ id: "i" + Date.now().toString(36), card: c, date: (U.$("cp-date") || {}).value || U.today(), memo: ((U.$("cp-memo") || {}).value || "").trim(), amount: a, months: num((U.$("cp-mon") || {}).value) || 1 }); await saveCP(d); ERP.toast("추가했어요"); ERP.render(); };
/* 2026-11-19 대표님: 메뉴 이름 '자금관리', 메인 = 나갈 돈(카드 할부·고정 지출), 맨 위에 통장 내역 올리기, 거래내역 목록은 아래 탭 */
function dropBox() { var d = D(); return '<div class="panel" id="bk-drop" style="border:2px dashed rgba(127,127,127,.4);padding:12px 16px;cursor:pointer;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b>📎 통장 거래내역 올리기</b><span class="muted">엑셀(xls·xlsx·csv)을 여기에 끌어다 놓거나 클릭 · 같은 거래는 두 번 안 들어가요</span><input type="file" id="bk-file" accept=".xls,.xlsx,.csv" multiple style="display:none"><span style="flex:1"></span><small class="muted">' + (d.files.length ? "마지막: " + esc(d.files[d.files.length - 1].name) + " · 총 " + d.rows.length + "건" : "아직 올린 파일이 없어요") + "</small></div>"; }
function render() {
  var tx = v.bkTab === "tx", tabs = '<div class="tools" style="margin:0 0 10px"><button class="btn ' + (tx ? "" : "pri") + '" data-bktab="card">💳 나갈 돈 (카드 할부 · 고정 지출)</button><button class="btn ' + (tx ? "pri" : "") + '" data-bktab="tx">🏦 통장 거래내역 (' + D().rows.length + ')</button></div>';
  var head = '<div class="head"><div><h1>자금관리</h1><p>이번 달·다음 달 나갈 돈과 통장 흐름을 한곳에서 봐요. 통장 내역은 맨 위 칸에 올리면 돼요 (미라클럭스 농협).</p></div></div>' + dropBox() + tabs;
  return head + (tx ? renderTx() : renderCard());
}
function renderTx() {
  var d = D(), w = ERP.canWrite("purchases"), months = {}; d.rows.forEach(function (r) { months[r.date.slice(0, 7)] = 1; }); var ms = Object.keys(months).sort().reverse(); if (!v.bkM || ms.indexOf(v.bkM) < 0) v.bkM = ms[0] || "";
  var L = d.rows.filter(function (r) { return r.date.slice(0, 7) === v.bkM && (!v.bkQ || (r.memo + " " + r.out + " " + r.in).indexOf(v.bkQ) >= 0); }), tin = 0, tout = 0; L.forEach(function (r) { tin += r.in; tout += r.out; }); var G = kreamGroups();
  var body = L.map(function (r) { var sg = suggest(r, G), kit = kreamItemsFor(r), exp = kit.length && (v.bkExp || {})[r.id]; return (kit.length ? '<tr class="click" data-bkexp="' + esc(r.id) + '">' : "<tr>") + '<td class="num">' + (kit.length ? (exp ? "▼" : "▶") + " " : "") + esc(r.date.slice(5)) + ' <small class="muted">' + esc(r.time || "") + "</small></td><td>" + esc(r.memo || "") + (r.match ? '<br><small class="muted">✔ ' + esc(r.match) + "</small>" : "") + (kit.length && !r.match ? '<br><small class="p-acc">📦 크림 매입 ' + kit.length + "종 (펼쳐 보기)</small>" : "") + (sg ? '<br><button class="btn sm pri" data-bkm="' + esc(r.id) + "§" + esc(sg.key) + '">크림 매입 ' + esc(sg.day.slice(5) + " " + sg.sup) + " (" + won(sg.sum) + ") 입금으로 처리</button>" : "") + '</td><td class="r num">' + (r.in ? '<b style="color:#30a46c">' + won(r.in) + "</b>" : "") + '</td><td class="r num">' + (r.out ? '<b class="neg">' + won(r.out) + "</b>" : "") + '</td><td class="r num"><small>' + (r.bal != null ? won(r.bal) : "") + "</small></td></tr>" + (exp ? itemsPanel(kit, r) : ""); }).join("");
  var _unused2 = (function () { var _OLD_body_unused = (function(){var x=L.map(function (r) { var sg = suggest(r, G); return "<tr><td class=\"num\">" + esc(r.date.slice(5)) + " <small class=\"muted\">" + esc(r.time || "") + "</small></td><td>" + esc(r.memo || "") + (r.match ? '<br><small class="muted">✔ ' + esc(r.match) + "</small>" : "") + (sg ? '<br><button class="btn sm pri" data-bkm="' + esc(r.id) + "§" + esc(sg.key) + '">크림 매입 ' + esc(sg.day.slice(5) + " " + sg.sup) + " (" + won(sg.sum) + ") 입금으로 처리</button>" : "") + '</td><td class="r num">' + (r.in ? '<b style="color:#30a46c">' + won(r.in) + "</b>" : "") + '</td><td class="r num">' + (r.out ? '<b class="neg">' + won(r.out) + "</b>" : "") + '</td><td class="r num"><small>' + (r.bal != null ? won(r.bal) : "") + "</small></td></tr>"; }).join(""); return x;})();})();
  return '<p class="note">크림 매입 송금이 보이면 <b>입금으로 처리</b> 버튼이 떠요 → 누르면 크림 매입 입금일이 들어가고 ‘매입’에 자동 기록돼요. 도매처가 조금 깎아 준 경우(매입 확정 금액의 1% 이내)도 후보로 떠요.</p>' +
    (ms.length ? '<div class="panel"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><select class="ctl" id="bk-m">' + ms.map(function (m) { return "<option" + (m === v.bkM ? " selected" : "") + ">" + m + "</option>"; }).join("") + '</select><input class="ctl" id="bk-q" placeholder="내용·금액 검색" value="' + esc(v.bkQ || "") + '"><span>입금 <b style="color:#30a46c">' + won(tin) + '</b> · 출금 <b class="neg">' + won(tout) + "</b> · " + L.length + '건</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>날짜</th><th>내용</th><th class="r">입금</th><th class="r">출금</th><th class="r">잔액</th></tr></thead><tbody>' + body + "</tbody></table></div></div>" : "");
}
function bind(root) {
  root.querySelectorAll("[data-bktab]").forEach(function (b) { b.onclick = function () { v.bkTab = b.dataset.bktab; ERP.render(); }; });
  root.querySelectorAll("[data-bkexp]").forEach(function (tr) { tr.onclick = function (e) { if (e.target.closest("button,a,input")) return; v.bkExp = v.bkExp || {}; var k = tr.dataset.bkexp; if (v.bkExp[k]) delete v.bkExp[k]; else v.bkExp[k] = 1; ERP.render(); }; });
  root.querySelectorAll("[data-cpf]").forEach(function (el) { el.onchange = async function () { var a = el.dataset.cpf.split("|"), d = CP(), it = d.items.find(function (x) { return x.id === a[0]; }); if (!it) return; it[a[1]] = el.value; await saveCP(d); ERP.render(); }; });
  root.querySelectorAll("[data-cpdel]").forEach(function (b) { b.onclick = async function () { if (!confirm("이 결제를 지울까요?")) return; var d = CP(); d.items = d.items.filter(function (x) { return x.id !== b.dataset.cpdel; }); await saveCP(d); ERP.render(); }; });
  root.querySelectorAll("[data-cpcdel]").forEach(function (b) { b.onclick = async function () { var d = CP(), id = b.dataset.cpcdel; if (d.items.some(function (x) { return x.card === id; })) { ERP.toast("이 카드로 넣은 결제가 있어서 못 지워요"); return; } d.cards = d.cards.filter(function (x) { return x.id !== id; }); await saveCP(d); ERP.render(); }; });
  root.querySelectorAll("[data-cpfdel]").forEach(function (b) { b.onclick = async function () { var d = CP(); d.fixed = d.fixed.filter(function (x) { return x.id !== b.dataset.cpfdel; }); await saveCP(d); ERP.render(); }; });
  var dz = root.querySelector("#bk-drop"), fi = root.querySelector("#bk-file");
  if (dz) { dz.onclick = function () { fi.click(); }; dz.ondragover = function (e) { e.preventDefault(); }; dz.ondrop = function (e) { e.preventDefault(); importFiles(Array.from(e.dataTransfer.files)); }; fi.onchange = function () { importFiles(Array.from(fi.files)); }; }
  var m = root.querySelector("#bk-m"); if (m) m.onchange = function () { v.bkM = m.value; ERP.render(); };
  var q = root.querySelector("#bk-q"); if (q) q.onchange = function () { v.bkQ = q.value.trim(); ERP.render(); };
  root.querySelectorAll("[data-bkm]").forEach(function (b) { b.onclick = async function () { var a = b.dataset.bkm.split("§"), d = D(), r = d.rows.find(function (x) { return x.id === a[0]; }); if (!r || !ERP.kbPayGroup) return; b.disabled = true; var n2 = await ERP.kbPayGroup(a[1], r.date); r.match = "크림 매입 " + a[1].replace("|", " ") + " 입금 (" + n2 + "줄)"; await save(d); ERP.render(); }; });
}
ERP.page({ id: "bank", title: "자금관리", roles: ["owner", "accountant"], render: render, bind: bind });
})();
