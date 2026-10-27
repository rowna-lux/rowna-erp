/* 메뉴: 소싱관리 › 사방넷 소싱폼 (구글시트 '소싱폼 최종본' ACTIVE 이관, 2026-10-27)
   - 저장 열: 소싱날짜·브랜드·자체상품코드·URL·원산지·구매단가·상품명 + 상태·카테고리·메모
   - 계산 열(저장 안 함): 판매가(공통 가격식)·마진율·트렌비/필웨이 마진·몰별 판매가
   - 가격식은 app_settings.price_policy 한 곳 — 여기서 바꾸면 모든 화면·엑셀이 같이 바뀜 */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, C = ERP.C, esc = U.esc, won = U.won, num = U.num;
var v = ERP.view; v.rxQ = v.rxQ || ""; v.rxSt = v.rxSt || ""; v.rxPage = v.rxPage || 0; v.rxPol = !!v.rxPol;
var STATUS = ["소싱", "등록요청", "등록완료", "품절", "보류"], OUT = "사방넷없음", PAGE = 100;
var ITEMS = null, loading = false, SEL = new Set();
function pol() { return C.policy(S.SET.price_policy); }
async function load(force) {
  if ((ITEMS && !force) || loading) return; loading = true;
  try { var r = await ERP.fetchAll("sourcing_items", "id"); ITEMS = new Map(); r.forEach(function (x) { ITEMS.set(x.id, x); }); }
  catch (e) { ERP.toast("소싱폼을 불러오지 못했어요: " + (e.message || e)); ITEMS = ITEMS || new Map(); }
  loading = false; if (ERP.view.tab === "rex-sourcing") ERP.render();
}
/* 중복 = 자체상품코드(띄어쓰기·대소문자 무시)가 같은 줄. 대표님 지시: 소싱폼에 중복은 절대 안 됨 */
function dupCount() { var m = {}; ITEMS.forEach(function (x) { if (x.status === OUT) return; var k = U.norm(x.sku); if (k) m[k] = (m[k] || 0) + 1; }); return m; }
function list() {
  var DUP = dupCount();
  var q = v.rxQ.trim().toLowerCase();
  return Array.from(ITEMS.values()).filter(function (x) {
    if (v.rxSt === "__dup") { if (x.status === OUT || (DUP[U.norm(x.sku)] || 0) < 2) return false; }
    else if (v.rxSt) { if (x.status !== v.rxSt) return false; }
    else if (x.status === OUT) return false;   /* 사방넷에 없는 상품은 따로(전체에서 뺌) */
    if (q && ((x.sku || "") + " " + (x.brand || "") + " " + (x.name || "") + " " + (x.memo || "") + " " + (x.category || "")).toLowerCase().indexOf(q) === -1) return false;
    return true;
  }).sort(function (a, b) { if (v.rxSt === "__dup") { var c = U.norm(a.sku).localeCompare(U.norm(b.sku)); if (c) return c; } return String(b.date || "").localeCompare(String(a.date || "")) || String(b.created_at || "").localeCompare(String(a.created_at || "")); });
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
  var DUP = dupCount(), dupRows = 0; Object.keys(DUP).forEach(function (k) { if (DUP[k] > 1) dupRows += DUP[k]; });
  var chips = [["", "전체 " + (ITEMS.size - (cnt[OUT] || 0))]].concat(STATUS.map(function (s) { return [s, s + " " + (cnt[s] || 0)]; })).concat(dupRows ? [["__dup", "⚠ 중복 " + dupRows]] : []).concat([[OUT, "사방넷에 없음 " + (cnt[OUT] || 0)]]);
  var ss = p.malls[0], lo = p.malls.find(function (m) { return m[0] === "shop0372"; }) || p.malls[2];
  var head = "<tr>" + (w ? '<th><input type="checkbox" id="rx-all" title="이 쪽 전체 선택"></th>' : "") + "<th>소싱날짜</th><th>브랜드</th><th>자체상품코드</th><th>상품명</th><th>원산지</th><th class=num>구매단가</th><th class=num>판매가</th><th class=num>마진율</th><th class=num>트렌비 마진</th><th class=num>필웨이 마진</th><th class=num>" + esc(ss[1]) + "</th><th class=num>" + esc(lo[1]) + "</th><th>상태</th><th>카테고리</th><th>메모</th>" + (w ? "<th></th>" : "") + "</tr>";
  var add = w ? '<tr class="rx-new"><td></td><td><input class="ctl" type="date" id="rxn-date" value="' + U.today() + '"></td><td><input class="ctl" id="rxn-brand" placeholder="브랜드"></td><td><input class="ctl" id="rxn-sku" placeholder="자체상품코드"></td><td><input class="ctl" id="rxn-name" placeholder="상품명" style="min-width:260px"><input class="ctl" id="rxn-url" placeholder="URL" style="min-width:260px;margin-top:4px"></td><td><input class="ctl" id="rxn-origin" placeholder="원산지" style="width:80px"></td><td><input class="ctl num" id="rxn-price" placeholder="구매단가" inputmode="numeric" style="width:100px"></td><td class="num" id="rxn-calc" colspan="6"></td><td><select class="ctl" id="rxn-st">' + STATUS.map(function (s) { return "<option>" + s + "</option>"; }).join("") + '</select></td><td><input class="ctl" id="rxn-cat" style="width:90px"></td><td><input class="ctl" id="rxn-memo" style="width:120px"></td><td><button class="btn pri sm" data-rx="add">추가</button></td></tr>' : "";
  var body = rows.map(function (x) {
    var c = C.srcCalc(x.buy_price, p);
    var dn = DUP[U.norm(x.sku)] || 0;
    return '<tr data-id="' + esc(x.id) + '"' + (dn > 1 ? ' class="dup" title="같은 자체상품코드가 ' + dn + '줄 있어요"' : "") + '>'  + (w ? '<td><input type="checkbox" data-sel' + (SEL.has(x.id) ? " checked" : "") + "></td>" : "") + '<td class="num">' + esc(x.date || "") + "</td><td>" + esc(x.brand || "") + '</td><td class="num">' + esc(x.sku || "") + (dn > 1 ? ' <span class="pill p-warn">중복 ' + dn + "</span>" : "") + '</td><td class="name" title="' + esc(x.name || "") + '">' + (x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.name || "(상품명 없음)") + "</a>" : esc(x.name || "")) + "</td><td>" + esc(x.origin || "") + '</td><td class="num">' + (w ? '<input class="ctl num" data-f="buy_price" value="' + (x.buy_price == null ? "" : x.buy_price) + '" style="width:100px">' : wonOr(x.buy_price)) + '</td><td class="num"><b>' + (c.over ? '<span class="warn-t">구간 밖</span>' : wonOr(c.sale)) + '</b></td><td class="num">' + (c.rate == null ? "–" : U.pct(c.rate)) + '</td><td class="num ' + mcls(c.trenbi) + '">' + wonOr(c.trenbi) + '</td><td class="num ' + mcls(c.feelway) + '">' + wonOr(c.feelway) + '</td><td class="num">' + wonOr(c.malls[ss[0]]) + '</td><td class="num">' + wonOr(c.malls[lo[0]]) + "</td>" +
      "<td>" + (w ? '<select class="ctl" data-f="status">' + STATUS.map(function (s) { return "<option" + (s === x.status ? " selected" : "") + ">" + s + "</option>"; }).join("") + "</select>" : esc(x.status || "")) + "</td>" +
      "<td>" + (w ? '<input class="ctl" data-f="category" value="' + esc(x.category || "") + '" style="width:90px">' : esc(x.category || "")) + "</td>" +
      "<td>" + (w ? '<input class="ctl" data-f="memo" value="' + esc(x.memo || "") + '" style="width:140px">' : esc(x.memo || "")) + "</td>" + (w ? '<td><button class="btn sm" data-rx="del" title="삭제">✕</button></td>' : "") + "</tr>";
  }).join("");
  return '<div class="head"><h2>사방넷 소싱폼</h2><div class="tools">' +
    '<input class="ctl" data-search="rxQ" placeholder="코드·브랜드·상품명·메모 검색" value="' + esc(v.rxQ) + '" style="min-width:240px">' +
    (w ? '<button class="btn pri sm" data-rx="sabang"' + (SEL.size ? "" : " disabled") + '>사방넷·스토어봇 파일 (' + SEL.size + ')</button>' + (SEL.size ? '<button class="btn sm" data-rx="selclear">선택 해제</button>' : "") : "") + '<button class="btn sm" data-rx="pol">' + (v.rxPol ? "가격식 닫기" : "가격식 보기·수정") + '</button>' + (w ? '<button class="btn sm" data-rx="sync" title="사방넷 › 상품관리 › 사방넷상품대량수정(또는 상품조회) 엑셀로 대조">사방넷 상품파일로 대조</button>' : "") + '<button class="btn sm" data-rx="xlsx">엑셀 내보내기 (' + all.length.toLocaleString() + ')</button><button class="btn sm" data-rx="reload">새로고침</button></div></div>' +
    (v.rxPol ? polHtml() : "") +
    '<div class="tools" style="margin:8px 0">' + ERP.chips("data-rxst", v.rxSt, chips) + '<span style="flex:1"></span><label class="muted" for="rx-den">줄 높이·글자</label><select class="ctl" id="rx-den">' + [["s", "작게"], ["m", "보통"], ["l", "크게"]].map(function (o) { return '<option value="' + o[0] + '"' + (den() === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + '</select><label class="muted"><input type="checkbox" id="rx-wrap"' + (lsGet("rx-wrap") === "1" ? " checked" : "") + '> 상품명 줄바꿈</label><button class="btn sm" id="rx-wreset" title="열 너비를 처음대로">열 너비 초기화</button></div>' +
    '<div class="tbl-wrap"><table class="tbl rx den-' + den() + (lsGet("rx-wrap") === "1" ? " wrap" : "") + '">' + "<thead>" + head + "</thead><tbody>" + add + body + "</tbody></table></div>" +
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
function lsGet(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
function lsSet(k, val) { try { if (val == null) localStorage.removeItem(k); else localStorage.setItem(k, val); } catch (e) {} }
function den() { return lsGet("rx-den") || "m"; }
/* 열 너비: 머리글 오른쪽 끝을 끌어서 조절(두 번 클릭 = 그 열 자동) · 이 브라우저에 저장 */
function colResize(tb) {
  var ths = Array.prototype.slice.call(tb.querySelectorAll("thead th")), W = {};
  try { W = JSON.parse(lsGet("rx-colw") || "{}"); } catch (e) {}
  var key = function (th, i) { return (th.textContent || "").trim() || ("#" + i); };
  if (Object.keys(W).length) { tb.classList.add("fixed"); ths.forEach(function (th, i) { th.style.width = (W[key(th, i)] || th.offsetWidth) + "px"; }); }
  ths.forEach(function (th, i) {
    var h = document.createElement("span"); h.className = "rx-rz"; h.title = "끌어서 너비 조절 · 두 번 클릭하면 자동"; th.appendChild(h);
    h.onmousedown = function (e) {
      e.preventDefault(); e.stopPropagation();
      if (!tb.classList.contains("fixed")) { ths.forEach(function (t) { t.style.width = t.offsetWidth + "px"; }); tb.classList.add("fixed"); }
      var x0 = e.clientX, w0 = th.offsetWidth;
      var mv = function (ev) { th.style.width = Math.max(36, w0 + ev.clientX - x0) + "px"; };
      var up = function () { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); ths.forEach(function (t, j) { W[key(t, j)] = t.offsetWidth; }); lsSet("rx-colw", JSON.stringify(W)); };
      document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
    };
    h.ondblclick = function (e) { e.stopPropagation(); delete W[key(th, i)]; lsSet("rx-colw", JSON.stringify(W)); ERP.render(); };
  });
}
function bind(root) {
  if (!ITEMS) return;
  var tb = root.querySelector("table.rx"); if (tb) colResize(tb);
  var dn = root.querySelector("#rx-den"); if (dn) dn.onchange = function () { lsSet("rx-den", dn.value); ERP.render(); };
  var wr = root.querySelector("#rx-wrap"); if (wr) wr.onchange = function () { lsSet("rx-wrap", wr.checked ? "1" : null); ERP.render(); };
  var wre = root.querySelector("#rx-wreset"); if (wre) wre.onclick = function () { lsSet("rx-colw", null); ERP.render(); };
  root.querySelectorAll("[data-rxst]").forEach(function (b) { b.onclick = function () { v.rxSt = b.dataset.rxst; v.rxPage = 0; ERP.render(); }; });
  root.querySelectorAll("[data-rx]").forEach(function (b) { b.onclick = async function () {
    var a = b.dataset.rx, tr = b.closest("tr"), id = tr && tr.dataset.id;
    if (a === "prev") { v.rxPage--; ERP.render(); window.scrollTo(0, 0); }
    else if (a === "next") { v.rxPage++; ERP.render(); window.scrollTo(0, 0); }
    else if (a === "pol") { v.rxPol = !v.rxPol; ERP.render(); }
    else if (a === "reload") { await load(true); }
    else if (a === "xlsx") exportXlsx();
    else if (a === "sync") ERP.pickFile(".xlsx,.xls,.csv", syncSabang);
    else if (a === "selclear") { SEL.clear(); ERP.render(); }
    else if (a === "sabang") SABANG.open();
    else if (a === "addtier") { var p = readPol(root), l = p.tiers[p.tiers.length - 1]; p.tiers.push([num(l[1]) + 1, num(l[1]) + 1000000, l[2]]); S.SET.price_policy = p; ERP.render(); }
    else if (a === "deltier") { var p2 = readPol(root); if (p2.tiers.length > 1) p2.tiers.pop(); S.SET.price_policy = p2; ERP.render(); }
    else if (a === "resetpol") { if (confirm("스토어봇 기본값(2026-10-26)으로 되돌릴까요? 저장을 눌러야 반영돼요.")) { S.SET.price_policy = JSON.parse(JSON.stringify(C.PRICE_POLICY)); ERP.render(); } }
    else if (a === "savepol") { var np = readPol(root); for (var i = 1; i < np.tiers.length; i++) if (np.tiers[i][0] <= np.tiers[i - 1][1]) { ERP.toast((i + 1) + "번 구간 시작값이 앞 구간과 겹쳐요."); return; } await ERP.saveSetting("price_policy", np); ERP.render(); }
    else if (a === "del") { var x = ITEMS.get(id); if (!x || !confirm((x.sku || x.name) + " 줄을 삭제할까요?")) return; var r = await S.sb.from("sourcing_items").delete().eq("id", id); if (r.error) ERP.toast(r.error.message); else { ITEMS.delete(id); ERP.render(); } }
    else if (a === "add") {
      var g = function (k) { var el = root.querySelector("#rxn-" + k); return el ? el.value.trim() : ""; };
      if (!g("sku") && !g("name")) { ERP.toast("자체상품코드나 상품명을 넣어주세요."); return; }
      var same = g("sku") ? Array.from(ITEMS.values()).filter(function (x) { return U.norm(x.sku) === U.norm(g("sku")); }) : [];
      var dupe = same.filter(function (x) { return x.status !== OUT; }), olds = same.filter(function (x) { return x.status === OUT; });
      if (dupe && dupe.length) { ERP.toast("이미 소싱폼에 있는 코드라 추가할 수 없어요 (" + dupe.map(function (x) { return x.date || "날짜없음"; }).join(", ") + ")."); v.rxQ = g("sku"); v.rxSt = ""; ERP.render(); return; }
      var o = { id: U.uid(), date: g("date") || null, brand: g("brand"), sku: g("sku"), url: g("url"), origin: g("origin"), buy_price: g("price") ? num(g("price")) : null, name: g("name"), status: g("st") || "소싱", category: g("cat"), memo: g("memo"), extra: {} };
      if (olds.length) { var dr = await S.sb.from("sourcing_items").delete().in("id", olds.map(function (x) { return x.id; })); if (!dr.error) olds.forEach(function (x) { ITEMS.delete(x.id); }); }
      if (await saveRow(o)) { ERP.toast(olds.length ? "추가했어요 · '사방넷에 없음' 목록의 같은 코드 " + olds.length + "줄은 지웠어요." : "추가했어요."); v.rxSt = ""; v.rxQ = ""; v.rxPage = 0; ERP.render(); }
    }
  }; });
  root.querySelectorAll("tr[data-id] [data-sel]").forEach(function (el) { el.onchange = function () { var id = el.closest("tr").dataset.id; if (el.checked) SEL.add(id); else SEL.delete(id); selBtn(root); }; });
  var ra = root.querySelector("#rx-all"); if (ra) ra.onchange = function () { root.querySelectorAll("tr[data-id] [data-sel]").forEach(function (el) { el.checked = ra.checked; var id = el.closest("tr").dataset.id; if (ra.checked) SEL.add(id); else SEL.delete(id); }); selBtn(root); };
  var np = root.querySelector("#rxn-price"); if (np) np.oninput = function () { var c = C.srcCalc(np.value, pol()), o = root.querySelector("#rxn-calc"); o.innerHTML = c.sale ? "판매가 <b>" + won(c.sale) + "</b> · 트렌비 " + won(c.trenbi) + " · 필웨이 " + won(c.feelway) : c.over ? '<span class="warn-t">가격식 구간 밖</span>' : ""; };
  root.querySelectorAll("tr[data-id] [data-f]").forEach(function (el) { el.onchange = async function () {
    var id = el.closest("tr").dataset.id, x = ITEMS.get(id); if (!x) return; var o = Object.assign({}, x), f = el.dataset.f;
    o[f] = f === "buy_price" ? (el.value === "" ? null : num(el.value)) : el.value;
    if (await saveRow(o)) { if (f === "buy_price") ERP.render(); else ERP.toast("저장했어요."); }
  }; });
}
/* 사방넷 대조: 사방넷 상품 엑셀(자체상품코드 열)과 비교
   - 소싱폼에 있는데 사방넷에 없음 → 상태 '사방넷없음'(따로 관리, 전체에서 빠짐)
   - '사방넷없음'인데 사방넷에 다시 생김(재입고 재등록) → 그 목록에서 지움(같은 코드가 이미 있으면 삭제, 없으면 등록완료로) */
async function syncSabang(file) {
  try {
    var wb = XLSX.read(await file.arrayBuffer()), a = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
    var hr = -1, col = -1; for (var r = 0; r < Math.min(10, a.length) && col < 0; r++) for (var c = 0; c < a[r].length; c++) if (String(a[r][c]).replace(/\s/g, "").indexOf("자체상품코드") === 0) { hr = r; col = c; break; }
    if (col < 0) { ERP.toast("이 파일에서 '자체상품코드' 칸을 못 찾았어요."); return; }
    var SB = new Set(); a.slice(hr + 1).forEach(function (row) { var k = U.norm(row[col]); if (k && !/^▶/.test(String(row[col]))) SB.add(k); });
    if (SB.size < 1000 && !confirm("사방넷 코드가 " + SB.size + "개뿐이에요. 전체 상품 파일이 맞나요? (기간 2000-01-01부터, 상태 전체)")) return;
    var all = Array.from(ITEMS.values()), active = {}, toOut = [], back = [], drop = [];
    all.forEach(function (x) { if (x.status !== OUT) { var k = U.norm(x.sku); if (k) active[k] = 1; } });
    all.forEach(function (x) { var k = U.norm(x.sku), inS = k && SB.has(k);
      if (x.status !== OUT && !inS) toOut.push(x);
      else if (x.status === OUT && inS) { if (active[k]) drop.push(x); else { back.push(x); active[k] = 1; } } });
    if (!toOut.length && !back.length && !drop.length) { ERP.toast("사방넷과 소싱폼이 맞아요. 바꿀 것 없음 (사방넷 " + SB.size + "개)"); return; }
    if (!confirm("사방넷 상품 " + SB.size + "개와 대조했어요.\n\n· 사방넷에 없어서 '사방넷에 없음'으로 옮김: " + toOut.length + "줄\n· 사방넷에 다시 생겨서 목록에서 지움: " + (back.length + drop.length) + "줄\n\n진행할까요?")) return;
    var now = new Date().toISOString(), up = [];
    toOut.forEach(function (x) { up.push(Object.assign({}, x, { status: OUT, extra: Object.assign({}, x.extra || {}, { prevStatus: x.status, outAt: now }), updated_at: now })); });
    back.forEach(function (x) { var e = Object.assign({}, x.extra || {}); var ps = e.prevStatus; delete e.prevStatus; e.backAt = now; up.push(Object.assign({}, x, { status: ps && ps !== OUT ? ps : "등록완료", extra: e, updated_at: now })); });
    for (var i = 0; i < up.length; i += 500) { var res = await S.sb.from("sourcing_items").upsert(up.slice(i, i + 500)); if (res.error) throw res.error; }
    up.forEach(function (u) { ITEMS.set(u.id, u); });
    if (drop.length) { for (var j = 0; j < drop.length; j += 200) { var dr = await S.sb.from("sourcing_items").delete().in("id", drop.slice(j, j + 200).map(function (x) { return x.id; })); if (dr.error) throw dr.error; } drop.forEach(function (x) { ITEMS.delete(x.id); }); }
    await ERP.saveSetting("sabang_sync", { at: now, codes: SB.size, out: toOut.length, back: back.length + drop.length });
    ERP.render();
  } catch (e) { ERP.toast("대조 실패: " + (e.message || e)); }
}
function selBtn(root) { var b = root.querySelector('[data-rx="sabang"]'); if (b) { b.disabled = !SEL.size; b.textContent = "사방넷·스토어봇 파일 (" + SEL.size + ")"; } }

/* ---------- 사방넷 상품대량등록 엑셀 (구글시트 '사방넷 도구 › 엑셀 생성'과 같은 113칸) ----------
   브랜드별 묶음 설정 = app_settings.sabang_presets[한글브랜드] (시트 Metadata·Brands에서 옮김)
   이미지: https://gi.esmplus.com/{ESM}/{작업폴더}/{순번}␣␣{품번}/{n}.jpg — 대표 2, 부가6~8 = 3·4·5, 상세 = 배너 0 + 상세번호 */
var SABANG = (function () {
  var ESM = "djsouplim", TAG = 1.6, MARKET = "shinmy777", HEAD = null;
  var COL = { name: 0, model: 2, modelNo: 3, brandEn: 4, sku: 5, kw: 6, kind: 8, maker: 12, origin: 13, gender: 17, state: 18, region: 19, tax: 20, shipKind: 21, shipFee: 22, cost: 24, sale: 25, tag: 26, opt1: 27, opt1v: 28, opt2: 29, opt2v: 30, img: 31, add6: 37, add7: 38, add8: 39, detail: 42, certNo: 44, certField: 50, stock: 51, memo: 68, optEdit: 69, attrCode: 79 };
  function presets() { return S.SET.sabang_presets || {}; }
  function yymmdd(d) { var t = d || U.today(); return t.slice(2, 4) + t.slice(5, 7) + t.slice(8, 10); }
  function gender(name, def) { if (/남여|공용|유니섹스/.test(name)) return 3; if (/여성|우먼|womens?/i.test(name)) return 2; if (/남성|맨즈|mens?\b/i.test(name)) return 1; return Number(def) || 3; }
  function enc(s) { return encodeURIComponent(s); }
  /* 사이즈 = 렉스몬드 상품페이지(대표님 규칙 2026-10-27): '구매 가능 사이즈' + '사이즈 선택 TIP' 표에서 앞뒤로 한 칸씩 더 → 택사이즈[실측] */
  function parseSizes(t) {
    var am = (t.match(/구매 가능 사이즈\s*\t?\s*([^\n]*)/) || [])[1] || "", avail = am.split(/\s*,\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
    var i = t.indexOf("사이즈 선택 TIP"), tips = [];
    if (i >= 0) { var seg = t.slice(i, i + 3000), e = seg.search(/\n(혼용률|소재|상품의 라벨|구성품)/); if (e > 0) seg = seg.slice(0, e); seg.split("\n").slice(1).forEach(function (ln) { var c = ln.split("\t").map(function (x) { return x.trim(); }); if (c.length >= 2 && c[0] && c[1] && !/도움말|택 사이즈/.test(c[0])) tips.push([c[0], c[1].replace(/\s*(㎜|mm)?\s*(전후)?\s*$/i, "").trim()]); }); }
    var nz = function (x) { return String(x).replace(/\s|㎜|mm|전후/gi, "").toUpperCase(); };
    if (!avail.length && !tips.length) return { sizes: "단일사이즈[ONE SIZE]", how: "사이즈 없음" };
    if (avail.length && avail.every(function (a) { return /^(FREE|F|ONE ?SIZE|단일|OS)$/i.test(a); })) return { sizes: "단일사이즈[ONE SIZE]", how: "단일" };
    if (!tips.length) return { sizes: avail.map(function (a) { return a + "[" + a + "]"; }).join(","), how: "TIP 표 없음 — 구매가능 사이즈만", warn: true };
    var idx = []; tips.forEach(function (tp, k) { if (avail.some(function (a) { return nz(a) === nz(tp[1]) || nz(a) === nz(tp[0]); })) idx.push(k); });
    if (!idx.length) return { sizes: tips.map(function (tp) { return tp[0] + "[" + tp[1] + "]"; }).join(","), how: "구매가능 사이즈를 TIP 표에서 못 찾음 — 표 전체", warn: true };
    var a = Math.max(0, Math.min.apply(null, idx) - 1), b = Math.min(tips.length - 1, Math.max.apply(null, idx) + 1);
    return { sizes: tips.slice(a, b + 1).map(function (tp) { return tp[0] + "[" + tp[1] + "]"; }).join(","), how: "구매가능 " + idx.length + "개 + 앞뒤 1칸" };
  }
  async function rexSizes(x) {
    var url = /rexmonde\.com\/products\/view/.test(x.url || "") ? x.url : "https://www.rexmonde.com/products/list?search_keyword=" + encodeURIComponent(x.sku || "");
    var d = await ERP.helperAsk("page", { rexGap: 15, url: url, waitFor: "사이즈 선택 TIP|상품정보고시|상품이 없|검색 결과", minLen: 300, tries: 15 });
    if (!/products\/view/.test(d.url || "")) return { fail: "렉스몬드 상품페이지를 못 찾음" };
    var t = d.text || ""; if (x.sku && t.indexOf(x.sku) < 0 && (d.title || "").indexOf(x.sku) < 0) return { fail: "렉스몬드 품번 불일치" };
    if (/일시품절|품절된 상품|SOLD OUT/i.test(t.slice(0, 3000)) && !/구매 가능 사이즈/.test(t)) return { fail: "렉스몬드 품절" };
    var r = parseSizes(t), no = (String(d.url).match(/[?&]no=(\d+)/) || [])[1]; r.url = no ? "https://www.rexmonde.com/products/view?no=" + no : String(d.url).split("&")[0]; return r;
  }
  function imgUrl(folder, no, sku, n) { return "https://gi.esmplus.com/" + ESM + "/" + enc(folder) + "/" + enc(no + "  " + sku) + "/" + n + ".jpg"; }
  function bannerUrl(p, brand) { return p.banner || ("https://gi.esmplus.com/" + ESM + "/banners/" + enc(brand) + "/0.jpg"); }
  function exists(url) { return new Promise(function (res) { var im = new Image(), t = setTimeout(function () { res(null); }, 8000); im.onload = function () { clearTimeout(t); res(true); }; im.onerror = function () { clearTimeout(t); res(false); }; im.src = url + (url.indexOf("?") < 0 ? "?v=" : "&v=") + Date.now(); }); }
  async function head() { if (HEAD) return HEAD; var r = await fetch("data/sabang_head.json?v=1027i"); HEAD = await r.json(); return HEAD; }
  function picked() { return Array.from(SEL).map(function (id) { return ITEMS.get(id); }).filter(Boolean).sort(function (a, b) { return String(a.date || "").localeCompare(String(b.date || "")) || ((a.extra && a.extra.row) || 0) - ((b.extra && b.extra.row) || 0) || String(a.created_at || "").localeCompare(String(b.created_at || "")); }); }
  function open() {
    var items = picked(); if (!items.length) return;
    var brands = {}; items.forEach(function (x) { brands[x.brand || "(브랜드 없음)"] = (brands[x.brand || "(브랜드 없음)"] || 0) + 1; });
    var bk = Object.keys(brands), main = bk.sort(function (a, b) { return brands[b] - brands[a]; })[0], p = presets()[main] || {};
    var f = function (l, n, val, wide) { return '<div class="fd' + (wide ? " full" : "") + '"><label for="sx-' + n + '">' + l + '</label><input id="sx-' + n + '" name="' + n + '" value="' + esc(val == null ? "" : val) + '"></div>'; };
    var html = '<p class="muted">' + items.length + "개 · " + bk.map(function (b) { return esc(b) + " " + brands[b]; }).join(", ") + (bk.length > 1 ? ' <b class="warn-t">브랜드가 섞여 있어요 — 아래 설정은 ' + esc(main) + " 기준으로 모두에 적용돼요.</b>" : "") + "</p>" +
      '<div class="grid2 even">' + f("작업폴더명 (ESM 이미지 폴더)", "folder", yymmdd(items[0].date) + " " + main) + f("시작 순번", "start", 1) +
      f("영문 브랜드명", "brandEn", p.brandEn || "") + f("제조사", "maker", p.maker || main) +
      f("사이트검색어 (쉼표로)", "kw", p.kw || main, true) +
      ERP.sel("남녀구분 (상품명에 남성/여성/남여공용 있으면 그걸 우선)", "gender", [["1", "1 남성"], ["2", "2 여성"], ["3", "3 공용"]], p.gender || "3") +
      ERP.sel("속성분류코드", "attrCode", [["001", "001 의류"], ["002", "002 신발"], ["003", "003 가방"], ["004", "004 패션잡화"]], p.attrCode || "001") +
      f("상세 이미지 번호", "imgs", p.imgs || "0,2,3,4,5,6,7,9") + f("원산지 (비우면 소싱폼 값)", "origin", "") +
      f("브랜드 배너 주소 (비우면 자동)", "banner", p.banner || "", true) +
      '<div class="fd full"><label><input type="checkbox" name="check" checked> ESM에 이미지가 올라가 있는지 확인하고 없는 번호는 빼기</label></div></div>' +
      '<p class="muted">판매가 = 공통 가격식(스토어봇과 같음) · TAG가 = 판매가 ×' + TAG + " · 원가 = 구매단가(렉스몬드 판매가) · 사이즈 = 렉스몬드 구매가능 사이즈 + 앞뒤 1칸(상품당 약 15초) · 다 만들면 상태가 '등록요청'으로 바뀌어요.</p><div id=\"sx-log\"></div>";
    ERP.openDrawer("사방넷 엑셀 + 스토어봇 파일", html, "sourcing_items", { brand: main }, true, { saveLabel: "파일 2개 만들기" });
  }
  async function build(body, o) {
    if (!(ERP.helperOn && ERP.helperOn())) { ERP.toast("사이즈를 렉스몬드에서 가져오려면 로우나 도우미(크롬 확장)가 켜진 컴퓨터에서 만들어 주세요."); return false; }
    var items = picked(), pol = C.policy(S.SET.price_policy), H = await head(), log = body.querySelector("#sx-log");
    var say = function (t) { if (log) log.innerHTML = t; };
    var imgs = String(o.imgs || "").split(/[,\s]+/).filter(Boolean).map(Number), start = Number(o.start) || 1, rows = [], warn = [];
    for (var i = 0; i < items.length; i++) {
      var x = items[i], no = start + i, sku = (x.sku || "").trim(), sale = C.storePrice(x.buy_price, pol);
      if (!sale) { warn.push(sku + ": 구매단가 없음/가격식 구간 밖 — 뺐어요"); continue; }
      say("렉스몬드 사이즈 확인 중 " + (i + 1) + "/" + items.length + " · " + esc(sku) + " (상품당 약 15초)");
      var sz; try { sz = await rexSizes(x); } catch (e) { sz = { fail: "렉스몬드 확인 실패: " + (e.message || e) }; }
      if (sz.fail) { warn.push(sku + ": " + sz.fail + " — 뺐어요"); continue; }
      if (sz.warn) warn.push(sku + ": 사이즈 " + sz.how + " → " + sz.sizes);
      var have = {}; imgs.forEach(function (n) { have[n] = true; });
      if (o.check) { say("이미지 확인 중 " + (i + 1) + "/" + items.length + " · " + esc(sku)); for (var k = 0; k < imgs.length; k++) { if (imgs[k] === 0) continue; var ok = await exists(imgUrl(o.folder, no, sku, imgs[k])); if (ok === false) have[imgs[k]] = false; } if (have[2] === false) warn.push(no + " " + sku + ": 2.jpg(대표) 없음"); }
      var r = new Array(H[1].length).fill("");
      r[COL.name] = x.name || ""; r[COL.model] = sku; r[COL.modelNo] = sku; r[COL.brandEn] = (o.brandEn || "").trim(); r[COL.sku] = sku; r[COL.kw] = o.kw || "";
      r[COL.kind] = 3; r[COL.maker] = o.maker || x.brand || ""; r[COL.origin] = (o.origin || x.origin || "").trim(); r[COL.gender] = gender(x.name || "", o.gender);
      r[COL.state] = 2; r[COL.region] = 1; r[COL.tax] = 1; r[COL.shipKind] = 1; r[COL.shipFee] = 0;
      r[COL.cost] = Number(x.buy_price) || 0; r[COL.sale] = sale; r[COL.tag] = Math.round(sale * TAG);
      r[COL.opt1] = "색상"; r[COL.opt1v] = "상세참조"; r[COL.opt2] = "사이즈"; r[COL.opt2v] = sz.sizes;
      r[COL.img] = imgUrl(o.folder, no, sku, 2);
      [[COL.add6, 3], [COL.add7, 4], [COL.add8, 5]].forEach(function (a) { if (have[a[1]] !== false) r[a[0]] = imgUrl(o.folder, no, sku, a[1]); });
      r[COL.detail] = imgs.filter(function (n) { return have[n] !== false; }).map(function (n) { return "<img src='" + (n === 0 ? bannerUrl(o, x.brand || "") : imgUrl(o.folder, no, sku, n)) + "' />"; }).join("<br />\n");
      r[COL.certNo] = "없음"; r[COL.certField] = "없음"; r[COL.stock] = "N"; r[COL.memo] = "로우나"; r[COL.optEdit] = 2; r[COL.attrCode] = o.attrCode || "001";
      for (var q = 1; q <= 14; q++) r[COL.attrCode + q] = "상세참조";
      rows.push({ x: x, no: no, r: r, sizes: sz.sizes, url: sz.url });
    }
    if (!rows.length) { say('<span class="neg">만들 상품이 없어요.</span><br>' + warn.map(esc).join("<br>")); return false; }
    var ws = XLSX.utils.aoa_to_sheet(H.concat(rows.map(function (z) { return z.r; })));
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } }];
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "사방넷상품대량등록_샘플파일");
    var brandK = (items[0] && items[0].brand) || "상품", fname;
    var bset = []; rows.forEach(function (z) { var b = z.x.brand || "상품"; if (bset.indexOf(b) < 0) bset.push(b); });
    var tab = (U.today().replace(/-/g, ".") + "_" + bset.join("·")).replace(/[\[\]:*?\/\\]/g, " ").slice(0, 31);
    fname = "사방넷_" + bset.join("·").slice(0, 40) + "_" + U.today().replace(/-/g, ".") + ".xlsx";
    var XT = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    ERP.downloadBlob(fname, new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: XT }));
    /* 스토어봇 파일: 마켓 sabang · 마켓아이디 · 자체상품코드 · 옵션(상세참조-사이즈) · 렉스몬드 URL */
    var sb = [["마켓", "마켓아이디", "마켓상품ID", "옵션(사방넷 필수)", "연동상품URL"]].concat(rows.map(function (z) { return ["sabang", MARKET, z.r[COL.sku], z.sizes.split(",").map(function (v) { return "상세참조-" + v; }).join(","), z.url]; }));
    var wb2 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet(sb), tab);
    var sname = "스토어봇_" + bset.join("·").slice(0, 40) + "_" + U.today().replace(/-/g, ".") + ".xlsx";
    setTimeout(function () { ERP.downloadBlob(sname, new Blob([XLSX.write(wb2, { bookType: "xlsx", type: "array" })], { type: XT })); }, 1200);
    /* 브랜드 설정 저장 + 상태 '등록요청' */
    var ps = Object.assign({}, presets()); ps[brandK] = Object.assign({}, ps[brandK] || {}, { brandEn: o.brandEn, maker: o.maker, kw: o.kw, gender: o.gender, attrCode: o.attrCode, imgs: o.imgs, banner: o.banner || "" });
    await ERP.saveSetting("sabang_presets", ps);
    var now = new Date().toISOString(), up = rows.map(function (z) { var e = Object.assign({}, z.x.extra || {}, { sizes: z.sizes, rexUrl: z.url, sabang: { file: fname, storebot: sname, folder: o.folder, no: z.no, at: now } }); return Object.assign({}, z.x, { status: "등록요청", extra: e, updated_at: now }); });
    var res = await S.sb.from("sourcing_items").upsert(up); if (!res.error) up.forEach(function (u) { ITEMS.set(u.id, u); });
    SEL.clear();
    ERP.toast(rows.length + "개 · 사방넷 엑셀 + 스토어봇 파일을 만들었어요." + (warn.length ? " 확인할 것 " + warn.length + "개" : ""));
    if (warn.length) setTimeout(function () { alert("확인할 것\n" + warn.join("\n")); }, 300);
    return true;
  }
  return { open: open, build: build };
})();
ERP.forms.sourcing_items = { commit: async function (body, o) { var c = body.querySelector('input[name="check"]'); o.check = !!(c && c.checked); return SABANG.build(body, o); } };
ERP.sourcingItems = function () { return ITEMS; };
ERP.loadSourcing = load;
ERP.page({ id: "rex-sourcing", title: "사방넷 소싱폼", wide: true, roles: ["owner", "accountant", "staff", "ai"], render: render, bind: bind });
})();
