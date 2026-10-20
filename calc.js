/* 로우나 ERP · 계산 로직 (화면과 분리해 자동 테스트합니다) */
(function (root) {
  "use strict";
  function num(v) { if (v == null || v === "") return 0; var n = Number(String(v).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; }
  function ym(d) { return (d || "").slice(0, 7); }

  /* 수수료: 일반 = 판매가×수수료율×배수, 구간형 = 기준금액 이하/초과분 각각 */
  function fee(sale, p) {
    if (!p) return 0;
    var L = num(sale.salePrice), m = Number(p.multiplier) || 1;
    if (p.tiered) {
      var t = num(p.tieredThreshold), a = Number(p.tieredRateBelow) || 0, b = Number(p.tieredRateAbove) || 0;
      return (L <= t ? L * a : t * a + (L - t) * b) * m;
    }
    return L * (Number(p.fee) || 0) * m;
  }

  /* 매출 1건 계산 */
  function derive(s, p) {
    var L = num(s.salePrice), M = num(s.cost), O = num(s.adjustment), T = num(s.shippingFee), E = num(s.etcAmount);
    var f = fee(s, p), st = s.settleStatus || "미확인";
    var N = st === "확정" ? num(s.settledAmount) : Math.max(0, Math.round(L - f));
    var isDef = !!p && p.settlement === "후정산";
    var defEst = isDef ? L * (Number(p.deferredRate) || 0) * (Number(p.multiplier) || 1) : 0;
    var defApplied = isDef ? (s.deferredStatus === "확정" ? num(s.deferredFinalAmount) : defEst) : 0;
    var noSale = st !== "확정" && L <= 0 && !O && !E;
    var margin = noSale ? 0 : N + O + E - M - T - defApplied;
    return {
      fee: f, settled: N, st: st, isDef: isDef, defApplied: defApplied, margin: margin,
      hasCost: M > 0, rate: L ? margin / L : 0,
      outVat: Math.round(L / 11), inVat: s.vatCreditable === false ? 0 : Math.round(M / 11)
    };
  }

  function retLoss(r) { return num(r.shipCost) - num(r.shipIncome) + num(r.refundLoss); }
  function retDate(r) { return (r.dates && (r.dates["완료"] || r.dates["회수중"] || r.dates["접수"])) || r.date || ""; }
  function effCost(p) { return p.effectiveUnitCost != null && p.effectiveUnitCost !== "" ? num(p.effectiveUnitCost) : num(p.unitCost); }
  function isExcluded(sale, retBySale) { var r = retBySale.get(sale.id); return !!r && (r.type === "취소" || r.type === "반품"); // 반품·취소는 진행 상태와 상관없이 매출에서 뺌(대표님 지시 2026-10-20) }

  /* 기간 집계. 마진은 원가가 입력된 주문만 합산(원가 없는 주문이 이익을 부풀리지 않도록) */
  function aggregate(sales, returns, platById, retBySale, inRange) {
    var a = { rev: 0, fee: 0, settled: 0, cost: 0, ship: 0, def: 0, margin: 0, marginRev: 0, outVat: 0, inVat: 0, n: 0, pendAmt: 0, pendN: 0, noCost: 0, retLoss: 0, byPlat: {} };
    sales.forEach(function (s) {
      if (!inRange(s.date || "") || isExcluded(s, retBySale)) return;
      var d = derive(s, platById(s.platformId));
      a.n++; a.rev += num(s.salePrice); a.fee += d.fee; a.settled += d.settled; a.cost += num(s.cost); a.ship += num(s.shippingFee); a.def += d.defApplied;
      a.outVat += d.outVat; a.inVat += d.inVat;
      if (d.hasCost) { a.margin += d.margin; a.marginRev += num(s.salePrice); }
      if (d.st !== "확정") { a.pendAmt += d.settled; a.pendN++; }
      if (num(s.salePrice) > 0 && !d.hasCost) a.noCost++;
      var k = s.platformId || "";
      var b = a.byPlat[k] || (a.byPlat[k] = { rev: 0, n: 0, margin: 0, marginRev: 0 });
      b.rev += num(s.salePrice); b.n++; if (d.hasCost) { b.margin += d.margin; b.marginRev += num(s.salePrice); }
    });
    returns.forEach(function (r) { var d = retDate(r); if (d && inRange(d)) a.retLoss += retLoss(r); });
    a.net = a.margin - a.retLoss;
    return a;
  }

  /* 재고 나이 구간 (입고일 기준) */
  function agingBucket(dateStr, today) {
    var d = (Date.parse(today) - Date.parse(dateStr)) / 86400000;
    if (isNaN(d)) return "알수없음";
    if (d <= 30) return "0-30일";
    if (d <= 60) return "31-60일";
    if (d <= 90) return "61-90일";
    return "90일 초과";
  }

  /* 사방넷 엑셀 헤더에서 열 찾기 */
  function findCol(header, cands) {
    for (var i = 0; i < header.length; i++) {
      var x = String(header[i] || "").replace(/\s+/g, "");
      for (var j = 0; j < cands.length; j++) if (x.indexOf(cands[j]) !== -1) return i;
    }
    return -1;
  }
  function normDate(v) {
    v = String(v || "").trim();
    var m = v.match(/(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})/);
    if (m) return m[1] + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[3]).padStart(2, "0");
    m = v.match(/^(\d{4})(\d{2})(\d{2})/);
    return m ? m[1] + "-" + m[2] + "-" + m[3] : "";
  }

  /* DB(snake_case) <-> 화면(camelCase) */
  function toCamel(row) { var o = {}; for (var k in row) o[k.replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); })] = row[k]; return o; }
  function toSnake(obj, allowed) {
    var o = {};
    for (var k in obj) {
      var sk = k.replace(/[A-Z]/g, function (c) { return "_" + c.toLowerCase(); });
      if (!allowed || allowed.indexOf(sk) !== -1) o[sk] = obj[k] === "" && /(_price|_cost|cost|amount|_fee|_rate|adjustment|qty|multiplier|threshold)$/.test(sk) ? 0 : obj[k];
    }
    return o;
  }

  /* 크림 되팔기 이익: 판매가·도매가 모두 부가세 포함, 수수료는 부가세 별도 요율(최대 cap)
     실이익 = 판매가/1.1 − 수수료 − 도매가/1.1  (매입·매출 부가세를 정리한 뒤 남는 돈) */
  function kream(sell, whole, rate, cap) {
    sell = num(sell); whole = num(whole); rate = rate == null ? 0.06 : Number(rate); cap = cap == null ? 300000 : num(cap);
    if (!sell) return null;
    var fee = Math.min(sell * rate, cap || Infinity), settle = sell - fee * 1.1, real = sell / 1.1 - fee - whole / 1.1;
    var be = rate * (whole / 1.1) / (1 / 1.1 - rate) <= cap ? (whole / 1.1) / (1 / 1.1 - rate) : (whole / 1.1 + cap) * 1.1;
    var r = real / (sell / 1.1);
    return { fee: fee, settle: settle, cash: settle - whole, real: real, rate: r, breakeven: be, verdict: r >= 0.08 ? "추천" : r >= 0.03 ? "검토" : "비추천" };
  }

  /* 스마트스토어 가격 (엑셀 '가격관리_간소화'와 같은 식)
     실질원가 = 매입가×(1−카드혜택) · 적용마진 = (입력마진 또는 구분별 기본마진) + 전체조정
     판매가 = 올림((실질원가+부대비용)×(1+적용마진) ÷ (1−수수료), 올림단위) · 직접지정이 있으면 그 값
     스토어 입력가 = 올림(최종판매가 ÷ (1−할인노출률)) · 순이익 = 최종판매가×(1−수수료) − 실질원가 − 부대비용 */
  function ceilTo(v, unit) { unit = num(unit) || 1; return Math.ceil(Math.round(v * 1e6) / 1e6 / unit) * unit; }
  function priceCalc(it, cfg) {
    var feeNaver = num(cfg.npay) + num(cfg.fee_naver) * (1 + num(cfg.vat));
    var out = { feeDefault: feeNaver };
    var buy = it.buyPrice === "" || it.buyPrice == null ? null : num(it.buyPrice);
    if (buy == null) { out.warn = it.name ? "원가없음" : ""; return out; }
    var cost = buy * (1 - num(it.cardRate));
    var base = it.margin === "" || it.margin == null ? (it.tier === "하이엔드" ? num(cfg.margin_high) : num(cfg.margin_contemp)) : num(it.margin);
    var m = base + num(cfg.global_adj), fee = it.feeRate === "" || it.feeRate == null ? feeNaver : num(it.feeRate);
    var calc = ceilTo((cost + num(cfg.extra_cost)) * (1 + m) / (1 - fee), cfg.round_unit);
    var fin = num(it.fixedPrice) > 0 ? num(it.fixedPrice) : calc;
    var store = ceilTo(fin / (1 - num(cfg.discount_rate)), cfg.round_unit);
    var profit = fin * (1 - fee) - cost - num(cfg.extra_cost), rate = fin ? profit / fin : 0, cur = num(it.storePrice);
    Object.assign(out, { cost: cost, margin: m, marginIsDefault: base !== num(it.margin) || it.margin === "" || it.margin == null, fee: fee, calcPrice: calc, final: fin, storeInput: store, discount: store - fin, profit: profit, rate: rate,
      change: !cur ? "신규" : fin === cur ? "" : (fin > cur ? "▲" : "▼") + Math.abs(fin - cur).toLocaleString("ko-KR"), diff: cur ? fin - cur : null,
      warn: profit < 0 ? "손해" : rate < num(cfg.low_margin) ? "저마진" : "" });
    return out;
  }

  var api = { priceCalc: priceCalc, ceilTo: ceilTo, kream: kream, num: num, ym: ym, fee: fee, derive: derive, retLoss: retLoss, retDate: retDate, effCost: effCost, isExcluded: isExcluded, aggregate: aggregate, agingBucket: agingBucket, findCol: findCol, normDate: normDate, toCamel: toCamel, toSnake: toSnake };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.RownaCalc = api;
})(this);
