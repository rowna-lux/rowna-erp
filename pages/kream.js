/* 메뉴: 크림 › 열무 도매
   도매 리스트(브랜드·품번·사이즈·수량·도매가)를 크림 시세와 비교해 살지 말지 판단.
   크림 가격을 고칠 때마다 시세 기록(kream_price_log)에 한 줄씩 쌓여 추이를 볼 수 있어요. */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, C = ERP.C, esc = U.esc, won = U.won, pct = U.pct, num = U.num;
var SUPPLIER = "열무", v = ERP.view;
var DECISIONS = ["검토", "매입", "보류", "제외"];
function rate() { return S.SET.kream_fee_rate == null ? 0.06 : Number(S.SET.kream_fee_rate); }
function cap() { return S.SET.kream_fee_cap == null ? 300000 : num(S.SET.kream_fee_cap); }
function calc(it) { return C.kream(it.kreamPrice, it.wholesalePrice, rate(), cap()); }
function items() { return ERP.list("kream_wholesale").filter(function (x) { return (x.supplier || SUPPLIER) === SUPPLIER; }); }
function listDates() { var d = {}; items().forEach(function (x) { if (x.listDate) d[x.listDate] = 1; }); return Object.keys(d).sort().reverse(); }
function vpill(c) { if (!c) return '<span class="pill p-mute">크림가 필요</span>'; return c.verdict === "추천" ? '<span class="pill p-good">✓ 추천</span>' : c.verdict === "검토" ? '<span class="pill p-warn">△ 검토</span>' : '<span class="pill p-crit">✕ 비추천</span>'; }

function render() {
  var dates = listDates(); if (!v.kList || dates.indexOf(v.kList) === -1) v.kList = dates[0] || "";
  var w = ERP.canWrite("kream_wholesale"), list = items().filter(function (x) { return x.listDate === v.kList; });
  var groups = {}, order = [];
  list.forEach(function (x) { var k = x.sku || x.name || x.id; if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(x); });
  var T = { qty: 0, whole: 0, real: 0, recQty: 0, recReal: 0, recWhole: 0, buyQty: 0, buyWhole: 0, buyReal: 0 };
  var body = order.map(function (k) {
    var g = groups[k].sort(function (a, b) { return String(a.size).localeCompare(String(b.size), "ko", { numeric: true }); }), f = g[0];
    return g.map(function (it, i) {
      var c = calc(it), q = num(it.qty), tot = c ? c.real * q : 0;
      T.qty += q; T.whole += num(it.wholesalePrice) * q; T.real += tot;
      if (c && c.verdict === "추천") { T.recQty += q; T.recReal += tot; T.recWhole += num(it.wholesalePrice) * q; }
      if (it.decision === "매입") { T.buyQty += q; T.buyWhole += num(it.wholesalePrice) * q; T.buyReal += tot; }
      var prod = i ? "" : '<td class="name" rowspan="' + g.length + '"><b>' + esc(f.brand || "") + "</b> " + esc(f.name || "") + '<small class="num">' + esc(f.sku || "") + "</small>" + (f.kreamUrl ? '<small><a href="' + esc(f.kreamUrl) + '" target="_blank" rel="noopener">크림에서 보기 ↗</a></small>' : "") + "</td>";
      return '<tr class="' + (it.decision === "제외" ? "off" : "") + '">' + prod + '<td class="click" data-edit="kream_wholesale:' + esc(it.id) + '" tabindex="0">' + esc(it.size || "F") + '</td><td class="r num">' + q + '</td><td class="r num">' + won(it.wholesalePrice) + '</td><td class="r kp">' +
        (w ? '<input class="cell-in num" type="number" inputmode="numeric" aria-label="' + esc((f.brand || "") + " " + (it.size || "") + " 크림 판매가") + '" data-kp="' + esc(it.id) + '" value="' + (it.kreamPrice == null ? "" : Math.round(it.kreamPrice)) + '" placeholder="입력">' : '<span class="num">' + (it.kreamPrice == null ? "–" : won(it.kreamPrice)) + "</span>") +
        '<small class="muted">' + esc(it.kreamRecent || "") + "</small></td>" +
        '<td class="r num ' + (c && c.real < 0 ? "neg" : "") + '">' + (c ? won(c.real) : "–") + '</td><td class="r num">' + (c ? pct(c.rate) : "–") + '</td><td class="r num ' + (tot < 0 ? "neg" : "") + '">' + (c ? won(tot) : "–") + '</td><td class="r num">' + (c ? won(c.breakeven) : "–") + "</td><td>" + vpill(c) + "</td><td>" +
        (w ? '<select class="ctl sm" data-dec="' + esc(it.id) + '" aria-label="결정">' + DECISIONS.map(function (d) { return "<option" + (d === (it.decision || "검토") ? " selected" : "") + ">" + d + "</option>"; }).join("") + "</select>" : esc(it.decision || "검토")) + "</td></tr>";
    }).join("");
  }).join("");
  var h = '<div class="head"><div><h1>열무 도매</h1><p>도매가와 크림 시세를 비교해 살지 판단해요 · 크림 판매가를 고치면 시세 기록에 쌓여요</p></div><div class="tools">' +
    (dates.length ? '<select class="ctl" id="k-list" aria-label="리스트 날짜">' + dates.map(function (d) { return "<option" + (d === v.kList ? " selected" : "") + ' value="' + d + '">' + d.replace(/-/g, ".") + " 리스트</option>"; }).join("") + "</select>" : "") +
    (w ? '<button class="btn" data-act="kreamnewlist">새 리스트</button><button class="btn pri" data-act="kreamadd">+ 상품 추가</button>' : "") + (list.length ? '<button class="btn" data-act="kreamexport">엑셀 내보내기</button>' : "") + "</div></div>";
  if (!list.length) return h + '<div class="panel empty"><b>열무 도매 리스트가 아직 없어요</b>' + (w ? "‘+ 상품 추가’로 넣거나, 도매 리스트 사진을 Claude에게 보내면 크림 시세까지 채워서 넣어 드려요." : "") + "</div>" + feeNote(w);
  h += '<div class="tiles">' + ERP.tile("리스트 전체", T.qty + "개", won(T.whole) + "원 · 예상 이익 " + won(T.real) + "원") + ERP.tile("추천만 사면", T.recQty + "개", won(T.recWhole) + "원 → 이익 " + won(T.recReal) + "원", "hl") + ERP.tile("매입 결정", T.buyQty + "개", won(T.buyWhole) + "원 · 예상 이익 " + won(T.buyReal) + "원") + "</div>";
  h += '<div class="table-wrap"><table style="min-width:1180px"><thead><tr><th>상품</th><th>사이즈</th><th class="r">수량</th><th class="r">도매가</th><th class="r">크림 판매가</th><th class="r">개당 실이익</th><th class="r">이익률</th><th class="r">합계 이익</th><th class="r">손익분기가</th><th>판단</th><th>결정</th></tr></thead><tbody>' + body + "</tbody></table></div>";
  return h + feeNote(w);
}
function feeNote(w) {
  return '<div class="panel"><h2>계산 기준</h2><div class="fg narrow"><div class="fd"><label for="k-rate">크림 판매 수수료 % (부가세 별도)</label><input id="k-rate" type="number" step="0.1" value="' + (rate() * 100).toFixed(1) + '"' + (ERP.isOwner() ? "" : " disabled") + '></div><div class="fd"><label for="k-cap">수수료 최대 금액(원)</label><input id="k-cap" type="number" value="' + cap() + '"' + (ERP.isOwner() ? "" : " disabled") + '></div></div>' +
    '<p class="note">실이익 = 크림 판매가 ÷ 1.1 − 수수료 − 도매가 ÷ 1.1 (도매 세금계산서 매입세액 공제, 크림 매출 부가세 반영). 판단: 이익률 8% 이상 추천 · 3~8% 검토 · 3% 미만 비추천. 크림 창고 보내는 택배비는 빠져 있어요. 수수료는 판매자 등급에 따라 달라요 — 대표님 등급에 맞게 고쳐 주세요.</p></div>';
}
function bind(root) {
  var kl = root.querySelector("#k-list"); if (kl) kl.onchange = function () { v.kList = kl.value; ERP.render(); };
  root.querySelectorAll("[data-kp]").forEach(function (el) { el.onchange = async function () { var it = ERP.DATA.kream_wholesale.get(el.dataset.kp); if (!it) return; var val = el.value === "" ? null : num(el.value); await savePrice(it, val, it.kreamRecent); }; });
  root.querySelectorAll("[data-dec]").forEach(function (el) { el.onchange = function () { var it = ERP.DATA.kream_wholesale.get(el.dataset.dec); if (it) ERP.save("kream_wholesale", Object.assign({}, it, { decision: el.value })); }; });
  var r = root.querySelector("#k-rate"); if (r) r.onchange = function () { ERP.saveSetting("kream_fee_rate", num(r.value) / 100); ERP.render(); };
  var cp = root.querySelector("#k-cap"); if (cp) cp.onchange = function () { ERP.saveSetting("kream_fee_cap", num(cp.value)); ERP.render(); };
}
async function savePrice(it, price, recent) {
  var saved = await ERP.save("kream_wholesale", Object.assign({}, it, { kreamPrice: price, kreamRecent: recent || "", kreamCheckedAt: new Date().toISOString() }));
  if (saved && price != null) await S.sb.from("kream_price_log").insert({ sku: it.sku || it.name || "", size: it.size || "", kream_url: it.kreamUrl || "", last_trade: price, trades: recent || "", source: "manual" });
  return saved;
}

function open(it, preset) {
  var isNew = !it, fd = ERP.fd, sel = ERP.sel; preset = preset || {};
  it = it || Object.assign({ id: U.uid(), supplier: SUPPLIER, listDate: v.kList || U.today(), brand: "", sku: "", name: "", kreamUrl: "", size: "F", qty: 1, wholesalePrice: "", kreamPrice: "", kreamRecent: "", decision: "검토", memo: "", extra: {} }, preset);
  var f = '<div class="fg">' + fd("리스트 날짜", "listDate", "date", it.listDate) + fd("브랜드", "brand", "text", it.brand) + fd("품번(SKU)", "sku", "text", it.sku) + fd("상품명", "name", "text", it.name, "full") + fd("크림 링크", "kreamUrl", "url", it.kreamUrl, "full") +
    fd("사이즈", "size", "text", it.size) + fd("수량", "qty", "number", it.qty) + fd("도매가 (부가세 포함, 1개)", "wholesalePrice", "number", it.wholesalePrice) + fd("크림 판매가 (1개)", "kreamPrice", "number", it.kreamPrice == null ? "" : it.kreamPrice) +
    fd("최근 체결가 메모", "kreamRecent", "text", it.kreamRecent, "full", ' placeholder="예: 10/19 311,000 · 10/18 309,000"') + sel("결정", "decision", DECISIONS, it.decision || "검토") + fd("메모", "memo", "text", it.memo, "full") + '</div><div class="preview" id="kpv"></div>' +
    (isNew ? "" : '<div class="sect">시세 기록</div><div id="khist" class="note">불러오는 중</div>');
  ERP.openDrawer(isNew ? "열무 도매 상품 추가" : "열무 도매 상품", f, "kream_wholesale", it, isNew);
}
ERP.forms.kream_wholesale = {
  open: open,
  afterOpen: async function (body, it, isNew) {
    var upd = function () { var o = ERP.readForm(body, it), c = calc(o); U.$("kpv").innerHTML = c ? "<div><span>개당 실이익</span><b>" + won(c.real) + "</b></div><div><span>이익률</span><b>" + pct(c.rate) + "</b></div><div><span>손익분기 판매가</span><b>" + won(c.breakeven) + "</b></div><div><span>판단</span><b>" + c.verdict + "</b></div>" : "<div><span>크림 판매가를 넣으면 이익이 계산돼요</span><b>–</b></div>"; };
    body.addEventListener("input", upd); upd();
    if (isNew) return;
    var res = await S.sb.from("kream_price_log").select("*").eq("sku", it.sku || it.name || "").eq("size", it.size || "").order("checked_at", { ascending: false }).limit(30);
    var el = U.$("khist"); if (!el) return;
    if (res.error) { el.textContent = ERP.errMsg(res.error); return; }
    var rows = res.data || [];
    el.innerHTML = rows.length ? '<div class="scroll-x"><table style="min-width:420px"><thead><tr><th>확인 시각</th><th class="r">판매가</th><th class="r">즉시구매가</th><th>메모</th></tr></thead><tbody>' + rows.map(function (r) { return '<tr><td class="num">' + esc(new Date(r.checked_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })) + '</td><td class="r num">' + (r.last_trade == null ? "–" : won(r.last_trade)) + '</td><td class="r num">' + (r.lowest_ask == null ? "–" : won(r.lowest_ask)) + '</td><td class="name"><small>' + esc(r.trades || "") + "</small></td></tr>"; }).join("") + "</tbody></table></div>" : "아직 기록이 없어요. 크림 판매가를 고치면 여기에 쌓여요.";
  },
  commit: async function (body, o, st) {
    if (!o.brand && !o.sku && !o.name) throw new Error("브랜드나 품번 중 하나는 입력해 주세요.");
    if (!num(o.wholesalePrice)) throw new Error("도매가를 입력해 주세요.");
    o.supplier = SUPPLIER; o.qty = num(o.qty) || 1; if (o.kreamPrice === "") o.kreamPrice = null;
    var priceChanged = st.isNew ? o.kreamPrice != null : num(o.kreamPrice) !== num(st.rec.kreamPrice);
    if (priceChanged) o.kreamCheckedAt = new Date().toISOString();
    var saved = await ERP.save("kream_wholesale", o); if (!saved) return false;
    if (priceChanged && o.kreamPrice != null) await S.sb.from("kream_price_log").insert({ sku: o.sku || o.name || "", size: o.size || "", kream_url: o.kreamUrl || "", last_trade: o.kreamPrice, trades: o.kreamRecent || "", source: "manual" });
    v.kList = o.listDate; ERP.toast("저장했어요."); return true;
  }
};
ERP.acts.kreamadd = function () { open(); };
ERP.acts.kreamnewlist = function () { v.kList = U.today(); open(null, { listDate: U.today() }); };
ERP.kreamRowsX = function (list) { return list.map(function (it) { var c = calc(it); return { "공급처": it.supplier, "리스트": it.listDate, "브랜드": it.brand, "품번": it.sku, "상품명": it.name, "사이즈": it.size, "수량": num(it.qty), "도매가": num(it.wholesalePrice), "크림판매가": it.kreamPrice == null ? "" : num(it.kreamPrice), "개당실이익": c ? Math.round(c.real) : "", "이익률": c ? Math.round(c.rate * 1000) / 10 + "%" : "", "합계이익": c ? Math.round(c.real * num(it.qty)) : "", "손익분기가": c ? Math.round(c.breakeven) : "", "판단": c ? c.verdict : "", "결정": it.decision, "최근체결": it.kreamRecent || "", "크림링크": it.kreamUrl || "" }; }); };
ERP.acts.kreamexport = function () { ERP.downloadBlob("열무도매_" + v.kList + ".xlsx", ERP.xlsxBlob([{ name: "열무 도매", rows: ERP.kreamRowsX(items().filter(function (x) { return x.listDate === v.kList; })) }])); };

/* 가져오기 파일: {format:'rowna-erp-kream-v1', items:[...snake_case...], price_log:[...]} */
ERP.importers = ERP.importers || {};
ERP.importers["rowna-erp-kream-v1"] = async function (data, say) {
  say("크림 도매 리스트 저장 중"); await ERP.saveBatch("kream_wholesale", data.items || []);
  if (data.price_log && data.price_log.length) { var r = await S.sb.from("kream_price_log").insert(data.price_log); if (r.error) throw r.error; }
  return { kind: "크림 도매 리스트", summary: (data.supplier || SUPPLIER) + " " + (data.list_date || "") + " · 상품 " + (data.items || []).length + "줄, 시세 기록 " + ((data.price_log || []).length) + "건" };
};
ERP.page({ id: "kream-yeolmu", title: "열무 도매", roles: ["owner", "accountant", "staff", "ai"], render: render, bind: bind });
})();
