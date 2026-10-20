/* 메뉴: 매출 (+ 사방넷 주문 가져오기) */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, C = ERP.C, esc = U.esc, won = U.won, pct = U.pct, num = U.num;
var v = ERP.view; v.saleFilter = v.saleFilter || "all"; v.platform = v.platform || ""; v.q = v.q || "";
function settleOf(s) { return s.settleStatus || "미확인"; }
function rows() {
  var q = v.q.trim().toLowerCase(), cross = v.saleFilter === "nocost" || v.saleFilter === "pending";
  return ERP.list("sales").filter(function (s) {
    if (!cross && U.ym(s.date) !== v.month) return false;
    if (v.saleFilter === "nocost" && !(num(s.salePrice) > 0 && !num(s.cost) && !ERP.excluded(s))) return false;
    if (v.saleFilter === "pending" && (settleOf(s) === "확정" || ERP.excluded(s))) return false;
    if (v.saleFilter === "ret" && !S.retBySale.get(s.id)) return false;
    if (v.platform && s.platformId !== v.platform) return false;
    if (q && ((s.productName || "") + " " + (s.itemCode || "") + " " + (s.sabangOrderNo || "") + " " + (s.mallOrderNo || "")).toLowerCase().indexOf(q) === -1) return false;
    return true;
  }).sort(function (a, b) { return ((b.date || "") + (b.orderTime || "")).localeCompare((a.date || "") + (a.orderTime || "")); });
}
function render() {
  var list = rows(), cross = v.saleFilter === "nocost" || v.saleFilter === "pending", w = ERP.canWrite("sales"), t = { rev: 0, fee: 0, set: 0, cost: 0, margin: 0, mrev: 0 };
  var body = list.map(function (s) {
    var d = ERP.derive(s), off = ERP.excluded(s), r = S.retBySale.get(s.id);
    if (!off) { t.rev += num(s.salePrice); t.fee += d.fee; t.set += d.settled; t.cost += num(s.cost); if (d.hasCost) { t.margin += d.margin; t.mrev += num(s.salePrice); } }
    var stp = d.st === "확정" ? '<span class="pill p-good">확정</span>' : d.st === "예상" ? '<span class="pill p-warn">예상</span>' : '<span class="pill p-crit">미확인</span>';
    var rp = r ? ' <span class="pill ' + (r.status === "완료" ? "p-mute" : "p-crit") + '">' + esc(r.type) + " " + esc(r.status) + "</span>" : "";
    return '<tr class="click ' + (off ? "off" : "") + '" data-edit="sales:' + esc(s.id) + '" tabindex="0"><td class="num">' + esc((s.date || "날짜없음").slice(5)) + "</td><td>" + esc(ERP.platName(s.platformId)) + '</td><td class="name">' + esc(s.productName) + rp + '<small class="num">' + esc(s.itemCode || "") + (s.sabangOrderNo ? " · 사방넷 " + esc(s.sabangOrderNo) : "") + '</small></td><td class="r num">' + won(s.salePrice) + '</td><td class="r num">' + won(d.fee) + '</td><td class="r num">' + won(d.settled) + " " + stp + '</td><td class="r num">' + (num(s.cost) ? won(s.cost) : '<span class="pill p-warn">미입력</span>') + '</td><td class="r num ' + (d.hasCost && d.margin < 0 ? "neg" : "") + '">' + (d.hasCost ? won(d.margin) : "–") + '</td><td class="r num">' + (d.hasCost ? pct(d.rate) : "–") + "</td></tr>";
  }).join("");
  var h = '<div class="head"><div><h1>매출</h1><p>' + (cross ? "모든 기간" : v.month.replace("-", "년 ") + "월") + " · " + list.length + "건" + (w ? " · 줄을 누르면 수정해요" : "") + '</p></div><div class="tools">' + (cross ? "" : ERP.monthBar()) + (w ? '<button class="btn" data-act="sabangimport">사방넷 주문 가져오기</button><button class="btn pri" data-act="newsale">+ 매출 추가</button>' : "") + '<button class="btn" data-act="exportsales">엑셀 내보내기</button></div></div>';
  h += '<div class="tools filters">' + ERP.chips("data-view", "saleFilter=" + v.saleFilter, [["saleFilter=all", "전체"], ["saleFilter=nocost", "원가 미입력"], ["saleFilter=pending", "정산 미확정"], ["saleFilter=ret", "반품·취소 건"]]) + '<select class="ctl" id="f-plat" aria-label="쇼핑몰">' + ERP.platOptions(v.platform, true) + '</select><input class="ctl search" data-search="q" type="search" aria-label="검색" placeholder="상품명·품번·주문번호" value="' + esc(v.q) + '"></div>';
  h += '<div class="tiles">' + ERP.tile("매출", won(t.rev)) + ERP.tile("수수료", won(t.fee)) + ERP.tile("정산액", won(t.set)) + ERP.tile("원가", won(t.cost)) + ERP.tile("마진", '<span class="' + (t.margin < 0 ? "neg" : "") + '">' + won(t.margin) + "</span>", "원가 입력분 마진율 " + pct(t.mrev ? t.margin / t.mrev : 0)) + "</div>";
  h += list.length ? '<div class="table-wrap"><table><thead><tr><th>날짜</th><th>쇼핑몰</th><th>상품</th><th class="r">판매가</th><th class="r">수수료</th><th class="r">정산액</th><th class="r">원가</th><th class="r">마진</th><th class="r">마진율</th></tr></thead><tbody>' + body + "</tbody></table></div>" : '<div class="panel empty"><b>조건에 맞는 매출이 없어요</b>' + (w ? "사방넷 주문 엑셀을 가져오거나 ‘매출 추가’로 직접 입력하세요." : "") + "</div>";
  return h + '<p class="note">정산액: 확정은 실제 정산 금액, 예상·미확인은 판매가에서 수수료를 뺀 추정치예요. 마진 = 정산액 + 조정 − 원가 − 배송비 − 후정산 광고비.</p>';
}
function bind(root) { var fp = root.querySelector("#f-plat"); if (fp) fp.onchange = function () { v.platform = fp.value; ERP.render(); }; }

/* 입력창 */
function open(s) {
  var isNew = !s, fd = ERP.fd, sel = ERP.sel;
  s = s || { id: U.uid(), date: U.today(), orderTime: "", platformId: "", productName: "", itemCode: "", brand: "", category: "", salePrice: "", cost: "", settledAmount: "", settleStatus: "미확인", adjustment: 0, shippingFee: num(S.SET.default_shipping_fee), etcAmount: 0, vatCreditable: true, deferredStatus: null, deferredFinalAmount: 0, sabangOrderNo: "", mallOrderNo: "", source: "manual", purchaseId: "", memo: "", extra: {} };
  var stock = ERP.list("purchases").filter(function (p) { return p.status === "in_stock" || p.id === s.purchaseId; }).sort(function (a, b) { var ma = s.itemCode && U.norm(a.itemCode) === U.norm(s.itemCode) ? 0 : 1, mb = s.itemCode && U.norm(b.itemCode) === U.norm(s.itemCode) ? 0 : 1; return ma - mb || a.date.localeCompare(b.date); });
  var f = '<div class="fg">' + fd("날짜", "date", "date", s.date) + fd("주문시간", "orderTime", "time", s.orderTime) + '<div class="fd"><label for="i-platformId">쇼핑몰</label><select id="i-platformId" name="platformId">' + ERP.platOptions(s.platformId) + "</select></div>" + sel("분류", "category", [["", "미분류"]].concat(ERP.CATS), s.category) +
    fd("상품명", "productName", "text", s.productName, "full") + fd("품번", "itemCode", "text", s.itemCode) + fd("브랜드", "brand", "text", s.brand) +
    '</div><div class="sect">금액</div><div class="fg">' + fd("판매가", "salePrice", "number", s.salePrice) + fd("배송비(내가 부담)", "shippingFee", "number", s.shippingFee) + sel("정산 상태", "settleStatus", ["확정", "예상", "미확인"], settleOf(s)) + fd("실제 정산액(확정일 때)", "settledAmount", "number", s.settledAmount) + fd("조정금액(+/−)", "adjustment", "number", s.adjustment) + fd("기타 수입", "etcAmount", "number", s.etcAmount) + sel("후정산 광고비", "deferredStatus", [["", "예상치 사용"], ["확정", "확정 금액 입력"]], s.deferredStatus || "") + fd("확정 광고비", "deferredFinalAmount", "number", s.deferredFinalAmount) +
    '</div><div class="sect">원가 · 매입 연결</div><div class="fg"><div class="fd full"><label for="i-purchaseId">재고에서 연결 (선택하면 원가가 자동으로 들어가요)</label><select id="i-purchaseId" name="purchaseId"><option value="">연결 안 함</option>' + stock.slice(0, 400).map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === s.purchaseId ? " selected" : "") + ">" + esc(p.date + " · " + (p.itemCode || "") + " " + (p.option || "") + " · " + won(C.effCost(p)) + "원") + "</option>"; }).join("") + "</select></div>" +
    fd("원가", "cost", "number", s.cost) + '<div class="fd chk"><input type="checkbox" id="i-vatCreditable" name="vatCreditable"' + (s.vatCreditable !== false ? " checked" : "") + '><label for="i-vatCreditable">매입세액 공제 대상</label></div>' +
    '</div><div class="sect">주문번호 · 메모</div><div class="fg">' + fd("사방넷 주문번호", "sabangOrderNo", "text", s.sabangOrderNo) + fd("쇼핑몰 주문번호", "mallOrderNo", "text", s.mallOrderNo) + fd("메모", "memo", "text", s.memo || "", "full") + '</div><div class="preview" id="pv"></div>' + (isNew || !ERP.docsBlock ? "" : ERP.docsBlock("sale", s.id, s.itemCode));
  ERP.openDrawer(isNew ? "매출 추가" : "매출 수정", f, "sales", s, isNew);
}
ERP.forms.sales = {
  open: open,
  afterOpen: function (body, rec) {
    var upd = function () { var o = ERP.readForm(body, rec), d = ERP.derive(o); U.$("pv").innerHTML = "<div><span>수수료</span><b>" + won(d.fee) + "</b></div><div><span>정산액" + (d.st === "확정" ? "" : " (추정)") + "</span><b>" + won(d.settled) + "</b></div>" + (d.isDef ? "<div><span>후정산 광고비</span><b>" + won(d.defApplied) + "</b></div>" : "") + "<div><span>마진</span><b>" + (d.hasCost ? won(d.margin) : "원가 필요") + "</b></div><div><span>마진율</span><b>" + (d.hasCost ? pct(d.rate) : "–") + "</b></div>"; };
    body.addEventListener("input", upd); body.addEventListener("change", upd); upd();
    var ps = body.querySelector("#i-purchaseId"); ps.addEventListener("change", function () { var p = ERP.DATA.purchases.get(ps.value); if (p) { body.querySelector("#i-cost").value = Math.round(C.effCost(p)); if (!body.querySelector("#i-itemCode").value) body.querySelector("#i-itemCode").value = p.itemCode || ""; upd(); } });
    if (ERP.bindDocLinks) ERP.bindDocLinks(body);
  },
  commit: async function (body, o, st) {
    if (!o.date || !o.platformId) throw new Error("날짜와 쇼핑몰을 입력해 주세요.");
    o.deferredStatus = o.deferredStatus || null;
    var prevP = st.rec.purchaseId || "", saved = await ERP.save("sales", o); if (!saved) return false;
    if (prevP !== (o.purchaseId || "")) {
      var old = ERP.DATA.purchases.get(prevP); if (old && old.soldSaleId === o.id) await ERP.save("purchases", Object.assign({}, old, { status: "in_stock", soldSaleId: null }));
      var np = ERP.DATA.purchases.get(o.purchaseId); if (np) await ERP.save("purchases", Object.assign({}, np, { status: "sold", soldSaleId: o.id }));
    }
    ERP.toast("매출을 저장했어요."); return true;
  },
  remove: async function (rec) { var ok = await ERP.remove("sales", rec.id); if (ok && rec.purchaseId) { var p = ERP.DATA.purchases.get(rec.purchaseId); if (p && p.soldSaleId === rec.id) await ERP.save("purchases", Object.assign({}, p, { status: "in_stock", soldSaleId: null })); } return ok; }
};
ERP.acts.newsale = function () { open(); };

/* 사방넷 주문 가져오기 */
function readRows(file) {
  return new Promise(function (res, rej) {
    var isCsv = /\.csv$/i.test(file.name), fr = new FileReader();
    fr.onerror = function () { rej(new Error("read")); };
    fr.onload = function () { try { var wb; if (isCsv) { var buf = new Uint8Array(fr.result), txt = new TextDecoder("utf-8").decode(buf); if (txt.indexOf(String.fromCharCode(65533)) !== -1) { try { txt = new TextDecoder("euc-kr").decode(buf); } catch (e) {} } wb = XLSX.read(txt, { type: "string" }); } else wb = XLSX.read(new Uint8Array(fr.result), { type: "array" }); res(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" })); } catch (e) { rej(e); } };
    fr.readAsArrayBuffer(file);
  });
}
function matchPlat(name) { if (!name) return ""; var n = String(name).replace(/\s+/g, ""); var e = S.PLATS.find(function (p) { return p.name.replace(/\s+/g, "") === n; }); if (e) return e.id; var l = S.PLATS.find(function (p) { var pn = p.name.replace(/\s+/g, ""); return n.indexOf(pn) !== -1 || pn.indexOf(n) !== -1; }); return l ? l.id : ""; }
async function importSabang(file) {
  var rows; try { rows = await readRows(file); } catch (e) { ERP.toast("파일을 읽지 못했어요. 사방넷에서 내려받은 엑셀(xlsx) 또는 CSV인지 확인해 주세요."); return; }
  var hi = rows.findIndex(function (r) { return r.some(function (c) { return /주문일|쇼핑몰명/.test(String(c)); }); });
  if (hi < 0) { ERP.toast("‘주문일시’, ‘쇼핑몰명’ 열을 찾지 못했어요."); return; }
  var h = rows[hi], F = C.findCol, ix = { date: F(h, ["주문일시", "주문일자", "주문일"]), plat: F(h, ["쇼핑몰명"]), name: F(h, ["상품명(확정)"]), name2: F(h, ["상품명(수집)", "상품명"]), opt: F(h, ["옵션(확정)", "옵션(수집)", "옵션"]), ord: F(h, ["사방넷주문번호"]), mall: F(h, ["쇼핑몰주문번호", "주문번호(쇼핑몰)"]), amt: F(h, ["주문금액", "결제금액", "주문합계"]), price: F(h, ["판매가(수집)", "판매가"]), code: F(h, ["모델NO", "모델번호", "자체상품코드", "품번"]), status: F(h, ["주문상태", "상태"]) };
  if (ix.ord < 0) ix.ord = F(h, ["주문번호"]);
  var byOrd = new Map(); ERP.list("sales").forEach(function (s) { if (s.sabangOrderNo) byOrd.set(String(s.sabangOrderNo), s); });
  var added = [], updated = [], newPlats = [], skip = 0;
  for (var r = hi + 1; r < rows.length; r++) {
    var row = rows[r]; if (!row || row.every(function (c) { return !String(c).trim(); })) continue;
    var ord = ix.ord >= 0 ? String(row[ix.ord]).trim() : "", st = ix.status >= 0 ? String(row[ix.status]).trim() : "";
    if (ord && byOrd.has(ord)) { var ex = byOrd.get(ord); if (st && ex.id && ex.shipStatus !== st) updated.push(ERP.toRow("sales", Object.assign({}, ex, { shipStatus: st }))); continue; }
    var date = C.normDate(row[ix.date]); if (!date) { skip++; continue; }
    var pn = ix.plat >= 0 ? String(row[ix.plat]).trim() : "", pid = matchPlat(pn);
    if (!pid && pn) { var np = newPlats.find(function (x) { return x.name === pn; }); if (!np) { np = { id: "p_" + Math.random().toString(36).slice(2, 9), name: pn, fee: 0, settlement: "선정산", deferredRate: 0, multiplier: 1, verified: false, tiered: false, sort: 999 }; newPlats.push(np); S.PLATS.push(np); } pid = np.id; }
    var nm = String((ix.name >= 0 && row[ix.name]) || (ix.name2 >= 0 && row[ix.name2]) || "").trim(), op = ix.opt >= 0 ? String(row[ix.opt]).trim() : "";
    var amt = ix.amt >= 0 ? num(row[ix.amt]) : 0; if (!amt && ix.price >= 0) amt = num(row[ix.price]); if (!amt) { skip++; continue; }
    var tm = String(row[ix.date] || "").match(/(\d{1,2}):(\d{2})/);
    added.push(ERP.toRow("sales", { id: U.uid(), date: date, orderTime: tm ? U.p2(tm[1]) + ":" + tm[2] : "", platformId: pid, productName: (nm || "(상품명 없음)") + (op ? " (" + op + ")" : ""), itemCode: ix.code >= 0 ? String(row[ix.code]).trim() : "", salePrice: amt, cost: 0, settledAmount: 0, settleStatus: "미확인", adjustment: 0, shippingFee: num(S.SET.default_shipping_fee), etcAmount: 0, vatCreditable: true, deferredStatus: null, deferredFinalAmount: 0, sabangOrderNo: ord, mallOrderNo: ix.mall >= 0 ? String(row[ix.mall]).trim() : "", source: "sabangnet", shipStatus: st, extra: {} }));
    if (ord) byOrd.set(ord, {});
  }
  if (!added.length && !updated.length) { ERP.toast("새로 추가할 주문이 없어요." + (skip ? " (형식이 맞지 않는 " + skip + "줄 제외)" : "")); return; }
  try {
    ERP.sync("busy", "가져오는 중");
    if (newPlats.length) await ERP.saveBatch("platforms", newPlats.map(function (p) { return ERP.toRow("platforms", p); }));
    await ERP.saveBatch("sales", added.concat(updated));
    added.concat(updated).forEach(function (r) { ERP.applyRow("sales", r); });
    var summary = added.length + "건 추가, " + updated.length + "건 상태 갱신" + (skip ? ", " + skip + "줄 제외" : "") + (newPlats.length ? ", 새 쇼핑몰 " + newPlats.map(function (p) { return p.name; }).join("·") : "");
    await S.sb.from("import_log").insert({ kind: "사방넷 주문", file_name: file.name, summary: summary });
    ERP.sync("ok", "저장됨"); await ERP.loadReport(); ERP.render();
    ERP.toast("사방넷 가져오기 완료: " + summary + (newPlats.length ? "\n채널·카드 설정에서 새 쇼핑몰 수수료를 입력해 주세요." : ""));
  } catch (e) { ERP.sync("err", "가져오기 실패"); ERP.toast(ERP.errMsg(e)); }
}
ERP.acts.sabangimport = function () { ERP.pickFile(".xlsx,.xls,.csv", importSabang); };
ERP.saleRowsX = function (list) { return list.map(function (s) { var d = ERP.derive(s); return { "날짜": s.date || "", "시간": s.orderTime || "", "쇼핑몰": ERP.platName(s.platformId), "상품명": s.productName, "품번": s.itemCode || "", "판매가": num(s.salePrice), "수수료": Math.round(d.fee), "정산액": d.settled, "정산상태": d.st, "원가": num(s.cost), "배송비": num(s.shippingFee), "조정": num(s.adjustment), "후정산광고비": Math.round(d.defApplied), "마진": d.hasCost ? Math.round(d.margin) : "", "반품·취소": ERP.excluded(s) ? "제외" : "", "사방넷주문번호": s.sabangOrderNo || "", "쇼핑몰주문번호": s.mallOrderNo || "" }; }); };
ERP.acts.exportsales = function () { ERP.downloadBlob("로우나_매출_" + v.month + ".xlsx", ERP.xlsxBlob([{ name: "매출", rows: ERP.saleRowsX(rows()) }])); };
ERP.page({ id: "sales", title: "매출", render: render, bind: bind, badge: function () { var n = 0; ERP.list("sales").forEach(function (s) { if (num(s.salePrice) > 0 && !num(s.cost) && !ERP.excluded(s)) n++; }); return n || ""; } });
})();
