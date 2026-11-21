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
    var rl = C.retLoss(r);
    var rlCls = rl > 0 ? "neg" : rl < 0 ? "p-good" : "";
    var rlDisp = rl === 0 ? "-" : (rl > 0 ? "손실 " + won(rl) : "수익 " + won(-rl));
    return '<tr class="click" data-edit="returns:' + esc(r.id) + '" tabindex="0"><td class="num">' + esc(C.retDate(r).slice(5)) + '</td><td><span class="pill p-acc">' + esc(r.type) + '</span></td><td><span class="pill ' + sp + '">' + esc(r.status) + "</span></td><td>" + esc(ERP.platName(r.platformId || (sale && sale.platformId))) + '</td><td class="name">' + esc(r.productName || (sale && sale.productName) || "") + (r.memo ? "<small>" + esc(r.memo) + "</small>" : "") + '</td><td class="r num">' + won(r.shipCost) + '</td><td class="r num">' + won(r.shipIncome) + '</td><td class="r num">' + won(r.refundLoss) + '</td><td class="r num ' + rlCls + '">' + rlDisp + "</td></tr>";
  }).join("");
  var h = '<div class="head"><div><h1>반품·취소</h1><p>완료된 취소·반품은 매출과 이익에서 자동으로 빠져요</p></div><div class="tools">' + (w ? '<button class="btn pri" data-act="newret">+ 반품·취소 등록</button>' : "") + "</div></div>";
  h += '<div class="tools filters">' + ERP.chips("data-view", "rStatus=" + v.rStatus, [["rStatus=", "전체"], ["rStatus=open", "진행 중"], ["rStatus=done", "완료"]]) + "</div>";
  var lossLabel = loss > 0 ? ("손실 " + won(loss) + "원") : loss < 0 ? ("수익 " + won(-loss) + "원") : "0원";
  h += '<div class="tiles">' + ERP.tile("건수", list.length + "건") + ERP.tile("반품 순손익", lossLabel, "배송비지출 − 고객부담 반품비 + 환불손실", loss > 0 ? "" : "hl") + "</div>";
  return h + (list.length ? '<div class="table-wrap"><table><thead><tr><th>날짜</th><th>유형</th><th>상태</th><th>쇼핑몰</th><th>상품</th><th class="r">배송비 지출</th><th class="r">고객부담 반품비</th><th class="r">환불손실</th><th class="r">순손익</th></tr></thead><tbody>' + body + "</tbody></table></div>" : '<div class="panel empty"><b>등록된 반품·취소가 없어요</b></div>');
}
function open(r) {
  var isNew = !r, fd = ERP.fd, sel = ERP.sel;
  r = r || { id: U.uid(), date: U.today(), type: "반품", status: "접수", saleId: "", orderNo: "", platformId: "", productName: "", salePrice: 0, shipCost: 7000, shipIncome: 0, refundLoss: 0, restocked: false, memo: "", dates: {}, source: "manual", extra: {} };
  var lo = U.shiftMonth(U.ym(U.today()), -3);
  var sales = ERP.list("sales").filter(function (s) { return s.id === r.saleId || (s.date || "") >= lo; }).sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
  var f = '<div class="fg">' + fd("접수일", "date", "date", r.date) + sel("유형", "type", ["취소", "반품", "교환"], r.type) + '<div class="fd"><label>유형 바꾸기</label><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><button type="button" class="btn" onclick="(function(b){var s=document.querySelector(\'[name=type]\');if(s){s.value=\'반품\';s.dispatchEvent(new Event(\'change\',{bubbles:true}));}var h=document.getElementById(\'type-hint\');if(h)h.textContent=\'반품(으)로 바뀜 · 저장을 누르세요\';})(this)">반품으로</button><button type="button" class="btn" onclick="(function(b){var s=document.querySelector(\'[name=type]\');if(s){s.value=\'교환\';s.dispatchEvent(new Event(\'change\',{bubbles:true}));}var h=document.getElementById(\'type-hint\');if(h)h.textContent=\'교환(으)로 바뀜 · 저장을 누르세요\';})(this)">교환으로</button><span id="type-hint" style="font-size:12px;opacity:.75"></span></div></div>' + sel("진행 상태", "status", ["접수", "회수중", "완료"], r.status) + '<div class="fd"><label for="i-platformId">쇼핑몰</label><select id="i-platformId" name="platformId">' + ERP.platOptions(r.platformId) + "</select></div>" +
    '<div class="fd full"><label for="i-saleId">연결할 매출 (최근 3개월)</label><select id="i-saleId" name="saleId"><option value="">연결 안 함</option>' + sales.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === r.saleId ? " selected" : "") + ">" + esc((s.date || "").slice(5) + " · " + ERP.platName(s.platformId) + " · " + (s.productName || "").slice(0, 40) + " · " + won(s.salePrice)) + "</option>"; }).join("") + "</select></div>" +
    fd("상품명 (매출 연결 안 할 때)", "productName", "text", r.productName, "full") + fd("우리 손실 (기본: 머스트잇 왕복 3,500원 · 다른 쇼핑몰 7,000원 · 취소 0원)", "shipCost", "number", r.shipCost) + fd("고객한테 받은 반품비 (수익)", "shipIncome", "number", r.shipIncome) + '<div class="fd"><label>받은 반품비 빠른 입력 → 수익</label><div style="display:flex;gap:6px;flex-wrap:wrap">' + [0, 7000, 10000, 12000, 14000, 16000, 18000, 20000, 40000, 50000].map(function (x) { return '<button type="button" class="btn sm" onclick="var b=this.closest(\'.fg\').querySelector(\'#i-shipIncome\');b.value=' + x + ';b.dispatchEvent(new Event(\'input\',{bubbles:true}))">' + (x ? won(x) : "안 받음") + "</button>"; }).join("") + "</div></div>" + fd("환불 손실(차액 등)", "refundLoss", "number", r.refundLoss) +
    '<div class="fd chk"><input type="checkbox" id="i-restocked" name="restocked"' + (r.restocked ? " checked" : "") + '><label for="i-restocked">재고로 다시 들어옴</label></div>' + fd("메모", "memo", "text", r.memo, "full") + "</div>";
  ERP.openDrawer(isNew ? "반품·취소 등록" : "반품·취소 수정", f, "returns", r, isNew);
}
ERP.forms.returns = {
  open: open,
  afterOpen: function (body) { var ty = body.querySelector("#i-type"), sc = body.querySelector("#i-shipCost"), pf = body.querySelector("#i-platformId");
    /* 우리 손실 기본값 (2026-11-17 대표님): 머스트잇 = 왕복 3,500원 · 다른 쇼핑몰 = 7,000원 · 취소 = 0원. 직접 고친 금액은 안 건드림 */
    var DEF = [0, 3500, 7000], auto = function () { if (!ty || !sc) return; var cur = sc.value === "" ? 0 : Number(sc.value); if (DEF.indexOf(cur) < 0) return; var must = pf && /머스트잇|mustit/i.test(ERP.platName(pf.value) || ""); sc.value = ty.value === "취소" ? 0 : must ? 3500 : 7000; };
    if (ty) ty.addEventListener("change", auto); if (pf) pf.addEventListener("change", auto);
    var ss = body.querySelector("#i-saleId"); ss.addEventListener("change", function () { var s = ERP.DATA.sales.get(ss.value); if (s) { pf.value = s.platformId || ""; body.querySelector("#i-productName").value = s.productName || ""; auto(); } });
    },
  commit: async function (body, o, st) {
    o.dates = Object.assign({}, st.rec.dates || {}); if (!o.dates["접수"]) o.dates["접수"] = o.date; if (!o.dates[o.status]) o.dates[o.status] = U.today();
    if (o.saleId) { var s = ERP.DATA.sales.get(o.saleId); if (s) { o.salePrice = num(s.salePrice); o.orderNo = s.sabangOrderNo || ""; } }
    if (await ERP.save("returns", o)) { ERP.toast("반품·취소를 저장했어요."); return true; } return false;
  }
};
ERP.acts.newret = function () { open(); };
ERP.page({ id: "returns", title: "반품·취소", render: render, badge: function () { return ERP.list("returns").filter(function (r) { return r.status !== "완료"; }).length || ""; } });
})();
