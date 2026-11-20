/* 메뉴: 분석 › 반품률 (대표님 요청 2026-11-20)
   상품(itemCode)별 반품률 — 반품 많은 상품 = 상세페이지 개선 or 접기 */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, esc = U.esc, won = U.won, pct = U.pct, num = U.num, v = ERP.view;

function groups() {
  var G = {};
  /* 1) 매출: 상품별 주문 수 */
  ERP.list("sales").forEach(function (s) {
    if (ERP.excluded(s)) return; if (v.rrM && (s.date || "").slice(0, 7) !== v.rrM) return;
    var key = (s.itemCode || s.productName || "").trim() || s.id, g = G[key] = G[key] || { key: key, code: s.itemCode || "", name: s.productName || "", brand: s.brand || "", orders: 0, rev: 0, returns: 0, loss: 0, sids: {} };
    g.orders++; g.rev += num(s.salePrice); g.sids[s.id] = 1;
  });
  /* 2) 반품: 매출에 연결된 반품만 */
  var sales = {}; ERP.list("sales").forEach(function (s) { sales[s.id] = s; });
  ERP.list("returns").forEach(function (r) {
    if (v.rrM && (r.date || r.returnDate || "").slice(0, 7) !== v.rrM) return;
    var sid = r.saleId || r.sale_id; if (!sid || !sales[sid]) return;
    var s = sales[sid], key = (s.itemCode || s.productName || "").trim() || s.id, g = G[key]; if (!g) return;
    g.returns++; g.loss += num(r.shipCost) - num(r.shipIncome) + num(r.refundLoss);
  });
  return Object.values(G).map(function (g) { g.rate = g.orders ? (g.returns / g.orders) : 0; return g; });
}
function months() { var m = {}; ERP.list("sales").forEach(function (s) { if (s.date) m[s.date.slice(0, 7)] = 1; }); return Object.keys(m).sort().reverse(); }

function tbl(rows) {
  if (!rows.length) return '<p class="muted">데이터 없음</p>';
  return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>상품</th><th class="r">주문</th><th class="r">반품</th><th class="r">반품률</th><th class="r">매출</th><th class="r">반품 손실</th></tr></thead><tbody>' +
    rows.map(function (g, i) {
      var cls = g.rate >= 0.2 ? "neg" : g.rate >= 0.1 ? "hl" : "";
      return "<tr><td>" + (i + 1) + "</td><td>" + esc(g.brand) + " <small>" + esc(g.code || "") + "</small> " + esc((g.name || "").slice(0, 45)) + '</td><td class="r num">' + g.orders + '</td><td class="r num">' + g.returns + '</td><td class="r num ' + cls + '"><b>' + pct(g.rate) + '</b></td><td class="r num">' + won(g.rev) + '</td><td class="r num ' + (g.loss > 0 ? "neg" : "") + '">' + won(g.loss) + "</td></tr>";
    }).join("") +
    "</tbody></table></div>";
}

function render() {
  var ms = months(); if (!v.rrM) v.rrM = "";
  var G = groups(), withOrders = G.filter(function (g) { return g.orders > 0; });
  var overall = { o: 0, r: 0 }; withOrders.forEach(function (g) { overall.o += g.orders; overall.r += g.returns; });
  var topRate = withOrders.filter(function (g) { return g.orders >= 3; }).sort(function (a, b) { return b.rate - a.rate; }).filter(function (g) { return g.rate > 0; }).slice(0, 30);
  var topLoss = withOrders.filter(function (g) { return g.loss > 0; }).sort(function (a, b) { return b.loss - a.loss; }).slice(0, 20);
  var zeroR = withOrders.filter(function (g) { return g.returns === 0 && g.orders >= 5; }).sort(function (a, b) { return b.rev - a.rev; }).slice(0, 20);
  /* 2026-11-21 대표님 요청: 광고 후보 추출 — 반품 없고 매출 중상위 상품 (머스트잇·네이버쇼핑 광고용) */
  var adRev = withOrders.reduce(function (a, g) { return a + g.rev; }, 0) / Math.max(1, withOrders.length);  /* 평균 매출 = 중상위 기준 */
  var adCandidates = withOrders.filter(function (g) { return g.orders >= 3 && g.returns === 0 && g.rev >= adRev; }).sort(function (a, b) { return b.rev - a.rev; }).slice(0, 20);
  var h = '<div class="head"><div><h1>반품률 분석</h1><p>반품 많은 상품 = 상세페이지 개선 or 접기 · 반품 없는 상품 = 안정적 재구매 상품</p></div><div class="tools"><select class="ctl" id="rr-m"><option value="">전체 기간</option>' + ms.map(function (m) { return "<option" + (m === v.rrM ? " selected" : "") + ">" + m + "</option>"; }).join("") + "</select></div></div>";
  h += '<div class="tiles">' + ERP.tile("전체 반품률", (overall.o ? (overall.r / overall.o * 100).toFixed(1) : 0) + "%", overall.r + " / " + overall.o + "건") + ERP.tile("반품률 10% 넘는 상품", topRate.filter(function (g) { return g.rate >= 0.1; }).length + "개", "주문 3건 이상 기준") + ERP.tile("반품 손실 합계", won(withOrders.reduce(function (a, g) { return a + g.loss; }, 0)) + "원", "배송비+환불 등") + ERP.tile("광고 후보 상품", adCandidates.length + "개", "반품 0건 + 매출 중상위 (주문 3건+)") + "</div>";
  h += '<div class="panel"><h2>⚠ 반품률 Top 30 (주문 3건 이상)</h2>' + tbl(topRate) + '<p class="note">반품률 20% 넘으면 빨강. 상세페이지 사이즈·소재·사진 다시 보거나 공급처에 품질 확인 요청.</p></div>';
  h += '<div class="panel"><h2>💸 반품 손실 Top 20</h2>' + tbl(topLoss) + '<p class="note">배송비 왕복·환불 손실 합계 큰 상품. 반품 조건 재검토(수선·반품불가·교환 정책).</p></div>';
  h += '<div class="panel"><h2>⭐ 반품 0건 · 매출 Top 20 (안정 상품)</h2>' + tbl(zeroR) + '<p class="note">주문 5건 이상인데 반품 한 건도 없는 상품. 재구매·광고 집중 대상.</p></div>';
  h += '<div class="panel"><h2>📢 광고 후보 Top 20 (반품 0 + 매출 중상위) <button class="btn pri sm" data-act="rrCsv" style="margin-left:8px">📥 CSV 다운로드</button></h2>' + tbl(adCandidates) + '<p class="note">주문 3건 이상, 반품 한 건도 없고, 매출이 평균 이상인 상품만. 머스트잇 그로스패키지·네이버쇼핑·구글 상품광고 등록할 상품 후보. CSV 눌러 받으면 품번·상품명·매출 포함된 엑셀로 열림.</p></div>';
  return h;
}
function bind(root) { var sel = root.querySelector("#rr-m"); if (sel) sel.onchange = function () { v.rrM = sel.value; ERP.render(); }; }
ERP.acts.rrCsv = function () {
  var G = groups(), withOrders = G.filter(function (g) { return g.orders > 0; });
  var adRev = withOrders.reduce(function (a, g) { return a + g.rev; }, 0) / Math.max(1, withOrders.length);
  var ad = withOrders.filter(function (g) { return g.orders >= 3 && g.returns === 0 && g.rev >= adRev; }).sort(function (a, b) { return b.rev - a.rev; }).slice(0, 20);
  var header = ["순위", "품번", "브랜드", "상품명", "주문수", "총매출", "평균단가"];
  var rows = ad.map(function (g, i) { return [i + 1, g.code || "", g.brand || "", g.name || "", g.orders, g.rev, Math.round(g.rev / g.orders)]; });
  var csv = "﻿" + [header].concat(rows).map(function (r) { return r.map(function (x) { var s = String(x || ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(","); }).join("\n");
  var blob = new Blob([csv], { type: "text/csv;charset=utf-8" }), url = URL.createObjectURL(blob);
  var a = document.createElement("a"); a.href = url; a.download = "광고후보_" + U.today() + ".csv"; a.click(); URL.revokeObjectURL(url);
  ERP.toast(ad.length + "개 상품 CSV 다운로드");
};
ERP.page({ id: "return-rate", title: "반품률 분석", wide: true, roles: ["owner", "accountant"], render: render, bind: bind });
})();
