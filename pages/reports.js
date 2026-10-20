/* 메뉴: 기간 리포트 · 채널별 순마진 */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, C = ERP.C, esc = U.esc, won = U.won, pct = U.pct;
var v = ERP.view;
function z() { return { rev: 0, fee: 0, settled: 0, cost: 0, ship: 0, def: 0, margin: 0, marginRev: 0, retLoss: 0, net: 0, outVat: 0, inVat: 0, n: 0, noCost: 0 }; }
function add(a, b) { for (var k in a) a[k] += b[k] || 0; }
function renderReports() {
  var y = v.year, rows = "", T = z(), Q = z();
  function line(label, a, cls, mk) { return '<tr class="' + (cls || "") + (mk ? " click" : "") + '"' + (mk ? ' data-go="sales:month=' + mk + '&saleFilter=all" tabindex="0"' : "") + "><td>" + label + '</td><td class="r num">' + a.n + '</td><td class="r num">' + won(a.rev) + '</td><td class="r num">' + won(a.fee) + '</td><td class="r num">' + won(a.settled) + '</td><td class="r num">' + won(a.cost) + '</td><td class="r num">' + won(a.ship) + '</td><td class="r num">' + won(a.def) + '</td><td class="r num">' + won(a.retLoss) + '</td><td class="r num ' + (a.net < 0 ? "neg" : "") + '">' + won(a.net) + '</td><td class="r num">' + pct(a.marginRev ? a.margin / a.marginRev : 0) + '</td><td class="r num">' + a.noCost + '</td><td class="r num">' + won(a.outVat) + '</td><td class="r num">' + won(a.inVat) + '</td><td class="r num">' + won(a.outVat - a.inVat) + "</td></tr>"; }
  for (var i = 1; i <= 12; i++) { var mk = y + "-" + U.p2(i), a = ERP.aggregate(function (d) { return U.ym(d) === mk; }); rows += line(i + "월", a, "", mk); add(Q, a); add(T, a); if (i % 3 === 0) { rows += line((i / 3) + "분기", Q, "qtr"); Q = z(); } }
  rows += line(y + "년 합계", T, "sum");
  return '<div class="head"><div><h1>기간 리포트</h1><p>부가세·종합소득세 신고 준비용 · 월을 누르면 그 달 매출로 이동해요</p></div><div class="tools">' + ERP.yearSelect() + '<button class="btn" data-act="exportreport">엑셀 내보내기</button></div></div>' +
    '<div class="table-wrap"><table style="min-width:1320px"><thead><tr><th>기간</th><th class="r">건수</th><th class="r">매출</th><th class="r">수수료</th><th class="r">정산액</th><th class="r">원가</th><th class="r">배송비</th><th class="r">후정산 광고비</th><th class="r">반품손실</th><th class="r">순이익</th><th class="r">마진율</th><th class="r">원가 미입력</th><th class="r">매출세액</th><th class="r">매입세액</th><th class="r">부가세(추정)</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
    '<p class="note">순이익 = 원가가 입력된 주문의 마진 − 반품손실. 매출세액 = 판매가 ÷ 11, 매입세액 = 공제 대상 원가 ÷ 11로 계산한 추정치예요. 실제 신고 금액은 세무사 확인이 필요해요.</p>';
}
ERP.acts.exportreport = function () { var y = v.year, rows = []; for (var i = 1; i <= 12; i++) { var mk = y + "-" + U.p2(i), a = ERP.aggregate(function (d) { return U.ym(d) === mk; }); rows.push({ "월": mk, "건수": a.n, "매출": Math.round(a.rev), "수수료": Math.round(a.fee), "정산액": Math.round(a.settled), "원가": Math.round(a.cost), "배송비": Math.round(a.ship), "후정산광고비": Math.round(a.def), "반품손실": Math.round(a.retLoss), "순이익": Math.round(a.net), "원가미입력": a.noCost, "매출세액(추정)": a.outVat, "매입세액(추정)": a.inVat, "부가세(추정)": a.outVat - a.inVat }); } ERP.downloadBlob("로우나_기간리포트_" + y + ".xlsx", ERP.xlsxBlob([{ name: y + "년", rows: rows }])); };

function renderChannels() {
  var y = v.year, a = ERP.aggregate(function (d) { return d.slice(0, 4) === y; }), feeBy = {}, retBy = {};
  ERP.list("sales").forEach(function (s) { if ((s.date || "").slice(0, 4) !== y || ERP.excluded(s)) return; var d = ERP.derive(s), k = s.platformId || "", o = feeBy[k] || (feeBy[k] = { fee: 0, def: 0 }); o.fee += d.fee; o.def += d.defApplied; });
  ERP.list("returns").forEach(function (r) { var d = C.retDate(r); if (d.slice(0, 4) !== y) return; var s = r.saleId ? ERP.DATA.sales.get(r.saleId) : null, k = r.platformId || (s && s.platformId) || ""; retBy[k] = (retBy[k] || 0) + C.retLoss(r); });
  var rows = Object.keys(a.byPlat).map(function (k) { var b = a.byPlat[k], net = b.margin - (retBy[k] || 0); return { id: k, b: b, net: net, rate: b.marginRev ? net / b.marginRev : 0 }; }).sort(function (x, z) { return z.b.rev - x.b.rev; });
  var chart = ERP.Charts.hbars(rows.map(function (x) { return { label: ERP.platName(x.id), value: x.net, sub: pct(x.rate), cls: x.net < 0 ? "crit" : "c2" }; }), { fmt: function (n) { return U.shortWon(n); } });
  return '<div class="head"><div><h1>채널별 순마진</h1><p>' + y + '년 · 수수료·후정산 광고비·반품손실까지 뺀 쇼핑몰별 실제 이익 · 원가 입력 주문 기준</p></div><div class="tools">' + ERP.yearSelect() + "</div></div>" +
    '<div class="panel"><h2>쇼핑몰별 순마진<span class="sub">막대 오른쪽 숫자는 순마진 · 아래 작은 숫자는 순마진율</span></h2>' + chart + "</div>" +
    '<div class="table-wrap"><table><thead><tr><th>쇼핑몰</th><th class="r">주문</th><th class="r">매출</th><th class="r">수수료</th><th class="r">후정산 광고비</th><th class="r">반품손실</th><th class="r">순마진</th><th class="r">순마진율</th></tr></thead><tbody>' +
    rows.map(function (x) { var f = feeBy[x.id] || { fee: 0, def: 0 }, p = ERP.plat(x.id); return "<tr><td>" + esc(ERP.platName(x.id)) + (p && !p.verified ? ' <span class="pill p-warn">수수료 확인 필요</span>' : "") + '</td><td class="r num">' + x.b.n + '</td><td class="r num">' + won(x.b.rev) + '</td><td class="r num">' + won(f.fee) + '</td><td class="r num">' + won(f.def) + '</td><td class="r num">' + won(retBy[x.id] || 0) + '</td><td class="r num ' + (x.net < 0 ? "neg" : "") + '">' + won(x.net) + '</td><td class="r num">' + pct(x.rate) + "</td></tr>"; }).join("") + "</tbody></table></div>";
}
ERP.page({ id: "reports", title: "기간 리포트", roles: ["owner", "accountant"], render: renderReports });
ERP.page({ id: "channels", title: "채널별 순마진", roles: ["owner", "accountant"], render: renderChannels });
})();
