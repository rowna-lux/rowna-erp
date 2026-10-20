/* 메뉴: 가격 관리 (스마트스토어 판매가·마진) — 엑셀 '가격관리_간소화'와 같은 계산
   입력: 매입가·카드혜택·마진율(비우면 기본)·마켓수수료(비우면 네이버 유입)·판매가 직접지정·현재 스토어가
   결과: 실질원가 → 최종판매가 → 스토어 입력가(할인 전) → 순이익·순이익률 → 변동·경고 */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, C = ERP.C, esc = U.esc, won = U.won, pct = U.pct, num = U.num;
var v = ERP.view; v.prF = v.prF || "all"; v.prQ = v.prQ || "";
var DEF = { global_adj: 0, margin_high: 0.04, margin_contemp: 0.15, extra_cost: 3000, round_unit: 100, discount_rate: 0.1, low_margin: 0.05, npay: 0.03003, fee_naver: 0.0273, fee_mkt: 0.0091, vat: 0.1 };
var STATUS = ["판매중", "판매대기", "품절", "판매중지"], CATS = ["가방", "지갑", "신발", "의류", "주얼리/시계", "액세서리", "모자", "스카프", "기타"];
function cfg() { return Object.assign({}, DEF, S.SET.price_settings || {}); }
function calc(it) { return C.priceCalc(it, cfg()); }
function all() { return ERP.list("price_items"); }
function rows() {
  var q = v.prQ.trim().toLowerCase();
  return all().map(function (it) { return { it: it, c: calc(it) }; }).filter(function (x) {
    var it = x.it, c = x.c;
    if (v.prF === "하이엔드" || v.prF === "컨템포러리") { if (it.tier !== v.prF) return false; }
    else if (v.prF === "change") { if (!(c.change)) return false; }
    else if (v.prF === "warn") { if (c.warn !== "손해" && c.warn !== "저마진") return false; }
    else if (v.prF === "nocost") { if (c.warn !== "원가없음") return false; }
    if (q && ((it.sku || "") + " " + (it.brand || "") + " " + (it.name || "") + " " + (it.vendor || "")).toLowerCase().indexOf(q) === -1) return false;
    return true;
  }).sort(function (a, b) { return (a.it.tier || "").localeCompare(b.it.tier || "") || String(a.it.createdAt || a.it.id).localeCompare(String(b.it.createdAt || b.it.id)); });
}
function counts() { var n = { all: 0, loss: 0, low: 0, change: 0, nocost: 0 }; all().forEach(function (it) { var c = calc(it); n.all++; if (c.warn === "손해") n.loss++; if (c.warn === "저마진") n.low++; if (c.warn === "원가없음") n.nocost++; if (c.change) n.change++; }); return n; }
function warnPill(w) { return w === "손해" ? '<span class="pill p-crit">손해</span>' : w === "저마진" ? '<span class="pill p-warn">저마진</span>' : w === "원가없음" ? '<span class="pill p-mute">원가없음</span>' : ""; }
function chgPill(c) { if (!c.change) return ""; if (c.change === "신규") return '<span class="pill p-good">신규</span>'; return '<span class="pill p-acc">' + esc(c.change) + "</span>"; }

function render() {
  var w = ERP.canWrite("price_items"), list = rows(), n = counts(), cf = cfg();
  var body = list.map(function (x) {
    var it = x.it, c = x.c, ln = (it.name || "").length;
    var rowCls = c.warn === "손해" ? "row-crit" : c.warn === "저마진" ? "row-warn" : "";
    var inp = function (k, val, fmt, ph) { return w ? '<input class="cell-in num" type="number" step="any" inputmode="decimal" data-pr="' + esc(it.id) + '" data-k="' + k + '" value="' + (val == null || val === "" ? "" : (fmt === "pct" ? Math.round(num(val) * 10000) / 100 : Math.round(num(val)))) + '" placeholder="' + (ph || "") + '" aria-label="' + esc((it.sku || it.name || "") + " " + k) + '">' : '<span class="num">' + (val == null || val === "" ? "–" : fmt === "pct" ? pct(val) : won(val)) + "</span>"; };
    return '<tr class="' + rowCls + '"><td><span class="pill ' + (it.tier === "하이엔드" ? "p-acc" : "p-mute") + '">' + esc(it.tier === "하이엔드" ? "하이엔드" : "컨템") + "</span>" + (it.status && it.status !== "판매중" ? '<small class="muted">' + esc(it.status) + "</small>" : "") + '</td><td class="name click" data-edit="price_items:' + esc(it.id) + '" tabindex="0" title="' + esc(it.name || "") + '"><b>' + esc(it.brand || "") + "</b> " + esc(it.name || "(상품명 없음)") + '<small class="num">' + esc(it.sku || "") + (it.vendor ? " · " + esc(it.vendor) : "") + (ln > 50 ? ' · <span class="' + (ln > 100 ? "neg" : "warn-t") + '">' + ln + "자</span>" : "") + "</small></td>" +
      '<td class="r">' + inp("buyPrice", it.buyPrice, "won", "매입가") + '</td><td class="r num">' + (c.cost != null ? won(c.cost) : "–") + "<small class=\"muted\">카드 " + (it.cardRate ? pct(it.cardRate) : "0%") + "</small></td>" +
      '<td class="r">' + inp("margin", it.margin, "pct", c.margin != null ? (Math.round((c.margin - num(cf.global_adj)) * 1000) / 10) + "" : "") + '</td><td class="r num">' + (c.fee != null ? (c.fee * 100).toFixed(2) + "%" : "–") + "</td>" +
      '<td class="r num strong">' + (c.final != null ? won(c.final) : "–") + (num(it.fixedPrice) > 0 ? '<small class="muted">직접지정</small>' : "") + '</td><td class="r num">' + (c.storeInput != null ? won(c.storeInput) : "–") + '</td><td class="r num strong ' + (c.profit < 0 ? "neg" : "") + '">' + (c.profit != null ? won(c.profit) : "–") + '</td><td class="r num">' + (c.rate != null ? pct(c.rate) : "–") + "</td>" +
      '<td class="r">' + inp("storePrice", it.storePrice, "won", "현재가") + "</td><td>" + chgPill(c) + "</td><td>" + warnPill(c.warn) + "</td></tr>";
  }).join("");
  var h = '<div class="head"><div><h1>스마트스토어 소싱</h1><p>스마트스토어 판매가·마진 · 칸을 고치면 바로 다시 계산돼요 · 마진율을 비우면 기본마진(하이엔드 ' + pct(cf.margin_high) + " · 컨템포러리 " + pct(cf.margin_contemp) + ")" + (num(cf.global_adj) ? " + 전체조정 " + pct(cf.global_adj) : "") + '</p></div><div class="tools">' + (w ? '<button class="btn pri" data-act="pradd">+ 상품 추가</button>' : "") + '<button class="btn" data-act="prexport">변경분 엑셀</button>' + (w && n.change ? '<button class="btn" data-act="prapply">보이는 변경분 반영 완료</button>' : "") + "</div></div>";
  h += '<div class="tiles">' + ERP.tile("상품", n.all + "개") + ERP.tile("가격 변경 필요", n.change + "개", "신규·변경 — 스마트스토어에 반영할 것", n.change ? "hl" : "") + ERP.tile("손해", '<span class="' + (n.loss ? "neg" : "") + '">' + n.loss + "개</span>", "순이익 마이너스") + ERP.tile("저마진", n.low + "개", "순이익률 " + pct(cf.low_margin) + " 미만") + ERP.tile("원가 미입력", n.nocost + "개") + "</div>";
  h += '<div class="tools filters">' + ERP.chips("data-view", "prF=" + v.prF, [["prF=all", "전체"], ["prF=하이엔드", "하이엔드"], ["prF=컨템포러리", "컨템포러리"], ["prF=change", "변경 필요"], ["prF=warn", "손해·저마진"], ["prF=nocost", "원가 미입력"]]) + '<input class="ctl search" data-search="prQ" type="search" aria-label="검색" placeholder="품번·브랜드·상품명·매입처" value="' + esc(v.prQ) + '"></div>';
  h += list.length ? '<div class="table-wrap"><table class="pr" style="min-width:1220px"><thead><tr><th>구분</th><th>상품 (누르면 수정)</th><th class="r">매입가</th><th class="r">실질원가</th><th class="r">마진율 %</th><th class="r">수수료</th><th class="r">최종판매가</th><th class="r">스토어 입력가<br><small>할인 전</small></th><th class="r">순이익</th><th class="r">순이익률</th><th class="r">현재 스토어가</th><th>변동</th><th>경고</th></tr></thead><tbody>' + body + "</tbody></table></div>"
    : '<div class="panel empty"><b>' + (all().length ? "조건에 맞는 상품이 없어요" : "스마트스토어 소싱 상품이 아직 없어요") + "</b>" + (all().length ? "" : "[데이터·백업]에서 가격관리 가져오기 파일을 넣거나 ‘+ 상품 추가’로 입력하세요.") + "</div>";
  return h + settingsPanel();
}
function settingsPanel() {
  var cf = cfg(), dis = ERP.isOwner() ? "" : " disabled", f = function (k, label, isPct, step) { return '<div class="fd"><label for="ps-' + k + '">' + label + '</label><input id="ps-' + k + '" data-ps="' + k + '" data-pct="' + (isPct ? 1 : "") + '" type="number" step="' + (step || "any") + '" value="' + (isPct ? Math.round(num(cf[k]) * 100000) / 1000 : num(cf[k])) + '"' + dis + "></div>"; };
  var fn = num(cf.npay) + num(cf.fee_naver) * (1 + num(cf.vat)), fm = num(cf.npay) + num(cf.fee_mkt) * (1 + num(cf.vat));
  return '<div class="panel"><h2>가격 설정<span class="sub">바꾸면 모든 상품 가격이 바로 다시 계산돼요</span></h2><div class="fg four">' +
    f("global_adj", "전체 마진 조정 %p", 1) + f("margin_high", "기본 마진 - 하이엔드 %", 1) + f("margin_contemp", "기본 마진 - 컨템포러리 %", 1) + f("extra_cost", "건당 부대비용 (원)") +
    f("round_unit", "가격 올림 단위 (원)") + f("discount_rate", "즉시할인 노출률 %", 1) + f("low_margin", "저마진 경고 기준 %", 1) + '<div class="fd"></div>' +
    f("npay", "Npay 주문관리수수료 % (VAT 포함)", 1) + f("fee_naver", "판매수수료 - 네이버 유입 % (VAT 별도)", 1) + f("fee_mkt", "판매수수료 - 마케팅링크 % (VAT 별도)", 1) + f("vat", "부가세율 %", 1) +
    '</div><p class="note">마켓수수료 합계: 네이버 유입 <b class="num">' + (fn * 100).toFixed(3) + '%</b> · 마케팅링크 유입 <b class="num">' + (fm * 100).toFixed(3) + "%</b> (마케팅링크 상품은 상품 수정창에서 수수료를 바꿔 주세요). 판매가 = 올림((실질원가 + 부대비용) × (1 + 마진율) ÷ (1 − 수수료)). 순이익 = 최종판매가 × (1 − 수수료) − 실질원가 − 부대비용.</p></div>";
}
function bind(root) {
  root.querySelectorAll("[data-pr]").forEach(function (el) { el.onchange = async function () { var it = ERP.DATA.price_items.get(el.dataset.pr); if (!it) return; var o = Object.assign({}, it), k = el.dataset.k; o[k] = el.value === "" ? null : (k === "margin" ? num(el.value) / 100 : num(el.value)); await ERP.save("price_items", o); }; });
  root.querySelectorAll("[data-ps]").forEach(function (el) { el.onchange = function () { var o = Object.assign({}, cfg()); o[el.dataset.ps] = el.dataset.pct ? num(el.value) / 100 : num(el.value); ERP.saveSetting("price_settings", o); setTimeout(ERP.render, 50); }; });
}

function open(it) {
  var isNew = !it, fd = ERP.fd, sel = ERP.sel, cf = cfg();
  it = it || { id: U.uid(), status: "판매중", tier: "컨템포러리", sku: "", buyLink: "", vendor: "", brand: "", category: "", name: "", buyPrice: "", cardRate: "", margin: "", feeRate: "", fixedPrice: "", storePrice: "", memo: "", extra: {} };
  var pv = function (x) { return x == null || x === "" ? "" : Math.round(num(x) * 100000) / 1000; };
  var f = '<div class="fg">' + sel("구분", "tier", ["하이엔드", "컨템포러리"], it.tier) + sel("상태", "status", STATUS, it.status || "판매중") + fd("품번", "sku", "text", it.sku) + fd("브랜드", "brand", "text", it.brand) +
    fd("상품명", "name", "text", it.name, "full") + '<div class="fd"><label for="i-category">대분류</label><input id="i-category" name="category" list="pr-cats" value="' + esc(it.category || "") + '"><datalist id="pr-cats">' + CATS.map(function (c) { return '<option value="' + c + '">'; }).join("") + "</datalist></div>" + fd("매입처", "vendor", "text", it.vendor) + fd("매입링크", "buyLink", "url", it.buyLink, "full") +
    '</div><div class="sect">가격</div><div class="fg">' + fd("매입가 (원)", "buyPrice", "number", it.buyPrice) + fd("카드혜택 %", "cardRatePct", "number", pv(it.cardRate)) +
    fd("마진율 % (비우면 기본 " + pct(it.tier === "하이엔드" ? cf.margin_high : cf.margin_contemp) + ")", "marginPct", "number", pv(it.margin)) + fd("마켓수수료 % (비우면 네이버 유입)", "feePct", "number", pv(it.feeRate)) +
    fd("판매가 직접지정 (원, 선택)", "fixedPrice", "number", it.fixedPrice) + fd("현재 스토어가 (원)", "storePrice", "number", it.storePrice) + fd("메모", "memo", "text", it.memo, "full") + '</div><div class="preview" id="prpv"></div>' +
    (it.buyLink ? '<p class="note"><a href="' + esc(it.buyLink) + '" target="_blank" rel="noopener">매입처 상품 페이지 열기 ↗</a></p>' : "");
  ERP.openDrawer(isNew ? "소싱 상품 추가" : "소싱 상품", f, "price_items", it, isNew);
}
function fromForm(o) {
  var p = function (k) { return o[k] === "" || o[k] == null ? null : num(o[k]) / 100; };
  o.cardRate = p("cardRatePct"); o.margin = p("marginPct"); o.feeRate = p("feePct");
  delete o.cardRatePct; delete o.marginPct; delete o.feePct;
  ["buyPrice", "fixedPrice", "storePrice"].forEach(function (k) { if (o[k] === "") o[k] = null; });
  return o;
}
ERP.forms.price_items = {
  open: open,
  afterOpen: function (body, it) {
    var upd = function () { var o = fromForm(ERP.readForm(body, it)), c = calc(o); U.$("prpv").innerHTML = c.final == null ? "<div><span>매입가를 넣으면 계산돼요</span><b>–</b></div>" : "<div><span>실질원가</span><b>" + won(c.cost) + "</b></div><div><span>적용 마진</span><b>" + pct(c.margin) + "</b></div><div><span>최종판매가</span><b>" + won(c.final) + "</b></div><div><span>스토어 입력가</span><b>" + won(c.storeInput) + "</b></div><div><span>순이익</span><b>" + won(c.profit) + " (" + pct(c.rate) + ")</b></div>"; };
    body.addEventListener("input", upd); body.addEventListener("change", upd); upd();
  },
  commit: async function (body, o) {
    o = fromForm(o);
    if (!o.name && !o.sku) throw new Error("상품명이나 품번 중 하나는 입력해 주세요.");
    if (await ERP.save("price_items", o)) { ERP.toast("저장했어요."); return true; } return false;
  }
};
ERP.acts.pradd = function () { open(); };
function exportRows(list) { return list.map(function (x) { var it = x.it, c = x.c; return { "구분": it.tier, "상태": it.status || "", "품번": it.sku || "", "브랜드": it.brand || "", "상품명": it.name || "", "매입처": it.vendor || "", "매입가": it.buyPrice == null ? "" : num(it.buyPrice), "실질원가": c.cost == null ? "" : Math.round(c.cost), "적용마진": c.margin == null ? "" : c.margin, "수수료": c.fee == null ? "" : c.fee, "최종판매가": c.final == null ? "" : c.final, "스토어입력가(할인전)": c.storeInput == null ? "" : c.storeInput, "즉시할인액": c.discount == null ? "" : c.discount, "순이익": c.profit == null ? "" : Math.round(c.profit), "순이익률": c.rate == null ? "" : Math.round(c.rate * 1000) / 10 + "%", "현재스토어가": it.storePrice == null ? "" : num(it.storePrice), "변동": c.change || "", "경고": c.warn || "", "매입링크": it.buyLink || "" }; }); }
ERP.acts.prexport = function () { var list = all().map(function (it) { return { it: it, c: calc(it) }; }); var ch = list.filter(function (x) { return x.c.change; }); ERP.downloadBlob("가격관리_" + U.today() + ".xlsx", ERP.xlsxBlob([{ name: "변경분(스토어반영)", rows: exportRows(ch) }, { name: "전체", rows: exportRows(list) }])); };
ERP.acts.prapply = async function (btn) {
  var targets = rows().filter(function (x) { return x.c.change && x.c.final != null; });
  if (!btn.dataset.arm) { btn.dataset.arm = "1"; btn.textContent = targets.length + "개 현재 스토어가를 최종판매가로 바꿀까요? 한 번 더 누르기"; return; }
  btn.disabled = true;
  try { var rs = targets.map(function (x) { return ERP.toRow("price_items", Object.assign({}, x.it, { storePrice: x.c.final })); }); await ERP.saveBatch("price_items", rs); rs.forEach(function (r) { ERP.applyRow("price_items", r); }); ERP.toast(targets.length + "개를 스토어 반영 완료로 표시했어요."); }
  catch (e) { ERP.toast(ERP.errMsg(e)); btn.disabled = false; }
};
ERP.priceRowsX = function () { return exportRows(all().map(function (it) { return { it: it, c: calc(it) }; })); };
ERP.importers = ERP.importers || {};
ERP.importers["rowna-erp-price-v1"] = async function (data, say) {
  say("가격 관리 상품 저장 중"); await ERP.saveBatch("price_items", data.items || []);
  if (data.settings) await S.sb.from("app_settings").upsert({ key: "price_settings", value: data.settings });
  return { kind: "스마트스토어 소싱", summary: "상품 " + (data.items || []).length + "개" + (data.settings ? " · 가격 설정 포함" : "") };
};
ERP.page({ id: "pricing", title: "스마트스토어 소싱", render: render, bind: bind, badge: function () { var n = 0; all().forEach(function (it) { var c = calc(it); if (c.warn === "손해") n++; }); return n || ""; } });
})();
