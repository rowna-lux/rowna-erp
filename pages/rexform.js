/* 메뉴: 소싱관리 › 사방넷 소싱폼 (구글시트 '소싱폼 최종본' ACTIVE 이관, 2026-10-27)
   - 저장 열: 소싱날짜·브랜드·자체상품코드·URL·원산지·구매단가·상품명 + 상태·카테고리·메모
   - 계산 열(저장 안 함): 판매가(공통 가격식)·마진율·트렌비/필웨이 마진·몰별 판매가
   - 가격식은 app_settings.price_policy 한 곳 — 여기서 바꾸면 모든 화면·엑셀이 같이 바뀜 */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, C = ERP.C, esc = U.esc, won = U.won, num = U.num;
var v = ERP.view; v.rxQ = v.rxQ || ""; v.rxSt = v.rxSt || ""; v.rxPage = v.rxPage || 0; v.rxPol = !!v.rxPol;
var STATUS = ["소싱", "등록요청", "등록완료", "품절", "보류"], PAGE = 100;
var ITEMS = null, loading = false;
function pol() { return C.policy(S.SET.price_policy); }
async function load(force) {
  if ((ITEMS && !force) || loading) return; loading = true;
  try { var r = await ERP.fetchAll("sourcing_items", "id"); ITEMS = new Map(); r.forEach(function (x) { ITEMS.set(x.id, x); }); }
  catch (e) { ERP.toast("소싱폼을 불러오지 못했어요: " + (e.message || e)); ITEMS = ITEMS || new Map(); }
  loading = false; if (ERP.view.tab === "rex-sourcing") ERP.render();
}
function list() {
  var q = v.rxQ.trim().toLowerCase();
  return Array.from(ITEMS.values()).filter(function (x) {
    if (v.rxSt && x.status !== v.rxSt) return false;
    if (q && ((x.sku || "") + " " + (x.brand || "") + " " + (x.name || "") + " " + (x.memo || "") + " " + (x.category || "")).toLowerCase().indexOf(q) === -1) return false;
    return true;
  }).sort(function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")) || String(b.created_at || "").localeCompare(String(a.created_at || "")); });
}
function wonOr(n) { return n == null ? '<span class="muted">–</span>' : won(n); }
function mcls(n) { return n == null ? "" : n < 0 ? "neg" : ""; }

function polHtml() {
  var p = pol(), own = ERP.isOwner();
  var tr = p.tiers.map(function (t, i) { return "<tr><td>" + (i + 1) + '</td><td><input class="ctl num" data-pt="' + i + ':0" value="' + t[0] + '"></td><td><input class="ctl num" data-pt="' + i + ':1" value="' + t[1] + '"></td><td><input class="ctl num" data-pt="' + i + ':2" value="' + t[2] + '"></td><td class="num muted">' + won(C.storePrice(t[1], p)) + "</td></tr>"; }).join("");
  var ml = p.malls.map(function (m, i) { return '<label class="fd sm"><span>' + esc(m[1]) + ' <small class="muted">' + esc(m[0]) + '</small></span><input class="ctl num" data-pm="' + i + '" value="' + m[2] + '"></label>'; }).join("");
  return '<div class="panel"><h3>공통 가격식 <small class="muted">스토어봇 \'로우나명품\' 가격정책과 같은 값이어야 해요 · 판매가 = 구매가 ÷ <input class="ctl num" style="width:70px" data-pp="divisor" value="' + p.divisor + '"> + 정액 → <input class="ctl num" style="width:80px" data-pp="round" value="' + p.round + '">원 단위 올림</small></h3>' +
    '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>구매가 이상</th><th>이하</th><th>정액</th><th>구간 끝 판매가</th></tr></thead><tbody>' + tr + "</tbody></table></div>" +
    '<div class="tools" style="flex-wrap:wrap;gap:8px;margin-top:8px"><b>몰별 배수(사방넷 별도정보)</b>' + ml + "</div>" +
    '<div class="tools" style="gap:8px;margin-top:8px">트렌비 ×<input class="ctl num" style="width:70px" data-pp="trenbi" value="' + p.trenbi + '"> 필웨이 ×<input class="ctl num" style="width:70px" data-pp="feelway" value="' + p.feelway + '"> 배송비 <input class="ctl num" style="width:80px" data-pp="ship" value="' + p.ship + '">' +
    (own ? '<button class="btn sm" data-rx="addtier">구간 추가</button><button class="btn sm" data-rx="deltier">마지막 구간 삭제</button><button class="btn pri sm" data-rx="savepol">가격식 저장</button><button class="btn sm" data-rx="resetpol">스토어봇 기본값</button>' : '<span class="muted">대표님만 바꿀 수 있어요</span>') + "</div></div>";
}

function render() {
  if (!ITEMS) { load(); return '<div class="panel empty"><b>소싱폼 불러오는 중</b>1만여 건이라 몇 초 걸려요.</div>'; }
  var p = pol(), all = list(), w = ERP.canWrite("sourcing_items"), pages = Math.max(1, Math.ceil(all.length / PAGE));
  if (v.rxPage >= pages) v.rxPage = pages - 1;
  var rows = all.slice(v.rxPage * PAGE, (v.rxPage + 1) * PAGE);
  var cnt = {}; ITEMS.forEach(function (x) { cnt[x.status || ""] = (cnt[x.status || ""] || 0) + 1; });
  var chips = [["", "전체 " + ITEMS.size]].concat(STATUS.map(function (s) { return [s, s + " " + (cnt[s] || 0)]; }));
  var ss = p.malls[0], lo = p.malls.find(function (m) { return m[0] === "shop0372"; }) || p.malls[2];
  var head = "<tr><th>소싱날짜</th><th>브랜드</th><th>자체상품코드</th><th>상품명</th><th>원산지</th><th class=num>구매단가</th><th class=num>판매가</th><th class=num>마진율</th><th class=num>트렌비 마진</th><th class=num>필웨이 마진</th><th class=num>" + esc(ss[1]) + "</th><th class=num>" + esc(lo[1]) + "</th><th>상태</th><th>카테고리</th><th>메모</th>" + (w ? "<th></th>" : "") + "</tr>";
  var add = w ? '<tr class="rx-new"><td><input class="ctl" type="date" id="rxn-date" value="' + U.today() + '"></td><td><input class="ctl" id="rxn-brand" placeholder="브랜드"></td><td><input class="ctl" id="rxn-sku" placeholder="자체상품코드"></td><td><input class="ctl" id="rxn-name" placeholder="상품명" style="min-width:260px"><input class="ctl" id="rxn-url" placeholder="URL" style="min-width:260px;margin-top:4px"></td><td><input class="ctl" id="rxn-origin" placeholder="원산지" style="width:80px"></td><td><input class="ctl num" id="rxn-price" placeholder="구매단가" inputmode="numeric" style="width:100px"></td><td class="num" id="rxn-calc" colspan="6"></td><td><select class="ctl" id="rxn-st">' + STATUS.map(function (s) { return "<option>" + s + "</option>"; }).join("") + '</select></td><td><input class="ctl" id="rxn-cat" style="width:90px"></td><td><input class="ctl" id="rxn-memo" style="width:120px"></td><td><button class="btn pri sm" data-rx="add">추가</button></td></tr>' : "";
  var body = rows.map(function (x) {
    var c = C.srcCalc(x.buy_price, p);
    return '<tr data-id="' + esc(x.id) + '"><td class="num">' + esc(x.date || "") + "</td><td>" + esc(x.brand || "") + '</td><td class="num">' + esc(x.sku || "") + '</td><td class="name" title="' + esc(x.name || "") + '">' + (x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.name || "(상품명 없음)") + "</a>" : esc(x.name || "")) + "</td><td>" + esc(x.origin || "") + '</td><td class="num">' + (w ? '<input class="ctl num" data-f="buy_price" value="' + (x.buy_price == null ? "" : x.buy_price) + '" style="width:100px">' : wonOr(x.buy_price)) + '</td><td class="num"><b>' + (c.over ? '<span class="warn-t">구간 밖</span>' : wonOr(c.sale)) + '</b></td><td class="num">' + (c.rate == null ? "–" : U.pct(c.rate)) + '</td><td class="num ' + mcls(c.trenbi) + '">' + wonOr(c.trenbi) + '</td><td class="num ' + mcls(c.feelway) + '">' + wonOr(c.feelway) + '</td><td class="num">' + wonOr(c.malls[ss[0]]) + '</td><td class="num">' + wonOr(c.malls[lo[0]]) + "</td>" +
      "<td>" + (w ? '<select class="ctl" data-f="status">' + STATUS.map(function (s) { return "<option" + (s === x.status ? " selected" : "") + ">" + s + "</option>"; }).join("") + "</select>" : esc(x.status || "")) + "</td>" +
      "<td>" + (w ? '<input class="ctl" data-f="category" value="' + esc(x.category || "") + '" style="width:90px">' : esc(x.category || "")) + "</td>" +
      "<td>" + (w ? '<input class="ctl" data-f="memo" value="' + esc(x.memo || "") + '" style="width:140px">' : esc(x.memo || "")) + "</td>" + (w ? '<td><button class="btn sm" data-rx="del" title="삭제">✕</button></td>' : "") + "</tr>";
  }).join("");
  return '<div class="head"><h2>사방넷 소싱폼</h2><div class="tools">' +
    '<input class="ctl" data-search="rxQ" placeholder="코드·브랜드·상품명·메모 검색" value="' + esc(v.rxQ) + '" style="min-width:240px">' +
    '<button class="btn sm" data-rx="pol">' + (v.rxPol ? "가격식 닫기" : "가격식 보기·수정") + '</button><button class="btn sm" data-rx="xlsx">엑셀 내보내기 (' + all.length.toLocaleString() + ')</button><button class="btn sm" data-rx="reload">새로고침</button></div></div>' +
    (v.rxPol ? polHtml() : "") +
    '<div class="tools" style="margin:8px 0">' + ERP.chips("data-rxst", v.rxSt, chips) + "</div>" +
    '<div class="tbl-wrap"><table class="tbl rx">' + "<thead>" + head + "</thead><tbody>" + add + body + "</tbody></table></div>" +
    '<div class="tools" style="justify-content:center;margin:10px 0"><button class="btn sm" data-rx="prev"' + (v.rxPage ? "" : " disabled") + '>‹ 이전</button><span class="muted">' + (v.rxPage + 1) + " / " + pages + ' 쪽 · ' + all.length.toLocaleString() + '건</span><button class="btn sm" data-rx="next"' + (v.rxPage < pages - 1 ? "" : " disabled") + ">다음 ›</button></div>";
}

async function saveRow(o) {
  o = Object.assign({}, o, { updated_at: new Date().toISOString() });
  var r = await S.sb.from("sourcing_items").upsert(o).select().single();
  if (r.error) { ERP.toast(ERP.errMsg ? ERP.errMsg(r.error) : r.error.message); return false; }
  ITEMS.set(r.data.id, r.data); return true;
}
function exportXlsx() {
  var p = pol(), rows = list().map(function (x) {
    var c = C.srcCalc(x.buy_price, p), o = { "소싱날짜": x.date || "", "브랜드": x.brand || "", "자체상품코드": x.sku || "", "URL": x.url || "", "원산지": x.origin || "", "구매단가": x.buy_price, "상품명": x.name || "", "판매가": c.sale, "트렌비 마진": c.trenbi, "필웨이 마진": c.feelway };
    p.malls.forEach(function (m) { o[m[1] + " 판매가"] = c.malls[m[0]]; });
    o["상태"] = x.status || ""; o["카테고리"] = x.category || ""; o["메모"] = x.memo || ""; return o;
  });
  var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "소싱폼");
  XLSX.writeFile(wb, "로우나_소싱폼_" + U.today() + ".xlsx");
}
function readPol(root) {
  var p = JSON.parse(JSON.stringify(pol()));
  root.querySelectorAll("[data-pt]").forEach(function (el) { var k = el.dataset.pt.split(":"); p.tiers[+k[0]][+k[1]] = num(el.value); });
  root.querySelectorAll("[data-pm]").forEach(function (el) { p.malls[+el.dataset.pm][2] = Number(el.value) || 1; });
  root.querySelectorAll("[data-pp]").forEach(function (el) { p[el.dataset.pp] = Number(el.value); });
  return p;
}
function bind(root) {
  if (!ITEMS) return;
  root.querySelectorAll("[data-rxst]").forEach(function (b) { b.onclick = function () { v.rxSt = b.dataset.rxst; v.rxPage = 0; ERP.render(); }; });
  root.querySelectorAll("[data-rx]").forEach(function (b) { b.onclick = async function () {
    var a = b.dataset.rx, tr = b.closest("tr"), id = tr && tr.dataset.id;
    if (a === "prev") { v.rxPage--; ERP.render(); window.scrollTo(0, 0); }
    else if (a === "next") { v.rxPage++; ERP.render(); window.scrollTo(0, 0); }
    else if (a === "pol") { v.rxPol = !v.rxPol; ERP.render(); }
    else if (a === "reload") { await load(true); }
    else if (a === "xlsx") exportXlsx();
    else if (a === "addtier") { var p = readPol(root), l = p.tiers[p.tiers.length - 1]; p.tiers.push([num(l[1]) + 1, num(l[1]) + 1000000, l[2]]); S.SET.price_policy = p; ERP.render(); }
    else if (a === "deltier") { var p2 = readPol(root); if (p2.tiers.length > 1) p2.tiers.pop(); S.SET.price_policy = p2; ERP.render(); }
    else if (a === "resetpol") { if (confirm("스토어봇 기본값(2026-10-26)으로 되돌릴까요? 저장을 눌러야 반영돼요.")) { S.SET.price_policy = JSON.parse(JSON.stringify(C.PRICE_POLICY)); ERP.render(); } }
    else if (a === "savepol") { var np = readPol(root); for (var i = 1; i < np.tiers.length; i++) if (np.tiers[i][0] <= np.tiers[i - 1][1]) { ERP.toast((i + 1) + "번 구간 시작값이 앞 구간과 겹쳐요."); return; } await ERP.saveSetting("price_policy", np); ERP.render(); }
    else if (a === "del") { var x = ITEMS.get(id); if (!x || !confirm((x.sku || x.name) + " 줄을 삭제할까요?")) return; var r = await S.sb.from("sourcing_items").delete().eq("id", id); if (r.error) ERP.toast(r.error.message); else { ITEMS.delete(id); ERP.render(); } }
    else if (a === "add") {
      var g = function (k) { var el = root.querySelector("#rxn-" + k); return el ? el.value.trim() : ""; };
      if (!g("sku") && !g("name")) { ERP.toast("자체상품코드나 상품명을 넣어주세요."); return; }
      var dupe = g("sku") && Array.from(ITEMS.values()).filter(function (x) { return U.norm(x.sku) === U.norm(g("sku")); });
      if (dupe && dupe.length && !confirm("이미 소싱폼에 있는 코드예요 (" + dupe.map(function (x) { return x.date; }).join(", ") + "). 그래도 추가할까요?")) return;
      var o = { id: U.uid(), date: g("date") || null, brand: g("brand"), sku: g("sku"), url: g("url"), origin: g("origin"), buy_price: g("price") ? num(g("price")) : null, name: g("name"), status: g("st") || "소싱", category: g("cat"), memo: g("memo"), extra: {} };
      if (await saveRow(o)) { ERP.toast("추가했어요."); v.rxSt = ""; v.rxQ = ""; v.rxPage = 0; ERP.render(); }
    }
  }; });
  var np = root.querySelector("#rxn-price"); if (np) np.oninput = function () { var c = C.srcCalc(np.value, pol()), o = root.querySelector("#rxn-calc"); o.innerHTML = c.sale ? "판매가 <b>" + won(c.sale) + "</b> · 트렌비 " + won(c.trenbi) + " · 필웨이 " + won(c.feelway) : c.over ? '<span class="warn-t">가격식 구간 밖</span>' : ""; };
  root.querySelectorAll("tr[data-id] [data-f]").forEach(function (el) { el.onchange = async function () {
    var id = el.closest("tr").dataset.id, x = ITEMS.get(id); if (!x) return; var o = Object.assign({}, x), f = el.dataset.f;
    o[f] = f === "buy_price" ? (el.value === "" ? null : num(el.value)) : el.value;
    if (await saveRow(o)) { if (f === "buy_price") ERP.render(); else ERP.toast("저장했어요."); }
  }; });
}
ERP.sourcingItems = function () { return ITEMS; };
ERP.loadSourcing = load;
ERP.page({ id: "rex-sourcing", title: "사방넷 소싱폼", wide: true, roles: ["owner", "accountant", "staff", "ai"], render: render, bind: bind });
})();
