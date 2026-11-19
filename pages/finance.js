/* 메뉴: 분석 › 경영 현황 (대표님 요청 2026-11-20) — 법인처럼 관리하기 위한 돈의 흐름
   ① 매출채권: 쇼핑몰별 정산 예정액(미확정) vs 통장 입금 · ② 재고 묶인 돈 · ③ 이번 달 현금 흐름 */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, esc = U.esc, won = U.won, num = U.num, v = ERP.view;

function thisM() { return U.today().slice(0, 7); }
function lastM() { var d = new Date(U.today()); d.setMonth(d.getMonth() - 1); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2); }

/* ① 매출채권 */
function receivables() {
  var byP = {}; ERP.list("sales").forEach(function (s) {
    if (ERP.excluded(s)) return; var d = ERP.derive(s), p = s.platformId || "-", k = byP[p] = byP[p] || { rev: 0, settled: 0, pend: 0, n: 0, pendN: 0, oldest: "" };
    k.rev += num(s.salePrice); k.n++;
    if (d.st === "확정") k.settled += num(s.settledAmount) || d.settled;
    else { k.pend += d.settled; k.pendN++; if (!k.oldest || s.date < k.oldest) k.oldest = s.date; }
  });
  return Object.keys(byP).map(function (p) { var o = byP[p]; return { pid: p, name: ERP.platName(p), rev: o.rev, settled: o.settled, pend: o.pend, n: o.n, pendN: o.pendN, oldest: o.oldest }; }).sort(function (a, b) { return b.pend - a.pend; });
}

/* ② 재고 묶인 돈 */
function cashTied() {
  var I = (S.SET.stock_inventory || {}).items || {}, tot = 0, n = 0, bucket = { "0-30": { c: 0, w: 0 }, "31-60": { c: 0, w: 0 }, "61-90": { c: 0, w: 0 }, "90+": { c: 0, w: 0 } }, today = U.today();
  Object.values(I).forEach(function (s) { if (!s || !s.lots) return; s.lots.forEach(function (l) { if (l.out) return; var p = num(l.price); if (!p) return; tot += p; n++; var age = Math.round((Date.parse(today) - Date.parse(l.date || today)) / 86400000); var k = age <= 30 ? "0-30" : age <= 60 ? "31-60" : age <= 90 ? "61-90" : "90+"; bucket[k].c++; bucket[k].w += p; }); });
  return { tot: tot, n: n, bucket: bucket };
}

/* ③ 이번 달 현금 흐름 (통장 기준) */
function cashFlow(ym) {
  var rows = ((S.SET.bank_tx || {}).rows || []).filter(function (r) { return r.date.slice(0, 7) === ym; });
  var rev = 0, pur = 0, card = 0, self = 0, other = 0, inSum = 0, outSum = 0;
  rows.forEach(function (r) {
    inSum += r.in; outSum += r.out; var m = r.memo || "";
    if (r.in) { if (/스마트스토어|머스트잇|롯데온|11번가|11ST|쿠팡|카카오톡스토어|트렌비|리본즈|에이블리|SSG|필웨이|바바더|코오롱|이랜드|하프클럽|톡스토어/i.test(m)) rev += r.in; }
    if (r.out) {
      if (/카드|KB오토할부|NH농협카드/i.test(m)) card += r.out;
      else if (/밀라노|하이엔드|부티크|열무|수고개/i.test(m)) pur += r.out;
      else if (/신소희|대표/i.test(m)) self += r.out;
      else other += r.out;
    }
  });
  var cp = S.SET.card_plan || {}, fx = (cp.fixed || []).reduce(function (a, f) { return (f.until && f.until < ym) ? a : a + num(f.amount); }, 0);
  return { rows: rows.length, rev: rev, pur: pur, card: card, self: self, other: other, inSum: inSum, outSum: outSum, net: inSum - outSum, fixedMo: fx };
}

function tile(label, value, foot, cls) { return '<div class="tile ' + (cls || "") + '"><div class="l">' + label + '</div><div class="v num">' + value + '</div><div class="f">' + (foot || "") + "</div></div>"; }

function render() {
  var R = receivables(), CT = cashTied(), tM = thisM(), lM = lastM(), cF = cashFlow(tM), cFL = cashFlow(lM);
  var totPend = R.reduce(function (a, r) { return a + r.pend; }, 0), totSettled = R.reduce(function (a, r) { return a + r.settled; }, 0);
  var h = '<div class="head"><div><h1>경영 현황</h1><p>법인처럼 돈 흐름을 보는 화면 — 매출채권(들어올 돈), 재고 묶인 돈, 이번 달 현금 흐름 (통장 기준)</p></div></div>';
  h += '<div class="tiles">' +
    tile("💎 들어올 돈 (정산 미확정)", won(totPend) + "원", R.reduce(function (a, r) { return a + r.pendN; }, 0) + "건 · 확정 " + won(totSettled) + "원", "hl") +
    tile("📦 재고 묶인 돈", won(CT.tot) + "원", CT.n + "개 · 60일+ " + (CT.bucket["61-90"].c + CT.bucket["90+"].c) + "개 " + won(CT.bucket["61-90"].w + CT.bucket["90+"].w) + "원") +
    tile("🏦 이번 달 통장 순흐름", (cF.net >= 0 ? "+" : "") + won(cF.net) + "원", "입금 " + won(cF.inSum) + " · 출금 " + won(cF.outSum), cF.net < 0 ? "neg" : "") +
    tile("💳 이번 달 고정지출", won(cF.fixedMo) + "원", "자금관리 › 고정 지출") + "</div>";
  h += '<div class="panel"><h2>💎 쇼핑몰별 매출채권 (들어와야 할 돈)</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>쇼핑몰</th><th class="r">총 매출</th><th class="r">정산 확정</th><th class="r">정산 미확정</th><th class="r">미확정 건수</th><th>가장 오래된 미확정</th></tr></thead><tbody>' +
    R.map(function (r) { var old = r.oldest ? Math.round((Date.parse(U.today()) - Date.parse(r.oldest)) / 86400000) : 0; return "<tr><td>" + esc(r.name) + '</td><td class="r num">' + won(r.rev) + '</td><td class="r num">' + won(r.settled) + '</td><td class="r num ' + (r.pend > 0 ? "hl" : "") + '">' + won(r.pend) + '</td><td class="r num">' + r.pendN + "</td><td>" + (r.oldest ? esc(r.oldest.slice(5)) + " <small class='" + (old > 60 ? "neg" : "muted") + "'>(" + old + "일 전)</small>" : "-") + "</td></tr>"; }).join("") +
    "</tbody></table></div><p class='note'>정산 미확정 = 아직 정산일이 안 왔거나 입금 확인 안 된 주문. 60일 넘은 미확정은 쇼핑몰에 직접 확인하세요.</p></div>";
  var CB = CT.bucket;
  h += '<div class="panel"><h2>📦 재고 묶인 돈 (입고일 기준)</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>구간</th><th class="r">수량</th><th class="r">묶인 돈</th><th class="r">비중</th></tr></thead><tbody>' +
    ["0-30", "31-60", "61-90", "90+"].map(function (k) { var b = CB[k], pct = CT.tot ? (b.w / CT.tot * 100).toFixed(1) : 0; return "<tr><td>" + (k === "90+" ? "90일 초과" : k + "일") + '</td><td class="r num">' + b.c + '</td><td class="r num">' + won(b.w) + '</td><td class="r num ' + (k === "90+" ? "neg" : "") + '">' + pct + "%</td></tr>"; }).join("") +
    "</tbody></table></div><p class='note'>60일 넘은 재고 처분은 '로우나재고 크림 › ⏳ 60일+' 탭에서 크림/머스트잇/반송 중 가장 유리한 쪽 추천을 받으세요.</p></div>";
  h += '<div class="panel"><h2>🏦 통장 현금 흐름 (' + tM + ')</h2>' + (cF.rows === 0 ? '<p class="muted">통장 거래내역이 없어요. 자금관리에서 농협 엑셀을 올려 주세요.</p>' :
    '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>항목</th><th class="r">이번 달</th><th class="r">지난달</th><th class="r">변화</th></tr></thead><tbody>' +
    [["💰 매출 입금 (쇼핑몰 정산)", cF.rev, cFL.rev], ["🛒 매입 송금 (열무·수고개)", cF.pur, cFL.pur], ["💳 카드 대금", cF.card, cFL.card], ["👤 대표 입출금", cF.self, cFL.self], ["기타 출금", cF.other, cFL.other]].map(function (x) { var diff = x[1] - x[2]; return "<tr><td>" + x[0] + '</td><td class="r num">' + won(x[1]) + '</td><td class="r num">' + won(x[2]) + '</td><td class="r num ' + (diff < 0 ? "neg" : "") + '">' + (diff >= 0 ? "+" : "") + won(diff) + "</td></tr>"; }).join("") +
    "</tbody></table></div><p class='note'>매출 · 매입 분류는 통장 메모에서 자동으로 찾아요. 분류 규칙을 고치려면 알려 주세요.</p></div>");
  return h;
}
ERP.page({ id: "finance", title: "경영 현황", wide: true, roles: ["owner", "accountant"], render: render, bind: function () {} });
})();
