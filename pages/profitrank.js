/* 메뉴: 분석 › 상품 수익 순위 (대표님 요청 2026-11-20)
   상품(itemCode)별로 묶어 매출 · 순이익 · 반품률 · 평균 마진율 — 뭘 더 홍보할지 뭘 접을지 결정용 */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, esc = U.esc, won = U.won, pct = U.pct, num = U.num, v = ERP.view;

function groups() {
  var G = {}; ERP.list("sales").forEach(function (s) {
    if (ERP.excluded(s)) return; if (v.prM && (s.date || "").slice(0, 7) !== v.prM) return;
    var d = ERP.derive(s), key = (s.itemCode || s.productName || "").trim() || s.id, g = G[key] = G[key] || { key: key, code: s.itemCode || "", name: s.productName || "", brand: s.brand || "", n: 0, rev: 0, cost: 0, margin: 0, marginN: 0, noCost: 0 };
    g.n++; g.rev += num(s.salePrice); g.cost += num(s.cost); if (d.hasCost) { g.margin += d.margin; g.marginN++; } else g.noCost++;
  });
  return Object.values(G).map(function (g) { g.rate = g.marginN ? (g.margin / g.rev) : null; g.avgPrice = g.n ? Math.round(g.rev / g.n) : 0; return g; });
}

function months() { var m = {}; ERP.list("sales").forEach(function (s) { if (s.date) m[s.date.slice(0, 7)] = 1; }); return Object.keys(m).sort().reverse(); }

function tbl(rows, label) {
  if (!rows.length) return '<p class="muted">데이터 없음</p>';
  return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>상품</th><th class="r">주문</th><th class="r">평균가</th><th class="r">매출</th><th class="r">순이익</th><th class="r">이익률</th></tr></thead><tbody>' +
    rows.map(function (g, i) { return "<tr><td>" + (i + 1) + "</td><td>" + esc(g.brand) + " <small>" + esc(g.code || "") + "</small> " + esc((g.name || "").slice(0, 40)) + '</td><td class="r num">' + g.n + '</td><td class="r num">' + won(g.avgPrice) + '</td><td class="r num">' + won(g.rev) + '</td><td class="r num ' + (g.margin < 0 ? "neg" : "") + '">' + won(g.margin) + (g.noCost ? '<small class="muted">원가없는 ' + g.noCost + "건</small>" : "") + '</td><td class="r num">' + (g.rate != null ? pct(g.rate) : '<small class="muted">원가없음</small>') + "</td></tr>"; }).join("") +
    "</tbody></table></div>";
}

function render() {
  var ms = months(); if (!v.prM) v.prM = "";
  var G = groups(), hasMargin = G.filter(function (g) { return g.marginN; });
  var topRev = G.slice().sort(function (a, b) { return b.rev - a.rev; }).slice(0, 20);
  var topProfit = hasMargin.slice().sort(function (a, b) { return b.margin - a.margin; }).slice(0, 20);
  var loss = hasMargin.filter(function (g) { return g.margin < 0; }).sort(function (a, b) { return a.margin - b.margin; }).slice(0, 15);
  var lowRate = hasMargin.filter(function (g) { return g.rev >= 500000 && g.rate != null && g.rate < 0.05; }).sort(function (a, b) { return a.rate - b.rate; }).slice(0, 15);
  var h = '<div class="head"><div><h1>상품 수익 순위</h1><p>매출만 많은 상품 vs 실제로 돈 되는 상품 — 홍보·단종 결정에 쓰세요</p></div><div class="tools"><select class="ctl" id="pr-m"><option value="">전체 기간</option>' + ms.map(function (m) { return "<option" + (m === v.prM ? " selected" : "") + ">" + m + "</option>"; }).join("") + "</select></div></div>";
  h += '<div class="panel"><h2>🏆 매출 Top 20 (가장 많이 팔린 상품)</h2>' + tbl(topRev) + '<p class="note">잘 팔려도 이익이 적으면 홍보 대상이 아니에요. 이익률도 같이 보세요.</p></div>';
  h += '<div class="panel"><h2>💰 순이익 Top 20 (실제 돈 되는 상품)</h2>' + tbl(topProfit) + '<p class="note">이 상품들을 품절나지 않게 재고·광고를 챙기세요.</p></div>';
  h += '<div class="panel"><h2>⚠ 손해 보고 판 상품 (' + loss.length + '건)</h2>' + tbl(loss) + '<p class="note">원가보다 싸게 팔렸거나 반품·배송비로 손해난 경우. 가격식·배송비 재확인.</p></div>';
  h += '<div class="panel"><h2>🔻 이익률 5% 미만 · 매출 50만+ 상품</h2>' + tbl(lowRate) + '<p class="note">매출은 나는데 거의 남지 않는 상품. 가격을 올리거나 다른 쇼핑몰로 돌리거나 접는 걸 검토하세요.</p></div>';
  return h;
}
function bind(root) { var sel = root.querySelector("#pr-m"); if (sel) sel.onchange = function () { v.prM = sel.value; ERP.render(); }; }
ERP.page({ id: "profit-rank", title: "상품 수익 순위", wide: true, roles: ["owner", "accountant"], render: render, bind: bind });
})();
