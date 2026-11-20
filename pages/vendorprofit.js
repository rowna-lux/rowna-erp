/* 메뉴: 분석 › 매입처별 수익성 (대표님 요청 2026-11-21)
   공급처(오케이몰·수고개·열무·백화점·크림 등)별 매입·회전·마진 비교 — 어느 공급처가 돈 되는지 */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, esc = U.esc, won = U.won, pct = U.pct, num = U.num, v = ERP.view;

function months() { var m = {}; ERP.list("purchases").forEach(function (p) { if (p.date) m[p.date.slice(0, 7)] = 1; }); return Object.keys(m).sort().reverse(); }

function normVendor(v) {
  var s = String(v || "").trim(); if (!s) return "(미지정)";
  /* 공급처 이름 정리 — 괄호 안 설명 제거, 유사 이름 통합 */
  var m = s.match(/([가-힣A-Za-z0-9·]+)/); var base = m ? m[1] : s;
  if (/오케이몰|렉스몬드|OKMALL/i.test(s)) return "오케이몰(렉스몬드)";
  if (/수고개|하이엔드부티크/i.test(s)) return "수고개(하이엔드부티크)";
  if (/열무/i.test(s)) return "열무";
  if (/크림|KREAM/i.test(s)) return "크림";
  if (/신세계|롯데백화점|현대백|백화점/i.test(s)) return "백화점";
  if (/밀라노|부티크|이탈리아/i.test(s)) return "해외 부티크";
  return base;
}

function groups() {
  var sMap = {}; ERP.list("sales").forEach(function (s) { sMap[s.id] = s; });
  var G = {}, today = U.today();
  ERP.list("purchases").forEach(function (p) {
    if (v.vpM && (p.date || "").slice(0, 7) !== v.vpM) return;
    var k = normVendor(p.vendor);
    var g = G[k] = G[k] || { key: k, n: 0, total: 0, effTotal: 0, inStock: 0, inStockVal: 0, sold: 0, soldVal: 0, cancelled: 0, margin: 0, marginN: 0, turnDays: 0, turnN: 0, oldestStock: "" };
    g.n++;
    var cost = num(p.unitCost), eff = num(p.effectiveUnitCost) || cost;
    g.total += cost; g.effTotal += eff;
    if (p.status === "cancelled") { g.cancelled++; return; }
    if (p.status === "in_stock") {
      g.inStock++; g.inStockVal += eff;
      if (p.date && (!g.oldestStock || p.date < g.oldestStock)) g.oldestStock = p.date;
    } else if (p.status === "sold" && p.soldSaleId) {
      g.sold++; g.soldVal += eff;
      var sale = sMap[p.soldSaleId];
      if (sale) {
        var d = ERP.derive(sale);
        if (d.hasCost) { g.margin += d.margin; g.marginN++; }
        if (sale.date && p.date) {
          var days = Math.round((Date.parse(sale.date) - Date.parse(p.date)) / 864e5);
          if (days >= 0 && days < 1000) { g.turnDays += days; g.turnN++; }
        }
      }
    }
  });
  return Object.values(G).map(function (g) {
    g.sellRate = (g.sold + g.inStock + g.cancelled) ? g.sold / (g.sold + g.inStock + g.cancelled) : 0;
    g.avgTurn = g.turnN ? Math.round(g.turnDays / g.turnN) : null;
    g.avgMargin = g.marginN ? Math.round(g.margin / g.marginN) : null;
    g.avgMarginPer = g.marginN && g.soldVal ? g.margin / g.soldVal : null;  /* 매입액 대비 마진율 */
    g.stockAge = g.oldestStock ? Math.round((Date.parse(U.today()) - Date.parse(g.oldestStock)) / 864e5) : null;
    return g;
  }).sort(function (a, b) { return b.total - a.total; });
}

function render() {
  var ms = months(); if (!v.vpM) v.vpM = "";
  var G = groups().filter(function (g) { return g.n > 0; });
  var total = G.reduce(function (a, g) { return { n: a.n + g.n, total: a.total + g.total, sold: a.sold + g.sold, inStock: a.inStock + g.inStock, margin: a.margin + g.margin, inStockVal: a.inStockVal + g.inStockVal }; }, { n: 0, total: 0, sold: 0, inStock: 0, margin: 0, inStockVal: 0 });
  var h = '<div class="head"><div><h1>매입처별 수익성 분석</h1><p>공급처마다 회전·마진 달라요. 어느 공급처에 집중할지, 어느 공급처 줄일지 판단.</p></div><div class="tools"><select class="ctl" id="vp-m"><option value="">전체 기간</option>' + ms.map(function (m) { return "<option" + (m === v.vpM ? " selected" : "") + ">" + m + "</option>"; }).join("") + "</select></div></div>";
  h += '<div class="tiles">' +
    ERP.tile("전체 매입 건수", total.n + "건", won(total.total) + "원") +
    ERP.tile("판매 완료", total.sold + "건", (total.n ? (total.sold / total.n * 100).toFixed(0) : 0) + "% 전환") +
    ERP.tile("재고 남음", total.inStock + "건", won(total.inStockVal) + "원 묶임") +
    ERP.tile("판매 마진 합계", won(total.margin) + "원", "원가 입력된 판매 기준") + "</div>";

  h += '<div class="panel"><h2>💰 공급처별 수익성 (매입액순)</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>공급처</th><th class="r">매입</th><th class="r">매입액</th><th class="r">판매</th><th class="r">재고</th><th class="r">취소</th><th class="r">판매 전환율</th><th class="r">평균 회전일</th><th class="r">판매당 마진</th><th class="r">매입가 대비 마진율</th><th class="r">재고 묶인 돈</th></tr></thead><tbody>' +
    G.map(function (g, i) {
      var rateCls = g.sellRate >= 0.7 ? "p-good" : g.sellRate < 0.3 ? "neg" : "";
      var turnCls = g.avgTurn != null && g.avgTurn > 60 ? "neg" : g.avgTurn != null && g.avgTurn < 30 ? "p-good" : "";
      var marCls = g.avgMarginPer != null && g.avgMarginPer < 0 ? "neg" : g.avgMarginPer != null && g.avgMarginPer >= 0.3 ? "p-good" : "";
      var oldCls = g.stockAge != null && g.stockAge > 90 ? "neg" : "";
      return "<tr><td>" + (i + 1) + "</td><td><b>" + esc(g.key) + "</b>" + (g.stockAge != null && g.stockAge > 90 ? '<br><small class="neg">최오래 재고 ' + g.stockAge + '일</small>' : "") + '</td><td class="r num">' + g.n + '</td><td class="r num">' + won(g.total) + '</td><td class="r num">' + g.sold + '</td><td class="r num">' + g.inStock + '</td><td class="r num">' + (g.cancelled || "-") + '</td><td class="r num ' + rateCls + '"><b>' + pct(g.sellRate) + '</b></td><td class="r num ' + turnCls + '">' + (g.avgTurn != null ? g.avgTurn + "일" : "-") + '</td><td class="r num">' + (g.avgMargin != null ? won(g.avgMargin) : "-") + '</td><td class="r num ' + marCls + '">' + (g.avgMarginPer != null ? pct(g.avgMarginPer) : "-") + '</td><td class="r num ' + oldCls + '">' + won(g.inStockVal) + "</td></tr>";
    }).join("") + "</tbody></table></div><p class=\"note\">판매 전환율 70%+ 녹색, 30% 미만 빨강 · 평균 회전일 30일 미만 녹색, 60일+ 빨강 · 매입가 대비 마진율 30%+ 녹색, 마이너스 빨강.</p></div>";

  /* 액션 아이템 */
  var bad = G.filter(function (g) { return g.n >= 3 && g.sellRate < 0.3; });
  var slow = G.filter(function (g) { return g.avgTurn != null && g.avgTurn > 60 && g.marginN >= 2; });
  var star = G.filter(function (g) { return g.avgMarginPer != null && g.avgMarginPer >= 0.3 && g.marginN >= 3; }).sort(function (a, b) { return b.margin - a.margin; });
  if (bad.length || slow.length || star.length) {
    h += '<div class="panel"><h2>🎯 액션 아이템</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px">';
    if (bad.length) h += '<div><b class="neg">⚠ 판매 안 되는 공급처 (' + bad.length + '개, 전환율 30% 미만)</b><ul>' + bad.map(function (g) { return "<li>" + esc(g.key) + " · 매입 " + g.n + "건 중 " + g.sold + "건만 팔림</li>"; }).join("") + '</ul><small class="muted">상품 선별 더 까다롭게. 공급처와 가격 재협상.</small></div>';
    if (slow.length) h += '<div><b class="hl">🐢 느리게 팔리는 공급처 (평균 회전 60일+)</b><ul>' + slow.slice(0, 5).map(function (g) { return "<li>" + esc(g.key) + " · 평균 " + g.avgTurn + "일</li>"; }).join("") + '</ul><small class="muted">가격 재조정 or 할인 판매 전환 검토.</small></div>';
    if (star.length) h += '<div><b class="p-good">⭐ 효자 공급처 (매입가 대비 30%+ 마진)</b><ul>' + star.slice(0, 5).map(function (g) { return "<li>" + esc(g.key) + " · 마진 " + won(g.margin) + "원 · " + pct(g.avgMarginPer) + "</li>"; }).join("") + '</ul><small class="muted">매입량 늘리기. 독점 계약 고려.</small></div>';
    h += "</div></div>";
  }

  return h;
}
function bind(root) { var sel = root.querySelector("#vp-m"); if (sel) sel.onchange = function () { v.vpM = sel.value; ERP.render(); }; }
ERP.page({ id: "vendor-profit", title: "매입처별 수익성", wide: true, roles: ["owner", "accountant"], render: render, bind: bind });
})();
