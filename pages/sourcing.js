/* 메뉴: 소싱관리 › 스마트스토어 소싱 — 엑셀처럼 쓰는 표
   - 칸 클릭 → 바로 입력 · Enter/Tab/방향키 이동 · 엑셀에서 복사한 여러 칸 Ctrl+V
   - 계산식은 대표님 '스마트스토어 소싱폼' 엑셀과 동일 + 정산·부가세·세후 순수익
   - 저장: 칸을 벗어나면 그 줄만 자동 저장(화면 전체를 다시 그리지 않음)
   - 링크 가격 확인(3시간마다 AI): extra.linkPrice / linkCheckedAt / priceHistory 에 기록 */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, C = ERP.C, esc = U.esc, num = U.num;
var v = ERP.view; v.scTab = v.scTab || "컨템포러리"; v.scQ = v.scQ || ""; v.scF = v.scF || "all"; v.scSort = v.scSort || null;
var DEF = { global_adj: 0, margin_high: 0.04, margin_contemp: 0.15, extra_cost: 3000, round_unit: 100, discount_rate: 0.1, low_margin: 0.05, npay: 0.03003, fee_naver: 0.0273, fee_mkt: 0.0091, vat: 0.1, vendor_adj: { "까르피": 0 }, category_adj: {}, brands: {} };
var SEED = {"category_adj":{"가방/숄더백":0,"가방/토트백":0,"가방/크로스백":0,"가방/클러치":0,"가방/백팩":0,"가방/미니백":0,"지갑/장지갑":0,"지갑/반지갑":0,"지갑/카드지갑":0,"지갑/동전지갑":0,"신발/스니커즈":0,"신발/로퍼":0,"신발/샌들":0,"신발/부츠":0,"신발/플랫":0,"의류/티셔츠":0,"의류/맨투맨/후드":0,"의류/니트":0,"의류/아우터":0,"의류/셔츠":0,"액세서리/벨트":0,"액세서리/스카프":0,"액세서리/모자":0,"액세서리/키링/참":0,"액세서리/선글라스":0,"주얼리/시계/목걸이":0,"주얼리/시계/팔찌":0,"주얼리/시계/귀걸이":0,"주얼리/시계/반지":0,"주얼리/시계/시계":0}};
var OPT = { status: ["판매중", "판매대기", "품절", "판매중지"], tier: ["하이엔드", "컨템포러리"], gender: ["", "여성", "남성", "공용"], channel: ["네이버유입", "마케팅링크"], proof: ["카드·세금계산서", "현금영수증", "증빙없음"] };
/* 열 정의: k=저장 위치('x.'은 extra), t=입력 형식(txt/num/pct/sel/link) 없으면 계산값, c=계산키, f=표시형식, w=너비, g=묶음 */
var COLS = [ /* 대표님 지정 순서 2026-10-20 */
  { g: "① 기본정보", k: "buyLink", l: "매입처 링크", t: "link", w: 200 },
  { k: "vendor", l: "매입처", t: "txt", w: 100 },
  { k: "sku", l: "SKU 넘버", t: "txt", w: 140 },
  { k: "x.ssNo", l: "스마트스토어 상품번호", t: "txt", w: 120 },
  { k: "x.storeLink", l: "내 스토어 링크", t: "link", w: 180 },
  { k: "x.nameOverride", l: "상품명", t: "txt", w: 280, key: 1 },
  { k: "brand", l: "브랜드", t: "txt", w: 120 },
  { k: "x.sub", l: "중분류", t: "txt", w: 90 },
  { g: "② 매입", k: "buyPrice", l: "매입가", t: "num", w: 110 },
  { k: "x.payCard", l: "결제카드", t: "sel", o: "card", w: 140 },
  { c: "cardBase", l: "카드 기본혜택", w: 80, f: "pct" },
  { c: "cardPromo", l: "매입처 카드행사", w: 86, f: "pct" },
  { k: "cardRate", l: "카드혜택%(합계)", t: "pct", w: 90, ph: "card" },
  { k: "x.cardPromoText", l: "페이지 카드행사(참고)", w: 170, f: "txt", ro: 1 },
  { c: "cost", l: "실질원가", w: 104, f: "won" },
  { k: "x.linkPrice", l: "링크 현재가(AI)", w: 104, f: "won", ro: 1 },
  { k: "x.linkCheckedAt", l: "가격 확인(AI)", w: 110, f: "dt", ro: 1 },
  { c: "linkDiff", l: "매입가 변동", w: 96, f: "diff" },
  { g: "③ 판매가", k: "x.marginSet", l: "적용마진(1~30%)", t: "pct", w: 96, ph: "margin" },
  { c: "feeRate", l: "수수료율", w: 70, f: "pct2" },
  { c: "final", l: "최종판매가", w: 110, f: "won", key: 1 },
  { c: "storeInput", l: "스토어 설정가격(할인전)", w: 120, f: "won", key: 1 },
  { c: "discount", l: "즉시할인액", w: 90, f: "won" },
  { k: "x.storeLivePrice", l: "내 스토어 현재가(AI)", w: 112, f: "won", ro: 1 },
  { c: "mActual", l: "실제 마진(스토어가 기준)", w: 104, f: "pct" },
  { c: "mGap", l: "마진 차이(±3%p 알림)", w: 104, f: "pct" },
  { g: "④ 정산·수익", c: "feeSum", l: "수수료 합계", w: 96, f: "won" },
  { c: "settle", l: "정산예정액", w: 106, f: "won" },
  { c: "marginAmt", l: "마진액", w: 100, f: "won" },
  { c: "marginRate", l: "마진율", w: 66, f: "pct" },
  { c: "profit", l: "순이익", w: 100, f: "won", key: 1 },
  { g: "⑤ 부가세 정리", c: "vatOut", l: "매출세액", w: 90, f: "won" },
  { c: "vatIn", l: "매입세액", w: 90, f: "won" },
  { c: "vatFee", l: "수수료 세액", w: 86, f: "won" },
  { c: "vatDue", l: "납부 부가세", w: 92, f: "won" },
  { c: "netAfterVat", l: "세후 순수익", w: 104, f: "won", key: 1 },
  { g: "⑥ 상태", k: "status", l: "상태", t: "sel", o: "status", w: 86 }
];
var FROZEN_KEYS = ["sku"]; /* 가로로 스크롤해도 품번은 왼쪽에 고정 */
/* 열 숨기기·너비 (엑셀처럼) — 이 PC/브라우저에 기억 */
var LAY = { w: {}, h: [] }; try { LAY = Object.assign(LAY, JSON.parse(localStorage.getItem("rowna-sc-layout") || "{}")); } catch (e) {}
function saveLay() { try { localStorage.setItem("rowna-sc-layout", JSON.stringify(LAY)); } catch (e) {} }
function cid(col) { return col.k || col.c; }
function cw(col) { return LAY.w[cid(col)] || col.w; }
function vis() { var out = []; COLS.forEach(function (c, i) { if (LAY.h.indexOf(cid(c)) === -1) out.push(i); }); return out; }
var TIER_SEED = {"CHANEL":"하이엔드","HERMES":"하이엔드","LOUIS VUITTON":"하이엔드","DIOR":"하이엔드","GUCCI":"하이엔드","PRADA":"하이엔드","SAINT LAURENT":"하이엔드","BOTTEGA VENETA":"하이엔드","CELINE":"하이엔드","MIU MIU":"하이엔드","LOEWE":"하이엔드","VAN CLEEF & ARPELS":"하이엔드"};
v.scCols = v.scCols || false;
function cfg() { var c = Object.assign({}, DEF, S.SET.price_settings || {}); if (!c.category_adj || !Object.keys(c.category_adj).length) c.category_adj = SEED.category_adj; c.brands = c.brands || {}; c.vendor_adj = c.vendor_adj || {}; return c; }
/* 카드혜택 = 결제카드 기본 할인율(설정›채널·카드) + 매입처 카드행사(설정 탭 '매입처/카드') — 카드혜택% 칸에 직접 넣으면 그 값 우선 */
function cardOpts() { OPT.card = [""].concat((S.CARDS || []).map(function (c) { return c.name; })); }
function cardAuto(it, c0) {
  var x = it.extra || {}, nm = x.payCard || "", card = (S.CARDS || []).filter(function (c) { return c.name === nm; })[0], pr = (c0 || cfg()).card_promo || {};
  var base = card ? num(card.discount_rate != null ? card.discount_rate : card.discountRate) + num(card.point_rate != null ? card.point_rate : card.pointRate) : 0;
  var promo = nm ? num(pr[(it.vendor || "") + "/" + nm] != null ? pr[(it.vendor || "") + "/" + nm] : pr["전체/" + nm]) : 0;
  return { base: base, promo: promo, sum: base + promo };
}
function calc(it) { var c0 = cfg(), a = cardAuto(it, c0), manual = it.cardRate != null && it.cardRate !== "", o = C.sourcing(manual ? it : Object.assign({}, it, { cardRate: a.sum }), c0); o.cardBase = a.base; o.cardPromo = a.promo; o.cardAuto = a.sum; return o; }
function get(it, k) { if (k.indexOf("x.") === 0) { var x = it.extra || {}; return x[k.slice(2)]; } return it[k]; }
function setv(it, k, val) { if (k.indexOf("x.") === 0) { it.extra = Object.assign({}, it.extra || {}); it.extra[k.slice(2)] = val; } else it[k] = val; }
function all() { return ERP.list("price_items"); }
function rows() {
  var q = v.scQ.trim().toLowerCase();
  var L = all().filter(function (it) {
    if (v.scTab !== "전체" && it.tier !== v.scTab) return false;
    if (q) { var x = it.extra || {}; if ([it.sku, it.brand, x.brandKr, it.name, x.line, it.vendor, x.code, x.ssNo, it.memo].join(" ").toLowerCase().indexOf(q) === -1) return false; }
    if (v.scF !== "all") { var c = calc(it); if (v.scF === "change" && !c.change) return false; if (v.scF === "warn" && !/손해|저마진/.test(c.warn || "")) return false; if (v.scF === "link" && !c.linkDiff) return false; if (v.scF === "nocost" && c.warn !== "원가없음") return false; }
    return true;
  });
  if (v.scSort) { var s = v.scSort, col = COLS[s.i]; L = L.map(function (it) { return { it: it, val: col.c ? calc(it)[col.c] : get(it, col.k) }; }).sort(function (a, b) { var x = a.val, y = b.val; if (x == null || x === "") return 1; if (y == null || y === "") return -1; return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * s.d; }).map(function (o) { return o.it; }); }
  else L.sort(function (a, b) { return String(a.createdAt || a.id).localeCompare(String(b.createdAt || b.id)); });
  return L;
}
function fmt(col, val, c) {
  if (val == null || val === "" || (typeof val === "number" && !isFinite(val))) return "";
  switch (col.f) {
    case "won": return Math.round(val).toLocaleString("ko-KR");
    case "pct": return (val * 100).toFixed(1).replace(/\.0$/, "") + "%";
    case "pct2": return (val * 100).toFixed(3) + "%";
    case "pct0": return Math.round(val * 100) + "%";
    case "len": return '<span class="' + (val > 100 ? "neg" : val > 50 ? "warn-t" : "") + '">' + val + "</span>";
    case "dt": return esc(String(val).replace("T", " ").slice(5, 16));
    case "diff": return '<span class="' + (val > 0 ? "neg" : "pos") + '">' + (val > 0 ? "▲" : "▼") + Math.abs(val).toLocaleString("ko-KR") + "</span>";
    case "chg": return val === "신규" ? '<span class="pill p-good">신규</span>' : '<span class="pill p-acc">' + esc(val) + "</span>";
    case "warn": return String(val).split(" · ").map(function (w) { return '<span class="pill ' + (w === "손해" ? "p-crit" : w === "원가없음" ? "p-mute" : "p-warn") + '">' + esc(w) + "</span>"; }).join(" ");
    default: return esc(val);
  }
}
function inVal(col, val) { if (val == null) return ""; if (col.t === "pct") return val === "" ? "" : Math.round(num(val) * 10000) / 100 + "%"; if (col.t === "num") return val === "" ? "" : Math.round(num(val)).toLocaleString("ko-KR"); return String(val); }
function cellHtml(it, ci, c, w) {
  var col = COLS[ci], cls = [], inner;
  if (col.t && !col.ro) {
    cls.push("in");
    var val = get(it, col.k);
    if (col.t === "sel") {
      var opts = OPT[col.o], cur = val == null ? "" : val; if (col.k === "x.channel" && !cur) cur = "네이버유입"; if (col.k === "x.proof" && !cur) cur = "카드·세금계산서";
      inner = w ? '<select data-ci="' + ci + '" aria-label="' + esc(col.l) + '">' + opts.map(function (o) { return '<option' + (o === cur ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>" : esc(cur);
    } else if (col.t === "link") {
      inner = '<div class="lk"><span class="ce" ' + (w ? 'contenteditable="plaintext-only" ' : "") + 'data-ci="' + ci + '" spellcheck="false">' + esc(val || "") + "</span>" + (val ? '<a href="' + esc(val) + '" target="_blank" rel="noopener" title="새 창으로 열기" tabindex="-1">↗</a>' : "") + "</div>";
    } else {
      var phv = col.ph === "brandKr" ? c.brandKr : col.ph === "margin" ? (Math.round(num(c.margin) * 1000) / 10) + "%" : col.ph === "card" ? (c.cardAuto ? (Math.round(num(c.cardAuto) * 1000) / 10) + "%" : "") : "";
      if (col.ph && (val == null || val === "") && phv) inner = '<span class="ce ph' + (col.t !== "txt" ? " r" : "") + '" ' + (w ? 'contenteditable="plaintext-only" ' : "") + 'data-ci="' + ci + '" spellcheck="false" data-ph="' + esc(phv) + '"></span>';
      else inner = '<span class="ce' + (col.t !== "txt" ? " r" : "") + '" ' + (w ? 'contenteditable="plaintext-only" ' : "") + 'data-ci="' + ci + '" spellcheck="false">' + esc(inVal(col, val)) + "</span>";
    }
  } else {
    cls.push(col.key ? "key" : "calc"); if (col.f !== "txt" && col.f !== "warn" && col.f !== "chg") cls.push("r");
    inner = fmt(col, col.c ? c[col.c] : get(it, col.k), c);
  }
  var fz = FROZEN_KEYS.indexOf(col.k) !== -1; if (fz) cls.push("fz");
  return '<td class="' + cls.join(" ") + '" data-ci="' + ci + '"' + (fz ? ' style="left:38px"' : "") + ">" + inner + "</td>";
}
function isSold(it) { return it.status === "품절" || (it.extra || {}).linkStatus === "품절"; }
function rowHtml(it, i, w) { var c = calc(it); var so = isSold(it); return '<tr data-id="' + esc(it.id) + '"' + (so ? ' class="so" title="매입처 품절"' : "") + '><th class="rn" scope="row" data-sel="' + esc(it.id) + '">' + (i + 1) + "</th>" + vis().map(function (ci) { return cellHtml(it, ci, c, w); }).join("") + "</tr>"; }
function counts() { var n = { all: 0, change: 0, warn: 0, link: 0, nocost: 0 }; all().filter(function (it) { return v.scTab === "전체" || it.tier === v.scTab; }).forEach(function (it) { var c = calc(it); n.all++; if (c.change) n.change++; if (/손해|저마진/.test(c.warn || "")) n.warn++; if (c.linkDiff) n.link++; if (c.warn === "원가없음") n.nocost++; }); return n; }

function render() {
  cardOpts();
  if (v.scTab === "설정") return head() + settingsHtml() + tabsHtml();
  var w = ERP.canWrite("price_items"), list = rows(), n = counts();
  var groups = "", g = null, span = 0, gl = [];
  var V = vis(), curG = null; COLS.forEach(function (col, i) { if (col.g) curG = col.g; if (V.indexOf(i) === -1) return; if (curG !== g) { if (g !== null) gl.push([g, span]); g = curG; span = 1; } else span++; }); if (g !== null) gl.push([g, span]);
  groups = '<tr class="grp"><th class="rn"></th>' + gl.map(function (x) { return '<th colspan="' + x[1] + '">' + esc(x[0]) + "</th>"; }).join("") + "</tr>";
  var hdr = '<tr class="hd"><th class="rn">#</th>' + V.map(function (ci) { var col = COLS[ci]; var s = v.scSort && v.scSort.i === ci ? (v.scSort.d > 0 ? " ▲" : " ▼") : "", fz = FROZEN_KEYS.indexOf(col.k) !== -1; return '<th style="width:' + cw(col) + 'px;min-width:' + cw(col) + 'px' + (fz ? ";left:38px" : "") + '" class="' + (col.t && !col.ro ? "h-in" : col.key ? "h-key" : "h-calc") + (fz ? " fz" : "") + '" data-sort="' + ci + '" title="누르면 정렬 · 오른쪽 끝을 끌면 너비 조절 · 마우스 오른쪽 버튼 = 열 숨기기">' + esc(col.l) + s + '<span class="rz" data-rz="' + ci + '"></span></th>'; }).join("") + "</tr>";
  var body = list.map(function (it, i) { return rowHtml(it, i, w); }).join("");
  if (w) body += '<tr class="newrow"><th class="rn">+</th><td colspan="' + V.length + '"><button class="linkbtn" data-act="scadd">+ 새 상품 줄 추가</button> <span class="muted">· 엑셀에서 여러 줄을 복사해 아무 칸에서 Ctrl+V 해도 돼요(모자라는 줄은 자동으로 늘어나요)</span></td></tr>';
  var h = head(n);
  var tw = 38 + V.reduce(function (a, i) { return a + cw(COLS[i]); }, 0), cg = '<colgroup><col style="width:38px">' + V.map(function (i) { return '<col data-ci="' + i + '" style="width:' + cw(COLS[i]) + 'px">'; }).join("") + "</colgroup>";
  if (v.scCols) h += colsPanel();
  h += '<div class="sheet-wrap" id="sheet"><table class="sheet" style="width:' + tw + 'px">' + cg + '<thead>' + groups + hdr + "</thead><tbody>" + body + "</tbody></table></div>";
  if (!list.length) h += '<div class="panel empty"><b>' + (all().length ? "조건에 맞는 상품이 없어요" : "아직 상품이 없어요") + "</b>‘+ 새 상품 줄 추가’를 누르거나 소싱폼 엑셀을 올려 주세요.</div>";
  return h + tabsHtml();
}
function head(n) {
  var w = ERP.canWrite("price_items");
  var h = '<div class="head sc-head"><div><h1>스마트스토어 소싱</h1><p>칸을 눌러 바로 입력 · Enter/Tab/방향키 이동 · 여러 칸 Ctrl+V · 칸을 벗어나면 자동 저장 · 흰 칸=입력, 회색=자동계산, 분홍=핵심 결과</p></div><div class="tools"><button class="btn" data-act="scrail">' + (document.body.classList.contains("rail-hide") ? "메뉴 보이기" : "메뉴 숨기고 넓게") + '</button>' +
    (w ? '<button class="btn pri" data-act="scsave" title="지금 바로 저장 (Ctrl+S) · 입력하면 자동으로도 저장돼요">💾 저장</button>' : "") + ('<button class="btn' + (v.scCols ? " pri" : "") + '" data-act="sccols">열 숨기기·보이기' + (LAY.h.length ? " (" + LAY.h.length + "개 숨김)" : "") + "</button>") + (w ? '<button class="btn" data-act="scattrdiag" title="스마트스토어 상품속성 자동입력 준비: 수정 화면 구조 진단">속성 진단</button><button class="btn" data-act="sccafe" title="메투 카페 여주메니아 판매글 주소를 넣으면 상품 정보를 채워요">메투 글 추가</button><button class="btn" data-act="scautofill" title="링크는 있는데 빈칸이 있는 줄을 자동으로 채워요">링크로 빈칸 채우기</button><button class="btn" data-act="sccheck" title="모든 링크의 가격·재고를 지금 확인해요(ERP 창이 켜져 있으면 3시간마다 자동)">가격·재고 지금 확인</button>' + AUTO.badge() : "") + (w ? '<button class="btn" data-act="scimport">소싱폼 엑셀 올리기</button>' : "") + '<button class="btn" data-act="scexport">엑셀로 받기</button>' + (w ? '<button class="btn" data-act="scsold" id="scso" disabled title="왼쪽 줄 번호를 누른 뒤 사용">줄 번호 눌러 품절 표시</button>' : "") + (ERP.canWrite("price_items") ? '<button class="btn danger" data-act="scdel" id="scdel" disabled>선택 줄 삭제</button>' : "") + "</div></div>";
  if (n) h += '<div class="tools filters">' + ERP.chips("data-view", "scF=" + v.scF, [["scF=all", "전체 " + n.all], ["scF=change", "가격 변경 필요 " + n.change], ["scF=warn", "손해·저마진 " + n.warn], ["scF=link", "매입가 변동 " + n.link], ["scF=nocost", "원가 없음 " + n.nocost]]) + '<input class="ctl search" data-search="scQ" type="search" aria-label="검색" placeholder="품번·브랜드·상품명·매입처·코드" value="' + esc(v.scQ) + '">' + (v.scSort ? '<button class="btn sm" data-act="scunsort">정렬 해제</button>' : "") + "</div>";
  return h;
}
function tabsHtml() { return '<div class="sheet-tabs" role="tablist">' + ["하이엔드", "컨템포러리", "전체", "설정"].map(function (t) { return '<button role="tab" aria-selected="' + (v.scTab === t) + '" class="' + (v.scTab === t ? "on" : "") + '" data-view="scTab=' + t + '">' + (t === "설정" ? "⚙ 설정" : t === "후보" ? "🔎 소싱 후보" : t) + "</button>"; }).join("") + "</div>"; }

function settingsHtml() {
  var c = cfg(), dis = ERP.canWrite("price_items") ? "" : " disabled";
  var f = function (k, label, isPct) { return '<div class="fd"><label for="sc-' + k + '">' + label + '</label><input id="sc-' + k + '" data-ps="' + k + '" data-pct="' + (isPct ? 1 : "") + '" type="number" step="any" value="' + (isPct ? Math.round(num(c[k]) * 100000) / 1000 : num(c[k])) + '"' + dis + "></div>"; };
  var kv = function (title, key, items, hint) { return '<div class="panel"><h2>' + title + '<span class="sub">' + hint + '</span></h2><div class="kv-list">' + items.map(function (k) { return '<div class="kv"><span>' + esc(k) + '</span><input type="number" step="any" data-map="' + key + '" data-mk="' + esc(k) + '" value="' + Math.round(num((c[key] || {})[k]) * 100000) / 1000 + '"' + dis + '><em>%p</em></div>'; }).join("") + (ERP.canWrite("price_items") ? '<div class="kv add"><input type="text" placeholder="새 항목 이름" data-newkey="' + key + '"><button class="btn sm" data-act="scaddkey" data-key="' + key + '">추가</button></div>' : "") + "</div></div>"; };
  var brands = c.brands || {};
  var h = '<div class="panel"><h2>가격 정책<span class="sub">바꾸면 모든 상품 가격이 바로 다시 계산돼요 (대표님만 수정)</span></h2><div class="fg four">' +
    f("global_adj", "전체 일괄조정 %p", 1) + f("margin_high", "기본마진 - 하이엔드 %", 1) + f("margin_contemp", "기본마진 - 컨템포러리 %", 1) + f("extra_cost", "건당 부대비용 (원)") +
    f("round_unit", "가격 올림 단위 (원)") + f("discount_rate", "즉시할인 노출률 %", 1) + f("low_margin", "저마진 경고 기준 %", 1) + '<div class="fd"></div>' +
    f("npay", "Npay 주문관리수수료 % (VAT포함)", 1) + f("fee_naver", "판매수수료 - 네이버 유입 % (VAT별도)", 1) + f("fee_mkt", "판매수수료 - 마케팅링크 % (VAT별도)", 1) + f("vat", "부가세율 %", 1) +
    '</div><p class="note">판매가 = 올림((실질원가+부대비용)×(1+적용마진)÷(1−수수료율)). 적용마진 = 기본 + 카테고리 + 브랜드 + 매입처 + 개별 + 전체 조정. 순이익 = 최종판매가 − 수수료 − 실질원가 − 부대비용. 부가세(추정) = 판매가÷11 − 매입가÷11(매입증빙이 카드·세금계산서일 때) − 수수료÷11 — 신고 전 세무사 확인 필요.</p></div>';
  h += '<div class="grid2">' + kv("매입처 카드행사", "card_promo", Object.keys(c.card_promo || {}), "형식: 매입처/카드이름 (예: 롯데온/국민카드 → 5) · 모든 매입처면 전체/국민카드 · 카드이름은 설정›채널·카드와 같게 · 카드 기본 할인율은 설정›채널·카드에서") + "</div>";
  h += '<div class="grid2">' + kv("매입처 조정", "vendor_adj", Object.keys(c.vendor_adj || {}), "그 매입처 상품에만 더하는 마진") + kv("카테고리 조정", "category_adj", Object.keys(c.category_adj || {}), "대분류/중분류 별 마진 가감") + "</div>";
  var bt = function (b) { return brands[b].tier || TIER_SEED[b] || "컨템포러리"; };
  var btable = function (tier) { var L = Object.keys(brands).filter(function (b) { return bt(b) === tier; }).sort(); return '<div class="panel"><h2>' + tier + ' 브랜드<span class="sub">' + L.length + '개 · 영문이 같으면 한글명 자동, 브랜드조정 %p가 붙어요</span></h2><div class="table-wrap"><table><thead><tr><th>브랜드(영문)</th><th>브랜드(한글)</th><th class="r">브랜드조정 %p</th><th>구분</th></tr></thead><tbody>' +
    L.map(function (b) { return '<tr><td>' + esc(b) + '</td><td><input class="cell-in" style="width:130px;text-align:left" data-brand="' + esc(b) + '" data-bk="kr" value="' + esc(brands[b].kr || "") + '"' + dis + '></td><td class="r"><input class="cell-in" type="number" step="any" data-brand="' + esc(b) + '" data-bk="adj" value="' + Math.round(num(brands[b].adj) * 100000) / 1000 + '"' + dis + '></td><td><select class="ctl sm" data-brand="' + esc(b) + '" data-bk="tier"' + dis + '><option' + (tier === "하이엔드" ? " selected" : "") + '>하이엔드</option><option' + (tier === "컨템포러리" ? " selected" : "") + ">컨템포러리</option></select></td></tr>"; }).join("") +
    "</tbody></table></div>" + (ERP.canWrite("price_items") ? '<div class="tools" style="margin-top:8px"><input class="ctl" id="nb-en-' + tier + '" placeholder="브랜드(영문) 예: ' + (tier === "하이엔드" ? "HERMES" : "MAX MARA") + '"><input class="ctl" id="nb-kr-' + tier + '" placeholder="한글 예: ' + (tier === "하이엔드" ? "에르메스" : "막스마라") + '"><button class="btn sm" data-act="scaddbrand" data-tier="' + tier + '">' + tier + " 브랜드 추가</button></div>" : "") + "</div>"; };
  h += '<div class="grid2 even">' + btable("하이엔드") + btable("컨템포러리") + "</div>";
  return h;
}
function colsPanel() {
  var groups = [], g = null; COLS.forEach(function (c, i) { if (c.g) { g = { name: c.g, items: [] }; groups.push(g); } g.items.push(i); });
  return '<div class="panel cols-panel"><h2>열 숨기기·보이기<span class="sub">체크를 끄면 숨겨져요 · 머리글 오른쪽 끝을 끌면 너비 조절 · 머리글에서 마우스 오른쪽 버튼을 눌러도 바로 숨겨져요 · 이 컴퓨터에 기억돼요</span></h2><div class="cols-grid">' +
    groups.map(function (gr) { return '<div><b>' + esc(gr.name) + "</b>" + gr.items.map(function (i) { var c = COLS[i], id = cid(c); return '<label class="ck"><input type="checkbox" data-colvis="' + esc(id) + '"' + (LAY.h.indexOf(id) === -1 ? " checked" : "") + "> " + esc(c.l) + "</label>"; }).join("") + "</div>"; }).join("") +
    '</div><div class="tools" style="margin-top:8px"><button class="btn sm" data-act="scshowall">모두 보이기</button><button class="btn sm" data-act="scwreset">열 너비 처음대로</button><button class="btn sm" data-act="sccols">닫기</button></div></div>';
}
function saveCfg(o) { return ERP.saveSetting("price_settings", o); }

/* ---------- 저장 (줄 단위, 디바운스) ---------- */
var pending = {}, timers = {};
function queueSave(it) { pending[it.id] = it; clearTimeout(timers[it.id]); timers[it.id] = setTimeout(function () { flush(it.id); }, 500); }
async function flush(id) {
  var it = pending[id]; if (!it) return; delete pending[id];
  it.name = calc(it).finalName || it.name || "";
  ERP.DATA.price_items.set(it.id, it); ERP.sync("busy", "저장 중");
  var res = await S.sb.from("price_items").upsert(ERP.toRow("price_items", it));
  if (res.error) { ERP.sync("err", "저장 실패"); ERP.toast(ERP.errMsg(res.error)); } else ERP.sync("ok", "저장됨");
}
function parseIn(col, raw) {
  var s = String(raw == null ? "" : raw).replace(/ /g, " ").trim();
  if (col.t === "num") { if (s === "") return null; var n = Number(s.replace(/[,원\s]/g, "")); return isFinite(n) ? n : null; }
  if (col.t === "pct") { if (s === "") return null; var hasP = /%/.test(s), p = Number(s.replace(/[%\s]/g, "")); if (!isFinite(p)) return null; return hasP || Math.abs(p) >= 1 ? p / 100 : p; }
  if (col.t === "sel") { var o = OPT[col.o]; return o.indexOf(s) !== -1 ? s : (col.k === "x.gender" ? s : o[0]); }
  return s;
}
function refreshRow(tr, it) {
  var c = calc(it), w = ERP.canWrite("price_items");
  tr.querySelectorAll("td").forEach(function (td) { var ci = +td.dataset.ci, col = COLS[ci]; if (col.t && !col.ro) { if (col.ph) { var sp = td.querySelector(".ce"), gv = get(it, col.k); if (sp && (gv == null || gv === "")) { sp.dataset.ph = col.ph === "margin" ? (Math.round(num(c.margin) * 1000) / 10) + "%" : col.ph === "card" ? (c.cardAuto ? (Math.round(num(c.cardAuto) * 1000) / 10) + "%" : "") : (c.brandKr || ""); sp.classList.add("ph"); } } return; } var nh = cellHtml(it, ci, c, w); var tmp = document.createElement("tbody"); tmp.innerHTML = "<tr>" + nh + "</tr>"; td.innerHTML = tmp.firstChild.firstChild.innerHTML; });
}
function commitCell(span) {
  var td = span.closest("td"), tr = span.closest("tr"), it0 = ERP.DATA.price_items.get(tr.dataset.id); if (!it0) return;
  var col = COLS[+td.dataset.ci], it = Object.assign({}, pending[it0.id] || it0), val = parseIn(col, span.tagName === "SELECT" ? span.value : span.textContent);
  var old = get(it, col.k); if ((old == null ? "" : old) === (val == null ? "" : val)) { if (span.tagName !== "SELECT") span.textContent = inVal(col, old); return; }
  if (col.k === "x.marginSet" && val != null && (val < 0.01 || val > 0.30)) { ERP.toast("적용마진은 1~30% 사이로 넣어 주세요."); span.textContent = inVal(col, old); return; }
  setv(it, col.k, val);
  if (col.k === "buyLink") { /* 링크 바뀌면 AI 확인값 초기화 */ it.extra = Object.assign({}, it.extra || {}, { linkPrice: null, linkCheckedAt: null }); }
  ERP.DATA.price_items.set(it.id, it); queueSave(it);
  if (col.k === "buyLink" && val) { if (!it.vendor) { var vn0 = vendorOf(val, null); if (vn0 && vn0 !== "네이버스토어") { it.vendor = vn0; ERP.DATA.price_items.set(it.id, it); queueSave(it); } } AUTO.fill(it.id, val); }
  if (col.k === "x.storeLink" && val) AUTO.store(it.id, val, true);
  if (span.tagName !== "SELECT") { span.textContent = inVal(col, val); span.classList.remove("ph"); }
  refreshRow(tr, it); tr.classList.toggle("so", isSold(it));
}
async function addRows(n, tier) {
  var made = [], base = Date.now();
  for (var i = 0; i < n; i++) made.push({ id: "pr_" + base.toString(36) + "_" + i + Math.random().toString(36).slice(2, 5), status: "판매대기", tier: tier || (v.scTab === "하이엔드" ? "하이엔드" : "컨템포러리"), sku: "", buyLink: "", vendor: "", brand: "", category: "", name: "", buyPrice: null, cardRate: null, margin: null, feeRate: null, fixedPrice: null, storePrice: null, memo: "", extra: {}, createdAt: new Date(base + i).toISOString() });
  var res = await S.sb.from("price_items").upsert(made.map(function (m) { var r = ERP.toRow("price_items", m); delete r.created_at; return r; }));
  if (res.error) { ERP.toast(ERP.errMsg(res.error)); return []; }
  made.forEach(function (m) { ERP.DATA.price_items.set(m.id, m); });
  return made;
}

/* ---------- 키보드·붙여넣기 ---------- */
function cellsOf(tr) { return Array.prototype.slice.call(tr.querySelectorAll("td")); }
function focusCell(td) { if (!td) return; var e = td.querySelector(".ce,select"); if (e) { e.focus(); if (e.classList && e.classList.contains("ce")) { var r = document.createRange(); r.selectNodeContents(e); var s = getSelection(); s.removeAllRanges(); s.addRange(r); } } else { td.tabIndex = -1; td.focus(); } td.scrollIntoView({ block: "nearest", inline: "nearest" }); }
function move(td, dr, dc) {
  var tr = td.parentElement, ci = cellsOf(tr).indexOf(td), t;
  if (dr) { t = dr > 0 ? tr.nextElementSibling : tr.previousElementSibling; if (!t || t.classList.contains("newrow")) return; return focusCell(cellsOf(t)[ci]); }
  var cells = cellsOf(tr), j = ci + dc; while (cells[j] && !cells[j].classList.contains("in")) j += dc; if (cells[j]) focusCell(cells[j]);
}
async function onPaste(e, span) {
  var txt = (e.clipboardData || window.clipboardData).getData("text"); if (!txt || (txt.indexOf("\t") === -1 && txt.indexOf("\n") === -1)) return;
  e.preventDefault();
  var grid = txt.replace(/\r/g, "").replace(/\n$/, "").split("\n").map(function (l) { return l.split("\t"); });
  var td = span.closest("td"), tr = td.parentElement, ci0 = +td.dataset.ci, trs = Array.prototype.slice.call(tr.parentElement.querySelectorAll("tr[data-id]")), r0 = trs.indexOf(tr);
  var need = r0 + grid.length - trs.length; if (need > 0) { var made = await addRows(need); ERP.toast("새 줄 " + made.length + "개를 만들었어요."); }
  var ids = trs.map(function (t) { return t.dataset.id; }).concat(Object.keys(pending).length ? [] : []);
  if (need > 0) { var list = rows(); ids = list.map(function (x) { return x.id; }); }
  var changed = 0;
  grid.forEach(function (cells, ri) {
    var id = ids[r0 + ri]; var it0 = id && ERP.DATA.price_items.get(id); if (!it0) return; var it = Object.assign({}, pending[id] || it0);
    var V = vis(), p0 = V.indexOf(ci0);
    cells.forEach(function (raw, k) { var col = COLS[V[p0 + k]]; if (!col || !col.t || col.ro) return; var nv = parseIn(col, raw); if (col.k === "buyLink" && nv && nv !== it.buyLink) AUTO.later.push([id, nv]); setv(it, col.k, nv); changed++; });
    ERP.DATA.price_items.set(id, it); queueSave(it);
  });
  ERP.render(); ERP.toast(changed + "칸을 붙여넣었어요."); AUTO.later.splice(0).forEach(function (a) { AUTO.fill(a[0], a[1]); });
}
var selected = null;
function bind(root) {
  var sheet = root.querySelector("#sheet");
  root.querySelectorAll("[data-sort]").forEach(function (th) { th.onclick = function () { var i = +th.dataset.sort; v.scSort = v.scSort && v.scSort.i === i ? (v.scSort.d > 0 ? { i: i, d: -1 } : null) : { i: i, d: 1 }; ERP.render(); }; });
  if (sheet) {
    sheet.addEventListener("focusout", function (e) { var t = e.target; if (t.classList && t.classList.contains("ce")) commitCell(t); });
    sheet.addEventListener("change", function (e) { if (e.target.tagName === "SELECT" && e.target.dataset.ci) commitCell(e.target); });
    sheet.addEventListener("paste", function (e) { var t = e.target.closest && e.target.closest(".ce"); if (t) onPaste(e, t); });
    sheet.addEventListener("keydown", function (e) {
      var t = e.target, td = t.closest && t.closest("td"); if (!td) return;
      if (e.key === "Enter" && !e.altKey) { e.preventDefault(); if (t.classList.contains("ce")) t.blur(); move(td, e.shiftKey ? -1 : 1, 0); }
      else if (e.key === "Tab") { e.preventDefault(); if (t.classList.contains("ce")) t.blur(); move(td, 0, e.shiftKey ? -1 : 1); }
      else if (e.key === "Escape") { var col = COLS[+td.dataset.ci], it = ERP.DATA.price_items.get(td.parentElement.dataset.id); if (t.classList.contains("ce") && it) t.textContent = inVal(col, get(it, col.k)); t.blur(); }
      else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && t.tagName !== "SELECT") { e.preventDefault(); if (t.classList.contains("ce")) t.blur(); move(td, e.key === "ArrowDown" ? 1 : -1, 0); }
      else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && t.classList.contains("ce")) { var sel = getSelection(), len = t.textContent.length, off = sel.focusOffset, all = sel.toString().length === len; if (all || (e.key === "ArrowLeft" && off === 0) || (e.key === "ArrowRight" && off >= len)) { e.preventDefault(); t.blur(); move(td, 0, e.key === "ArrowRight" ? 1 : -1); } }
    });
    sheet.addEventListener("click", function (e) {
      var th = e.target.closest && e.target.closest("th[data-sel]"); if (th && ERP.canWrite("price_items")) { sheet.querySelectorAll("tr.sel").forEach(function (r) { r.classList.remove("sel"); }); var tr = th.parentElement; if (selected === tr.dataset.id) { selected = null; } else { selected = tr.dataset.id; tr.classList.add("sel"); } var b = document.getElementById("scdel"); if (b) { b.disabled = !selected; b.textContent = "선택 줄 삭제"; delete b.dataset.arm; } soBtn(); return; }
      var td = e.target.closest && e.target.closest("td.in"); if (td && e.target === td) focusCell(td);
    });
  }
  root.querySelectorAll("[data-colvis]").forEach(function (el) { el.onchange = function () { var id = el.dataset.colvis, k = LAY.h.indexOf(id); if (el.checked && k !== -1) LAY.h.splice(k, 1); if (!el.checked && k === -1) LAY.h.push(id); saveLay(); ERP.render(); }; });
  if (sheet) {
    sheet.querySelectorAll("th[data-sort]").forEach(function (th) { th.addEventListener("contextmenu", function (e) { e.preventDefault(); var col = COLS[+th.dataset.sort]; LAY.h.push(cid(col)); saveLay(); ERP.render(); ERP.toast("‘" + col.l + "’ 열을 숨겼어요. 다시 보려면 ‘열 숨기기·보이기’를 누르세요."); }); });
    sheet.querySelectorAll(".rz").forEach(function (rz) { rz.addEventListener("click", function (e) { e.stopPropagation(); }); rz.addEventListener("mousedown", function (e) {
      e.preventDefault(); e.stopPropagation(); var ci = +rz.dataset.rz, col = COLS[ci], th = rz.parentElement, cg = sheet.querySelector('col[data-ci="' + ci + '"]'), tb = sheet.querySelector("table.sheet"), x0 = e.clientX, w0 = cw(col), tw0 = tb.offsetWidth;
      document.body.classList.add("resizing");
      var mv = function (ev) { var w = Math.max(40, Math.round(w0 + ev.clientX - x0)); cg.style.width = w + "px"; th.style.width = th.style.minWidth = w + "px"; tb.style.width = (tw0 + w - w0) + "px"; LAY.w[cid(col)] = w; };
      var up = function () { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); document.body.classList.remove("resizing"); saveLay(); };
      document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up); }); rz.addEventListener("dblclick", function (e) { e.stopPropagation(); delete LAY.w[cid(COLS[+rz.dataset.rz])]; saveLay(); ERP.render(); }); });
  }
  root.querySelectorAll("[data-ps]").forEach(function (el) { el.onchange = function () { var o = Object.assign({}, cfg()); o[el.dataset.ps] = el.dataset.pct ? num(el.value) / 100 : num(el.value); saveCfg(o); }; });
  root.querySelectorAll("[data-map]").forEach(function (el) { el.onchange = function () { var o = Object.assign({}, cfg()), m = Object.assign({}, o[el.dataset.map] || {}); m[el.dataset.mk] = num(el.value) / 100; o[el.dataset.map] = m; saveCfg(o); }; });
  root.querySelectorAll("[data-brand]").forEach(function (el) { el.onchange = function () { var o = Object.assign({}, cfg()), b = Object.assign({}, o.brands || {}), r = Object.assign({}, b[el.dataset.brand] || {}); if (el.dataset.bk === "kr") r.kr = el.value.trim(); else if (el.dataset.bk === "tier") r.tier = el.value; else r.adj = num(el.value) / 100; b[el.dataset.brand] = r; o.brands = b; saveCfg(o); }; });
}
function live() { /* 다른 사람·AI가 바꾼 내용 반영: 입력 중이면 그 줄만 건드리지 않음 */
  var sheet = document.getElementById("sheet"); if (!sheet || v.scTab === "설정") { var ae = document.activeElement; if (ae && ae.matches && ae.matches("input,select")) return; ERP.render(); return; }
  var act = document.activeElement, editingId = act && act.closest && act.closest("tr[data-id]") ? act.closest("tr[data-id]").dataset.id : null;
  var ids = rows().map(function (x) { return x.id; }), trs = sheet.querySelectorAll("tr[data-id]");
  if (ids.length !== trs.length) { if (!editingId) ERP.render(); return; }
  trs.forEach(function (tr) { if (tr.dataset.id === editingId) return; var it = ERP.DATA.price_items.get(tr.dataset.id); if (it) { var w = ERP.canWrite("price_items"); var tmp = document.createElement("tbody"); tmp.innerHTML = rowHtml(it, 0, w); var nt = tmp.firstChild; nt.firstChild.textContent = tr.firstChild.textContent; tr.innerHTML = nt.innerHTML; } });
}

/* ---------- 버튼 ---------- */
ERP.acts.scadd = async function () { var m = await addRows(1); if (!m.length) return; v.scSort = null; ERP.render(); var tr = document.querySelector('tr[data-id="' + m[0].id + '"]'); if (tr) focusCell(tr.querySelector("td.in")); };
ERP.acts.scrail = function () { var on = !document.body.classList.contains("rail-hide"); document.body.classList.toggle("rail-hide", on); try { localStorage.setItem("rowna-sc-rail", on ? "1" : ""); } catch (e) {} ERP.render(); };
try { if (localStorage.getItem("rowna-sc-rail")) document.body.classList.add("rail-hide"); } catch (e) {}
ERP.acts.scunsort = function () { v.scSort = null; ERP.render(); };
function soBtn() { var b = document.getElementById("scso"); if (!b) return; var it = selected && ERP.DATA.price_items.get(selected); b.disabled = !it; b.textContent = !it ? "줄 번호 눌러 품절 표시" : ((it.extra || {}).linkStatus === "품절" ? "선택 줄 품절 해제" : "선택 줄 품절로 표시"); }
ERP.acts.scsold = function () { var it0 = selected && ERP.DATA.price_items.get(selected); if (!it0) return; var it = Object.assign({}, pending[it0.id] || it0), x = Object.assign({}, it.extra || {}), on = x.linkStatus !== "품절"; x.linkStatus = on ? "품절" : "정상"; x.soldManual = on; x.soldManualAt = new Date().toISOString(); it.extra = x; if (on) it.status = "품절"; else if (it.status === "품절") it.status = "판매중"; ERP.DATA.price_items.set(it.id, it); queueSave(it); ERP.toast(on ? "품절로 표시했어요." : "품절을 해제했어요."); ERP.render(); };
ERP.acts.scsave = async function () {
  var a = document.activeElement; if (a && a.classList && a.classList.contains("ce")) commitCell(a);
  var ids = Object.keys(pending); ids.forEach(function (id) { clearTimeout(timers[id]); });
  await Promise.all(ids.map(function (id) { return flush(id); }));
  ERP.toast(ids.length ? ids.length + "줄 저장했어요." : "모두 저장돼 있어요.");
};
document.addEventListener("keydown", function (e) { if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S") && document.querySelector("table.sheet")) { e.preventDefault(); ERP.acts.scsave(); } });
window.addEventListener("beforeunload", function (e) { if (Object.keys(pending).length) { e.preventDefault(); e.returnValue = ""; } });
ERP.acts.scdel = async function (btn) { if (!selected) return; var it = ERP.DATA.price_items.get(selected); if (!btn.dataset.arm) { btn.dataset.arm = "1"; btn.textContent = "‘" + ((it && (calc(it).finalName || it.sku)) || "").slice(0, 18) + "’ 삭제할까요? 한 번 더"; return; } if (await ERP.remove("price_items", selected)) ERP.toast("삭제했어요."); selected = null; };
ERP.acts.scaddkey = function (btn) { var key = btn.dataset.key, inp = document.querySelector('[data-newkey="' + key + '"]'), name = inp && inp.value.trim(); if (!name) return; var o = Object.assign({}, cfg()), m = Object.assign({}, o[key] || {}); m[name] = 0; o[key] = m; saveCfg(o); };
ERP.acts.scaddbrand = function (btn) { var t = btn.dataset.tier || "컨템포러리", en = (document.getElementById("nb-en-" + t).value || "").trim().toUpperCase(), kr = (document.getElementById("nb-kr-" + t).value || "").trim(); if (!en) { ERP.toast("영문 브랜드명을 넣어 주세요."); return; } var o = Object.assign({}, cfg()), b = Object.assign({}, o.brands || {}); b[en] = Object.assign({}, b[en] || {}, { kr: kr || (b[en] && b[en].kr) || "", adj: (b[en] && b[en].adj) || 0, tier: t }); o.brands = b; saveCfg(o); };
ERP.acts.sccols = function () { v.scCols = !v.scCols; ERP.render(); };
ERP.acts.scshowall = function () { LAY.h = []; saveLay(); ERP.render(); };
ERP.acts.scwreset = function () { LAY.w = {}; saveLay(); ERP.render(); };
function exportRows(list) { return list.map(function (it) { var c = calc(it), o = {}; COLS.forEach(function (col) { var val = col.c ? c[col.c] : get(it, col.k); if (typeof val === "number" && /won/.test(col.f || (col.t === "num" ? "won" : ""))) val = Math.round(val); o[col.l] = val == null ? "" : val; }); return o; }); }
ERP.acts.scexport = function () { var L = all(); var ch = L.filter(function (it) { return calc(it).change; }); ERP.downloadBlob("스마트스토어소싱_" + U.today() + ".xlsx", ERP.xlsxBlob([{ name: "하이엔드", rows: exportRows(L.filter(function (x) { return x.tier === "하이엔드"; })) }, { name: "컨템포러리", rows: exportRows(L.filter(function (x) { return x.tier === "컨템포러리"; })) }, { name: "스토어반영용(변경분)", rows: ch.map(function (it) { var c = calc(it), x = it.extra || {}; return { "스마트스토어 상품번호": x.ssNo || "", "판매자관리코드": x.code || "", "최종 상품명": c.finalName, "스토어 판매가(할인전)": c.storeInput, "즉시할인액": c.discount, "최종판매가": c.final, "현재 스토어가": it.storePrice || "", "변동": c.change }; }) }])); };
/* 소싱폼 엑셀(하이엔드_백화점구매대행 / 컨템포러리 시트, 4행 머리글) 그대로 올리기 */
ERP.acts.scimport = function () {
  ERP.pickFile(".xlsx,.xls", async function (file) {
    try {
      var wb = XLSX.read(await file.arrayBuffer(), { type: "array" }), made = 0, upd = 0, map = {};
      all().forEach(function (it) { map[(it.sku || "").trim() + "|" + it.tier] = it; });
      var H = { "판매자관리코드": "x.code", "스마트스토어 상품번호": "x.ssNo", "상태": "status", "매입처": "vendor", "브랜드(영문)": "brand", "브랜드(한글)": "x.brandKr", "대분류": "category", "중분류": "x.sub", "모델명/품번": "sku", "상품명칭(라인·특징)": "x.line", "컬러": "x.color", "성별": "x.gender", "소재/사이즈": "x.material", "상품명 직접수정(선택)": "x.nameOverride", "매입가·기준가(원)": "buyPrice", "카드혜택%": "cardRate", "백화점정가(참고)": "x.refPrice", "매입처 상품링크": "buyLink", "개별조정": "x.adjIndiv", "유입경로": "x.channel", "판매가 직접지정(선택)": "fixedPrice", "현재 스토어가": "storePrice", "메모": "memo" };
      var out = [];
      [["하이엔드_백화점구매대행", "하이엔드"], ["컨템포러리", "컨템포러리"]].forEach(function (p) {
        var ws = wb.Sheets[p[0]]; if (!ws) return; var A = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }), hi = A.findIndex(function (r) { return r.indexOf("모델명/품번") !== -1; }); if (hi < 0) return;
        var hd = A[hi];
        A.slice(hi + 1).forEach(function (r) {
          var o = {}; hd.forEach(function (h, i) { if (H[h]) o[H[h]] = r[i]; });
          if (!String(o.brand || o.sku || o["x.line"] || "").trim()) return; if (/예시 행/.test(String(o.memo || ""))) return;
          var key = String(o.sku || "").trim() + "|" + p[1], cur = map[key];
          var it = cur ? Object.assign({}, cur, { extra: Object.assign({}, cur.extra || {}) }) : { id: U.uid(), tier: p[1], status: "판매중", extra: {}, name: "", sku: "", buyLink: "", vendor: "", brand: "", category: "", memo: "" };
          Object.keys(o).forEach(function (k) { var col = COLS.find(function (c) { return c.k === k; }), val = o[k]; if (val === "" || val == null) return; if (col && (col.t === "num")) val = num(val); else if (col && col.t === "pct") val = num(val); else val = String(val).trim(); if (k === "buyLink" && !/^https?:/.test(val)) return; setv(it, k, val); });
          it.name = calc(it).finalName || it.name; out.push(it); if (cur) upd++; else made++;
        });
      });
      if (!out.length) { ERP.toast("소싱폼 시트(하이엔드_백화점구매대행 / 컨템포러리)를 찾지 못했어요."); return; }
      await ERP.saveBatch("price_items", out.map(function (it) { return ERP.toRow("price_items", it); }));
      out.forEach(function (it) { ERP.DATA.price_items.set(it.id, it); }); ERP.render(); ERP.toast("새 상품 " + made + "개 · 수정 " + upd + "개를 반영했어요.");
    } catch (e) { ERP.toast("엑셀을 읽지 못했어요: " + (e.message || e)); }
  });
};

/* 매입처명: 링크 주소로 사이트 이름, 네이버 스토어는 스토어 이름 */
var SITES = [[/smartstore\.naver|brand\.naver|shopping\.naver/, ""], [/lotteon\.com/, "롯데온"], [/lotteimall\.com/, "롯데홈쇼핑"], [/hmall\.com/, "현대홈쇼핑"], [/thehyundai\.com/, "더현대닷컴"], [/lfmall\.co\.kr/, "LF몰"], [/ssg\.com/, "SSG"], [/shinsegaemall/, "신세계몰"], [/ssfshop\.com/, "SSF샵"], [/29cm\.co\.kr/, "29CM"], [/musinsa\.com/, "무신사"], [/wconcept\.co\.kr/, "W컨셉"], [/gsshop\.com/, "GS샵"], [/cjonstyle|cjmall/, "CJ온스타일"], [/11st\.co\.kr/, "11번가"], [/gmarket\.co\.kr/, "G마켓"], [/auction\.co\.kr/, "옥션"], [/coupang\.com/, "쿠팡"], [/kream\.co\.kr/, "크림"], [/mustit\.co\.kr/, "머스트잇"], [/trenbe\.com/, "트렌비"], [/balaan\.co\.kr/, "발란"], [/rexmonde|okmall/, "렉스몬드"], [/galleria/, "갤러리아"], [/akmall\.com/, "AK몰"], [/hfashionmall\.com/, "H패션몰"], [/sivillage\.com/, "S.I.VILLAGE"], [/lotteshopping|ellotte/, "롯데백화점몰"], [/4910\.kr/, "4910"], [/kakao\.com/, "카카오쇼핑"]];
function vendorOf(url, d) {
  var h = ""; try { h = new URL(url).host.toLowerCase(); } catch (e) { return ""; }
  for (var i = 0; i < SITES.length; i++) if (SITES[i][0].test(h)) return SITES[i][1] || (d && d.channelName ? String(d.channelName).slice(0, 30) : "네이버스토어");
  if (d && d.channelName) return String(d.channelName).slice(0, 30);
  var p = h.replace(/^www\.|^m\./, "").split("."); return p[0] || "";
}
/* ---------- 자동입력·가격/재고 확인 (크롬 확장 '로우나 소싱 도우미'가 페이지를 5~7초에 1개씩 열어 읽음) ---------- */
var AUTO = (function () {
  var wait = {}, later = [], warned = false, KEY = "rowna-sc-lastcheck", EVERY = 3 * 3600e3;
  function on() { return document.documentElement.dataset.rownaHelper === "1"; }
  function badge() { var n = Object.keys(wait).length; return on() ? (n ? '<span class="pill warn">자동입력·확인 중 ' + n + "건</span>" : '<span class="pill ok" title="크롬 확장이 켜져 있어요">자동입력 켜짐</span>') : '<span class="pill bad" title="크롬 확장 로우나 소싱 도우미를 설치하면 링크만 넣어도 자동으로 채워져요">자동입력 꺼짐(도우미 미설치)</span>'; }
  function send(id, url, mode) {
    if (!on()) { if (!warned) { warned = true; ERP.toast("자동입력 도우미(크롬 확장)가 없어서 채우지 못했어요. 설치 후 ‘링크로 빈칸 채우기’를 누르세요."); } return false; }
    if (wait[id]) return true; wait[id] = mode; window.postMessage({ rowna: "fetch", id: id, url: url }, location.origin); return true;
  }
  function store(id, url, manual) { if (send("s:" + id, url, "store")) { if (manual) ERP.toast("내 스토어 가격을 읽는 중… 5~10초 뒤 표시돼요."); scheduleR(); } }
  function fill(id, url) { if (CAFE.is(url)) { CAFE.fill(id, url); return; } if (send(id, url, "fill")) { ERP.toast("링크를 읽는 중… 5~10초 뒤 채워져요."); scheduleR(); } }
  var rt; function scheduleR() { clearTimeout(rt); rt = setTimeout(function () { if (!document.querySelector("table.sheet")) return; var a = document.activeElement; if (a && a.classList && a.classList.contains("ce")) { scheduleR(); return; } ERP.render(); }, 400); }
  var COLORS = [["오프화이트","오프화이트"],["블랙","블랙"],["BLACK","블랙"],["NOIR","블랙"],["화이트","화이트"],["WHITE","화이트"],["아이보리","아이보리"],["IVORY","아이보리"],["크림","크림"],["베이지","베이지"],["BEIGE","베이지"],["브라운","브라운"],["BROWN","브라운"],["카멜","카멜"],["CAMEL","카멜"],["TAN","탄"],["네이비","네이비"],["NAVY","네이비"],["블루","블루"],["BLUE","블루"],["그레이","그레이"],["GREY","그레이"],["GRAY","그레이"],["차콜","차콜"],["그린","그린"],["GREEN","그린"],["카키","카키"],["KHAKI","카키"],["레드","레드"],["RED","레드"],["버건디","버건디"],["핑크","핑크"],["PINK","핑크"],["퍼플","퍼플"],["옐로우","옐로우"],["오렌지","오렌지"],["실버","실버"],["SILVER","실버"],["골드","골드"],["GOLD","골드"],["멀티","멀티"]];
  var CATS = [["카드지갑","지갑/카드지갑"],["카드케이스","지갑/카드지갑"],["카드홀더","지갑/카드지갑"],["동전지갑","지갑/동전지갑"],["코인","지갑/동전지갑"],["장지갑","지갑/장지갑"],["반지갑","지갑/반지갑"],["지갑","지갑/반지갑"],["토트","가방/토트백"],["숄더","가방/숄더백"],["호보","가방/숄더백"],["버킷","가방/숄더백"],["크로스","가방/크로스백"],["메신저","가방/크로스백"],["클러치","가방/클러치"],["파우치","가방/클러치"],["백팩","가방/백팩"],["미니백","가방/미니백"],["스니커즈","신발/스니커즈"],["운동화","신발/스니커즈"],["로퍼","신발/로퍼"],["샌들","신발/샌들"],["슬리퍼","신발/샌들"],["뮬","신발/샌들"],["부츠","신발/부츠"],["플랫","신발/플랫"],["발레리나","신발/플랫"],["맨투맨","의류/맨투맨/후드"],["후드","의류/맨투맨/후드"],["티셔츠","의류/티셔츠"],["반팔","의류/티셔츠"],["니트","의류/니트"],["가디건","의류/니트"],["스웨터","의류/니트"],["셔츠","의류/셔츠"],["자켓","의류/아우터"],["재킷","의류/아우터"],["코트","의류/아우터"],["패딩","의류/아우터"],["점퍼","의류/아우터"],["벨트","액세서리/벨트"],["스카프","액세서리/스카프"],["머플러","액세서리/스카프"],["모자","액세서리/모자"],["볼캡","액세서리/모자"],["비니","액세서리/모자"],["키링","액세서리/키링/참"],["키홀더","액세서리/키링/참"],["선글라스","액세서리/선글라스"],["목걸이","주얼리/시계/목걸이"],["팔찌","주얼리/시계/팔찌"],["귀걸이","주얼리/시계/귀걸이"],["이어링","주얼리/시계/귀걸이"],["반지","주얼리/시계/반지"],["시계","주얼리/시계/시계"]];
  var MATS = ["램스킨","카프스킨","소가죽","가죽","레더","캔버스","나일론","스웨이드","데님","캐시미어","코튼","트위드","라피아","PVC","에나멜","페이턴트"];
  function parse(d) {
    var c = cfg(), B = c.brands || {}, t = String(d.name || ""), T = t.toUpperCase(), o = {};
    var bn = String(d.brandName || "").trim(), BN = bn.toUpperCase(), brand = "";
    Object.keys(B).forEach(function (en) { var kr = B[en].kr || ""; if (!brand && (BN === en || (kr && bn === kr))) brand = en; });
    if (!brand) Object.keys(B).sort(function (a, b) { return b.length - a.length; }).forEach(function (en) { var kr = B[en].kr || ""; if (!brand && (T.indexOf(en) !== -1 || (kr && t.indexOf(kr) !== -1))) brand = en; });
    if (!brand && bn && !/[가-힣]/.test(bn) && !/^(NONE|ETC)$/i.test(bn)) brand = BN;
    if (brand) { o.brand = brand; if (B[brand] && B[brand].kr) o["x.brandKr"] = B[brand].kr; }
    var sku = String(d.modelName || "").trim();
    if (!/\d/.test(sku) || sku.length < 4) { var m = (t.match(/[A-Z0-9][A-Z0-9\-\.\/]{4,}[A-Z0-9]/gi) || []).filter(function (x) { return /\d/.test(x) && /[A-Z]/i.test(x) || /^\d{6,}$/.test(x); }).sort(function (a, b) { return b.length - a.length; }); sku = m[0] || ""; }
    if (sku) o.sku = sku.toUpperCase();
    for (var i = 0; i < COLORS.length; i++) { var w = COLORS[i][0]; if (/[A-Z]/.test(w) ? new RegExp("\\b" + w + "\\b").test(T) : t.indexOf(w) !== -1) { o["x.color"] = COLORS[i][1]; break; } }
    if (/여성|우먼|WOMEN|레이디/i.test(t)) o["x.gender"] = "여성"; else if (/남성|맨즈|\bMEN'?S?\b/i.test(t)) o["x.gender"] = "남성"; else if (/공용|유니섹스|UNISEX/i.test(t)) o["x.gender"] = "공용";
    var cs = t + " " + (d.category || ""); for (var j = 0; j < CATS.length; j++) if (cs.indexOf(CATS[j][0]) !== -1) { var cc = CATS[j][1].split("/"); o.category = cc[0]; o["x.sub"] = cc.slice(1).join("/"); break; }
    var mats = MATS.filter(function (mm) { return t.indexOf(mm) !== -1; }); if (mats.length) o["x.material"] = mats.slice(0, 2).join(" ");
    var line = t.replace(/\[[^\]]*\]|\([^)]*\)/g, " ");
    [brand, o["x.brandKr"], sku].concat(COLORS.map(function (x) { return x[0]; })).forEach(function (w2) { if (w2) line = line.split(w2).join(" ").split(String(w2).toLowerCase()).join(" "); });
    line = line.replace(/여성|남성|공용|우먼|정품|국내배송|당일발송|무료배송|새상품|백화점|명품/g, " ").replace(/\s+/g, " ").trim(); if (line) o["x.line"] = line.slice(0, 40);
    if (t) o["x.nameOverride"] = t.replace(/\s*:\s*[^:]{1,30}$/, "").replace(/(^|[\s\[(])(?:\d{2}|20\d{2})\s*(?:S\/?S|F\/?W|AW|SS|FW|PF|RESORT|CRUISE)(?=[\s\])]|$)|(^|[\s\[(])(?:SS|FW|AW)\s*\d{2}(?=[\s\])]|$)/gi, " ").replace(/\[[^\]]*\]/g, " ").replace(/[\[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
    var vn = vendorOf(d.url || "", d); if (vn) o.vendor = vn;
    if (d.price && !d.soldOut) o.buyPrice = d.price;
    return o;
  }
  window.addEventListener("message", function (e) {
    if (e.source !== window || !e.data || e.data.rowna !== "result") return;
    var id = e.data.id, mode = wait[id]; delete wait[id];
    if (mode === "scan") { CAND.onResult(id, e.data); scheduleR(); return; }
    if (mode === "store") { id = id.slice(2); var s0 = ERP.DATA.price_items.get(id); if (!s0) return; var si = Object.assign({}, pending[id] || s0), sx = Object.assign({}, si.extra || {}), sd = e.data.data;
      sx.storeCheckedAt = new Date().toISOString(); if (sd && sd.price) sx.storeLivePrice = sd.price; sx.storePriceSrc = sd && sd.priceSrc || ""; sx.storeDebug = sd && sd.debug || null; sx.storeStatus = sd ? (sd.soldOut ? "품절" : "정상") : (e.data.error || "열기실패"); si.extra = sx; ERP.DATA.price_items.set(id, si); queueSave(si);
      var cc = calc(si), gap = cc.mGap, lim = num(cfg().store_alert_gap) || 0.03;
      if (sd && sd.price && gap != null && Math.abs(gap) >= lim - 1e-9) alertUser((cc.finalName || si.sku || "상품").slice(0, 20) + ": 실제 마진 " + (Math.round(cc.mActual * 1000) / 10) + "% (기준 " + (Math.round(cc.margin * 1000) / 10) + "%, " + (gap > 0 ? "+" : "") + (Math.round(gap * 1000) / 10) + "%p) — 내 스토어가 " + sd.price.toLocaleString() + "원, 매입가 " + Number(si.buyPrice || 0).toLocaleString() + "원", id);
      scheduleR(); return; }
    var it0 = ERP.DATA.price_items.get(id); if (!it0) return;
    var it = Object.assign({}, pending[id] || it0), x = Object.assign({}, it.extra || {}), now = new Date().toISOString(), d = e.data.data;
    if (!d) { x.linkStatus = e.data.error || "열기실패"; x.linkCheckedAt = now; it.extra = x; ERP.DATA.price_items.set(id, it); queueSave(it); if (mode === "fill") ERP.toast("자동입력 실패: " + x.linkStatus); scheduleR(); return; }
    var oldLP = x.linkPrice, oldSt = x.linkStatus;
    x.linkStatus = d.soldOut ? "품절" : "정상"; x.linkCheckedAt = now; x.linkPriceSrc = d.priceSrc || ""; if (d.cardPromo != null) x.cardPromoText = d.cardPromo; x.linkDebug = d.debug || null; if (d.basePrice) x.linkBasePrice = d.basePrice; if (d.price && !d.soldOut) x.linkPrice = d.price;
    if (d.price && oldLP && d.price !== oldLP) x.priceHistory = (x.priceHistory || []).concat([{ at: now, from: oldLP, to: d.price }]).slice(-20);
    it.extra = x;
    var oldBuy = it.buyPrice;
    if (d.price && !d.soldOut && oldBuy != null && oldBuy !== "" && num(oldBuy) !== d.price) { it.buyPrice = d.price; it.extra.lastBuyChange = d.price - num(oldBuy); it.extra.lastBuyChangeAt = now; it.extra.prevBuyPrice = num(oldBuy); }
    var filled = 0;
    if (mode === "fill") {
      var o = parse(d); Object.keys(o).forEach(function (k) { var cur = get(it, k); if (cur == null || cur === "" || (k === "tier" && !it0.brand)) { setv(it, k, o[k]); filled++; } });
      it.extra.autoFilledAt = now;
      var miss = ["brand", "sku", "buyPrice"].filter(function (k) { var v0 = get(it, k); return v0 == null || v0 === ""; });
      if (miss.length && !/AI확인필요/.test(it.memo || "")) it.memo = (it.memo ? it.memo + " · " : "") + "AI확인필요: " + miss.map(function (k) { return { brand: "브랜드", sku: "품번", buyPrice: "매입가" }[k]; }).join(",");
    }
    ERP.DATA.price_items.set(id, it); queueSave(it);
    var nm = (calc(it).finalName || it.sku || "상품").slice(0, 20);
    if (mode === "fill") { ERP.toast("‘" + nm + "’ " + filled + "칸 자동입력"); if (d.soldOut) alertUser(nm + ": 매입처 품절", id); }
    else { var msg = []; if (d.soldOut && oldSt !== "품절") msg.push("매입처 품절"); if (!d.soldOut && oldSt === "품절") msg.push("재입고"); if (d.price && oldBuy && d.price !== num(oldBuy)) msg.push("매입가 " + Number(oldBuy).toLocaleString() + " → " + d.price.toLocaleString() + " (자동 반영)"); if (msg.length) alertUser(nm + ": " + msg.join(", "), id); }
    scheduleR();
  });
  function alertUser(m, id) { ERP.toast("⚠ " + m); try { if (window.Notification && Notification.permission === "granted") new Notification("로우나 소싱 변동", { body: m }); } catch (e) {}
    /* 휴대폰 알림용: 줄에 기록 → 1시간마다 예약 작업이 모아서 휴대폰으로 보냄 */
    if (id) { var c0 = pending[id] || ERP.DATA.price_items.get(id); if (c0) { var c1 = Object.assign({}, c0), x1 = Object.assign({}, c1.extra || {}); x1.alerts = (x1.alerts || []).concat([{ at: new Date().toISOString(), msg: m, sent: false }]).slice(-20); c1.extra = x1; ERP.DATA.price_items.set(id, c1); queueSave(c1); } } }
  function checkAll(manual) {
    if (!on()) { if (manual) ERP.toast("자동입력 도우미(크롬 확장)를 먼저 설치해 주세요."); return; }
    var L = all().filter(function (it) { return it.buyLink && /^https?:/i.test(it.buyLink) && it.status !== "판매종료" && !CAFE.is(it.buyLink); }), nS = all().filter(function (it) { return (it.extra || {}).storeLink; }).length;
    try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
    L.forEach(function (it) { send(it.id, it.buyLink, "check"); });
    CAFE.checkAll();
    all().forEach(function (it) { var sl = (it.extra || {}).storeLink; if (sl && /^https?:/i.test(sl) && it.status !== "판매종료") send("s:" + it.id, sl, "store"); });
    if (manual) ERP.toast((L.length + nS) + "개 링크(매입처 " + L.length + " · 내 스토어 " + nS + ")를 6초에 1개씩 확인해요. 약 " + Math.ceil(L.length * 6 / 60) + "분 걸려요.");
    try { if (window.Notification && Notification.permission === "default") Notification.requestPermission(); } catch (e) {}
    scheduleR();
  }
  setInterval(function () { var t0 = 0; try { t0 = +localStorage.getItem(KEY) || 0; } catch (e) {} if (on() && S.user && Date.now() - t0 > EVERY) checkAll(false); }, 10 * 60e3);
  return { store: store, fill: fill, later: later, badge: badge, checkAll: checkAll, send: send, parse: parse };
})();


/* ---------- 메투 카페(판매자 여주메니아) 글 → 소싱 줄 ----------
   크롬 확장 '로우나 크림 도우미' 1.1+가 대표님 크롬(네이버 로그인)에서 글을 뒤에서 열어 읽고 ChatGPT로 상품 정보를 뽑아요.
   SKU = MT + 글번호 (색상이 여러 개면 -1, -2) · 매입처 = 메투(여주메니아) · 글 삭제/판매완료 표시면 품절로 바꿔요. */
var CAFE = (function () {
  var SELLER = "여주메니아", VENDOR = "메투(여주메니아)";
  function is(u) { return /cafe\.naver\.com/i.test(String(u || "")); }
  var PROMPT = [
    "다음은 네이버 카페 판매글입니다. 판매 상품 정보를 json(JSON)으로 뽑으세요. 글에 없는 값은 빈칸으로 두고 추측하지 마세요.",
    "- 같은 모델이 색상만 다르게 여러 개면 items를 색상별로 나누세요.",
    "- price: 지금 판매 가격(원, 숫자). '900만대 >>> 890만원'처럼 조정됐으면 마지막(조정 후) 가격. '890만원'=8900000.",
    "- 정확한 가격 없이 범위로만 쓴 경우(예: '2000후반대', '900만대', '1000초반', '1500중반')는 그 범위의 가장 높은 값으로: 후반/대 → 끝자리를 9로 채움(2000후반대=2999만원=29990000, 900만대=999만원), 중반 → 1500중반=1699만원, 초반 → 1000초반=1399만원. 이때 priceEstimated를 true로, priceText에 원문 표현을 넣으세요.",
    "- brandEn: 영문 대문자 브랜드(예: HERMES, CHANEL). brandKr: 한글 브랜드(예: 에르메스).",
    "- model: 모델/라인 이름(예: 가든파티 미니 네오 23). category: 가방/지갑/신발/의류/잡화/주얼리/시계 중 하나.",
    "- material: 소재(예: 토고, 캔버스). size: 사이즈 표기가 있으면. 구성품·구매시기·각인·상태·배송은 memo에 짧게.",
    "- 맨 위 카페 공지(✔ ❌ ■ 로 시작하는 안내, 결제·보증 안내)는 무시하세요.",
    "출력: {\"items\":[{\"brandEn\":\"\",\"brandKr\":\"\",\"model\":\"\",\"category\":\"\",\"color\":\"\",\"material\":\"\",\"size\":\"\",\"price\":0,\"priceEstimated\":false,\"priceText\":\"\",\"memo\":\"\"}]}"
  ].join("\n");
  async function read(url, parse) {
    var p = await ERP.helperAsk("page", { url: url, waitFor: "원|삭제|존재하지", minLen: 300, tries: 15 }), t = p.text || "", sel = p.sel || {};
    var title = sel[".title_text"] || String(p.title || "").replace(/\s*:\s*네이버\s*카페.*$/, "").trim(), body = sel[".se-main-container"] || sel[".article_viewer"] || t;
    var d = { url: url.split("&referrer")[0], articleId: (url.match(/articles\/(\d+)/) || url.match(/articleid=(\d+)/i) || [])[1] || "", title: title, author: sel[".nickname"] || sel[".nick_box"] || ((t.match(/여주메니아/) || [""])[0]), date: sel[".date"] || "",
      deleted: /삭제되었거나|존재하지 않는 게시글|게시글이 삭제/.test(t), soldMark: /판매\s*완료|예약\s*중|거래\s*완료|SOLD/i.test(title), needLogin: /로그인/.test(t) && t.length < 3000 && !body, images: p.images || [], items: [] };
    if (!parse || d.deleted || d.needLogin || !body) return d;
    try { var r = await ERP.helperAsk("ai", { body: { response_format: { type: "json_object" }, messages: [{ role: "user", content: PROMPT + "\n\n[제목]\n" + title + "\n\n[본문]\n" + String(body).slice(0, 8000) }] } }); d.items = JSON.parse(r.content || "{}").items || []; }
    catch (e) { d.parseError = e.message; }
    return d;
  }

  function ok() { return ERP.helperOn && ERP.helperOn(); }
  function clean(t) { return String(t || "").replace(/\[[^\]]*\]/g, " ").replace(/바로\s*배송되?[^\s]*|배송되셔요!?|국내배송|정품|급처|네고/g, " ").replace(/[!~]+/g, " ").replace(/\s+/g, " ").trim(); }
  function apply(it, d, x0, n) {
    var o = Object.assign({}, it, { extra: Object.assign({}, it.extra || {}) }), x = o.extra, c = cfg();
    if (!o.vendor) o.vendor = VENDOR; if (!o.tier || o.tier === "컨템포러리") o.tier = "하이엔드";
    if (!o.sku && d.articleId) o.sku = "MT" + d.articleId + (n > 1 ? "-" + (x0.idx + 1) : "");
    var en = String(x0.brandEn || "").toUpperCase().trim();
    if (!o.brand && en) { o.brand = en; if (c.brands[en] && c.brands[en].kr) x.brandKr = c.brands[en].kr; else if (x0.brandKr) x.brandKr = x0.brandKr; }
    if (!x.color && x0.color) x.color = x0.color; if (!x.material && x0.material) x.material = x0.material;
    if (!x.line && x0.model) x.line = String(x0.model).slice(0, 40);
    if (!x.nameOverride) x.nameOverride = [x.brandKr || x0.brandKr || "", x0.model || clean(d.title), x0.color || "", x0.size || ""].join(" ").replace(/\s+/g, " ").trim().slice(0, 100);
    if (x0.price) { if (o.buyPrice == null || o.buyPrice === "") o.buyPrice = x0.price; x.linkPrice = x0.price; }
    if (x0.category && !o.category) o.category = x0.category;
    if (x0.priceEstimated) x.priceEstimated = true;
    var memo = [x0.priceEstimated ? "가격 미기재(" + (x0.priceText || "범위") + " → 최고가 " + Math.round((x0.price || 0) / 10000) + "만원으로 잡음, 판매자 확인 필요)" : "", x0.memo, "카페글 " + (d.date || "")].filter(Boolean).join(" · ");
    if (memo && (o.memo || "").indexOf(memo) < 0) o.memo = (o.memo ? o.memo + " · " : "") + memo;
    x.linkStatus = d.deleted || d.soldMark ? "품절" : "정상"; x.linkCheckedAt = new Date().toISOString(); x.cafeTitle = d.title; x.cafeAuthor = d.author;
    return o;
  }
  async function fill(id, url) {
    if (!ok()) { ERP.toast("메투 카페 글은 크롬 확장 ‘로우나 도우미’(2.0)가 있어야 읽어요. 설치 후 새로고침(F5)해 주세요."); return; }
    ERP.toast("카페 글을 읽는 중… 20~40초 걸려요.");
    var d; try { d = await read(url, true); } catch (e) { ERP.toast("⚠ 카페 글 읽기 실패: " + e.message); return; }
    if (d.needLogin) { ERP.toast("⚠ 크롬에서 네이버에 로그인한 뒤 다시 해 주세요."); return; }
    if (d.deleted) { ERP.toast("⚠ 삭제된 글이에요."); }
    var who = (d.author || "") + " " + (d.title || "");
    if (who.indexOf(SELLER) < 0) ERP.toast("⚠ 작성자가 ‘" + SELLER + "’가 아닐 수 있어요 (" + (d.author || "확인불가") + "). 내용을 확인해 주세요.");
    var items = (d.items || []).map(function (x, i) { return Object.assign({ idx: i }, x); });
    if (!items.length) items = [{ idx: 0 }];
    var base = pending[id] || ERP.DATA.price_items.get(id); if (!base) return;
    var rows = [apply(base, d, items[0], items.length)];
    if (items.length > 1) { var more = await addRows(items.length - 1, "하이엔드"); more.forEach(function (m, k) { m.buyLink = d.url; rows.push(apply(m, d, items[k + 1], items.length)); }); }
    rows.forEach(function (r) { ERP.DATA.price_items.set(r.id, r); queueSave(r); });
    ERP.render(); ERP.toast("카페 글로 " + rows.length + "줄을 채웠어요" + (d.parseError ? " (" + d.parseError + ")" : "") + ". 가격·색상이 맞는지 확인해 주세요.");
  }
  var running = false;
  async function checkAll() {
    if (!ok() || running) return; running = true;
    var L = all().filter(function (it) { return is(it.buyLink) && it.status !== "판매종료"; }), seen = {};
    for (var i = 0; i < L.length; i++) {
      var u = L[i].buyLink; if (seen[u]) continue; seen[u] = 1;
      try {
        var d = await read(u, false), sold = d.deleted || d.soldMark;
        all().filter(function (it) { return it.buyLink === u; }).forEach(function (it0) { var it = Object.assign({}, pending[it0.id] || it0), x = Object.assign({}, it.extra || {}), was = x.linkStatus; x.linkStatus = sold ? "품절" : "정상"; x.linkCheckedAt = new Date().toISOString(); it.extra = x; ERP.DATA.price_items.set(it.id, it); queueSave(it); if (sold && was !== "품절") ERP.toast("⚠ 메투 글 " + (d.deleted ? "삭제됨" : "판매완료 표시") + ": " + (x.nameOverride || it.sku || "")); });
      } catch (e) { if (/멈춤|멈췄/.test(e.message)) break; }
    }
    running = false; ERP.render();
  }
  return { is: is, fill: fill, checkAll: checkAll };
})();
ERP.acts.sccafe = async function () {
  var t = prompt("메투 카페 글 주소를 붙여 넣으세요 (여러 개면 줄바꿈이나 띄어쓰기로 구분)"); if (!t) return;
  var urls = (t.match(/https?:\/\/[^\s]+/g) || []).filter(CAFE.is); if (!urls.length) { ERP.toast("카페 글 주소를 찾지 못했어요."); return; }
  var have = {}; all().forEach(function (it) { if (it.buyLink) have[it.buyLink.split("&referrer")[0]] = 1; });
  urls = urls.filter(function (u) { return !have[u.split("&referrer")[0]]; }); if (!urls.length) { ERP.toast("이미 넣은 글이에요."); return; }
  var made = await addRows(urls.length, "하이엔드"); if (!made.length) return;
  v.scTab = "하이엔드"; ERP.render();
  for (var i = 0; i < made.length; i++) { var it = Object.assign({}, made[i], { buyLink: urls[i].split("&referrer")[0], vendor: "메투(여주메니아)" }); ERP.DATA.price_items.set(it.id, it); queueSave(it); await CAFE.fill(it.id, it.buyLink); }
};


/* ---------- 스마트스토어 상품속성 자동입력 (1단계: 화면 구조 진단) ----------
   로우나 도우미 2.1의 act로 상품 수정 화면을 열어 '상품속성' 부분 구조를 파일로 받아요. 이 파일로 자동입력 규칙을 맞춰요. */
ERP.acts.scattrdiag = async function () {
  if (!(ERP.helperOn && ERP.helperOn())) { ERP.toast("크롬 확장 ‘로우나 도우미’가 꺼져 있어요."); return; }
  var no = (prompt("시험할 스마트스토어 상품번호(원상품번호)를 넣어 주세요") || "").replace(/\D/g, ""); if (!no) return;
  ERP.toast("상품 수정 화면을 여는 중… 30~60초 걸려요. 화면이 잠깐 열렸다 닫혀요.");
  try {
    var r = await ERP.helperAsk("act", { url: "https://sell.smartstore.naver.com/#/products/edit/" + no, visible: true, ops: [
      { op: "waitText", text: "상품속성", ms: 30000, gap: 0 }, { op: "wait", ms: 2000 },
      { op: "html", near: "상품속성", max: 120000 }, { op: "html", near: "카테고리", max: 30000 }, { op: "text" } ] });
    var blob = new Blob([JSON.stringify(r, null, 1)], { type: "application/json" });
    ERP.downloadBlob("스마트스토어_속성진단_" + no + ".json", blob);
    var ok = r.results && r.results[0] && r.results[0].ok;
    ERP.toast(ok ? "진단 파일을 받았어요. Claude에게 보내 주세요." : "‘상품속성’ 화면을 못 찾았어요. 진단 파일을 Claude에게 보내 주세요.");
  } catch (e) { ERP.toast("⚠ " + e.message); }
};

/* ---------- 소싱 후보: 등록한 네이버 스토어의 인기순 목록에서 사방넷·ERP와 겹치지 않는 상품 찾기 ---------- */
var CAND = (function () {
  var SEED_STORES = ["까르피", "더소뇨", "디몬트", "밀라노브릿지", "루네드", "럭스보이", "아르떼모아", "메종파르코", "토리즈명품관", "파노", "tutto bene", "바이스트", "타임메카", "프리미엄스니커즈", "라벨루쏘", "루티크"];
  var SEED_URL = { "더소뇨": "https://smartstore.naver.com/sogno0114", "루티크": "https://smartstore.naver.com/loutique" };
  function stores() { var s = S.SET.sourcing_stores; if (Array.isArray(s) && s.length) return s; return SEED_STORES.map(function (n) { return { name: n, url: SEED_URL[n] || "" }; }); }
  function data() { return S.SET.sourcing_candidates || { items: {} }; }
  function norm(x) { return String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
  var skuSet = null, skuList = null, skuAt = null;
  function sabang() { var s = S.SET.sabang_skus; if (!s || !s.skus) return { set: {}, list: [], n: 0 }; if (skuAt !== s.at) { skuAt = s.at; skuSet = {}; skuList = []; s.skus.forEach(function (k) { var n = norm(k); if (n.length >= 5 && !skuSet[n]) { skuSet[n] = 1; skuList.push(n); } }); } return { set: skuSet, list: skuList, n: skuList.length, at: s.at }; }
  function erpSet() { var o = {}; all().forEach(function (it) { var n = norm(it.sku); if (n.length >= 5) o[n] = 1; var l = String(it.buyLink || "").match(/products\/(\d+)/); if (l) o["P" + l[1]] = 1; }); return o; }
  function dupOf(c, sb, er) {
    var n = norm(c.sku), nm = norm(c.name);
    if (er["P" + c.pid] || (n && er[n])) return "ERP에 있음";
    if (n && sb.set[n]) return "사방넷 등록됨";
    for (var i = 0; i < sb.list.length; i++) if (sb.list[i].length >= 6 && nm.indexOf(sb.list[i]) !== -1) return "사방넷 등록됨";
    return "";
  }
  function storeBase(u) { var m = String(u || "").match(/^(https?:\/\/(?:smartstore|brand)\.naver\.com\/[^\/?#]+)/i); return m ? m[1] : ""; }
  function scanUrl(u) { var b = storeBase(u); return b ? b + "/category/ALL?st=POPULAR&dt=LIST&page=1&size=80" : ""; }
  var running = 0;
  function scan() {
    var L = stores().map(function (s, i) { return [i, scanUrl(s.url)]; }).filter(function (x) { return x[1]; });
    if (!L.length) { ERP.toast("스토어 주소를 먼저 넣어 주세요(아래 ‘소싱 스토어’ 표)."); return; }
    var n = 0; L.forEach(function (x) { if (AUTO.send("scan:" + x[0], x[1], "scan")) n++; });
    if (n) { running += n; ERP.toast(n + "개 스토어 인기순 목록을 6초에 1곳씩 읽어요. 약 " + Math.ceil(n * 7 / 60) + "분 걸려요."); ERP.render(); }
  }
  function onResult(key, msg) {
    running = Math.max(0, running - 1);
    var st = stores()[+key.split(":")[1]]; if (!st) return;
    var d = msg.data, list = d && d.list || [];
    var D = JSON.parse(JSON.stringify(data())); D.items = D.items || {}; D.scans = D.scans || {};
    D.scans[st.name] = { at: new Date().toISOString(), n: list.length, err: msg.error || (d && d.blocked ? "차단" : (list.length ? "" : "목록을 못 읽음")) };
    var base = storeBase(st.url), now = new Date().toISOString(), added = 0;
    list.forEach(function (p, i) {
      if (!p.id) return; var url = base + "/products/" + p.id, key2 = "P" + p.id, old = D.items[key2];
      var o = AUTO.parse({ name: p.name, brandName: p.brand || "", modelName: p.model || "", price: p.price, url: url, channelName: st.name });
      D.items[key2] = { pid: String(p.id), url: url, store: st.name, name: (o["x.nameOverride"] || p.name || "").slice(0, 120), brand: o.brand || "", sku: o.sku || "", price: p.price || null, reviews: p.reviews || 0, rank: i + 1, img: p.img || "", firstAt: old ? old.firstAt : now, at: now, hidden: old ? !!old.hidden : false };
      if (!old) added++;
    });
    D.at = now; S.SET.sourcing_candidates = D;
    if (!running) { ERP.saveSetting("sourcing_candidates", D); ERP.toast("소싱 후보를 갱신했어요" + (added ? " (새 상품 " + added + "개)" : "") + "."); }
    ERP.render();
  }
  function score(c) { var B = cfg().brands || {}; return Math.round((Math.log10(1 + num(c.reviews)) * 30 + Math.max(0, 40 - num(c.rank) / 2) + (B[c.brand] ? 15 : 0)) * 10) / 10; }
  function rowsC() {
    var sb = sabang(), er = erpSet(), D = data(), out = [];
    Object.keys(D.items || {}).forEach(function (k) { var c = Object.assign({}, D.items[k]); c.dup = dupOf(c, sb, er); c.score = score(c); out.push(c); });
    if (!v.candDup) out = out.filter(function (c) { return !c.dup; });
    if (v.candBrand) { var B = cfg().brands || {}; out = out.filter(function (c) { return B[c.brand]; }); }
    out = out.filter(function (c) { return !c.hidden; });
    if (v.candStore) out = out.filter(function (c) { return c.store === v.candStore; });
    return out.sort(function (a, b) { return b.score - a.score; });
  }
  function html() {
    var w = ERP.canWrite("price_items"), sb = sabang(), D = data(), R = rowsC(), ST = stores(), c0 = cfg();
    var h = '<div class="panel"><h2>소싱 후보<span class="sub">등록한 네이버 스토어의 인기순 목록에서 사방넷·ERP에 없는 상품만 보여요 · 점수 = 리뷰 수 + 인기 순위 + 등록 브랜드</span></h2>' +
      '<div class="tools">' + AUTO.badge() + (w ? '<button class="btn pri" data-act="candscan">후보 찾기 (스토어 ' + ST.filter(function (s) { return scanUrl(s.url); }).length + '곳)</button>' : "") +
      (w ? '<button class="btn" data-act="candsabang">사방넷 상품파일 올리기</button>' : "") +
      '<span class="muted">사방넷 품번 ' + sb.n.toLocaleString() + "개" + (sb.at ? " (" + String(sb.at).slice(0, 10) + ")" : " — 파일을 올려 주세요") + " · 마지막 검색 " + (D.at ? String(D.at).replace("T", " ").slice(0, 16) : "없음") + (running ? " · 읽는 중 " + running + "곳" : "") + "</span></div>" +
      '<div class="tools" style="margin-top:6px"><label class="ck"><input type="checkbox" data-cand="candDup"' + (v.candDup ? " checked" : "") + '> 중복 상품도 보기</label><label class="ck"><input type="checkbox" data-cand="candBrand"' + (v.candBrand ? " checked" : "") + '> 등록 브랜드만</label><select class="ctl sm" data-candstore><option value="">전체 스토어</option>' + ST.map(function (s) { return "<option" + (v.candStore === s.name ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("") + "</select><b>" + R.length + "개</b></div>";
    h += '<div class="table-wrap" style="max-height:calc(100vh - 380px);overflow:auto"><table class="cand-tbl"><thead><tr><th class="r">점수</th><th>스토어</th><th>브랜드</th><th>상품명</th><th>SKU</th><th class="r">매입가</th><th class="r">예상 판매가</th><th class="r">리뷰</th><th class="r">순위</th><th>확인</th><th></th></tr></thead><tbody>' +
      R.slice(0, 300).map(function (c) { var est = c.price ? calc({ id: "x", buyPrice: c.price, brand: c.brand, tier: "컨템포러리", extra: {} }).final : null;
        return "<tr><td class=\"r\"><b>" + c.score + "</b></td><td>" + esc(c.store) + "</td><td>" + esc(c.brand) + '</td><td><a href="' + esc(c.url) + '" target="_blank" rel="noopener">' + esc(c.name) + "</a></td><td>" + esc(c.sku) + '</td><td class="r">' + (c.price ? Number(c.price).toLocaleString() : "") + '</td><td class="r">' + (est ? Math.round(est).toLocaleString() : "") + '</td><td class="r">' + num(c.reviews).toLocaleString() + '</td><td class="r">' + c.rank + "</td><td>" + (c.dup ? '<span class="pill bad">' + esc(c.dup) + "</span>" : '<span class="pill ok">신규</span>') + "</td><td>" + (w && !c.dup ? '<button class="btn sm pri" data-act="candadd" data-pid="' + esc(c.pid) + '">시트에 추가</button> ' : "") + (w ? '<button class="btn sm" data-act="candhide" data-pid="' + esc(c.pid) + '">숨기기</button>' : "") + "</td></tr>"; }).join("") +
      (R.length ? "" : '<tr><td colspan="11" class="muted">' + (D.at ? "조건에 맞는 후보가 없어요." : "‘후보 찾기’를 누르면 스토어 인기순 목록을 읽어 와요.") + "</td></tr>") + "</tbody></table></div></div>";
    h += '<div class="panel"><h2>소싱 스토어<span class="sub">스토어 첫 화면 주소를 넣어 주세요 (예: https://smartstore.naver.com/loutique) · 인기순 목록 1페이지(최대 80개)만 6초 간격으로 읽어요</span></h2><div class="table-wrap"><table><thead><tr><th>스토어 이름</th><th>주소</th><th class="r">마지막 결과</th><th></th></tr></thead><tbody>' +
      ST.map(function (s, i) { var sc = (D.scans || {})[s.name]; return "<tr><td>" + esc(s.name) + '</td><td><input class="cell-in" style="width:360px;text-align:left" data-storeurl="' + i + '" value="' + esc(s.url || "") + '" placeholder="https://smartstore.naver.com/…"' + (w ? "" : " disabled") + '></td><td class="r">' + (sc ? (sc.err ? '<span class="pill bad">' + esc(sc.err) + "</span>" : sc.n + "개") + " · " + String(sc.at).slice(5, 16).replace("T", " ") : "") + "</td><td>" + (w ? '<button class="btn sm" data-act="canddelstore" data-i="' + i + '">빼기</button>' : "") + "</td></tr>"; }).join("") +
      "</tbody></table></div>" + (w ? '<div class="tools" style="margin-top:8px"><input class="ctl" id="ns-name" placeholder="스토어 이름"><input class="ctl" id="ns-url" style="width:320px" placeholder="https://smartstore.naver.com/…"><button class="btn sm" data-act="candaddstore">스토어 추가</button></div>' : "") + "</div>";
    return h;
  }
  function saveStores(L) { S.SET.sourcing_stores = L; ERP.saveSetting("sourcing_stores", L); }
  function bindC(root) {
    root.querySelectorAll("[data-cand]").forEach(function (el) { el.onchange = function () { v[el.dataset.cand] = el.checked; ERP.render(); }; });
    root.querySelectorAll("[data-candstore]").forEach(function (el) { el.onchange = function () { v.candStore = el.value; ERP.render(); }; });
    root.querySelectorAll("[data-storeurl]").forEach(function (el) { el.onchange = function () { var L = JSON.parse(JSON.stringify(stores())), i = +el.dataset.storeurl, u = el.value.trim(); if (u && !storeBase(u)) { ERP.toast("네이버 스토어 주소(smartstore.naver.com/… 또는 brand.naver.com/…)를 넣어 주세요."); return; } L[i].url = storeBase(u) || ""; saveStores(L); }; });
  }
  ERP.acts.candscan = function () { scan(); };
  ERP.acts.candaddstore = function () { var n = (document.getElementById("ns-name").value || "").trim(), u = (document.getElementById("ns-url").value || "").trim(); if (!n) { ERP.toast("스토어 이름을 넣어 주세요."); return; } var L = JSON.parse(JSON.stringify(stores())); L.push({ name: n, url: storeBase(u) || "" }); saveStores(L); };
  ERP.acts.canddelstore = function (btn) { var L = JSON.parse(JSON.stringify(stores())); L.splice(+btn.dataset.i, 1); saveStores(L); };
  ERP.acts.candhide = function (btn) { var D = JSON.parse(JSON.stringify(data())), k = "P" + btn.dataset.pid; if (D.items && D.items[k]) { D.items[k].hidden = true; S.SET.sourcing_candidates = D; ERP.saveSetting("sourcing_candidates", D); ERP.render(); } };
  ERP.acts.candadd = async function (btn) {
    var c = (data().items || {})["P" + btn.dataset.pid]; if (!c) return; var B = cfg().brands || {};
    var made = await addRows(1, (B[c.brand] && B[c.brand].tier) || TIER_SEED[c.brand] || "컨템포러리"); if (!made.length) return;
    var it = Object.assign({}, made[0], { buyLink: c.url, vendor: c.store, sku: c.sku || "", brand: c.brand || "", buyPrice: c.price || null }); it.extra = Object.assign({}, it.extra || {}, { nameOverride: c.name, fromCandidate: true });
    ERP.DATA.price_items.set(it.id, it); queueSave(it); AUTO.fill(it.id, c.url);
    ERP.toast("소싱 시트에 추가했어요. 나머지 칸은 링크로 자동으로 채워져요."); ERP.render();
  };
  ERP.acts.candsabang = function () {
    ERP.pickFile(".xlsx,.xls,.csv", async function (file) {
      try {
        var wb = XLSX.read(await file.arrayBuffer(), { type: "array" }), out = {}, cols = 0;
        wb.SheetNames.forEach(function (sn) { var A = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "" }); for (var r = 0; r < Math.min(A.length, 10); r++) { var idx = []; A[r].forEach(function (hd, j) { if (/모델명|모델코드|품번|자체상품코드|상품코드|SKU/i.test(String(hd))) idx.push(j); }); if (idx.length) { cols += idx.length; for (var k = r + 1; k < A.length; k++) idx.forEach(function (j) { String(A[k][j] || "").split(/[,\/]/).forEach(function (x) { var t = x.trim(); if (norm(t).length >= 5) out[t] = 1; }); }); break; } } });
        var L = Object.keys(out); if (!L.length) { ERP.toast("품번(모델명·자체상품코드) 열을 찾지 못했어요."); return; }
        var o = { at: new Date().toISOString(), file: file.name, skus: L }; S.SET.sabang_skus = o; await ERP.saveSetting("sabang_skus", o); ERP.toast("사방넷 품번 " + L.length.toLocaleString() + "개를 불러왔어요."); ERP.render();
      } catch (e) { ERP.toast("파일을 읽지 못했어요: " + (e.message || e)); }
    });
  };
  return { html: html, bind: bindC, onResult: onResult };
})();

ERP.acts.scautofill = function () { var L = all().filter(function (it) { return it.buyLink && /^https?:/i.test(it.buyLink) && (!it.brand || !it.sku || it.buyPrice == null); }).slice(0, 30); if (!L.length) { ERP.toast("채울 줄이 없어요(링크 있고 빈칸 있는 줄)."); return; } L.forEach(function (it) { AUTO.send(it.id, it.buyLink, "fill"); }); ERP.toast(L.length + "줄을 6초에 1개씩 채워요."); ERP.render(); };
ERP.acts.sccheck = function () { AUTO.checkAll(true); };

ERP.page({ id: "sourcing", title: "스마트스토어 소싱", wide: true, render: render, bind: bind, live: live, badge: function () { var n = 0; all().forEach(function (it) { if (calc(it).linkDiff) n++; }); return n || ""; } });
ERP.page({ id: "naver-auto", title: "네이버 자동소싱", wide: true, render: function () { return CAND.html(); }, bind: function (root) { CAND.bind(root); }, live: function () { var ae = document.activeElement; if (ae && ae.matches && ae.matches("input,select")) return; ERP.render(); } });
})();
