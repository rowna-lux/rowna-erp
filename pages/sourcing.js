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
var COLS = [
  { g: "① 기본정보", k: "x.code", l: "판매자관리코드", t: "txt", w: 120 },
  { k: "x.ssNo", l: "스마트스토어 상품번호", t: "txt", w: 120 },
  { k: "status", l: "상태", t: "sel", o: "status", w: 82 },
  { k: "tier", l: "구분", t: "sel", o: "tier", w: 92 },
  { k: "vendor", l: "매입처", t: "txt", w: 100 },
  { k: "brand", l: "브랜드(영문)", t: "txt", w: 120 },
  { k: "x.brandKr", l: "브랜드(한글)", t: "txt", w: 90, ph: "brandKr" },
  { k: "category", l: "대분류", t: "txt", w: 80 },
  { k: "x.sub", l: "중분류", t: "txt", w: 80 },
  { k: "sku", l: "모델명/품번", t: "txt", w: 140 },
  { k: "x.line", l: "상품명칭(라인·특징)", t: "txt", w: 170 },
  { k: "x.color", l: "컬러", t: "txt", w: 70 },
  { k: "x.gender", l: "성별", t: "sel", o: "gender", w: 66 },
  { k: "x.material", l: "소재/사이즈", t: "txt", w: 90 },
  { g: "② 상품명", c: "autoName", l: "상품명 자동생성", w: 240, f: "txt" },
  { k: "x.nameOverride", l: "상품명 직접수정(선택)", t: "txt", w: 200 },
  { c: "finalName", l: "최종 상품명", w: 260, f: "txt", key: 1 },
  { c: "nameLen", l: "글자수", w: 58, f: "len" },
  { g: "③ 매입", k: "buyPrice", l: "매입가·기준가", t: "num", w: 110 },
  { k: "cardRate", l: "카드혜택%", t: "pct", w: 76 },
  { c: "cost", l: "실질원가", w: 104, f: "won" },
  { k: "x.proof", l: "매입증빙", t: "sel", o: "proof", w: 120 },
  { k: "x.refPrice", l: "백화점정가(참고)", t: "num", w: 110 },
  { k: "buyLink", l: "매입처 링크", t: "link", w: 160 },
  { k: "x.linkPrice", l: "링크 현재가(AI)", w: 104, f: "won", ro: 1 },
  { k: "x.linkCheckedAt", l: "가격 확인(AI)", w: 110, f: "dt", ro: 1 },
  { c: "linkDiff", l: "매입가 변동", w: 96, f: "diff" },
  { g: "④ 마진 %", c: "mBase", l: "기본마진", w: 70, f: "pct" },
  { c: "mCat", l: "카테고리조정", w: 78, f: "pct" },
  { c: "mBrand", l: "브랜드조정", w: 72, f: "pct" },
  { c: "mVendor", l: "매입처조정", w: 72, f: "pct" },
  { k: "x.adjIndiv", l: "개별조정", t: "pct", w: 72 },
  { c: "mGlobal", l: "전체조정", w: 66, f: "pct" },
  { c: "margin", l: "적용마진", w: 72, f: "pct" },
  { g: "⑤ 판매가", k: "x.channel", l: "유입경로", t: "sel", o: "channel", w: 100 },
  { c: "feeRate", l: "수수료율", w: 70, f: "pct2" },
  { c: "calcPrice", l: "계산판매가", w: 104, f: "won" },
  { k: "fixedPrice", l: "판매가 직접지정", t: "num", w: 106 },
  { c: "final", l: "최종판매가", w: 108, f: "won", key: 1 },
  { k: "storePrice", l: "현재 스토어가", t: "num", w: 104 },
  { c: "change", l: "변동", w: 90, f: "chg" },
  { c: "storeInput", l: "스토어 입력가(할인전)", w: 116, f: "won" },
  { c: "discount", l: "즉시할인액", w: 90, f: "won" },
  { g: "⑥ 정산·수익", c: "feeNpay", l: "Npay수수료", w: 90, f: "won" },
  { c: "feeSales", l: "판매수수료(VAT포함)", w: 104, f: "won" },
  { c: "feeSum", l: "수수료 합계", w: 96, f: "won" },
  { c: "settle", l: "정산예정액", w: 106, f: "won" },
  { c: "marginAmt", l: "마진액(판매가−원가)", w: 108, f: "won" },
  { c: "marginRate", l: "마진율", w: 66, f: "pct" },
  { c: "profit", l: "순이익", w: 100, f: "won", key: 1 },
  { c: "rate", l: "순이익률", w: 72, f: "pct" },
  { c: "refRatio", l: "정가대비", w: 70, f: "pct0" },
  { g: "⑦ 부가세(추정)", c: "vatOut", l: "매출세액", w: 90, f: "won" },
  { c: "vatIn", l: "매입세액", w: 90, f: "won" },
  { c: "vatFee", l: "수수료 세액", w: 86, f: "won" },
  { c: "vatDue", l: "납부 부가세", w: 92, f: "won" },
  { c: "netAfterVat", l: "세후 순수익", w: 104, f: "won", key: 1 },
  { g: "⑧ 확인", c: "warn", l: "경고", w: 120, f: "warn" },
  { k: "memo", l: "메모", t: "txt", w: 200 }
];
var FROZEN_KEYS = ["sku"]; /* 가로로 스크롤해도 품번은 왼쪽에 고정 */
function cfg() { var c = Object.assign({}, DEF, S.SET.price_settings || {}); if (!c.category_adj || !Object.keys(c.category_adj).length) c.category_adj = SEED.category_adj; c.brands = c.brands || {}; c.vendor_adj = c.vendor_adj || {}; return c; }
function calc(it) { return C.sourcing(it, cfg()); }
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
      if (col.ph === "brandKr" && !val && c.brandKr) inner = '<span class="ce ph" ' + (w ? 'contenteditable="plaintext-only" ' : "") + 'data-ci="' + ci + '" spellcheck="false" data-ph="' + esc(c.brandKr) + '"></span>';
      else inner = '<span class="ce' + (col.t !== "txt" ? " r" : "") + '" ' + (w ? 'contenteditable="plaintext-only" ' : "") + 'data-ci="' + ci + '" spellcheck="false">' + esc(inVal(col, val)) + "</span>";
    }
  } else {
    cls.push(col.key ? "key" : "calc"); if (col.f !== "txt" && col.f !== "warn" && col.f !== "chg") cls.push("r");
    inner = fmt(col, col.c ? c[col.c] : get(it, col.k), c);
  }
  var fz = FROZEN_KEYS.indexOf(col.k) !== -1; if (fz) cls.push("fz");
  return '<td class="' + cls.join(" ") + '" data-ci="' + ci + '"' + (fz ? ' style="left:38px"' : "") + ">" + inner + "</td>";
}
function rowHtml(it, i, w) { var c = calc(it); return '<tr data-id="' + esc(it.id) + '"><th class="rn" scope="row" data-sel="' + esc(it.id) + '">' + (i + 1) + "</th>" + COLS.map(function (col, ci) { return cellHtml(it, ci, c, w); }).join("") + "</tr>"; }
function counts() { var n = { all: 0, change: 0, warn: 0, link: 0, nocost: 0 }; all().filter(function (it) { return v.scTab === "전체" || it.tier === v.scTab; }).forEach(function (it) { var c = calc(it); n.all++; if (c.change) n.change++; if (/손해|저마진/.test(c.warn || "")) n.warn++; if (c.linkDiff) n.link++; if (c.warn === "원가없음") n.nocost++; }); return n; }

function render() {
  if (v.scTab === "설정") return head() + settingsHtml() + tabsHtml();
  var w = ERP.canWrite("price_items"), list = rows(), n = counts();
  var groups = "", g = null, span = 0, gl = [];
  COLS.forEach(function (col) { if (col.g) { if (g !== null) gl.push([g, span]); g = col.g; span = 1; } else span++; }); gl.push([g, span]);
  groups = '<tr class="grp"><th class="rn"></th>' + gl.map(function (x) { return '<th colspan="' + x[1] + '">' + esc(x[0]) + "</th>"; }).join("") + "</tr>";
  var hdr = '<tr class="hd"><th class="rn">#</th>' + COLS.map(function (col, ci) { var s = v.scSort && v.scSort.i === ci ? (v.scSort.d > 0 ? " ▲" : " ▼") : "", fz = FROZEN_KEYS.indexOf(col.k) !== -1; return '<th style="width:' + col.w + 'px;min-width:' + col.w + 'px' + (fz ? ";left:38px" : "") + '" class="' + (col.t && !col.ro ? "h-in" : col.key ? "h-key" : "h-calc") + (fz ? " fz" : "") + '" data-sort="' + ci + '" title="눌러서 정렬">' + esc(col.l) + s + "</th>"; }).join("") + "</tr>";
  var body = list.map(function (it, i) { return rowHtml(it, i, w); }).join("");
  if (w) body += '<tr class="newrow"><th class="rn">+</th><td colspan="' + COLS.length + '"><button class="linkbtn" data-act="scadd">+ 새 상품 줄 추가</button> <span class="muted">· 엑셀에서 여러 줄을 복사해 아무 칸에서 Ctrl+V 해도 돼요(모자라는 줄은 자동으로 늘어나요)</span></td></tr>';
  var h = head(n);
  var tw = 38 + COLS.reduce(function (a, c) { return a + c.w; }, 0), cg = '<colgroup><col style="width:38px">' + COLS.map(function (c) { return '<col style="width:' + c.w + 'px">'; }).join("") + "</colgroup>";
  h += '<div class="sheet-wrap" id="sheet"><table class="sheet" style="width:' + tw + 'px">' + cg + '<thead>' + groups + hdr + "</thead><tbody>" + body + "</tbody></table></div>";
  if (!list.length) h += '<div class="panel empty"><b>' + (all().length ? "조건에 맞는 상품이 없어요" : "아직 상품이 없어요") + "</b>‘+ 새 상품 줄 추가’를 누르거나 소싱폼 엑셀을 올려 주세요.</div>";
  return h + tabsHtml();
}
function head(n) {
  var w = ERP.canWrite("price_items");
  var h = '<div class="head"><div><h1>스마트스토어 소싱</h1><p>엑셀처럼 칸을 눌러 바로 입력 · Enter/Tab/방향키 이동 · 여러 칸 복사·붙여넣기 · 칸을 벗어나면 자동 저장 · 흰 칸=입력, 회색=자동계산, 분홍=핵심 결과</p></div><div class="tools">' +
    (w ? '<button class="btn" data-act="scimport">소싱폼 엑셀 올리기</button>' : "") + '<button class="btn" data-act="scexport">엑셀로 받기</button>' + (ERP.isOwner() ? '<button class="btn danger" data-act="scdel" id="scdel" disabled>선택 줄 삭제</button>' : "") + "</div></div>";
  if (n) h += '<div class="tools filters">' + ERP.chips("data-view", "scF=" + v.scF, [["scF=all", "전체 " + n.all], ["scF=change", "가격 변경 필요 " + n.change], ["scF=warn", "손해·저마진 " + n.warn], ["scF=link", "매입가 변동 " + n.link], ["scF=nocost", "원가 없음 " + n.nocost]]) + '<input class="ctl search" data-search="scQ" type="search" aria-label="검색" placeholder="품번·브랜드·상품명·매입처·코드" value="' + esc(v.scQ) + '">' + (v.scSort ? '<button class="btn sm" data-act="scunsort">정렬 해제</button>' : "") + "</div>";
  return h;
}
function tabsHtml() { return '<div class="sheet-tabs" role="tablist">' + ["하이엔드", "컨템포러리", "전체", "설정"].map(function (t) { return '<button role="tab" aria-selected="' + (v.scTab === t) + '" class="' + (v.scTab === t ? "on" : "") + '" data-view="scTab=' + t + '">' + (t === "설정" ? "⚙ 설정" : t) + "</button>"; }).join("") + "</div>"; }

function settingsHtml() {
  var c = cfg(), dis = ERP.isOwner() ? "" : " disabled";
  var f = function (k, label, isPct) { return '<div class="fd"><label for="sc-' + k + '">' + label + '</label><input id="sc-' + k + '" data-ps="' + k + '" data-pct="' + (isPct ? 1 : "") + '" type="number" step="any" value="' + (isPct ? Math.round(num(c[k]) * 100000) / 1000 : num(c[k])) + '"' + dis + "></div>"; };
  var kv = function (title, key, items, hint) { return '<div class="panel"><h2>' + title + '<span class="sub">' + hint + '</span></h2><div class="kv-list">' + items.map(function (k) { return '<div class="kv"><span>' + esc(k) + '</span><input type="number" step="any" data-map="' + key + '" data-mk="' + esc(k) + '" value="' + Math.round(num((c[key] || {})[k]) * 100000) / 1000 + '"' + dis + '><em>%p</em></div>'; }).join("") + (ERP.isOwner() ? '<div class="kv add"><input type="text" placeholder="새 항목 이름" data-newkey="' + key + '"><button class="btn sm" data-act="scaddkey" data-key="' + key + '">추가</button></div>' : "") + "</div></div>"; };
  var brands = c.brands || {};
  var h = '<div class="panel"><h2>가격 정책<span class="sub">바꾸면 모든 상품 가격이 바로 다시 계산돼요 (대표님만 수정)</span></h2><div class="fg four">' +
    f("global_adj", "전체 일괄조정 %p", 1) + f("margin_high", "기본마진 - 하이엔드 %", 1) + f("margin_contemp", "기본마진 - 컨템포러리 %", 1) + f("extra_cost", "건당 부대비용 (원)") +
    f("round_unit", "가격 올림 단위 (원)") + f("discount_rate", "즉시할인 노출률 %", 1) + f("low_margin", "저마진 경고 기준 %", 1) + '<div class="fd"></div>' +
    f("npay", "Npay 주문관리수수료 % (VAT포함)", 1) + f("fee_naver", "판매수수료 - 네이버 유입 % (VAT별도)", 1) + f("fee_mkt", "판매수수료 - 마케팅링크 % (VAT별도)", 1) + f("vat", "부가세율 %", 1) +
    '</div><p class="note">판매가 = 올림((실질원가+부대비용)×(1+적용마진)÷(1−수수료율)). 적용마진 = 기본 + 카테고리 + 브랜드 + 매입처 + 개별 + 전체 조정. 순이익 = 최종판매가 − 수수료 − 실질원가 − 부대비용. 부가세(추정) = 판매가÷11 − 매입가÷11(매입증빙이 카드·세금계산서일 때) − 수수료÷11 — 신고 전 세무사 확인 필요.</p></div>';
  h += '<div class="grid2">' + kv("매입처 조정", "vendor_adj", Object.keys(c.vendor_adj || {}), "그 매입처 상품에만 더하는 마진") + kv("카테고리 조정", "category_adj", Object.keys(c.category_adj || {}), "대분류/중분류 별 마진 가감") + "</div>";
  h += '<div class="panel"><h2>브랜드<span class="sub">영문 브랜드명이 같으면 한글명이 자동으로 채워지고 브랜드조정이 붙어요</span></h2><div class="table-wrap"><table><thead><tr><th>브랜드(영문)</th><th>브랜드(한글)</th><th class="r">브랜드조정 %p</th></tr></thead><tbody>' +
    Object.keys(brands).sort().map(function (b) { return '<tr><td>' + esc(b) + '</td><td><input class="cell-in" style="width:130px;text-align:left" data-brand="' + esc(b) + '" data-bk="kr" value="' + esc(brands[b].kr || "") + '"' + dis + '></td><td class="r"><input class="cell-in" type="number" step="any" data-brand="' + esc(b) + '" data-bk="adj" value="' + Math.round(num(brands[b].adj) * 100000) / 1000 + '"' + dis + "></td></tr>"; }).join("") +
    "</tbody></table></div>" + (ERP.isOwner() ? '<div class="tools" style="margin-top:8px"><input class="ctl" id="nb-en" placeholder="브랜드(영문) 예: PRADA"><input class="ctl" id="nb-kr" placeholder="한글 예: 프라다"><button class="btn sm" data-act="scaddbrand">브랜드 추가</button></div>' : "") + "</div>";
  return h;
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
  tr.querySelectorAll("td").forEach(function (td) { var ci = +td.dataset.ci, col = COLS[ci]; if (col.t && !col.ro) { if (col.ph === "brandKr") { var sp = td.querySelector(".ce"); if (sp && !get(it, col.k)) { sp.dataset.ph = c.brandKr || ""; sp.classList.add("ph"); } } return; } var nh = cellHtml(it, ci, c, w); var tmp = document.createElement("tbody"); tmp.innerHTML = "<tr>" + nh + "</tr>"; td.innerHTML = tmp.firstChild.firstChild.innerHTML; });
}
function commitCell(span) {
  var td = span.closest("td"), tr = span.closest("tr"), it0 = ERP.DATA.price_items.get(tr.dataset.id); if (!it0) return;
  var col = COLS[+td.dataset.ci], it = Object.assign({}, pending[it0.id] || it0), val = parseIn(col, span.tagName === "SELECT" ? span.value : span.textContent);
  var old = get(it, col.k); if ((old == null ? "" : old) === (val == null ? "" : val)) { if (span.tagName !== "SELECT") span.textContent = inVal(col, old); return; }
  setv(it, col.k, val);
  if (col.k === "buyLink") { /* 링크 바뀌면 AI 확인값 초기화 */ it.extra = Object.assign({}, it.extra || {}, { linkPrice: null, linkCheckedAt: null }); }
  ERP.DATA.price_items.set(it.id, it); queueSave(it);
  if (span.tagName !== "SELECT") { span.textContent = inVal(col, val); span.classList.remove("ph"); }
  refreshRow(tr, it);
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
    cells.forEach(function (raw, k) { var col = COLS[ci0 + k]; if (!col || !col.t || col.ro) return; setv(it, col.k, parseIn(col, raw)); changed++; });
    ERP.DATA.price_items.set(id, it); queueSave(it);
  });
  ERP.render(); ERP.toast(changed + "칸을 붙여넣었어요.");
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
      var th = e.target.closest && e.target.closest("th[data-sel]"); if (th && ERP.isOwner()) { sheet.querySelectorAll("tr.sel").forEach(function (r) { r.classList.remove("sel"); }); var tr = th.parentElement; if (selected === tr.dataset.id) { selected = null; } else { selected = tr.dataset.id; tr.classList.add("sel"); } var b = document.getElementById("scdel"); if (b) { b.disabled = !selected; b.textContent = "선택 줄 삭제"; delete b.dataset.arm; } return; }
      var td = e.target.closest && e.target.closest("td.in"); if (td && e.target === td) focusCell(td);
    });
  }
  root.querySelectorAll("[data-ps]").forEach(function (el) { el.onchange = function () { var o = Object.assign({}, cfg()); o[el.dataset.ps] = el.dataset.pct ? num(el.value) / 100 : num(el.value); saveCfg(o); }; });
  root.querySelectorAll("[data-map]").forEach(function (el) { el.onchange = function () { var o = Object.assign({}, cfg()), m = Object.assign({}, o[el.dataset.map] || {}); m[el.dataset.mk] = num(el.value) / 100; o[el.dataset.map] = m; saveCfg(o); }; });
  root.querySelectorAll("[data-brand]").forEach(function (el) { el.onchange = function () { var o = Object.assign({}, cfg()), b = Object.assign({}, o.brands || {}), r = Object.assign({}, b[el.dataset.brand] || {}); if (el.dataset.bk === "kr") r.kr = el.value.trim(); else r.adj = num(el.value) / 100; b[el.dataset.brand] = r; o.brands = b; saveCfg(o); }; });
}
function live() { /* 다른 사람·AI가 바꾼 내용 반영: 입력 중이면 그 줄만 건드리지 않음 */
  var sheet = document.getElementById("sheet"); if (!sheet || v.scTab === "설정") { ERP.render(); return; }
  var act = document.activeElement, editingId = act && act.closest && act.closest("tr[data-id]") ? act.closest("tr[data-id]").dataset.id : null;
  var ids = rows().map(function (x) { return x.id; }), trs = sheet.querySelectorAll("tr[data-id]");
  if (ids.length !== trs.length) { if (!editingId) ERP.render(); return; }
  trs.forEach(function (tr) { if (tr.dataset.id === editingId) return; var it = ERP.DATA.price_items.get(tr.dataset.id); if (it) { var w = ERP.canWrite("price_items"); var tmp = document.createElement("tbody"); tmp.innerHTML = rowHtml(it, 0, w); var nt = tmp.firstChild; nt.firstChild.textContent = tr.firstChild.textContent; tr.innerHTML = nt.innerHTML; } });
}

/* ---------- 버튼 ---------- */
ERP.acts.scadd = async function () { var m = await addRows(1); if (!m.length) return; v.scSort = null; ERP.render(); var tr = document.querySelector('tr[data-id="' + m[0].id + '"]'); if (tr) focusCell(tr.querySelector("td.in")); };
ERP.acts.scunsort = function () { v.scSort = null; ERP.render(); };
ERP.acts.scdel = async function (btn) { if (!selected) return; var it = ERP.DATA.price_items.get(selected); if (!btn.dataset.arm) { btn.dataset.arm = "1"; btn.textContent = "‘" + ((it && (calc(it).finalName || it.sku)) || "").slice(0, 18) + "’ 삭제할까요? 한 번 더"; return; } if (await ERP.remove("price_items", selected)) ERP.toast("삭제했어요."); selected = null; };
ERP.acts.scaddkey = function (btn) { var key = btn.dataset.key, inp = document.querySelector('[data-newkey="' + key + '"]'), name = inp && inp.value.trim(); if (!name) return; var o = Object.assign({}, cfg()), m = Object.assign({}, o[key] || {}); m[name] = 0; o[key] = m; saveCfg(o); };
ERP.acts.scaddbrand = function () { var en = (document.getElementById("nb-en").value || "").trim().toUpperCase(), kr = (document.getElementById("nb-kr").value || "").trim(); if (!en) return; var o = Object.assign({}, cfg()), b = Object.assign({}, o.brands || {}); b[en] = { kr: kr, adj: 0 }; o.brands = b; saveCfg(o); };
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
ERP.page({ id: "sourcing", title: "스마트스토어 소싱", render: render, bind: bind, live: live, badge: function () { var n = 0; all().forEach(function (it) { if (calc(it).linkDiff) n++; }); return n || ""; } });
})();
