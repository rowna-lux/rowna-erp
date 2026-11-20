/* 메뉴: 분석 › 재구매 고객 (대표님 요청 2026-11-21)
   2회 이상 구매한 고객 리스트 — CRM·광고 리타겟팅·단골 관리에 사용 */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, esc = U.esc, won = U.won, num = U.num, v = ERP.view;

function keyOf(s) {
  var c = (s.extra && s.extra.customer) || {};
  var o = (c.orderer || "").trim(), r = (c.receiver || "").trim();
  return o || r || ""; /* 주문자 우선 */
}
function platName(id) { var p = (S.PLATS || []).find(function (x) { return x.id === id; }); return p ? p.name : ""; }

function groups() {
  var G = {}, today = U.today();
  ERP.list("sales").forEach(function (s) {
    if (ERP.excluded(s)) return;
    var k = keyOf(s); if (!k) return;
    var g = G[k] = G[k] || { key: k, orders: 0, rev: 0, items: {}, plats: {}, first: "9999", last: "", receivers: {}, lastProd: "" };
    g.orders++; g.rev += num(s.salePrice);
    var nm = (s.productName || "").trim() || "상품"; g.items[nm] = (g.items[nm] || 0) + 1;
    var pl = s.platformId || ""; if (pl) g.plats[pl] = (g.plats[pl] || 0) + 1;
    var dt = (s.date || "").slice(0, 10);
    if (dt && dt < g.first) g.first = dt;
    if (dt && dt > g.last) { g.last = dt; g.lastProd = nm; }
    var c = (s.extra && s.extra.customer) || {}, r = (c.receiver || "").trim();
    if (r) g.receivers[r] = (g.receivers[r] || 0) + 1;
  });
  return Object.values(G).map(function (g) {
    g.avg = Math.round(g.rev / g.orders);
    var topItem = Object.entries(g.items).sort(function (a, b) { return b[1] - a[1]; })[0];
    g.topItem = topItem ? topItem[0] : "";
    g.topItemN = topItem ? topItem[1] : 0;
    var topPlat = Object.entries(g.plats).sort(function (a, b) { return b[1] - a[1]; })[0];
    g.topPlat = topPlat ? platName(topPlat[0]) : "";
    g.dsinceLast = g.last ? Math.round((Date.parse(U.today()) - Date.parse(g.last)) / 864e5) : null;
    g.dspan = (g.first !== "9999" && g.last) ? Math.round((Date.parse(g.last) - Date.parse(g.first)) / 864e5) : 0;
    return g;
  });
}

function tbl(rows, title, note) {
  if (!rows.length) return '<div class="panel"><h2>' + esc(title) + '</h2><p class="muted">데이터 없음</p></div>';
  return '<div class="panel"><h2>' + esc(title) + '</h2>' + (note ? '<p class="note" style="margin-top:0">' + esc(note) + '</p>' : '') +
    '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>고객</th><th class="r">주문</th><th class="r">총 구매액</th><th class="r">평균</th><th>자주 사는 상품</th><th>주 채널</th><th class="r">첫 구매 → 최근</th><th class="r">마지막</th></tr></thead><tbody>' +
    rows.map(function (g, i) {
      var reorderCls = g.dsinceLast != null && g.dsinceLast > 90 ? "neg" : g.dsinceLast != null && g.dsinceLast <= 30 ? "p-good" : "";
      return "<tr><td>" + (i + 1) + "</td><td><b>" + esc(g.key) + "</b>" + (Object.keys(g.receivers).length > 1 ? '<br><small class="muted">받는분 ' + Object.keys(g.receivers).length + '명</small>' : "") + '</td><td class="r num"><b>' + g.orders + '</b></td><td class="r num"><b>' + won(g.rev) + '</b></td><td class="r num">' + won(g.avg) + '</td><td>' + esc((g.topItem || "").slice(0, 35)) + (g.topItemN > 1 ? ' <small class="muted">×' + g.topItemN + '</small>' : "") + '</td><td>' + esc(g.topPlat || "-") + '</td><td class="r num"><small>' + (g.dspan ? g.dspan + "일" : "-") + '</small></td><td class="r num ' + reorderCls + '">' + (g.dsinceLast != null ? "D+" + g.dsinceLast : "-") + "</td></tr>";
    }).join("") + "</tbody></table></div></div>";
}

function render() {
  var G = groups();
  var repeat = G.filter(function (g) { return g.orders >= 2; });
  var totalCust = G.length, totalOrd = G.reduce(function (a, g) { return a + g.orders; }, 0), repRev = repeat.reduce(function (a, g) { return a + g.rev; }, 0), totalRev = G.reduce(function (a, g) { return a + g.rev; }, 0);
  var vip = repeat.slice().sort(function (a, b) { return b.rev - a.rev; }).slice(0, 30);
  var frequent = repeat.slice().sort(function (a, b) { return b.orders - a.orders; }).slice(0, 30);
  var churn = repeat.filter(function (g) { return g.dsinceLast != null && g.dsinceLast > 90 && g.dsinceLast < 365; }).sort(function (a, b) { return b.rev - a.rev; }).slice(0, 20);
  var h = '<div class="head"><div><h1>재구매 고객 분석</h1><p>2회 이상 산 고객 — 단골 찾고, 이탈 막고, 재구매 상품 찾기</p></div></div>';
  h += '<div class="tiles">' +
    ERP.tile("재구매 고객", repeat.length + "명", "전체 고객 " + totalCust + "명 중 " + (totalCust ? Math.round(repeat.length / totalCust * 100) : 0) + "%") +
    ERP.tile("재구매 매출 비중", won(repRev) + "원", "전체 " + won(totalRev) + "원 중 " + (totalRev ? Math.round(repRev / totalRev * 100) : 0) + "%") +
    ERP.tile("재구매 평균 주문수", (repeat.length ? (repeat.reduce(function (a, g) { return a + g.orders; }, 0) / repeat.length).toFixed(1) : 0) + "회", "단골 1명이 몇 번 샀나") +
    ERP.tile("이탈 위험 (90일+)", churn.length + "명", "재구매였는데 최근 안 산 고객") + "</div>";
  h += tbl(vip, "💎 VIP 고객 Top 30 (총 구매액 순)", "매출 많이 올려 준 단골. 신상 입고·할인 알림·감사 메시지 대상.");
  h += tbl(frequent, "🔁 자주 사는 고객 Top 30 (주문 횟수 순)", "횟수 많은 단골. 구독·적립·쿠폰 같은 로열티 프로그램 후보.");
  h += tbl(churn, "⚠ 이탈 위험 고객 Top 20 (90일+ 300일 이내)", "재구매 고객이었는데 90일 넘게 안 샀어요. 복귀 쿠폰·신상 소식 보내는 게 효율적.");
  return h;
}
ERP.page({ id: "repeat-customer", title: "재구매 고객 분석", wide: true, roles: ["owner", "accountant"], render: render, bind: function () {} });
})();
