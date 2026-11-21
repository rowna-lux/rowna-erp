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

/* FIFO lot 할당 추적용 — 호출 전 resetAlloc()로 리셋 */
var _usedLots = {}, _usedKw = {};
function resetAlloc() { _usedLots = {}; _usedKw = {}; }
function findMatch(it) {
  /* 1순위: kream_wholesale (크림 매입 - 도매가 가장 정확). 여러 건 매칭되면 FIFO (매입일 오래된 순) */
  var kw = ERP.list("kream_wholesale").filter(function (r) {
    if (r.decision !== "매입") return false;
    var skuOrModel = r.sku || r.model || "";
    if (!modelHit(skuOrModel, it.model)) return false;
    return !r.size || sizeHit(r.size, it["사이즈"]);
  }).sort(function (a, b) { return String((a.extra || {}).buyDate || "").localeCompare(String((b.extra || {}).buyDate || "")); });
  var kwAvail = kw.filter(function (r) { return !_usedKw[r.id]; });
  if (kwAvail.length) {
    var r = kwAvail[0]; _usedKw[r.id] = true;
    return { kind: "크림 매입", source: r.supplier || "열무", cost: num(r.wholesalePrice), id: r.id, brand: r.brand || "", name: r.name || "", buyDate: (r.extra || {}).buyDate || "" };
  }
  /* 2순위: stock_inventory (로우나 재고). lot이 여러 개면 FIFO 할당 */
  var I = (S.SET.stock_inventory || {}).items || {};
  var hitK = Object.keys(I).filter(function (k) { var s = I[k]; return s && modelHit(s.model, it.model) && sizeHit(s.opt || "", it["사이즈"]); });
  if (hitK.length) {
    var kk = hitK[0], s = I[kk];
    var lots = (s.lots || []).map(function (l, i) { return { lot: l, idx: i }; }).filter(function (x) { return !x.lot.out && num(x.lot.price); });
    lots.sort(function (a, b) { return String(a.lot.date || "").localeCompare(String(b.lot.date || "")); });
    _usedLots[kk] = _usedLots[kk] || {};
    var picked = lots.find(function (x) { return !_usedLots[kk][x.idx]; }) || lots[0];
    if (picked) { _usedLots[kk][picked.idx] = true; return { kind: "로우나 재고", source: "재고 실사", cost: num(picked.lot.price), id: kk, brand: s.brand || "", name: s.name || "", buyDate: picked.lot.date || "" }; }
  }
  /* kw/stock 둘 다 할당 끝났으면 재할당 없이 가장 오래된 (가장 비싼 리스크) 반환 */
  if (kw.length) { var r2 = kw[0]; return { kind: "크림 매입", source: r2.supplier || "열무", cost: num(r2.wholesalePrice), id: r2.id, brand: r2.brand || "", name: r2.name || "", buyDate: (r2.extra || {}).buyDate || "" }; }
  return null;
}

function rows() {
  resetAlloc();  /* lot 할당 리셋 */
  var ks = (S.SET.kream_sync || {}).items || {};
  /* 정산일/상태 오래된 순으로 할당 (FIFO) */
  var items = Object.values(ks).filter(function (x) { return x.st === "정산완료" || x.st === "판매완료"; }).sort(function (a, b) { return (d8(a["정산일"]) || "").localeCompare(d8(b["정산일"]) || ""); });
  return items.map(function (it) {
    var m = findMatch(it);
    var revenue = num(it["정산금액"]);  /* 판매완료는 0 (정산 전) */
    var cost = m ? m.cost : 0;
    var isSettled = it.st === "정산완료" && revenue > 0;
    var profit = isSettled && m && cost ? revenue - cost : null;
    var rate = (profit != null && revenue) ? profit / revenue : null;
    return {
      status: it.st,
      date: d8(it["정산일"]) || "",
      brand: m ? m.brand : "",
      model: it.model || "",
      size: it["사이즈"] || "",
      name: m ? m.name : (it.name || ""),
      revenue: revenue, cost: cost, profit: profit, rate: rate,
      match: !!m, source: m ? m.kind : "매칭안됨", supplier: m ? m.source : "-",
      kreamId: it.id,
      isSettled: isSettled
    };
  }).sort(function (a, b) { return b.date.localeCompare(a.date); });
}

/* 크림 수수료 — Level 1 기본 6% + 2,500원 (시세 변동 있을 수 있음, 앱 설정 kream_fee_rate/kream_fee_cap 우선) */
function kreamFee(sellPrice) {
  var rate = num(S.SET.kream_fee_rate) || 0.06;
  var base = 2500;
  var fee = Math.floor(sellPrice * rate) + base;
  var cap = num(S.SET.kream_fee_cap); if (cap && fee > cap) fee = cap;
  return fee;
}
/* 보관 중 · 판매 중 (아직 안 팔린 보판) - 예상 수익.
   중요: rows() 다음에 호출될 것이라 가정 - rows()가 정산/판매완료에 lot을 먼저 할당하고
   남은 lot을 보관중/판매중에 할당. 리셋하지 않음. */
function liveRows() {
  var ks = (S.SET.kream_sync || {}).items || {};
  /* 판매중/보관중도 오래된 순 (크림 ID 기준) */
  var items = Object.values(ks).filter(function (x) { return /^(판매 중|보관|창고|입고|검수|발송|신청)/.test(x.st || ""); }).sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); });
  return items.map(function (it) {
    var m = findMatch(it);
    var hope = num(it["판매 희망가"]) || 0;
    var recent = num(it["최근 거래가"]) || 0;
    var instant = num(it["즉시 판매가"]) || 0;
    var cost = m ? m.cost : 0;
    /* 예상 정산 = 희망가 - 크림 수수료 */
    var settleEst = hope ? hope - kreamFee(hope) : null;
    var profitEst = (m && cost && settleEst != null) ? settleEst - cost : null;
    var breakEven = cost ? cost + kreamFee(cost) + Math.ceil((cost * 0.065 + 2500) * 0.1) : null;  /* 손해 안 보는 최저 희망가 (대략) */
    return {
      status: it.st,
      model: it.model || "",
      size: it["사이즈"] || "",
      name: m ? m.name : (it.name || ""),
      brand: m ? m.brand : "",
      cost: cost,
      hope: hope,
      recent: recent,
      instant: instant,
      settleEst: settleEst,
      profitEst: profitEst,
      breakEven: breakEven,
      match: !!m,
      source: m ? m.source : "-",
      kreamId: it.id,
      /* 희망가가 매입가보다 낮으면 위험! */
      risk: m && cost && hope > 0 && (settleEst != null) && settleEst < cost
    };
  }).sort(function (a, b) { return (b.risk ? 1 : 0) - (a.risk ? 1 : 0) || b.cost - a.cost; });
}

function months(R) { var m = {}; R.forEach(function (r) { if (r.date) m[r.date.slice(0, 7)] = 1; }); return Object.keys(m).sort().reverse(); }

function render() {
  var R = rows(), ms = months(R);
  if (!v.kpM) v.kpM = "";
  /* 정산완료 (실제 수익 계산 가능) */
  var settled = R.filter(function (r) { return r.isSettled; });
  var settledMatched = settled.filter(function (r) { return r.match && r.cost > 0; });
  var settledUnmatched = settled.filter(function (r) { return !r.match || !r.cost; });
  /* 판매완료 (정산 대기 — revenue 아직 없음) */
  var pending = R.filter(function (r) { return !r.isSettled; });
  var matched = settledMatched;  /* 호환용 */
  var mRows = v.kpM ? matched.filter(function (r) { return r.date.slice(0, 7) === v.kpM; }) : matched;
  var uRows = v.kpM ? settledUnmatched.filter(function (r) { return r.date.slice(0, 7) === v.kpM; }) : settledUnmatched;
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
    ERP.tile("정산완료", settled.length + "건", "매칭 " + settledMatched.length + " · 매칭안됨 " + settledUnmatched.length) +
    ERP.tile("판매완료 (정산 대기)", pending.length + "건", "크림이 정산 전 상태") +
    ERP.tile("총 매출 (정산)", won(totalRev) + "원", v.kpM || "전체") +
    ERP.tile("순수익", won(totalProfit) + "원", pct(totalRate) + " 수익률", totalProfit >= 0 ? "hl" : "") + "</div>";

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

  /* 📦 보관중/판매중 - 예상 수익 + 위험 알림 (매입가 ↔ 희망가 비교) */
  var live = liveRows();
  if (live.length) {
    var risky = live.filter(function (r) { return r.risk; });
    var totalCostLive = live.filter(function (r) { return r.cost; }).reduce(function (a, r) { return a + r.cost; }, 0);
    var totalProfitEstLive = live.filter(function (r) { return r.profitEst != null; }).reduce(function (a, r) { return a + r.profitEst; }, 0);
    h += '<div class="panel"><h2>📦 보관중·판매중 ' + live.length + '건 · 매입 묶인 돈 ' + won(totalCostLive) + '원 · 예상 순수익 ' + (totalProfitEstLive >= 0 ? '+' : '') + won(totalProfitEstLive) + '원</h2>';
    if (risky.length) h += '<p class="note" style="background:rgba(255,77,109,.1);padding:8px;border-radius:6px;color:#ff4d6d"><b>⚠ 희망가가 매입가보다 낮은 위험 상품 ' + risky.length + '건</b> — 지금 팔면 손해! 희망가 올리거나 보류.</p>';
    h += '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>상태</th><th>상품</th><th>사이즈</th><th>출처</th><th class="r">매입가</th><th class="r">최근 거래가</th><th class="r">희망가</th><th class="r">예상 정산 (−수수료)</th><th class="r">예상 순수익</th><th class="r">최저 희망가 (손해無)</th></tr></thead><tbody>' +
      live.slice(0, 80).map(function (r) {
        var stCls = /판매 중/.test(r.status) ? "p-good" : "";
        var pcls = r.profitEst == null ? "" : r.profitEst < 0 ? "neg" : r.profitEst > 0 ? "p-good" : "";
        var hopeCls = r.risk ? "neg" : "";
        return '<tr' + (r.risk ? ' style="background:rgba(255,77,109,.06)"' : '') + '><td><span class="pill ' + stCls + '">' + esc(r.status) + '</span></td><td>' + esc(((r.brand || "") + " " + (r.name || "")).slice(0, 35)) + ' <small class="num muted">' + esc(r.model) + '</small></td><td>' + esc(r.size) + '</td><td><small>' + esc(r.source) + '</small></td><td class="r num"><b>' + (r.cost ? won(r.cost) : '<span class="pill p-crit" style="font-size:10px">매입 미매칭</span>') + '</b></td><td class="r num"><small>' + (r.recent ? won(r.recent) : "-") + '</small></td><td class="r num ' + hopeCls + '"><b>' + (r.hope ? won(r.hope) : "-") + '</b></td><td class="r num">' + (r.settleEst != null ? won(r.settleEst) : "-") + '</td><td class="r num ' + pcls + '"><b>' + (r.profitEst != null ? ((r.profitEst >= 0 ? "+" : "") + won(r.profitEst)) : "-") + '</b></td><td class="r num"><small>' + (r.breakEven ? won(r.breakEven) : "-") + '</small></td></tr>';
      }).join("") +
      '</tbody></table></div><p class="note">크림 수수료 Level1 기준(6% + 2,500원, 설정에서 변경 가능). 매입가 안 뜨는 상품 = 크림 매입이나 로우나 재고에 매칭 안 됨 → 품번 맞추거나 재고 추가 필요. <b>희망가 수정은 크림 앱/웹에서</b>.</p></div>';
  }
  /* 판매완료 대기 (정산 전 - 예상 수익만) */
  if (pending.length) {
    var pMatched = pending.filter(function (r) { return r.match && r.cost; });
    var pendingCost = pMatched.reduce(function (a, r) { return a + r.cost; }, 0);
    h += '<div class="panel"><h2>⏳ 판매완료 · 정산 대기 (' + pending.length + '건 · 매입가 ' + won(pendingCost) + '원)</h2><p class="note">크림에서 이미 판매는 됐지만 정산금액이 아직 안 들어옴. 정산되면 매출로 들어가요.</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>모델번호</th><th>상품명</th><th>사이즈</th><th>매입처</th><th class="r">매입가</th></tr></thead><tbody>' +
      pending.map(function (r) { return '<tr><td class="num">' + esc(r.model) + '</td><td>' + esc(((r.brand || "") + " " + (r.name || "")).slice(0, 40)) + '</td><td>' + esc(r.size) + '</td><td><small>' + esc(r.match ? (r.supplier + ' · ' + r.source) : '매칭 안됨') + '</small></td><td class="r num">' + (r.cost ? won(r.cost) : '-') + '</td></tr>'; }).join("") +
      '</tbody></table></div></div>';
  }
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
