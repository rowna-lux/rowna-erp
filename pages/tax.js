/* 메뉴: 로우나 세무 — 월별 부가세 적립 장부 · 종합소득세 예상 · 사업자 정보
   모든 금액은 ERP 매출·원가 기준 추정치. 실제 신고는 세무사 확인 필요. */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, C = ERP.C, esc = U.esc, won = U.won, num = U.num;
var v = ERP.view;
var KEY = "tax_settings";
/* 2026년 종합소득세 세율 (출처: moneynestlab 2026 세율표 — 과세표준 구간·누진공제) */
var BRACKETS = [[14e6, 0.06, 0], [50e6, 0.15, 1260000], [88e6, 0.24, 5760000], [150e6, 0.35, 15440000], [300e6, 0.38, 19940000], [500e6, 0.40, 25940000], [1e9, 0.42, 35940000], [Infinity, 0.45, 65940000]];
var DEF = { biz: { name: "로우나명품", owner: "", bizNo: "", addr: "" }, deduction: 0,
  expenses: [{ name: "사무실 임대료", monthly: 660000, vat: true }, { name: "스토어봇", monthly: 350000, vat: true }, { name: "사방넷", monthly: 0, vat: true }, { name: "비품", monthly: 100000, vat: true }] };
/* 홈택스 매출자료 (대표님 제공 2026-10-27: 현금영수증 매출내역누계 1~6월, 신용카드·판매대행 매출 1~2분기) */
var HT0 = { "2026-1": { pg: 246853269, card: 0, cash: 51211506, cashVat: 4655561 }, "2026-2": { pg: 209489603, card: 0, cash: 49885004, cashVat: 4534970 } };
function cfg() { var c = S.SET[KEY]; if (!c) { c = JSON.parse(JSON.stringify(DEF)); } if (!c.hometax) c.hometax = JSON.parse(JSON.stringify(HT0)); return c; }
function qtrOf(mk) { return mk.slice(0, 4) + "-" + Math.ceil(+mk.slice(5, 7) / 3); }
function htCalc(q) {
  var o = { sale: num(q.pg) + num(q.card) + num(q.cash) + num(q.etc), out: 0, inv: num(q.inTax) + num(q.inCard) + num(q.inFee) + num(q.inExp) };
  o.out = Math.round((num(q.pg) + num(q.card) + num(q.etc)) / 11) + (q.cashVat !== "" && q.cashVat != null ? num(q.cashVat) : Math.round(num(q.cash) / 11));
  o.due = o.out - o.inv; return o;
}
function incomeTax(base) { if (base <= 0) return 0; for (var i = 0; i < BRACKETS.length; i++) if (base <= BRACKETS[i][0]) return Math.max(0, Math.round(base * BRACKETS[i][1] - BRACKETS[i][2])); return 0; }
function expMonth(c) { var t = 0, tv = 0; (c.expenses || []).forEach(function (e) { var m = num(e.monthly); t += m; if (e.vat) tv += Math.round(m / 11); }); return { total: t, vat: tv }; }

/* 한 달 집계: 매출세액·매입세액·수수료 매입세액·소득 */
function month(mk, c) {
  var o = { rev: 0, outVat: 0, inVat: 0, feeVat: 0, margin: 0, vatLoss: 0, noCost: 0, n: 0 };
  ERP.list("sales").forEach(function (s) {
    if (U.ym(s.date || "") !== mk || ERP.excluded(s)) return;
    var d = ERP.derive(s); o.n++;
    o.rev += num(s.salePrice); o.outVat += d.outVat; o.inVat += d.inVat; o.feeVat += Math.round((d.fee + (d.defApplied || 0)) / 11);
    if (d.hasCost) { o.margin += d.margin; o.vatLoss += d.vatLoss || 0; } else if (num(s.salePrice) > 0) o.noCost++;
  });
  var ret = 0; ERP.list("returns").forEach(function (r) { if (U.ym(C.retDate(r)) === mk) ret += C.retLoss(r); });
  var ex = expMonth(c);
  o.expVat = ex.vat; o.exp = ex.total; o.ret = ret;
  o.vatDue = Math.max(0, o.outVat - o.inVat - o.feeVat - o.expVat);
  /* 소득(부가세 뺀 금액) = 마진 + (마진에서 이미 뺀 공제불가 부가세) − 낼 부가세 − 반품손실 − 경비(부가세 환급분 제외) */
  o.income = o.margin + o.vatLoss - (o.outVat - o.inVat - o.feeVat) - ret - (ex.total - ex.vat);
  return o;
}

function render() {
  var c = cfg(), y = v.year, now = U.today(), curYm = now.slice(0, 7), rows = "", H = [{ due: 0 }, { due: 0 }], Y = { income: 0, vat: 0, months: 0, noCost: 0 };
  for (var i = 1; i <= 12; i++) {
    var mk = y + "-" + U.p2(i), o = month(mk, c), future = mk > curYm, h = H[i <= 6 ? 0 : 1];
    if (!future) { h.due += o.vatDue; Y.income += o.income; Y.vat += o.vatDue; Y.months++; Y.noCost += o.noCost; }
    rows += '<tr class="' + (future ? "off" : "") + '"><td>' + i + '월</td><td class="r num">' + o.n + '</td><td class="r num">' + won(o.rev) + '</td><td class="r num">' + won(o.outVat) + '</td><td class="r num">' + won(o.inVat) + '</td><td class="r num">' + won(o.feeVat) + '</td><td class="r num">' + won(o.expVat) + '</td><td class="r num"><b>' + won(future ? 0 : o.vatDue) + '</b></td><td class="r num">' + won(future ? 0 : h.due) + "</td><td>" + (o.noCost ? '<span class="pill p-warn">원가 미입력 ' + o.noCost + "</span>" : "") + "</td></tr>";
    if (i === 6 || i === 12) rows += '<tr class="qtr"><td colspan="7">' + (i === 6 ? "1기 (1~6월) → 7월 확정신고" : "2기 (7~12월) → 다음 해 1월 확정신고") + '</td><td class="r num" colspan="2"><b>' + won(h.due) + "</b></td><td></td></tr>";
  }
  var annual = Y.months ? Math.round(Y.income * 12 / Y.months) : 0, base = Math.max(0, annual - num(c.deduction)), it = incomeTax(base), local = Math.round(it * 0.1);
  var thisM = month(curYm, c);
  var h = '<div class="head"><div><h1>로우나 세무</h1><p>' + y + '년 · 매달 떼어놓을 부가세·종합소득세 (ERP 매출·원가 기준 추정치)</p></div><div class="tools">' + ERP.yearSelect() + '<button class="btn" data-act="taxxls">엑셀 내보내기</button></div></div>';
  h += '<div class="tiles">' + ERP.tile("이번 달 떼어놓을 부가세", won(thisM.vatDue) + "원", curYm.replace("-", "년 ") + "월 기준") +
    ERP.tile("이번 달 떼어놓을 종소세", won(Math.round((it + local) / 12)) + "원", "연간 예상세액 ÷ 12") +
    ERP.tile("올해 예상 종소세", won(it + local) + "원", "국세 " + won(it) + " + 지방소득세 " + won(local)) +
    ERP.tile("연간 예상 소득", won(annual) + "원", Y.months + "개월 실적을 12개월로 환산") + "</div>";
  if (Y.noCost) h += '<p class="note" style="color:#a33">원가가 비어 있는 매출 ' + Y.noCost + "건은 소득 계산에서 빠져 있어요. 원가를 넣을수록 정확해져요.</p>";
  h += '<div class="panel"><h2>① 월별 부가세 적립 장부<span class="sub">낼 부가세 = 매출세액 − 매입세액 − 수수료 매입세액 − 경비 매입세액</span></h2><div class="table-wrap"><table><thead><tr><th>월</th><th class="r">건수</th><th class="r">매출</th><th class="r">매출세액</th><th class="r">매입세액</th><th class="r">수수료 매입세액</th><th class="r">경비 매입세액</th><th class="r">떼어놓을 부가세</th><th class="r">반기 누적</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
    '<p class="note">매출세액 = 판매가 ÷ 11 (반품·취소 제외) · 매입세액 = 세금계산서 있는 원가 ÷ 11 (개인 거래 매입은 0) · 수수료 매입세액 = 쇼핑몰 수수료 ÷ 11 (추정). 일반과세자는 직전 반기 납부세액의 절반이 4월·10월에 예정고지될 수 있어요 (토스페이먼츠 안내).</p></div>';
  h += '<div class="panel"><h2>② 종합소득세 예상<span class="sub">2026년 세율표 적용 · 지방소득세 10% 포함</span></h2><div class="tiles">' +
    ERP.tile("올해 지금까지 소득", won(Y.income) + "원") + ERP.tile("소득공제 (입력값)", won(c.deduction) + "원", "모르면 0 = 세금을 넉넉히 잡음") + ERP.tile("과세표준", won(base) + "원") + ERP.tile("세율 구간", taxRate(base)) + "</div>" +
    '<p class="note">소득 = 마진 − 낼 부가세 − 반품손실 − 경비. 세액공제·기납부세액(중간예납)은 반영하지 않았어요. 실제 신고는 세무사 확인이 필요해요.</p></div>';
  h += '<div class="panel"><h2>③ 매달 고정 경비<span class="sub">부가세 체크 = 세금계산서·카드영수증 받는 경비</span></h2><div class="table-wrap"><table><thead><tr><th>항목</th><th class="r">월 금액</th><th>부가세</th><th></th></tr></thead><tbody>' +
    (c.expenses || []).map(function (e, i) { return '<tr><td><input class="ctl" data-exn="' + i + '" value="' + esc(e.name) + '"></td><td class="r"><input class="ctl num" type="number" data-exm="' + i + '" value="' + num(e.monthly) + '" style="width:130px"></td><td><input type="checkbox" data-exv="' + i + '"' + (e.vat ? " checked" : "") + ' aria-label="부가세 있음"></td><td><button class="btn sm" data-act="taxexdel" data-i="' + i + '">삭제</button></td></tr>'; }).join("") +
    '</tbody></table></div><div class="tools" style="margin-top:8px"><button class="btn" data-act="taxexadd">+ 경비 추가</button><button class="btn pri" data-act="taxsave">경비 저장</button><span class="pill p-mute">월 합계 ' + won(expMonth(c).total) + "원</span></div></div>";
  h += htPanel(c, y);
  var B = c.biz || {};
  h += '<div class="panel"><h2>④ 사업자 정보<span class="sub">매입확인서에 자동으로 들어가요</span></h2><div class="fg">' +
    ERP.fd("상호", "tx-name", "text", B.name) + ERP.fd("대표자", "tx-owner", "text", B.owner) + ERP.fd("사업자등록번호", "tx-bizNo", "text", B.bizNo) + ERP.fd("사업장 주소", "tx-addr", "text", B.addr, "full") + ERP.fd("소득공제 합계 (원, 모르면 0)", "tx-ded", "number", c.deduction) + "</div>" +
    '<div class="tools" style="margin-top:10px"><button class="btn pri" data-act="taxsave">저장</button></div></div>';
  return h;
}
function htPanel(c, y) {
  var F = [["pg", "판매(결제)대행 매출"], ["card", "신용카드 매출"], ["cash", "현금영수증 매출"], ["cashVat", "└ 현금영수증 세액"], ["etc", "기타 매출(세금계산서 등)"], ["inTax", "매입 세금계산서 세액"], ["inCard", "매입 카드·현금영수증 세액"], ["inFee", "쇼핑몰 수수료 세액"], ["inExp", "기타 경비 세액"]];
  var Q = [1, 2, 3, 4].map(function (n) { return y + "-" + n; });
  var erp = {}; Q.forEach(function (k) { erp[k] = 0; });
  ERP.list("sales").forEach(function (s) { if (!s.date || ERP.excluded(s)) return; var k = qtrOf(U.ym(s.date)); if (k in erp) erp[k] += num(s.salePrice); });
  var head = "<tr><th>항목 (홈택스 금액, 원)</th>" + Q.map(function (k) { return '<th class="r">' + k.slice(5) + "분기</th>"; }).join("") + "</tr>";
  var body = F.map(function (f) { return "<tr><td>" + f[1] + "</td>" + Q.map(function (k) { var q = c.hometax[k] || {}; return '<td class="r"><input class="ctl num" type="number" style="width:130px" data-ht="' + k + "|" + f[0] + '" value="' + (q[f[0]] == null || q[f[0]] === "" ? "" : num(q[f[0]])) + '"></td>'; }).join("") + "</tr>"; }).join("");
  var R = Q.map(function (k) { return htCalc(c.hometax[k] || {}); });
  var line = function (label, fn, cls) { return '<tr class="' + (cls || "") + '"><td><b>' + label + "</b></td>" + Q.map(function (k, i) { return '<td class="r num">' + fn(R[i], k) + "</td>"; }).join("") + "</tr>"; };
  body += line("매출 합계", function (r) { return won(r.sale); }, "qtr") + line("ERP 매출 (비교)", function (r, k) { var d = erp[k] - r.sale; return won(erp[k]) + (r.sale ? '<br><small class="' + (Math.abs(d) > r.sale * 0.05 ? "neg" : "") + '">차이 ' + (d > 0 ? "+" : "") + won(d) + "</small>" : ""); }) +
    line("매출세액", function (r) { return won(r.out); }) + line("매입세액 합계", function (r) { return won(r.inv); }) +
    line("납부할 부가세 (추정)", function (r) { return '<b class="' + (r.due < 0 ? "neg" : "") + '">' + won(r.due) + "</b>"; }, "sum");
  var h1 = R[0].due + R[1].due, h2 = R[2].due + R[3].due;
  return '<div class="panel"><h2>⑤ 홈택스 자료로 부가세 계산<span class="sub">홈택스에서 받은 분기별 금액을 넣으면 납부세액을 계산해요 · 1·2분기 매출은 보내주신 파일 값으로 채워 두었어요</span></h2><div class="table-wrap"><table><thead>' + head + "</thead><tbody>" + body + "</tbody></table></div>" +
    '<div class="tiles" style="margin-top:10px">' + ERP.tile("1기 (1~6월) 납부 추정", won(h1) + "원", "매입세액을 넣어야 정확해요") + ERP.tile("2기 (7~12월) 납부 추정", won(h2) + "원") + "</div>" +
    '<div class="tools" style="margin-top:8px"><button class="btn pri" data-act="taxsave">홈택스 자료 저장</button></div>' +
    '<p class="note">매출세액 = (판매대행 + 신용카드 + 기타) ÷ 11 + 현금영수증 세액. 판매대행(카드 결제)과 현금영수증은 서로 다른 결제라 더해서 계산해요 (대표님 확인 2026-10-27). 영수증 없이 받은 계좌이체 등은 '기타 매출'에 넣어 주세요. 매입세액은 홈택스 [세금계산서 매입]·[신용카드 매입] 조회 금액을 넣어 주세요.</p></div>';
}
function taxRate(base) { for (var i = 0; i < BRACKETS.length; i++) if (base <= BRACKETS[i][0]) return Math.round(BRACKETS[i][1] * 100) + "%"; return "-"; }
function readCfg() {
  var c = JSON.parse(JSON.stringify(cfg()));
  document.querySelectorAll("[data-exn]").forEach(function (el) { c.expenses[+el.dataset.exn].name = el.value; });
  document.querySelectorAll("[data-exm]").forEach(function (el) { c.expenses[+el.dataset.exm].monthly = num(el.value); });
  document.querySelectorAll("[data-exv]").forEach(function (el) { c.expenses[+el.dataset.exv].vat = el.checked; });
  document.querySelectorAll("[data-ht]").forEach(function (el) { var p = el.dataset.ht.split("|"); c.hometax[p[0]] = c.hometax[p[0]] || {}; c.hometax[p[0]][p[1]] = el.value === "" ? "" : num(el.value); });
  var g = function (id) { var el = document.getElementById("i-" + id); return el ? el.value : ""; };
  if (document.getElementById("i-tx-name")) { c.biz = { name: g("tx-name"), owner: g("tx-owner"), bizNo: g("tx-bizNo"), addr: g("tx-addr") }; c.deduction = num(g("tx-ded")); }
  return c;
}
async function saveCfg(c) { S.SET[KEY] = c; S.SET.business_info = c.biz; await ERP.saveSetting(KEY, c); await S.sb.from("app_settings").upsert({ key: "business_info", value: c.biz }); ERP.render(); }
ERP.acts.taxsave = function () { saveCfg(readCfg()); };
ERP.acts.taxexadd = function () { var c = readCfg(); c.expenses.push({ name: "", monthly: 0, vat: true }); S.SET[KEY] = c; ERP.render(); };
ERP.acts.taxexdel = function (b) { var c = readCfg(); c.expenses.splice(+b.dataset.i, 1); saveCfg(c); };
ERP.acts.taxxls = function () {
  var c = cfg(), y = v.year, rows = [];
  for (var i = 1; i <= 12; i++) { var mk = y + "-" + U.p2(i), o = month(mk, c); rows.push({ "월": mk, "건수": o.n, "매출": o.rev, "매출세액": o.outVat, "매입세액": o.inVat, "수수료매입세액": o.feeVat, "경비매입세액": o.expVat, "낼부가세(추정)": o.vatDue, "소득(추정)": Math.round(o.income), "원가미입력": o.noCost }); }
  ERP.downloadBlob("로우나_세무_" + y + ".xlsx", ERP.xlsxBlob([{ name: "월별 부가세·소득", rows: rows }]));
};
ERP.page({ id: "tax", title: "로우나 세무", roles: ["owner", "accountant"], wide: true, render: render, live: function () { var ae = document.activeElement; if (ae && ae.matches && ae.matches("input,select")) return; ERP.render(); } });
})();
