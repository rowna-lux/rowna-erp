/* 메뉴: 분석 › 크림 보판 수익 (대표님 요청 2026-11-21)
   크림 보판 판매완료/정산완료 건의 매입가 대비 실제 순수익 — 로우나 수익의 핵심 */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, esc = U.esc, won = U.won, pct = U.pct, num = U.num, v = ERP.view;

/* 매칭 로직 — kreamsync.js의 modelHit/sizeHit 재구현 */
function nk(x) { return String(x || "").toLowerCase().replace(/[-\s.]/g, ""); }
function modelHit(a, b) { var A = nk(a); if (A.length < 4) return false; return String(b || "").split("/").map(nk).filter(Boolean).some(function (B) { return A === B || (A.length >= 5 && B.indexOf(A) === 0) || (B.length >= 5 && A.indexOf(B) === 0) || (A.length >= 8 && B.length >= 8 && (A.indexOf(B) >= 0 || B.indexOf(A) >= 0)); }); }
function sizeNorm(s) { return String(s || "").replace(/[\s\-()]/g, "").toLowerCase(); }
function sizeHit(a, b) { var A = sizeNorm(a), B = sizeNorm(b); if (!A || !B) return true; return A === B || A.indexOf(B) >= 0 || B.indexOf(A) >= 0; }
function d8(s) { var m = String(s || "").match(/(\d{2})\/(\d{2})\/(\d{2})/); return m ? "20" + m[1] + "-" + m[2] + "-" + m[3] : ""; }

function findMatch(it) {
  /* 1순위: kream_wholesale (크림 매입 - 도매가 가장 정확) */
  var kw = ERP.list("kream_wholesale").filter(function (r) {
    if (r.decision !== "매입") return false;
    var skuOrModel = r.sku || r.model || "";
    if (!modelHit(skuOrModel, it.model)) return false;
    return !r.size || sizeHit(r.size, it["사이즈"]);
  });
  if (kw.length) {
    var r = kw[0];
    return { kind: "크림 매입", source: r.supplier || "열무", cost: num(r.wholesalePrice), id: r.id, brand: r.brand || "", name: r.name || "", buyDate: (r.extra || {}).buyDate || "" };
  }
  /* 2순위: stock_inventory (로우나 재고) */
  var I = (S.SET.stock_inventory || {}).items || {};
  var hitK = Object.keys(I).filter(function (k) { var s = I[k]; return s && modelHit(s.model, it.model) && sizeHit(s.opt || "", it["사이즈"]); });
  if (hitK.length) {
    var kk = hitK[0], s = I[kk];
    var lot = (s.lots || []).find(function (l) { return !l.out && num(l.price); }) || (s.lots || [])[0];
    return { kind: "로우나 재고", source: "재고 실사", cost: lot ? num(lot.price) : 0, id: kk, brand: s.brand || "", name: s.name || "", buyDate: lot ? (lot.date || "") : "" };
  }
  return null;
}

function rows() {
  var ks = (S.SET.kream_sync || {}).items || {};
  var items = Object.values(ks).filter(function (x) { return x.st === "정산완료" || x.st === "판매완료"; });
  return items.map(function (it) {
    var m = findMatch(it);
    var revenue = num(it["정산금액"]);
    var cost = m ? m.cost : 0;
    var profit = m && cost ? revenue - cost : null;
    var rate = (profit != null && revenue) ? profit / revenue : null;
    return {
      date: d8(it["정산일"]) || "",
      brand: m ? m.brand : "",
      model: it.model || "",
      size: it["사이즈"] || "",
      name: m ? m.name : (it.name || ""),
      revenue: revenue, cost: cost, profit: profit, rate: rate,
      match: !!m, source: m ? m.kind : "매칭안됨", supplier: m ? m.source : "-",
      kreamId: it.id
    };
  }).sort(function (a, b) { return b.date.localeCompare(a.date); });
}

function months(R) { var m = {}; R.forEach(function (r) { if (r.date) m[r.date.slice(0, 7)] = 1; }); return Object.keys(m).sort().reverse(); }

function render() {
  var R = rows(), ms = months(R);
  if (!v.kpM) v.kpM = "";
  var matched = R.filter(function (r) { return r.match && r.cost > 0; });
  var unmatched = R.filter(function (r) { return !r.match || !r.cost; });
  var mRows = v.kpM ? matched.filter(function (r) { return r.date.slice(0, 7) === v.kpM; }) : matched;
  var uRows = v.kpM ? unmatched.filter(function (r) { return r.date.slice(0, 7) === v.kpM; }) : unmatched;
  var totalRev = mRows.reduce(function (a, r) { return a + r.revenue; }, 0);
  var totalCost = mRows.reduce(function (a, r) { return a + r.cost; }, 0);
  var totalProfit = totalRev - totalCost;
  var totalRate = totalRev ? totalProfit / totalRev : 0;
  /* 월별 */
  var byM = {}; matched.forEach(function (r) { var m = r.date.slice(0, 7); if (!m) return; byM[m] = byM[m] || { rev: 0, cost: 0, n: 0 }; byM[m].rev += r.revenue; byM[m].cost += r.cost; byM[m].n++; });
  /* 공급처별 */
  var bySup = {}; mRows.forEach(function (r) { var s = r.supplier || "-"; bySup[s] = bySup[s] || { rev: 0, cost: 0, n: 0 }; bySup[s].rev += r.revenue; bySup[s].cost += r.cost; bySup[s].n++; });
  /* 상품별 Top 10 효자/적자 */
  var byProd = {}; matched.forEach(function (r) { var k = r.model + "|" + r.size; byProd[k] = byProd[k] || { name: (r.brand || "") + " " + (r.name || ""), model: r.model, size: r.size, rev: 0, cost: 0, profit: 0, n: 0 }; byProd[k].rev += r.revenue; byProd[k].cost += r.cost; byProd[k].profit += (r.profit || 0); byProd[k].n++; });
  var prodArr = Object.values(byProd);
  var topProfit = prodArr.slice().sort(function (a, b) { return b.profit - a.profit; }).slice(0, 10);
  var topLoss = prodArr.filter(function (x) { return x.profit < 0; }).sort(function (a, b) { return a.profit - b.profit; }).slice(0, 10);

  var h = '<div class="head"><div><h1>크림 보판 수익</h1><p>크림 보판 판매완료 건의 <b>매입가 대비 실제 순수익</b>. 로우나 핵심 수익 지표.</p></div><div class="tools"><select class="ctl" id="kp-m"><option value="">전체 기간</option>' + ms.map(function (m) { return "<option" + (m === v.kpM ? " selected" : "") + ">" + m + "</option>"; }).join("") + "</select></div></div>";

  /* 타일 */
  h += '<div class="tiles">' +
    ERP.tile("정산완료 (매칭)", matched.length + "건", "매입 매칭됨") +
    ERP.tile("정산완료 (매칭 안됨)", unmatched.length + "건", "매입 입력 필요", unmatched.length > 0 ? "hl" : "") +
    ERP.tile("총 매출 (정산)", won(totalRev) + "원", v.kpM || "전체") +
    ERP.tile("순수익", won(totalProfit) + "원", pct(totalRate) + " 수익률", totalProfit < 0 ? "" : "hl") + "</div>";

  /* 월별 */
  if (Object.keys(byM).length) {
    h += '<div class="panel"><h2>📅 월별 수익</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>월</th><th class="r">건수</th><th class="r">매출</th><th class="r">매입가</th><th class="r">순수익</th><th class="r">수익률</th></tr></thead><tbody>' +
      Object.keys(byM).sort().reverse().map(function (m) { var x = byM[m], p = x.rev - x.cost, r = x.rev ? p / x.rev : 0; return '<tr><td class="num">' + m + '</td><td class="r num">' + x.n + '</td><td class="r num">' + won(x.rev) + '</td><td class="r num">' + won(x.cost) + '</td><td class="r num ' + (p < 0 ? "neg" : "p-good") + '"><b>' + won(p) + '</b></td><td class="r num">' + pct(r) + "</td></tr>"; }).join("") +
      "</tbody></table></div></div>";
  }

  /* 공급처별 */
  if (Object.keys(bySup).length) {
    h += '<div class="panel"><h2>🏷 공급처별 수익</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>공급처</th><th class="r">건수</th><th class="r">매출</th><th class="r">매입가</th><th class="r">순수익</th><th class="r">수익률</th></tr></thead><tbody>' +
      Object.keys(bySup).sort(function (a, b) { return (bySup[b].rev - bySup[b].cost) - (bySup[a].rev - bySup[a].cost); }).map(function (s) { var x = bySup[s], p = x.rev - x.cost, r = x.rev ? p / x.rev : 0; return '<tr><td><b>' + esc(s) + '</b></td><td class="r num">' + x.n + '</td><td class="r num">' + won(x.rev) + '</td><td class="r num">' + won(x.cost) + '</td><td class="r num ' + (p < 0 ? "neg" : "p-good") + '"><b>' + won(p) + '</b></td><td class="r num">' + pct(r) + "</td></tr>"; }).join("") +
      "</tbody></table></div></div>";
  }

  /* Top 효자 / 적자 상품 */
  if (topProfit.length || topLoss.length) {
    h += '<div class="panel" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:12px">';
    if (topProfit.length) h += '<div><h2 style="margin:0 0 8px">⭐ 효자 상품 Top 10 (순수익순)</h2><table class="tbl"><thead><tr><th>상품</th><th class="r">건수</th><th class="r">순수익</th></tr></thead><tbody>' + topProfit.map(function (x) { return '<tr><td>' + esc(x.name.slice(0, 30)) + ' <small>' + esc(x.size) + '</small></td><td class="r num">' + x.n + '</td><td class="r num p-good"><b>' + won(x.profit) + '</b></td></tr>'; }).join("") + "</tbody></table></div>";
    if (topLoss.length) h += '<div><h2 style="margin:0 0 8px">💸 적자 상품 Top 10 (손실순)</h2><table class="tbl"><thead><tr><th>상품</th><th class="r">건수</th><th class="r">순손익</th></tr></thead><tbody>' + topLoss.map(function (x) { return '<tr><td>' + esc(x.name.slice(0, 30)) + ' <small>' + esc(x.size) + '</small></td><td class="r num">' + x.n + '</td><td class="r num neg"><b>' + won(x.profit) + '</b></td></tr>'; }).join("") + "</tbody></table></div>";
    h += "</div>";
  }

  /* 건별 상세 */
  h += '<div class="panel"><h2>📋 정산완료 상세 (' + mRows.length + '건)</h2>' + (mRows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>정산일</th><th>상품</th><th>사이즈</th><th>출처</th><th class="r">정산금액</th><th class="r">매입가</th><th class="r">순수익</th><th class="r">수익률</th></tr></thead><tbody>' +
    mRows.map(function (r) { var cls = r.profit < 0 ? "neg" : r.profit > 0 ? "p-good" : ""; return '<tr><td class="num">' + esc(r.date) + '</td><td>' + esc(((r.brand || "") + " " + (r.name || "")).slice(0, 40)) + ' <small class="num muted">' + esc(r.model) + '</small></td><td>' + esc(r.size) + '</td><td><small class="pill">' + esc(r.source) + ' · ' + esc(r.supplier) + '</small></td><td class="r num">' + won(r.revenue) + '</td><td class="r num">' + won(r.cost) + '</td><td class="r num ' + cls + '"><b>' + won(r.profit || 0) + '</b></td><td class="r num ' + cls + '">' + (r.rate != null ? pct(r.rate) : "-") + "</td></tr>"; }).join("") +
    "</tbody></table></div>" : '<p class="muted">선택 기간에 매칭된 정산완료 건이 없어요.</p>') + "</div>";

  /* 매입 연결 안된 것 */
  if (uRows.length) {
    h += '<div class="panel"><h2>⚠ 매입 연결 안됨 (' + uRows.length + '건) · 수익 계산 못 함</h2><p class="note">정산완료됐는데 크림 매입·로우나 재고 어디에서도 매칭 못 찾았어요. 품번·사이즈 표기 다르거나 매입 기록 자체가 없어요.<br>→ 크림 매입에서 <b>품번(SKU)을 크림 모델번호와 같게</b> 고치거나, 로우나 재고에 재고 추가하면 자동 매칭돼요.</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>정산일</th><th>모델번호</th><th>상품명</th><th>사이즈</th><th class="r">정산금액</th></tr></thead><tbody>' +
      uRows.map(function (r) { return '<tr><td class="num">' + esc(r.date) + '</td><td class="num"><b>' + esc(r.model) + '</b></td><td>' + esc(r.name) + '</td><td>' + esc(r.size) + '</td><td class="r num">' + won(r.revenue) + "</td></tr>"; }).join("") +
      "</tbody></table></div></div>";
  }

  return h;
}
function bind(root) { var sel = root.querySelector("#kp-m"); if (sel) sel.onchange = function () { v.kpM = sel.value; ERP.render(); }; }
ERP.page({ id: "kream-profit", title: "크림 보판 수익", wide: true, roles: ["owner", "accountant"], render: render, bind: bind });
})();
