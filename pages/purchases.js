/* 메뉴: 매입·재고 (재고 나이 포함) */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, C = ERP.C, esc = U.esc, won = U.won, pct = U.pct, num = U.num;
var v = ERP.view; v.pStatus = v.pStatus || ""; v.pq = v.pq || "";
function isPersonal(p) { return !!(p.extra && p.extra.buyType === "personal"); }
var PLATFORMS = ["당근", "크림", "번개장터", "중고나라", "후루츠패밀리", "기타"];
function cross() { return v.pStatus === "in_stock" || v.pStatus === "aging"; }
function rows() {
  var q = v.pq.trim().toLowerCase();
  return ERP.list("purchases").filter(function (p) {
    if (!cross() && U.ym(p.date) !== v.month) return false;
    if (v.pStatus === "aging" && p.status !== "in_stock") return false;
    if (v.pStatus === "personal") { if (!isPersonal(p)) return false; } else if (v.pStatus && v.pStatus !== "aging" && p.status !== v.pStatus) return false;
    if (q && ((p.itemCode || "") + " " + (p.brand || "") + " " + ((p.extra && p.extra.sellerName) || "") + " " + (p.option || "") + " " + (p.rexOrderNo || "") + " " + (p.serialNo || "")).toLowerCase().indexOf(q) === -1) return false;
    return true;
  }).sort(function (a, b) { return v.pStatus === "aging" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date); });
}
function render() {
  var list = rows(), w = ERP.canWrite("purchases"), td = U.today(), stock = 0, stockN = 0, t = { nom: 0, eff: 0 };
  var B = [["0-30일", ""], ["31-60일", ""], ["61-90일", "warn"], ["90일 초과", "crit"]], bk = {};
  B.forEach(function (b) { bk[b[0]] = { n: 0, v: 0 }; });
  ERP.list("purchases").forEach(function (p) { if (p.status !== "in_stock") return; stock += C.effCost(p); stockN++; var b = C.agingBucket(p.date, td); if (bk[b]) { bk[b].n++; bk[b].v += C.effCost(p); } });
  var body = list.map(function (p) {
    if (p.status !== "cancelled") { t.nom += num(p.unitCost); t.eff += C.effCost(p); }
    var sale = p.soldSaleId ? ERP.DATA.sales.get(p.soldSaleId) : null, c = ERP.card(p.cardId), nd = ERP.docsFor("purchase", p.id).length;
    var st = p.status === "sold" ? '<span class="pill p-good">판매됨</span>' : p.status === "cancelled" ? '<span class="pill p-mute">취소</span>' : '<span class="pill p-acc">재고 · ' + C.agingBucket(p.date, td) + "</span>";
    return '<tr class="click ' + (p.status === "cancelled" ? "off" : "") + '" data-edit="purchases:' + esc(p.id) + '" tabindex="0"><td class="num">' + esc(p.date.slice(2)) + "</td><td>" + esc(p.vendor || "") + '</td><td class="name"><span class="num">' + esc(p.itemCode || "") + "</span> " + esc(p.option || "") + "<small>" + esc(p.brand || "") + (p.serialNo ? " · S/N " + esc(p.serialNo) : "") + (p.rexOrderNo ? " · 주문 " + esc(p.rexOrderNo) : "") + "</small></td><td>" + esc(c ? c.name : "") + '</td><td class="r num">' + won(p.unitCost) + '</td><td class="r num">' + won(C.effCost(p)) + "</td><td>" + st + "</td><td>" + (nd ? '<span class="pill p-good">증빙 ' + nd + "</span>" : '<span class="pill p-mute">없음</span>') + '</td><td class="name"><small>' + (sale ? esc((sale.date || "").slice(5) + " " + ERP.platName(sale.platformId) + " " + won(sale.salePrice) + "원") : "") + "</small></td></tr>";
  }).join("");
  var h = '<div class="head"><div><h1>매입·재고</h1><p>' + (cross() ? "현재 재고 전체" : v.month.replace("-", "년 ") + "월") + " · " + list.length + '건 · 상품 1개가 1줄이에요</p></div><div class="tools">' + (cross() ? "" : ERP.monthBar()) + (w ? '<button class="btn pri" data-act="newpurch">+ 매입 추가</button>' : "") + '<button class="btn" data-act="exportpurch">엑셀 내보내기</button></div></div>';
  h += '<div class="tools filters">' + ERP.chips("data-view", "pStatus=" + v.pStatus, [["pStatus=", "전체"], ["pStatus=in_stock", "재고만"], ["pStatus=aging", "오래된 재고순"], ["pStatus=sold", "판매됨"], ["pStatus=cancelled", "취소"], ["pStatus=personal", "개인 매입"]]) + '<input class="ctl search" data-search="pq" type="search" aria-label="검색" placeholder="품번·브랜드·시리얼·주문번호" value="' + esc(v.pq) + '"></div>';
  h += '<div class="grid2"><div class="tiles stack">' + ERP.tile("매입가 합계", won(t.nom), "이 목록 기준") + ERP.tile("실질 원가 합계", won(t.eff), "카드 할인·적립 반영") + ERP.tile("보유 재고", won(stock) + "원", stockN + "개") + '</div><div class="panel"><h2>재고 나이<span class="sub">입고일 기준 · 오래될수록 현금이 묶여요</span></h2>' +
    ERP.Charts.hbars(B.map(function (b) { return { label: b[0], value: bk[b[0]].v, sub: bk[b[0]].n + "개", cls: b[1] }; })) + "</div></div>";
  h += list.length ? '<div class="table-wrap"><table><thead><tr><th>매입일</th><th>매입처</th><th>품번 · 옵션</th><th>결제카드</th><th class="r">매입가</th><th class="r">실질원가</th><th>상태</th><th>증빙</th><th>판매 연결</th></tr></thead><tbody>' + body + "</tbody></table></div>" : '<div class="panel empty"><b>조건에 맞는 매입이 없어요</b>' + (w ? "‘매입 추가’로 입력하세요." : "") + "</div>";
  return h;
}
function open(p) {
  var isNew = !p, fd = ERP.fd, sel = ERP.sel;
  p = p || { id: U.uid(), date: U.today(), vendor: "오케이몰(렉스몬드)", brand: "", itemCode: "", option: "", serialNo: "", category: "", qty: 1, unitCost: "", cardId: "", effectiveUnitCost: "", status: "in_stock", soldSaleId: "", buyer: "신소희", rexOrderNo: "", rexStatus: "", source: "manual", memo: "", extra: {} };
  var x = p.extra || {}, per = x.buyType === "personal";
  var f = '<div class="fg">' + sel("매입 유형", "buyType", [["business", "사업자 매입 (렉스몬드·백화점·도매)"], ["personal", "개인 거래 (당근·크림 등 개인 물건)"]], per ? "personal" : "business", "full") +
    '<div class="full" id="pp-box" style="' + (per ? "" : "display:none") + ';grid-column:1/-1"><div class="fg" style="background:#fbf6f2;border:1px solid #e8d9cc;border-radius:10px;padding:12px">' +
    sel("거래 플랫폼", "pPlatform", PLATFORMS, x.platform || "당근") + fd("판매자 (닉네임·이름)", "pSeller", "text", x.sellerName || "") +
    sel("결제 방법", "pPay", ["계좌이체", "플랫폼 결제(안전결제)", "카드", "현금"], x.payMethod || "계좌이체") + fd("거래 링크·채팅 메모", "pLink", "text", x.dealLink || "") +
    '<p class="note full" style="grid-column:1/-1">개인 거래는 세금계산서가 없어요. 저장 후 다시 열어 거래 화면·이체내역 캡처를 증빙으로 붙여 두세요.</p></div></div>' +
    fd("매입일", "date", "date", p.date) + fd("매입처", "vendor", "text", p.vendor) + fd("브랜드", "brand", "text", p.brand) + fd("품번", "itemCode", "text", p.itemCode) + fd("옵션", "option", "text", p.option) + fd("시리얼·개체번호", "serialNo", "text", p.serialNo) +
    sel("분류", "category", [["", "미분류"]].concat(ERP.CATS), p.category) + (isNew ? fd("수량 (1개씩 나눠 저장돼요)", "qty", "number", 1) : "") + fd("매입가(1개)", "unitCost", "number", p.unitCost) +
    '<div class="fd"><label for="i-cardId">결제카드</label><select id="i-cardId" name="cardId"><option value="">현금·기타</option>' + S.CARDS.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === p.cardId ? " selected" : "") + ">" + esc(c.name) + (ERP.cardRate(c) ? " (" + pct(ERP.cardRate(c)) + ")" : "") + "</option>"; }).join("") + "</select></div>" +
    fd("실질원가 (비우면 카드 할인율로 계산)", "effectiveUnitCost", "number", isNew ? "" : p.effectiveUnitCost) + sel("상태", "status", [["in_stock", "재고"], ["sold", "판매됨"], ["cancelled", "취소"]], p.status) + fd("매입 주문번호", "rexOrderNo", "text", p.rexOrderNo) + fd("구매자", "buyer", "text", p.buyer) + fd("메모", "memo", "text", p.memo || "", "full") + "</div>" +
    (isNew ? '<p class="note">저장한 뒤 다시 열면 인보이스·영수증을 붙일 수 있어요.</p>' : (ERP.docsBlock ? ERP.docsBlock("purchase", p.id, p.itemCode) : ""));
  ERP.openDrawer(isNew ? "매입 추가" : "매입 수정", f, "purchases", p, isNew);
}
ERP.forms.purchases = {
  open: open,
  afterOpen: function (body) {
    if (ERP.bindDocLinks) ERP.bindDocLinks(body);
    var bt = body.querySelector("#i-buyType"), box = body.querySelector("#pp-box"), pf = body.querySelector("#i-pPlatform"), vd = body.querySelector("#i-vendor"), cd = body.querySelector("#i-cardId");
    var sync = function () { var per = bt.value === "personal"; box.style.display = per ? "" : "none"; if (per && (!vd.value || /렉스몬드|오케이몰/.test(vd.value))) { vd.value = pf.value; if (cd) cd.value = ""; } };
    bt.addEventListener("change", sync); pf.addEventListener("change", function () { if (bt.value === "personal" && PLATFORMS.indexOf(vd.value) !== -1) vd.value = pf.value; });
  },
  commit: async function (body, o, st) {
    if (!o.date || !num(o.unitCost)) throw new Error("매입일과 매입가를 입력해 주세요.");
    var rate = ERP.cardRate(ERP.card(o.cardId));
    if (o.effectiveUnitCost === "") o.effectiveUnitCost = Math.round(num(o.unitCost) * (1 - rate));
    var per = o.buyType === "personal";
    o.extra = Object.assign({}, o.extra || {}, { cardRateApplied: rate, buyType: per ? "personal" : "business" });
    if (per) Object.assign(o.extra, { platform: o.pPlatform, sellerName: o.pSeller, payMethod: o.pPay, dealLink: o.pLink, noTaxInvoice: true });
    else ["platform", "sellerName", "payMethod", "dealLink", "noTaxInvoice"].forEach(function (k) { delete o.extra[k]; });
    ["buyType", "pPlatform", "pSeller", "pPay", "pLink"].forEach(function (k) { delete o[k]; });
    var qty = st.isNew ? Math.max(1, Math.min(50, num(o.qty) || 1)) : 1; o.qty = 1;
    if (qty > 1) { var rows = []; for (var i = 0; i < qty; i++) rows.push(ERP.toRow("purchases", Object.assign({}, o, { id: i ? U.uid() : o.id }))); await ERP.saveBatch("purchases", rows); rows.forEach(function (r) { ERP.applyRow("purchases", r); }); ERP.toast(qty + "개를 재고로 저장했어요."); return true; }
    if (await ERP.save("purchases", o)) { ERP.toast("매입을 저장했어요."); return true; } return false;
  }
};
ERP.acts.newpurch = function () { open(); };
ERP.purchRowsX = function (list) { return list.map(function (p) { var c = ERP.card(p.cardId); return { "매입일": p.date, "매입처": p.vendor || "", "매입유형": isPersonal(p) ? "개인 거래" : "사업자", "판매자": (p.extra && p.extra.sellerName) || "", "결제방법": (p.extra && p.extra.payMethod) || "", "세금계산서": isPersonal(p) ? "없음" : "", "브랜드": p.brand || "", "품번": p.itemCode || "", "옵션": p.option || "", "시리얼": p.serialNo || "", "매입가": num(p.unitCost), "실질원가": C.effCost(p), "결제카드": c ? c.name : "", "상태": { in_stock: "재고", sold: "판매됨", cancelled: "취소" }[p.status] || p.status, "재고나이": p.status === "in_stock" ? C.agingBucket(p.date, U.today()) : "", "주문번호": p.rexOrderNo || "", "증빙": ERP.docsFor("purchase", p.id).length }; }); };
ERP.acts.exportpurch = function () { var l = ERP.list("purchases").filter(function (p) { return cross() ? p.status === "in_stock" : U.ym(p.date) === v.month; }); ERP.downloadBlob("로우나_매입_" + (cross() ? "재고_" + U.today() : v.month) + ".xlsx", ERP.xlsxBlob([{ name: "매입", rows: ERP.purchRowsX(l) }])); };
ERP.page({ id: "purchases", title: "매입·재고", render: render });
})();
