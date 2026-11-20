/* 메뉴: 분석 › 채널별 수익성 (대표님 요청 2026-11-21)
   쇼핑몰별 매출·수수료·순이익·마진율 비교 — 어느 몰이 실제로 돈 되는지 */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, esc = U.esc, won = U.won, pct = U.pct, num = U.num, v = ERP.view;

function months() { var m = {}; ERP.list("sales").forEach(function (s) { if (s.date) m[s.date.slice(0, 7)] = 1; }); return Object.keys(m).sort().reverse(); }

function groups() {
  var G = {};
  var retBySale = S.retBySale || new Map();
  ERP.list("sales").forEach(function (s) {
    if (v.cpM && (s.date || "").slice(0, 7) !== v.cpM) return;
    var pid = s.platformId || "-";
    var g = G[pid] = G[pid] || { pid: pid, name: ERP.platName(pid) || "(미지정)", rev: 0, fee: 0, cost: 0, margin: 0, settled: 0, n: 0, orders: 0, withCost: 0, returns: 0, retLoss: 0 };
    if (ERP.excluded(s)) { g.returns++; return; }
    var d = ERP.derive(s);
    g.rev += num(s.salePrice); g.fee += d.fee; g.settled += d.settled; g.orders++;
    if (d.hasCost) { g.cost += num(s.cost); g.margin += d.margin; g.withCost++; }
    g.n++;
  });
  ERP.list("returns").forEach(function (r) {
    if (v.cpM && (r.date || r.returnDate || "").slice(0, 7) !== v.cpM) return;
    var sid = r.saleId || r.sale_id; if (!sid) return;
    var sale = ERP.list("sales").find(function (s) { return s.id === sid; });
    if (!sale) return;
    var pid = sale.platformId || "-", g = G[pid]; if (!g) return;
    g.retLoss += num(r.shipCost) - num(r.shipIncome) + num(r.refundLoss);
  });
  return Object.values(G).map(function (g) {
    g.avg = g.orders ? Math.round(g.rev / g.orders) : 0;
    g.feeRate = g.rev ? g.fee / g.rev : 0;
    g.marginRate = g.rev ? g.margin / g.rev : 0;
    g.netProfit = g.margin - g.retLoss;
    g.netRate = g.rev ? g.netProfit / g.rev : 0;
    g.retRate = (g.orders + g.returns) ? g.returns / (g.orders + g.returns) : 0;
    return g;
  }).sort(function (a, b) { return b.rev - a.rev; });
}

function render() {
  var ms = months(); if (!v.cpM) v.cpM = "";
  var G = groups().filter(function (g) { return g.rev > 0 || g.orders > 0; });
  var total = G.reduce(function (a, g) { return { rev: a.rev + g.rev, fee: a.fee + g.fee, margin: a.margin + g.margin, retLoss: a.retLoss + g.retLoss, orders: a.orders + g.orders, returns: a.returns + g.returns }; }, { rev: 0, fee: 0, margin: 0, retLoss: 0, orders: 0, returns: 0 });
  var h = '<div class="head"><div><h1>채널별 수익성 분석</h1><p>쇼핑몰마다 수수료·마진 달라요. 어느 몰에 예산·시간 집중할지 결정하는 데 사용.</p></div><div class="tools"><select class="ctl" id="cp-m"><option value="">전체 기간</option>' + ms.map(function (m) { return "<option" + (m === v.cpM ? " selected" : "") + ">" + m + "</option>"; }).join("") + "</select></div></div>";
  h += '<div class="tiles">' +
    ERP.tile("전체 매출", won(total.rev) + "원", total.orders + "건") +
    ERP.tile("전체 수수료", won(total.fee) + "원", (total.rev ? (total.fee / total.rev * 100).toFixed(1) : 0) + "% (평균)") +
    ERP.tile("순이익 (반품손실 차감)", won(total.margin - total.retLoss) + "원", (total.rev ? ((total.margin - total.retLoss) / total.rev * 100).toFixed(1) : 0) + "% 마진율") +
    ERP.tile("판매 채널 수", G.length + "개", "매출 발생 기준") + "</div>";

  /* 수익성 비교 테이블 */
  h += '<div class="panel"><h2>💰 채널별 수익성 상세 (매출순)</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>채널</th><th class="r">주문</th><th class="r">매출</th><th class="r">평균 주문액</th><th class="r">수수료</th><th class="r">수수료율</th><th class="r">마진</th><th class="r">마진율</th><th class="r">반품손실</th><th class="r">순이익</th><th class="r">순이익률</th></tr></thead><tbody>' +
    G.map(function (g, i) {
      var rateCls = g.netRate < 0 ? "neg" : g.netRate < 0.1 ? "hl" : "p-good";
      var feeHi = g.feeRate >= 0.15 ? "neg" : "";
      return "<tr><td>" + (i + 1) + "</td><td><b>" + esc(g.name) + "</b>" + (g.withCost < g.orders ? '<br><small class="muted">원가 미입력 ' + (g.orders - g.withCost) + "건</small>" : "") + '</td><td class="r num">' + g.orders + "</td><td class=\"r num\">" + won(g.rev) + '</td><td class="r num"><small>' + won(g.avg) + '</small></td><td class="r num">' + won(Math.round(g.fee)) + '</td><td class="r num ' + feeHi + '">' + pct(g.feeRate) + '</td><td class="r num">' + won(g.margin) + '</td><td class="r num">' + pct(g.marginRate) + '</td><td class="r num ' + (g.retLoss > 0 ? "neg" : "") + '">' + (g.retLoss > 0 ? won(g.retLoss) : "-") + '</td><td class="r num ' + rateCls + '"><b>' + won(g.netProfit) + '</b></td><td class="r num ' + rateCls + '"><b>' + pct(g.netRate) + "</b></td></tr>";
    }).join("") + "</tbody></table></div><p class=\"note\">순이익 = 마진(매출-원가) - 반품손실. 순이익률 10%+ 녹색, 마이너스 빨강. 수수료율 15%+ 빨강(머스트잇 그로스패키지 등).</p></div>";

  /* 액션 아이템 — 적자 / 저효율 채널 */
  var loss = G.filter(function (g) { return g.netProfit < 0 && g.orders >= 3; });
  var lowMargin = G.filter(function (g) { return g.netRate >= 0 && g.netRate < 0.05 && g.orders >= 5; });
  var star = G.filter(function (g) { return g.netRate >= 0.15 && g.orders >= 3; }).sort(function (a, b) { return b.netProfit - a.netProfit; });
  if (loss.length || lowMargin.length || star.length) {
    h += '<div class="panel"><h2>🎯 액션 아이템</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px">';
    if (loss.length) h += '<div><b class="neg">⚠ 적자 채널 (' + loss.length + '개)</b><ul>' + loss.map(function (g) { return "<li>" + esc(g.name) + " · " + g.orders + "건 · 순이익 <b class=\"neg\">" + won(g.netProfit) + "</b></li>"; }).join("") + '</ul><small class="muted">원가·수수료·반품 재검토. 가격 인상 or 철수 고려.</small></div>';
    if (lowMargin.length) h += '<div><b class="hl">⚡ 저효율 채널 (' + lowMargin.length + '개, 순이익률 5% 미만)</b><ul>' + lowMargin.map(function (g) { return "<li>" + esc(g.name) + " · " + g.orders + "건 · " + pct(g.netRate) + "</li>"; }).join("") + '</ul><small class="muted">가격 재조정 or 수수료 적은 몰로 유도.</small></div>';
    if (star.length) h += '<div><b class="p-good">⭐ 효자 채널 (' + star.length + '개, 순이익률 15%+)</b><ul>' + star.slice(0, 5).map(function (g) { return "<li>" + esc(g.name) + " · " + won(g.netProfit) + "원 · " + pct(g.netRate) + "</li>"; }).join("") + '</ul><small class="muted">광고·재고 우선 투자. 상품 다양화.</small></div>';
    h += "</div></div>";
  }

  return h;
}
function bind(root) { var sel = root.querySelector("#cp-m"); if (sel) sel.onchange = function () { v.cpM = sel.value; ERP.render(); }; }
ERP.page({ id: "channel-profit", title: "채널별 수익성", wide: true, roles: ["owner", "accountant"], render: render, bind: bind });
})();
