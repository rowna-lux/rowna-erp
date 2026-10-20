/* 메뉴: 반품·취소 */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, C = ERP.C, esc = U.esc, won = U.won, num = U.num;
var v = ERP.view; v.rStatus = v.rStatus || "";
function render() {
  var w = ERP.canWrite("returns");
  var list = ERP.list("returns").filter(function (r) { return !v.rStatus || (v.rStatus === "open" ? r.status !== "완료" : r.status === "완료"); }).sort(function (a, b) { return C.retDate(b).localeCompare(C.retDate(a)); });
  var loss = 0; list.forEach(function (r) { loss += C.retLoss(r); });
  var body = list.map(function (r) {
    var sale = r.saleId ? ERP.DATA.sales.get(r.saleId) : null, sp = r.status === "완료" ? "p-mute" : r.status === "회수중" ? "p-warn" : "p-crit";
    return '<tr class="click" data-edit="returns:' + esc(r.id) + '" tabindex="0"><td class="num">' + esc(C.retDate(r).slice(5)) + '</td><td><span class="pill p-acc">' + esc(r.type) + '</span></td><td><span class="pill ' + sp + '">' + esc(r.status) + "</span></td><td>" + esc(ERP.platName(r.platformId || (sale && sale.platformId))) + '</td><td class="name">' + esc(r.productName || (sale && sale.productName) || "") + (r.memo ? "<small>" + esc(r.memo) + "</small>" : "") + '</td><td class="r num">' + won(r.shipCost) + '</td><td class="r num">' + won(r.shipIncome) + '</td><td class="r num">' + won(r.refundLoss) + '</td><td class="r num ' + (C.retLoss(r) > 0 ? "neg" : "") + '">' + won(C.retLoss(r)) + "</td></tr>";
  }).join("");
  var h = '<div class="head"><div><h1>반품·취소</h1><p>완료된 취소·반품은 매출과 이익에서 자동으로 빠져요</p></div><div class="tools">' + (w ? '<button class="btn pri" data-act="newret">+ 반품·취소 등록</button>' : "") + "</div></div>";
  h += '<div class="tools filters">' + ERP.chips("data-view", "rStatus=" + v.rStatus, [["rStatus=", "전체"], ["rStatus=open", "진행 중"], ["rStatus=done", "완료"]]) + "</div>";
  h += '<div class="tiles">' + ERP.tile("건수", list.length + "건") + ERP.tile("순손실", won(loss) + "원", "배송비 − 고객부담 배송비 + 환불손실") + "</div>";
  return h + (list.length ? '<div class="table-wrap"><table><thead><tr><th>날짜</th><th>유형</th><th>상태</th><th>쇼핑몰</th><th>상품</th><th class="r">배송비 지출</th><th class="r">고객부담 배송비</th><th class="r">환불손실</th><th class="r">순손실</th></tr></thead><tbody>' + body + "</tbody></table></div>" : '<div class="panel empty"><b>등록된 반품·취소가 없어요</b></div>');
}
function open(r) {
  var isNew = !r, fd = ERP.fd, sel = ERP.sel;
  r = r || { id: U.uid(), date: U.today(), type: "반품", status: "접수", saleId: "", orderNo: "", platformId: "", productName: "", salePrice: 0, shipCost: 0, shipIncome: 0, refundLoss: 0, restocked: false, memo: "", dates: {}, source: "manual", extra: {} };
  var lo = U.shiftMonth(U.ym(U.today()), -3);
  var sales = ERP.list("sales").filter(function (s) { return s.id === r.saleId || (s.date || "") >= lo; }).sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
  var f = '<div class="fg">' + fd("접수일", "date", "date", r.date) + sel("유형", "type", ["취소", "반품", "교환"], r.type) + sel("진행 상태", "status", ["접수", "회수중", "완료"], r.status) + '<div class="fd"><label for="i-platformId">쇼핑몰</label><select id="i-platformId" name="platformId">' + ERP.platOptions(r.platformId) + "</select></div>" +
    '<div class="fd full"><label for="i-saleId">연결할 매출 (최근 3개월)</label><select id="i-saleId" name="saleId"><option value="">연결 안 함</option>' + sales.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === r.saleId ? " selected" : "") + ">" + esc((s.date || "").slice(5) + " · " + ERP.platName(s.platformId) + " · " + (s.productName || "").slice(0, 40) + " · " + won(s.salePrice)) + "</option>"; }).join("") + "</select></div>" +
    fd("상품명 (매출 연결 안 할 때)", "productName", "text", r.productName, "full") + fd("배송비 지출(왕복 등)", "shipCost", "number", r.shipCost) + fd("고객부담 배송비 받은 금액", "shipIncome", "number", r.shipIncome) + fd("환불 손실(차액 등)", "refundLoss", "number", r.refundLoss) +
    '<div class="fd chk"><input type="checkbox" id="i-restocked" name="restocked"' + (r.restocked ? " checked" : "") + '><label for="i-restocked">재고로 다시 들어옴</label></div>' + fd("메모", "memo", "text", r.memo, "full") + "</div>";
  ERP.openDrawer(isNew ? "반품·취소 등록" : "반품·취소 수정", f, "returns", r, isNew);
}
ERP.forms.returns = {
  open: open,
  afterOpen: function (body) { var ss = body.querySelector("#i-saleId"); ss.addEventListener("change", function () { var s = ERP.DATA.sales.get(ss.value); if (s) { body.querySelector("#i-platformId").value = s.platformId || ""; body.querySelector("#i-productName").value = s.productName || ""; } }); },
  commit: async function (body, o, st) {
    o.dates = Object.assign({}, st.rec.dates || {}); if (!o.dates["접수"]) o.dates["접수"] = o.date; if (!o.dates[o.status]) o.dates[o.status] = U.today();
    if (o.saleId) { var s = ERP.DATA.sales.get(o.saleId); if (s) { o.salePrice = num(s.salePrice); o.orderNo = s.sabangOrderNo || ""; } }
    if (await ERP.save("returns", o)) { ERP.toast("반품·취소를 저장했어요."); return true; } return false;
  }
};
ERP.acts.newret = function () { open(); };
ERP.page({ id: "returns", title: "반품·취소", render: render, badge: function () { return ERP.list("returns").filter(function (r) { return r.status !== "완료"; }).length || ""; } });
})();
