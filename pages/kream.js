/* 메뉴: 크림 › 크림 도매 (열무·무우 등 도매처별)
   도매 리스트 사진을 올리면 ChatGPT로 표를 읽고(크롬 확장 '로우나 크림 도우미'),
   크림 상세페이지를 한 장씩 열어 모델번호를 끝자리까지 확인한 뒤 즉시구매가·최근 체결가·거래량을 채워요.
   크림 가격이 바뀔 때마다 시세 기록(kream_price_log)에 쌓여 추이를 볼 수 있어요. */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, C = ERP.C, esc = U.esc, won = U.won, pct = U.pct, num = U.num;
var v = ERP.view;
function SUP() { return v.kSup || "열무"; }
function suppliers() { var d = { "열무": 1, "무우": 1 }; ERP.list("kream_wholesale").forEach(function (x) { if (x.supplier) d[x.supplier] = 1; }); return Object.keys(d); }
var DECISIONS = ["검토", "매입", "보류", "제외"];
function rate() { return S.SET.kream_fee_rate == null ? 0.06 : Number(S.SET.kream_fee_rate); }
function cap() { return S.SET.kream_fee_cap == null ? 300000 : num(S.SET.kream_fee_cap); }
function base() { return S.SET.kream_fee_base == null ? 2500 : num(S.SET.kream_fee_base); }
/* 크림 프리미엄 카테고리(샤넬·에르메스 가방, 롤렉스 등 시계): 기본 20,000원 + 3% */
function premium(it) { var t = ((it.brand || "") + " " + (it.name || "")).toUpperCase(); return (/CHANEL|샤넬|HERMES|HERMÈS|에르메스/.test(t) && /백|BAG|토트|숄더|클러치|버킨|켈리|플랩/.test(t)) || /ROLEX|롤렉스|AUDEMARS|오데마|PATEK|파텍|VACHERON|바쉐론/.test(t); }
function calc(it) { var p = premium(it); return C.kream(it.kreamPrice, it.wholesalePrice, p ? 0.03 : rate(), cap(), p ? 20000 : base()); }
function items() { return ERP.list("kream_wholesale").filter(function (x) { return (x.supplier || "열무") === SUP(); }); }
/* 거래 속도: 최근 체결 5건 날짜로 한 달 거래 수 추정 */
function tdate(s) { s = String(s || ""); var m = s.match(/^(\d{2})\/(\d{2})\/(\d{2})$/); if (m) return new Date(2000 + +m[1], +m[2] - 1, +m[3]); m = s.match(/(\d+)\s*(분|시간|일)\s*전/); if (m) return new Date(Date.now() - +m[1] * (m[2] === "분" ? 6e4 : m[2] === "시간" ? 36e5 : 864e5)); return null; }
function speed(k) { var tr = (k && k.trades) || []; if (!tr.length) return null; var ds = tr.map(function (t) { return tdate(t.date); }).filter(Boolean); if (!ds.length) return null; var old = Math.min.apply(null, ds), days = Math.max(1, (Date.now() - old) / 864e5), n30 = ds.filter(function (d) { return Date.now() - d <= 30 * 864e5; }).length; return { perMonth: Math.round(ds.length * 30 / days * 10) / 10, n30: n30, days: Math.round(days) }; }
function recQty(it, c) { var k = (it.extra || {}).kream, sp = speed(k), q = num(it.qty); if (!c || c.verdict === "비추천" || !(k && k.verified)) return 0; if (!sp) return Math.min(q, 1); return Math.min(q, Math.max(1, Math.floor(sp.perMonth * (c.verdict === "추천" ? 1.5 : 1)))); }
function listDates() { var d = {}; items().forEach(function (x) { if (x.listDate) d[x.listDate] = 1; }); return Object.keys(d).sort().reverse(); }
function vpill(c) { if (!c) return '<span class="pill p-mute">크림가 필요</span>'; return c.verdict === "추천" ? '<span class="pill p-good">✓ 추천</span>' : c.verdict === "검토" ? '<span class="pill p-warn">△ 검토</span>' : '<span class="pill p-crit">✕ 비추천</span>'; }

function helperOn() { return document.documentElement.dataset.rownaKream === "1"; }
function kcell(it) {
  var k = (it.extra || {}).kream;
  if (!k) return '<span class="muted">' + (busy[it.id] ? "확인 중…" : "–") + "</span>";
  if (k.error) return '<span class="pill p-crit" title="' + esc(k.error) + '">확인 실패</span>';
  return (k.verified ? (k.exact ? '<span class="pill p-good" title="크림 모델번호 ' + esc(k.model) + '">✅ 품번 일치</span>' : '<span class="pill p-warn" title="크림 모델번호 ' + esc(k.model) + ' (0/O·1/I 등 비슷한 글자 차이)">△ 거의 일치</span>') : '<span class="pill p-crit" title="크림에서 같은 모델번호를 못 찾았어요">⚠ 품번 다름</span>') +
    '<small class="num">' + esc(k.model || "") + "</small>";
}
var busy = {};
function render() {
  var dates = listDates(); if (!v.kList || dates.indexOf(v.kList) === -1) v.kList = dates[0] || "";
  var w = ERP.canWrite("kream_wholesale"), list = items().filter(function (x) { return x.listDate === v.kList; });
  var groups = {}, order = [];
  list.forEach(function (x) { var k = x.sku || x.name || x.id; if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(x); });
  var T = { qty: 0, whole: 0, real: 0, recQty: 0, recReal: 0, recWhole: 0, buyQty: 0, buyWhole: 0, buyReal: 0 }, cand = [];
  var body = order.map(function (key) {
    var g = groups[key].sort(function (a, b) { return String(a.size).localeCompare(String(b.size), "ko", { numeric: true }); }), f = g[0];
    return g.map(function (it, i) {
      var c = calc(it), q = num(it.qty), tot = c ? c.real * q : 0, k = (it.extra || {}).kream || {}, sp = speed(k), rq = recQty(it, c);
      T.qty += q; T.whole += num(it.wholesalePrice) * q; T.real += tot;
      if (rq) { T.recQty += rq; T.recReal += c.real * rq; T.recWhole += num(it.wholesalePrice) * rq; cand.push({ it: it, c: c, rq: rq }); }
      if (it.decision === "매입") { T.buyQty += q; T.buyWhole += num(it.wholesalePrice) * q; T.buyReal += tot; }
      var flags = (it.extra || {}).ocr || {};
      var prod = i ? "" : '<td class="name" rowspan="' + g.length + '"><b>' + esc(f.brand || "") + "</b> " + esc(f.name || "") + '<small class="num">' + esc(f.sku || "") + (flags.skuUnsure ? ' <span class="pill p-warn" title="사진에서 글자가 흐려 확실하지 않아요">글자 확인</span>' : "") + "</small>" + (f.kreamUrl ? '<small><a href="' + esc(f.kreamUrl) + '" target="_blank" rel="noopener">크림에서 보기 ↗</a></small>' : "") + "</td><td rowspan=\"" + g.length + "\">" + kcell(f) + "</td>";
      var trades = (k.trades || []).slice(0, 5).map(function (t) { return t.date.replace(/^26\//, "") + " " + won(t.price); }).join("<br>");
      return '<tr class="' + (it.decision === "제외" ? "off" : "") + '">' + prod + '<td class="click" data-edit="kream_wholesale:' + esc(it.id) + '" tabindex="0">' + esc(it.size || "F") + '</td><td class="r num">' + q + '</td><td class="r num">' + won(it.wholesalePrice) + '</td>' +
        '<td class="r num">' + (k.price ? won(k.price) : "–") + '</td><td class="r"><small class="num">' + (trades || "–") + '</small></td><td class="r num">' + (k.tradeCount != null && k.model ? U.esc(String(k.tradeCount)) + "건" : "–") + (sp ? '<small class="muted">월 ' + sp.perMonth + "건 추정</small>" : "") + "</td>" +
        '<td class="r kp">' + (w ? '<input class="cell-in num" type="number" inputmode="numeric" aria-label="' + esc((f.brand || "") + " " + (it.size || "") + " 크림 기준가") + '" data-kp="' + esc(it.id) + '" value="' + (it.kreamPrice == null ? "" : Math.round(it.kreamPrice)) + '" placeholder="입력">' : '<span class="num">' + (it.kreamPrice == null ? "–" : won(it.kreamPrice)) + "</span>") + "</td>" +
        '<td class="r num ' + (c && c.real < 0 ? "neg" : "") + '">' + (c ? won(c.real) : "–") + '</td><td class="r num">' + (c ? pct(c.rate) : "–") + '</td><td class="r num">' + (c ? won(c.breakeven) : "–") + "</td><td>" + vpill(c) + '</td><td class="r num"><b>' + (rq ? rq + "개" : "–") + "</b></td><td>" +
        (w ? '<select class="ctl sm" data-dec="' + esc(it.id) + '" aria-label="결정">' + DECISIONS.map(function (d) { return "<option" + (d === (it.decision || "검토") ? " selected" : "") + ">" + d + "</option>"; }).join("") + "</select>" : esc(it.decision || "검토")) + "</td></tr>";
    }).join("");
  }).join("");
  /* 예산 안에서 이익률 높은 순으로 추천수량만큼 담기 */
  var budget = num(S.SET.kream_budget) || 10000000, pick = { qty: 0, whole: 0, real: 0, lines: [] };
  cand.sort(function (a, b) { return b.c.rate - a.c.rate; }).forEach(function (x) { var price = num(x.it.wholesalePrice), n = Math.min(x.rq, Math.floor((budget - pick.whole) / price)); if (n > 0) { pick.qty += n; pick.whole += n * price; pick.real += n * x.c.real; pick.lines.push((x.it.brand || "") + " " + (x.it.name || x.it.sku || "").slice(0, 18) + " ×" + n); } });
  var sups = suppliers();
  var h = '<div class="head"><div><h1>크림 도매</h1><p>도매 리스트 사진을 올리면 크림 시세·거래량·이익을 자동으로 채워요 · ' + (helperOn() ? '<span class="pill p-good">크림 도우미 켜짐</span>' : '<span class="pill p-crit" title="크롬 확장 ‘로우나 크림 도우미’를 설치해야 사진 읽기·크림 조회가 돼요">크림 도우미 꺼짐</span>') + '</p></div><div class="tools">' +
    '<select class="ctl" id="k-sup" aria-label="도매처">' + sups.map(function (x) { return "<option" + (x === SUP() ? " selected" : "") + ">" + esc(x) + "</option>"; }).join("") + '<option value="__new">+ 도매처 추가</option></select>' +
    (dates.length ? '<select class="ctl" id="k-list" aria-label="리스트 날짜">' + dates.map(function (d) { return "<option" + (d === v.kList ? " selected" : "") + ' value="' + d + '">' + d.replace(/-/g, ".") + " 리스트</option>"; }).join("") + "</select>" : "") +
    (w ? '<button class="btn pri" data-act="kreamphoto">📷 리스트 사진 올리기</button>' + (list.length ? '<button class="btn" data-act="kreamfetch">크림 시세 다시 가져오기</button>' : "") + '<button class="btn" data-act="kreamadd">+ 직접 추가</button>' : "") + (list.length ? '<button class="btn" data-act="kreamexport">엑셀 내보내기</button>' : "") + "</div></div>";
  if (!list.length) return h + '<div class="panel empty"><b>' + esc(SUP()) + ' 도매 리스트가 아직 없어요</b>' + (w ? "‘📷 리스트 사진 올리기’로 도매처가 보낸 사진을 올리면 표를 읽고 크림 시세까지 채워요." : "") + "</div>" + feeNote(w);
  h += '<div class="tiles">' + ERP.tile("리스트 전체", T.qty + "개", won(T.whole) + "원 · 전부 사면 예상 이익 " + won(T.real) + "원") + ERP.tile("추천 수량만 사면", T.recQty + "개", won(T.recWhole) + "원 → 이익 " + won(T.recReal) + "원", "hl") +
    ERP.tile("예산 " + won(budget) + "원 안에서", pick.qty + "개", won(pick.whole) + "원 → 이익 " + won(pick.real) + "원<br><small>" + esc(pick.lines.join(" · ")) + "</small>") + ERP.tile("매입 결정", T.buyQty + "개", won(T.buyWhole) + "원 · 예상 이익 " + won(T.buyReal) + "원") + "</div>";
  h += '<div class="table-wrap"><table style="min-width:1500px"><thead><tr><th>상품</th><th>크림 품번 확인</th><th>사이즈</th><th class="r">수량</th><th class="r">도매가</th><th class="r">크림 즉시구매가</th><th class="r">최근 체결</th><th class="r">누적 거래</th><th class="r">계산 기준가</th><th class="r">개당 실이익</th><th class="r">이익률</th><th class="r">손익분기가</th><th>판단</th><th class="r">추천 수량</th><th>결정</th></tr></thead><tbody>' + body + "</tbody></table></div>";
  h += '<p class="note">계산 기준가 = 최근 체결 5건 중간값과 지금 즉시구매가 중 낮은 값(보수적으로). 추천 수량 = 최근 체결 속도로 한 달 안에 팔 수 있을 만큼(추천은 1.5배). ✅ 품번 일치가 아닌 줄은 크림 링크를 직접 확인해 주세요.</p>';
  return h + feeNote(w);
}
function feeNote(w) {
  return '<div class="panel"><h2>계산 기준</h2><div class="fg narrow"><div class="fd"><label for="k-rate">크림 판매 수수료 % (부가세 별도)</label><input id="k-rate" type="number" step="0.1" value="' + (rate() * 100).toFixed(1) + '"' + (ERP.isOwner() ? "" : " disabled") + '></div><div class="fd"><label for="k-base">크림 기본 수수료(원, 부가세 별도)</label><input id="k-base" type="number" value="' + base() + '"' + (ERP.isOwner() ? "" : " disabled") + '></div><div class="fd"><label for="k-cap">수수료 최대 금액(원, 부가세 포함)</label><input id="k-cap" type="number" value="' + cap() + '"' + (ERP.isOwner() ? "" : " disabled") + '></div><div class="fd"><label for="k-bud">매입 예산(원)</label><input id="k-bud" type="number" value="' + (num(S.SET.kream_budget) || 10000000) + '"></div></div>' +
    '<p class="note">실이익 = 크림 판매가 ÷ 1.1 − 수수료 − 도매가 ÷ 1.1 (도매 세금계산서 매입세액 공제, 크림 매출 부가세 반영). 판단: 이익률 8% 이상 추천 · 3~8% 검토 · 3% 미만 비추천. 크림 검수센터로 보내는 택배비는 빠져 있어요. 수수료 기준: 크림 FAQ ‘판매자 등급 및 수수료 기준(2026.3.2 적용)’ — Level 1 기본 2,500원 + 6.0%(부가세 별도, 부가세 포함 최대 30만원), 샤넬·에르메스 가방·고급시계는 프리미엄 20,000원 + 3%로 자동 계산. 등급이 오르면 % 칸을 고쳐 주세요.</p></div>';
}
function bind(root) {
  var kl = root.querySelector("#k-list"); if (kl) kl.onchange = function () { v.kList = kl.value; ERP.render(); };
  var ks = root.querySelector("#k-sup"); if (ks) ks.onchange = function () { if (ks.value === "__new") { var n = (prompt("도매처 이름") || "").trim(); if (n) v.kSup = n; } else v.kSup = ks.value; v.kList = ""; ERP.render(); };
  var kb = root.querySelector("#k-base"); if (kb) kb.onchange = function () { ERP.saveSetting("kream_fee_base", num(kb.value)); ERP.render(); };
  var kbu = root.querySelector("#k-bud"); if (kbu) kbu.onchange = function () { ERP.saveSetting("kream_budget", num(kbu.value)); ERP.render(); };
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
  it = it || Object.assign({ id: U.uid(), supplier: SUP(), listDate: v.kList || U.today(), brand: "", sku: "", name: "", kreamUrl: "", size: "F", qty: 1, wholesalePrice: "", kreamPrice: "", kreamRecent: "", decision: "검토", memo: "", extra: {} }, preset);
  var f = '<div class="fg">' + fd("리스트 날짜", "listDate", "date", it.listDate) + fd("브랜드", "brand", "text", it.brand) + fd("품번(SKU)", "sku", "text", it.sku) + fd("상품명", "name", "text", it.name, "full") + fd("크림 링크", "kreamUrl", "url", it.kreamUrl, "full") +
    fd("사이즈", "size", "text", it.size) + fd("수량", "qty", "number", it.qty) + fd("도매가 (부가세 포함, 1개)", "wholesalePrice", "number", it.wholesalePrice) + fd("크림 판매가 (1개)", "kreamPrice", "number", it.kreamPrice == null ? "" : it.kreamPrice) +
    fd("최근 체결가 메모", "kreamRecent", "text", it.kreamRecent, "full", ' placeholder="예: 10/19 311,000 · 10/18 309,000"') + sel("결정", "decision", DECISIONS, it.decision || "검토") + fd("메모", "memo", "text", it.memo, "full") + '</div><div class="preview" id="kpv"></div>' +
    (isNew ? "" : '<div class="sect">시세 기록</div><div id="khist" class="note">불러오는 중</div>');
  ERP.openDrawer(isNew ? "도매 상품 추가" : "도매 상품", f, "kream_wholesale", it, isNew);
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
    o.supplier = o.supplier || SUP(); o.qty = num(o.qty) || 1; if (o.kreamPrice === "") o.kreamPrice = null;
    var priceChanged = st.isNew ? o.kreamPrice != null : num(o.kreamPrice) !== num(st.rec.kreamPrice);
    if (priceChanged) o.kreamCheckedAt = new Date().toISOString();
    var saved = await ERP.save("kream_wholesale", o); if (!saved) return false;
    if (priceChanged && o.kreamPrice != null) await S.sb.from("kream_price_log").insert({ sku: o.sku || o.name || "", size: o.size || "", kream_url: o.kreamUrl || "", last_trade: o.kreamPrice, trades: o.kreamRecent || "", source: "manual" });
    v.kList = o.listDate; ERP.toast("저장했어요."); return true;
  }
};
/* ---------- 크롬 확장 '로우나 크림 도우미' 연결 ---------- */
var waits = {};
window.addEventListener("message", function (e) { if (e.source !== window || !e.data || e.data.rownaK !== "res") return; var f = waits[e.data.id]; if (f) { delete waits[e.data.id]; f(e.data); } });
function ask(type, payload) {
  return new Promise(function (res, rej) {
    if (!helperOn()) { rej(new Error("크롬 확장 ‘로우나 크림 도우미’가 꺼져 있어요. 설치 후 ERP를 새로고침(F5)해 주세요.")); return; }
    var id = U.uid(); waits[id] = function (d) { d.ok ? res(d.data) : rej(new Error(d.error || "실패")); };
    window.postMessage(Object.assign({ rownaK: "req", id: id, type: type }, payload), location.origin);
  });
}
function shrink(file) {   /* 사진을 긴 변 2000px JPEG로 줄여서 보냄 (글자는 충분히 읽힘) */
  return new Promise(function (res, rej) {
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () { var k = Math.min(1, 2000 / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.92)); };
    img.onerror = function () { rej(new Error("사진을 열 수 없어요: " + file.name)); }; img.src = url;
  });
}
function median(a) { a = a.slice().sort(function (x, y) { return x - y; }); var n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null; }
function sizeTrades(k, size) { var tr = k.trades || [], s = String(size || "").toUpperCase(); if (!s || /^(F|FREE|TU|OS|ONE ?SIZE)$/.test(s)) return tr; var m = tr.filter(function (t) { return String(t.size).toUpperCase().replace(/\s/g, "") === s.replace(/\s/g, ""); }); return m.length ? m : tr; }
async function fetchKream(rows) {
  var bySku = {}, keys = [];
  rows.forEach(function (it) { var key = (it.sku || it.name || it.id) + "|" + (it.kreamUrl || ""); if (!bySku[key]) { bySku[key] = []; keys.push(key); } bySku[key].push(it); });
  for (var i = 0; i < keys.length; i++) {
    var g = bySku[keys[i]], f = g[0]; g.forEach(function (it) { busy[it.id] = 1; }); ERP.render();
    ERP.toast("크림 확인 중 " + (i + 1) + "/" + keys.length + " · " + (f.brand || "") + " " + (f.sku || ""));
    var k; try { k = await ask("kream", { sku: f.sku, url: f.kreamUrl }); } catch (e) { k = { error: e.message }; if (/멈췄|멈춤|꺼져/.test(e.message)) { g.forEach(function (it) { delete busy[it.id]; }); ERP.toast("⚠ " + e.message); break; } }
    var out = [], logs = [];
    g.forEach(function (it) {
      delete busy[it.id];
      var o = Object.assign({}, it, { extra: Object.assign({}, it.extra || {}, { kream: k }) });
      if (k && !k.error && k.verified) {
        var tr = sizeTrades(k, it.size).map(function (t) { return t.price; }), md = median(tr.slice(0, 5)), ref = md && k.price ? Math.min(md, k.price) : (md || k.price);
        o.kreamPrice = ref || null; o.kreamUrl = k.url || o.kreamUrl; o.kreamRecent = sizeTrades(k, it.size).slice(0, 5).map(function (t) { return t.date + " " + Number(t.price).toLocaleString(); }).join(" · "); o.kreamCheckedAt = new Date().toISOString();
        if (!o.name && k.name) o.name = k.name;
        logs.push({ sku: it.sku || it.name || "", size: it.size || "", kream_url: o.kreamUrl || "", last_trade: md, lowest_ask: k.price, trades: o.kreamRecent, source: "helper" });
      }
      out.push(o);
    });
    var rowsDb = out.map(function (o) { return ERP.toRow("kream_wholesale", o); });
    try { await ERP.saveBatch("kream_wholesale", rowsDb); rowsDb.forEach(function (r) { ERP.applyRow("kream_wholesale", r); }); if (logs.length) await S.sb.from("kream_price_log").insert(logs); } catch (e) { ERP.toast(ERP.errMsg(e)); }
  }
  ERP.render(); ERP.toast("크림 확인을 마쳤어요.");
}
ERP.acts.kreamfetch = function () { var list = items().filter(function (x) { return x.listDate === v.kList; }); if (!list.length) return; fetchKream(list); };
ERP.acts.kreamphoto = function () {
  if (!helperOn()) { ERP.toast("크롬 확장 ‘로우나 크림 도우미’가 꺼져 있어요. 설치 후 새로고침(F5)해 주세요."); return; }
  var inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.multiple = true;
  inp.onchange = async function () {
    var files = Array.prototype.slice.call(inp.files || []); if (!files.length) return;
    var made = [], day = U.today(), sup = SUP();
    for (var i = 0; i < files.length; i++) {
      ERP.toast("사진 읽는 중 " + (i + 1) + "/" + files.length + " (20~60초)");
      try {
        var r = await ask("ocr", { image: await shrink(files[i]) }), vat = r.vatIncluded !== false;
        (r.items || []).forEach(function (x) {
          var price = num(x.wholesalePrice); if (!price || !(x.sku || x.name)) return;
          made.push({ id: U.uid(), supplier: sup, listDate: day, brand: String(x.brand || "").trim(), sku: String(x.sku || "").trim(), name: String(x.name || "").trim(), kreamUrl: x.kreamUrlUnsure ? "" : String(x.kreamUrl || "").trim(), size: String(x.size || "F").trim() || "F", qty: num(x.qty) || 1, wholesalePrice: vat ? price : Math.round(price * 1.1), kreamPrice: null, kreamRecent: "", decision: "검토", memo: (vat ? "" : "사진 도매가 VAT 별도 → ×1.1 반영 · ") + "사진: " + files[i].name, extra: { ocr: { skuUnsure: !!x.skuUnsure, urlUnsure: !!x.kreamUrlUnsure, rawUrl: x.kreamUrl || "", file: files[i].name } } });
        });
      } catch (e) { ERP.toast("⚠ " + files[i].name + ": " + e.message); }
    }
    if (!made.length) { ERP.toast("사진에서 상품 줄을 찾지 못했어요."); return; }
    var rowsDb = made.map(function (o) { return ERP.toRow("kream_wholesale", o); });
    try { await ERP.saveBatch("kream_wholesale", rowsDb); rowsDb.forEach(function (r) { ERP.applyRow("kream_wholesale", r); }); } catch (e) { ERP.toast(ERP.errMsg(e)); return; }
    v.kList = day; ERP.render(); ERP.toast(made.length + "줄을 넣었어요. 이제 크림에서 한 상품씩 확인해요 (상품당 10~30초).");
    fetchKream(made);
  };
  inp.click();
};
ERP.acts.kreamadd = function () { open(); };
ERP.acts.kreamnewlist = function () { v.kList = U.today(); open(null, { listDate: U.today() }); };
ERP.kreamRowsX = function (list) { return list.map(function (it) { var c = calc(it); return { "공급처": it.supplier, "리스트": it.listDate, "브랜드": it.brand, "품번": it.sku, "상품명": it.name, "사이즈": it.size, "수량": num(it.qty), "도매가": num(it.wholesalePrice), "크림판매가": it.kreamPrice == null ? "" : num(it.kreamPrice), "개당실이익": c ? Math.round(c.real) : "", "이익률": c ? Math.round(c.rate * 1000) / 10 + "%" : "", "합계이익": c ? Math.round(c.real * num(it.qty)) : "", "손익분기가": c ? Math.round(c.breakeven) : "", "판단": c ? c.verdict : "", "추천수량": recQty(it, c), "크림품번확인": ((it.extra || {}).kream || {}).verified ? (((it.extra || {}).kream || {}).model || "") : "미확인", "크림즉시구매가": ((it.extra || {}).kream || {}).price || "", "누적거래": ((it.extra || {}).kream || {}).tradeCount || "", "결정": it.decision, "최근체결": it.kreamRecent || "", "크림링크": it.kreamUrl || "" }; }); };
ERP.acts.kreamexport = function () { ERP.downloadBlob("크림도매_" + SUP() + "_" + v.kList + ".xlsx", ERP.xlsxBlob([{ name: SUP() + " 도매", rows: ERP.kreamRowsX(items().filter(function (x) { return x.listDate === v.kList; })) }])); };

/* 가져오기 파일: {format:'rowna-erp-kream-v1', items:[...snake_case...], price_log:[...]} */
ERP.importers = ERP.importers || {};
ERP.importers["rowna-erp-kream-v1"] = async function (data, say) {
  say("크림 도매 리스트 저장 중"); await ERP.saveBatch("kream_wholesale", data.items || []);
  if (data.price_log && data.price_log.length) { var r = await S.sb.from("kream_price_log").insert(data.price_log); if (r.error) throw r.error; }
  return { kind: "크림 도매 리스트", summary: (data.supplier || "") + " " + (data.list_date || "") + " · 상품 " + (data.items || []).length + "줄, 시세 기록 " + ((data.price_log || []).length) + "건" };
};
ERP.page({ id: "kream-yeolmu", title: "크림 도매", roles: ["owner", "accountant", "staff", "ai"], render: render, bind: bind });
})();
