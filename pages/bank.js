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
function suggest(r, G) { if (!r.out || r.match) return null; return G.filter(function (g) { var dd = (new Date(r.date) - new Date(g.day)) / 86400000; return g.paid < g.n && Math.abs(g.sum - r.out) <= 1000 && dd >= -1 && dd <= 7; })[0] || null; }
function render() {
  var d = D(), w = ERP.canWrite("purchases"), months = {}; d.rows.forEach(function (r) { months[r.date.slice(0, 7)] = 1; }); var ms = Object.keys(months).sort().reverse(); if (!v.bkM || ms.indexOf(v.bkM) < 0) v.bkM = ms[0] || "";
  var L = d.rows.filter(function (r) { return r.date.slice(0, 7) === v.bkM && (!v.bkQ || (r.memo + " " + r.out + " " + r.in).indexOf(v.bkQ) >= 0); }), tin = 0, tout = 0; L.forEach(function (r) { tin += r.in; tout += r.out; }); var G = kreamGroups();
  var body = L.map(function (r) { var sg = suggest(r, G); return "<tr><td class=\"num\">" + esc(r.date.slice(5)) + " <small class=\"muted\">" + esc(r.time || "") + "</small></td><td>" + esc(r.memo || "") + (r.match ? '<br><small class="muted">✔ ' + esc(r.match) + "</small>" : "") + (sg ? '<br><button class="btn sm pri" data-bkm="' + esc(r.id) + "§" + esc(sg.key) + '">크림 매입 ' + esc(sg.day.slice(5) + " " + sg.sup) + " (" + won(sg.sum) + ") 입금으로 처리</button>" : "") + '</td><td class="r num">' + (r.in ? '<b style="color:#30a46c">' + won(r.in) + "</b>" : "") + '</td><td class="r num">' + (r.out ? '<b class="neg">' + won(r.out) + "</b>" : "") + '</td><td class="r num"><small>' + (r.bal != null ? won(r.bal) : "") + "</small></td></tr>"; }).join("");
  return '<div class="head"><div><h1>통장 (미라클럭스 농협)</h1><p>농협 인터넷뱅킹에서 받은 거래내역 엑셀을 아래 칸에 끌어다 놓으세요. 같은 거래는 두 번 들어가지 않아요. 크림 매입 송금이 보이면 <b>입금으로 처리</b> 버튼이 떠요 → 누르면 크림 매입 입금일이 들어가고 ‘매입’에 자동 기록돼요.</p></div></div>' +
    '<div class="panel" id="bk-drop" style="border:2px dashed rgba(127,127,127,.4);text-align:center;padding:18px;cursor:pointer"><b>📥 거래내역 엑셀(xls·xlsx·csv) 끌어다 놓기 또는 클릭</b><input type="file" id="bk-file" accept=".xls,.xlsx,.csv" multiple style="display:none"><br><small class="muted">' + (d.files.length ? "마지막: " + esc(d.files[d.files.length - 1].name) + " · 총 " + d.rows.length + "건" : "아직 올린 파일이 없어요") + "</small></div>" +
    (ms.length ? '<div class="panel"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><select class="ctl" id="bk-m">' + ms.map(function (m) { return "<option" + (m === v.bkM ? " selected" : "") + ">" + m + "</option>"; }).join("") + '</select><input class="ctl" id="bk-q" placeholder="내용·금액 검색" value="' + esc(v.bkQ || "") + '"><span>입금 <b style="color:#30a46c">' + won(tin) + '</b> · 출금 <b class="neg">' + won(tout) + "</b> · " + L.length + '건</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>날짜</th><th>내용</th><th class="r">입금</th><th class="r">출금</th><th class="r">잔액</th></tr></thead><tbody>' + body + "</tbody></table></div></div>" : "");
}
function bind(root) {
  var dz = root.querySelector("#bk-drop"), fi = root.querySelector("#bk-file");
  if (dz) { dz.onclick = function () { fi.click(); }; dz.ondragover = function (e) { e.preventDefault(); }; dz.ondrop = function (e) { e.preventDefault(); importFiles(Array.from(e.dataTransfer.files)); }; fi.onchange = function () { importFiles(Array.from(fi.files)); }; }
  var m = root.querySelector("#bk-m"); if (m) m.onchange = function () { v.bkM = m.value; ERP.render(); };
  var q = root.querySelector("#bk-q"); if (q) q.onchange = function () { v.bkQ = q.value.trim(); ERP.render(); };
  root.querySelectorAll("[data-bkm]").forEach(function (b) { b.onclick = async function () { var a = b.dataset.bkm.split("§"), d = D(), r = d.rows.find(function (x) { return x.id === a[0]; }); if (!r || !ERP.kbPayGroup) return; b.disabled = true; var n2 = await ERP.kbPayGroup(a[1], r.date); r.match = "크림 매입 " + a[1].replace("|", " ") + " 입금 (" + n2 + "줄)"; await save(d); ERP.render(); }; });
}
ERP.page({ id: "bank", title: "통장", roles: ["owner", "accountant"], render: render, bind: bind });
})();
