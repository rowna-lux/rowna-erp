/* 메뉴: 재고실사 (바코드) — 데이터는 app_settings.stock_inventory 한 곳에 저장 */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, esc = U.esc, norm = U.norm;
var KEY = "stock_inventory";
var BRANDS = [["CH", "샤넬"], ["HM", "에르메스"], ["AI", "알파인더스트리"], ["MC", "몽클레어"], ["CL", "셀린느"], ["CO", "끌로에"], ["MM", "미우미우"], ["HK", "호카"], ["AM", "아미"], ["MK", "메종키츠네"], ["PB", "파라부트"], ["TB", "톰브라운"], ["VW", "비비안웨스트우드"], ["LV", "루이비통"], ["DI", "디올"], ["GC", "구찌"], ["PR", "프라다"], ["BV", "보테가베네타"], ["YS", "생로랑"], ["FE", "펜디"], ["BA", "발렌시아가"], ["LO", "로에베"], ["BB", "버버리"], ["ET", "기타"]];
var v = ERP.view; v.stMode = v.stMode || "실사"; v.stQ = v.stQ || ""; v.stLoc = v.stLoc || ""; v.stMsg = v.stMsg || "";
function D() { var d = S.SET[KEY]; if (!d || !d.items) { d = { items: {}, seq: {}, count: null, locs: "A-01~A-05" }; S.SET[KEY] = d; } return d; }
var saveT = null;
function save(now) {
  clearTimeout(saveT);
  var run = async function () { var r = await S.sb.from("app_settings").upsert({ key: KEY, value: D() }); if (r.error) ERP.toast("재고 저장 실패: " + ERP.errMsg(r.error)); };
  if (now) return run(); saveT = setTimeout(run, 700);
}
function items() { return Object.values(D().items); }
function brandName(c) { var b = BRANDS.find(function (x) { return x[0] === c; }); return b ? b[1] : (c || ""); }
function isLoc(code) { return /^LOC-/i.test(code); }

/* ---------- 바코드 SVG (Code128) ---------- */
function barcodeSvg(code, h) {
  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try { window.JsBarcode(svg, code, { format: "CODE128", width: 2, height: h || 50, margin: 0, displayValue: false }); } catch (e) { return ""; }
  return svg.outerHTML;
}

/* ---------- 스캔 처리 ---------- */
/* 키보드가 한글 상태에서 스캔하면 'ㅣㅐㅊ-ㅁ1'처럼 들어옴 → 영문 자판으로 되돌림 */
var KO = { "ㄱ":"r","ㄲ":"R","ㄴ":"s","ㄷ":"e","ㄸ":"E","ㄹ":"f","ㅁ":"a","ㅂ":"q","ㅃ":"Q","ㅅ":"t","ㅆ":"T","ㅇ":"d","ㅈ":"w","ㅉ":"W","ㅊ":"c","ㅋ":"z","ㅌ":"x","ㅍ":"v","ㅎ":"g",
  "ㅏ":"k","ㅐ":"o","ㅑ":"i","ㅒ":"O","ㅓ":"j","ㅔ":"p","ㅕ":"u","ㅖ":"P","ㅗ":"h","ㅘ":"hk","ㅙ":"ho","ㅚ":"hl","ㅛ":"y","ㅜ":"n","ㅝ":"nj","ㅞ":"np","ㅟ":"nl","ㅠ":"b","ㅡ":"m","ㅢ":"ml","ㅣ":"l",
  "ㄳ":"rt","ㄵ":"sw","ㄶ":"sg","ㄺ":"fr","ㄻ":"fa","ㄼ":"fq","ㄽ":"ft","ㄾ":"fx","ㄿ":"fv","ㅀ":"fg","ㅄ":"qt" };
var CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ", JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ", JONG = ["", "ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
function fixKo(s) {
  if (!/[ㄱ-ㅣ가-힣]/.test(s)) return s;
  var out = "";
  for (var i = 0; i < s.length; i++) {
    var ch = s[i], n = ch.charCodeAt(0) - 0xAC00;
    if (n >= 0 && n < 11172) { out += KO[CHO[Math.floor(n / 588)]] + KO[JUNG[Math.floor((n % 588) / 28)]] + (n % 28 ? KO[JONG[n % 28]] : ""); }
    else out += KO[ch] || ch;
  }
  return out.toUpperCase();
}
function onScan(raw) {
  var code = fixKo(String(raw || "").trim()); if (!code) return; v.stLast = code;
  var d = D();
  if (isLoc(code)) { v.stLoc = code.toUpperCase().replace(/^LOC-/, ""); v.stMsg = "📍 위치 " + v.stLoc + " — 이제 찍는 상품은 이 위치로 기록돼요"; ERP.render(); return; }
  var it = d.items[code];
  if (!it) { v.stMsg = "새 바코드 " + code + " — 상품 정보를 등록해 주세요"; open(null, code); return; }
  if (v.stLoc) it.loc = v.stLoc;
  var m = v.stMode;
  if (m === "실사") { if (!d.count) d.count = { at: new Date().toISOString(), scans: {} }; d.count.scans[code] = (d.count.scans[code] || 0) + 1; v.stMsg = "✔ " + label(it) + " — 실사 " + d.count.scans[code] + "개째"; }
  else if (m === "입고") { it.qty = (Number(it.qty) || 0) + 1; v.stMsg = "＋ 입고 " + label(it) + " → 재고 " + it.qty; }
  else if (m === "출고") { it.qty = Math.max(0, (Number(it.qty) || 0) - 1); v.stMsg = "－ 출고 " + label(it) + " → 재고 " + it.qty; }
  else { v.stMsg = "🔎 " + label(it) + " · 재고 " + (it.qty || 0) + " · 위치 " + (it.loc || "-"); }
  it.at = new Date().toISOString(); save(); ERP.render();
}
function label(it) { return brandName(it.brand) + " " + (it.name || it.model || it.code); }

/* ---------- 화면 ---------- */
function render() {
  var d = D(), w = ERP.canWrite("stock"), cnt = d.count, q = norm(v.stQ);
  var L = items().filter(function (it) { return !q || norm([it.code, brandName(it.brand), it.name, it.model, it.serial, it.opt, it.loc].join(" ")).indexOf(q) !== -1; })
    .sort(function (a, b) { return (a.loc || "~").localeCompare(b.loc || "~") || a.code.localeCompare(b.code); });
  var tot = 0; items().forEach(function (it) { tot += Number(it.qty) || 0; });
  var h = '<div class="head"><div><h1>재고실사</h1><p>바코드를 찍으면 재고가 맞춰져요 · 위치 바코드(LOC-)를 먼저 찍으면 위치도 기록돼요</p></div><div class="tools">' +
    (w ? '<button class="btn pri" data-act="stnew">+ 자체 바코드 발급</button>' : "") +
    '<button class="btn" data-act="stlabel">상품 라벨 출력</button><button class="btn" data-act="stloclabel">위치 라벨 출력</button><button class="btn" data-act="stxls">엑셀 다운로드</button><button class="btn" data-act="stsabang">사방넷 대조</button></div></div>';
  h += '<div class="panel" style="padding:16px;margin-bottom:12px"><div class="tools filters" style="margin-bottom:10px">' + ERP.chips("data-stmode", v.stMode, [["실사", "실사(개수 세기)"], ["입고", "입고 +1"], ["출고", "출고 −1"], ["조회", "조회만"]]) +
    '<span class="pill ' + (v.stLoc ? "p-acc" : "p-mute") + '">위치: ' + esc(v.stLoc || "없음") + "</span>" + (v.stLoc ? '<button class="btn sm" data-act="stlocclear">위치 해제</button>' : "") + "</div>" +
    '<input class="ctl" id="st-scan" autocomplete="off" placeholder="여기를 누르고 바코드를 찍으세요 (직접 입력 후 Enter도 가능)" style="width:100%;font-size:20px;padding:14px" aria-label="바코드 입력">' +
    '<div id="st-msg" role="status" style="margin-top:10px;font-size:15px;min-height:22px">' + (v.stLast ? '<b>✔ 방금 읽은 바코드: ' + esc(v.stLast) + "</b><br>" : "") + esc(v.stMsg) + "</div></div>";
  if (cnt) {
    var scanned = 0; Object.values(cnt.scans).forEach(function (n) { scanned += n; });
    h += '<div class="panel" style="padding:14px;margin-bottom:12px;border-left:4px solid #851b00"><b>실사 진행 중</b> · ' + esc(cnt.at.slice(0, 16).replace("T", " ")) + " 시작 · 찍은 수량 " + scanned + "개 " +
      (w ? '<button class="btn sm pri" data-act="stfinish" style="margin-left:8px">실사 마감 · 차이 보기</button><button class="btn sm" data-act="stcancel">실사 취소</button>' : "") + "</div>";
  }
  h += '<div class="tiles">' + ERP.tile("상품(SKU)", items().length + "개") + ERP.tile("총 수량", tot + "개") + ERP.tile("자체 바코드", items().filter(function (it) { return it.own; }).length + "개", "RW-브랜드-번호") + "</div>";
  h += '<div class="tools filters"><input class="ctl" data-search="stQ" value="' + esc(v.stQ) + '" placeholder="검색: 코드·브랜드·상품명·품번·시리얼·위치" style="min-width:320px"></div>';
  var body = L.map(function (it) {
    var c = cnt ? (cnt.scans[it.code] || 0) : null, diff = cnt ? c - (Number(it.qty) || 0) : 0;
    return '<tr class="click" data-stedit="' + esc(it.code) + '" tabindex="0"><td><input type="checkbox" data-stpick="' + esc(it.code) + '" aria-label="라벨 선택"></td><td>' + (it.photo ? '<img src="' + it.photo + '" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:6px">' : "") + '</td><td class="num">' + esc(it.code) + (it.own ? ' <span class="pill p-acc">자체</span>' : "") + "</td><td>" + esc(brandName(it.brand)) + '</td><td class="name">' + esc(it.name || "") + (it.opt ? "<small>" + esc(it.opt) + "</small>" : "") + '</td><td class="num">' + esc(it.model || "") + (it.serial ? "<small>S/N " + esc(it.serial) + "</small>" : "") + "</td><td>" + esc(it.loc || "") + '</td><td class="r num">' + (Number(it.qty) || 0) + "</td>" +
      (cnt ? '<td class="r num">' + c + '</td><td class="r num ' + (diff ? "neg" : "") + '">' + (diff > 0 ? "+" : "") + diff + "</td>" : "") + "</tr>";
  }).join("");
  h += L.length ? '<div class="table-wrap"><table><thead><tr><th><input type="checkbox" data-stpickall aria-label="전체 선택"></th><th>사진</th><th>바코드</th><th>브랜드</th><th>상품명</th><th>품번</th><th>위치</th><th class="r">재고</th>' + (cnt ? '<th class="r">실사</th><th class="r">차이</th>' : "") + "</tr></thead><tbody>" + body + "</tbody></table></div>"
    : '<div class="panel empty"><b>아직 등록된 재고가 없어요</b>위 칸을 누르고 브랜드 택 바코드를 찍거나, 자체 바코드를 발급하세요.</div>';
  return h;
}
function bind(root) {
  var inp = root.querySelector("#st-scan");
  if (inp) { if (!ERP.drawer()) inp.focus(); inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); var x = inp.value; inp.value = ""; onScan(x); } }); }
  root.querySelectorAll("[data-stmode]").forEach(function (b) { b.onclick = function () { v.stMode = b.dataset.stmode; if (v.stMode === "실사" && !D().count && ERP.canWrite("stock")) { D().count = { at: new Date().toISOString(), scans: {} }; save(); } ERP.render(); }; });
  root.querySelectorAll("[data-stedit]").forEach(function (tr) { var go = function (e) { if (e && e.target.closest("input")) return; open(D().items[tr.dataset.stedit]); }; tr.addEventListener("click", go); tr.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); }); });
  var all = root.querySelector("[data-stpickall]"); if (all) all.onchange = function () { root.querySelectorAll("[data-stpick]").forEach(function (c) { c.checked = all.checked; }); };
}
function picked() { var L = Array.from(document.querySelectorAll("[data-stpick]:checked")).map(function (c) { return D().items[c.dataset.stpick]; }).filter(Boolean); return L; }

/* ---------- 등록·수정 ---------- */
function open(it, code) {
  var isNew = !it || !it.code, fd = ERP.fd;
  it = it ? Object.assign({}, it) : { code: code || "", own: !code, brand: code ? "ET" : "CH", name: "", model: "", serial: "", opt: "", loc: v.stLoc || "", qty: v.stMode === "출고" ? 0 : 1, photo: "", memo: "" };
  var f = '<div class="fg">' +
    (it.own && isNew ? '<div class="fd full"><label>바코드</label><div style="padding:8px 0">저장하면 <b>RW-' + esc(it.brand) + '-번호</b>로 자동 발급돼요</div></div>' : fd("바코드", "code", "text", it.code, "full", isNew ? "" : " readonly")) +
    fd("품번 (넣고 Enter → 브랜드·상품명 자동)", "model", "text", it.model) + fd("사이즈·컬러 (Enter → 저장)", "opt", "text", it.opt) +
    '<div class="fd full" id="st-found" role="status" style="font-size:13px;color:#666;min-height:18px"></div>' +
    ERP.sel("브랜드", "brand", BRANDS, it.brand) + fd("상품명 (짧게, 라벨에 찍혀요)", "name", "text", it.name) +
    fd("시리얼·보증카드 번호", "serial", "text", it.serial) + fd("위치", "loc", "text", it.loc) + fd("재고 수량", "qty", "number", it.qty) + fd("메모", "memo", "text", it.memo, "full") +
    '<div class="fd full"><label for="st-photo">사진 (라벨이 떨어져도 찾을 수 있게)</label><input id="st-photo" type="file" accept="image/*" capture="environment"><div id="st-pv" style="margin-top:8px">' + (it.photo ? '<img src="' + it.photo + '" alt="상품 사진" style="width:120px;border-radius:8px">' : "") + "</div></div>" +
    (isNew ? "" : '<div class="fd full"><label>바코드 미리보기</label><div style="background:#fff;padding:8px;width:240px">' + barcodeSvg(it.code, 40) + "</div></div>") + "</div>";
  ERP.openDrawer(isNew ? (it.own ? "자체 바코드 발급" : "새 바코드 상품 등록") : "재고 상품 수정", f, "stock", it, isNew, { saveLabel: isNew && it.own ? "발급하고 저장" : "저장" });
}
function shrink(file) {
  return new Promise(function (res, rej) {
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () { var s = 240 / Math.max(img.width, img.height), c = document.createElement("canvas"); c.width = Math.round(img.width * Math.min(1, s)); c.height = Math.round(img.height * Math.min(1, s)); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.6)); };
    img.onerror = rej; img.src = url;
  });
}
ERP.forms.stock = {
  open: open,
  afterOpen: function (body, rec) {
    var mi = body.querySelector('[name="model"]'), oi = body.querySelector('[name="opt"]'), fo = body.querySelector("#st-found");
    var run = function () {
      var r = lookup(mi.value); if (!mi.value.trim()) return;
      if (!r) { fo.textContent = "ERP 기록에서 이 품번을 못 찾았어요 — 브랜드·상품명을 직접 넣어 주세요"; return; }
      var bs = body.querySelector('[name="brand"]'), nm = body.querySelector('[name="name"]');
      if (r.code && bs) bs.value = r.code;
      if (nm && !nm.value) nm.value = r.name;
      fo.textContent = "✔ 찾았어요 (" + r.src + "): " + (r.brandText || "") + " " + r.name;
    };
    if (mi) { if (!rec.model && !rec.own) setTimeout(function () { mi.focus(); }, 50);
      mi.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); run(); if (oi) oi.focus(); } });
      mi.addEventListener("change", run); }
    if (oi) oi.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); var sv = document.getElementById("d-save"); if (sv) sv.click(); } });
    var ph = body.querySelector("#st-photo");
    ph.onchange = async function () { if (!ph.files[0]) return; rec._photo = await shrink(ph.files[0]); body.querySelector("#st-pv").innerHTML = '<img src="' + rec._photo + '" alt="상품 사진" style="width:120px;border-radius:8px">'; };
  },
  commit: async function (body, o, st) {
    var d = D(), rec = st.rec;
    if (rec.own && st.isNew) { var b = o.brand || "ET"; d.seq[b] = (d.seq[b] || 0) + 1; o.code = "RW-" + b + "-" + String(d.seq[b]).padStart(4, "0"); while (d.items[o.code]) { d.seq[b]++; o.code = "RW-" + b + "-" + String(d.seq[b]).padStart(4, "0"); } }
    o.code = String(o.code || "").trim(); if (!o.code) throw new Error("바코드를 입력해 주세요.");
    if (st.isNew && d.items[o.code]) throw new Error("이미 등록된 바코드예요: " + o.code);
    var it = { code: o.code, own: !!rec.own, brand: o.brand, name: o.name, model: o.model, serial: o.serial, opt: o.opt, loc: String(o.loc || "").toUpperCase(), qty: Math.max(0, Number(o.qty) || 0), photo: rec._photo || rec.photo || "", memo: o.memo, at: new Date().toISOString() };
    d.items[it.code] = it;
    if (st.isNew && v.stMode === "실사") { if (!d.count) d.count = { at: new Date().toISOString(), scans: {} }; } if (st.isNew && d.count && v.stMode === "실사") d.count.scans[it.code] = (d.count.scans[it.code] || 0) + 1;
    await save(true);
    v.stMsg = (st.isNew ? "등록했어요: " : "수정했어요: ") + it.code + " " + label(it);
    if (st.isNew && it.own) setTimeout(function () { printLabels([it]); }, 300);
    return true;
  },
  remove: async function (rec) { delete D().items[rec.code]; await save(true); return true; }
};

/* ---------- 품번으로 ERP 기록(매입·소싱·매출·재고)에서 브랜드·상품명 찾기 ---------- */
function brandCode(t) {
  t = String(t || "").toLowerCase(); if (!t) return "";
  var KO2 = { MC: "몽클레르", AI: "알파", VW: "비비안", MK: "키츠네" };
  var EN = { CH: "chanel", HM: "hermes", LV: "louis", DI: "dior", GC: "gucci", PR: "prada", BV: "bottega", CL: "celine", YS: "saint laurent", TB: "thom", MM: "miu", FE: "fendi", BA: "balenciaga", LO: "loewe", BB: "burberry", MC: "moncler", AI: "alpha", CO: "chlo", HK: "hoka", AM: "ami ", MK: "kitsune", PB: "paraboot", VW: "vivienne" };
  for (var i = 0; i < BRANDS.length; i++) { var c = BRANDS[i][0]; if (c === "ET") continue; if (t.indexOf(BRANDS[i][1]) !== -1 || (EN[c] && t.indexOf(EN[c]) !== -1) || (KO2[c] && t.indexOf(KO2[c]) !== -1)) return c; }
  return "ET";
}
function lookup(model) {
  var an = function (x) { return String(x || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); };
  var k = an(model); if (k.length < 4) return null;
  var hit = function (x) { var n = an(x); return n && (n === k || (n.length >= 6 && n.indexOf(k) !== -1) || (k.length >= 6 && k.indexOf(n) !== -1 && n.length >= 6)); };
  var clean = function (t) { return String(t || "").replace(/\[[^\]]*\]/g, "").replace(/\([^)]*\)\s*$/, "").replace(/\s+/g, " ").trim().slice(0, 40); };
  var mk = function (b, name, src) { var bt = b || ""; return { code: brandCode(bt + " " + name), brandText: bt, name: clean(name), src: src }; };
  var own = items().find(function (it) { return hit(it.model) && it.name; }); if (own) return { code: own.brand, brandText: brandName(own.brand), name: own.name, src: "재고" };
  var pi = ERP.DATA.price_items ? ERP.list("price_items").find(function (r) { return hit(r.sku) || hit(r.name && (r.name.match(/[A-Z0-9][A-Z0-9-]{5,}/i) || [""])[0]); }) : null;
  if (pi) return mk(pi.brand, (pi.extra && pi.extra.nameOverride) || pi.name || pi.sku, "소싱");
  var pu = ERP.list("purchases").find(function (r) { return hit(r.itemCode); }); if (pu && (pu.productName || (pu.extra && pu.extra.name))) return mk(pu.brand, pu.productName || pu.extra.name, "매입");
  var sa = ERP.list("sales").filter(function (r) { return hit(r.itemCode) || (k.length >= 6 && an(r.productName).indexOf(k) !== -1); }).pop();
  if (sa) return mk(sa.brand, sa.productName, "매출");
  if (pu) return mk(pu.brand, pu.brand || "", "매입");
  return null;
}

/* ---------- 라벨 출력 (40×20mm) ---------- */
function printLabels(L, locs) {
  var cells = L.map(function (it) {
    return '<div class="lb"><div class="bc">' + barcodeSvg(it.code, 40) + '</div><div class="cd">' + esc(it.code) + '</div><div class="nm">' + esc((locs ? "보관 위치" : brandName(it.brand) + " " + (it.name || it.model || "")).slice(0, 22)) + "</div></div>";
  }).join("");
  var w = window.open("", "_blank");
  if (!w) { ERP.toast("팝업이 막혔어요. 주소창 오른쪽에서 팝업을 허용해 주세요."); return; }
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>라벨 출력</title><style>@page{size:40mm 20mm;margin:0}*{box-sizing:border-box}body{margin:0;font-family:"Malgun Gothic",sans-serif}' +
    '.lb{width:40mm;height:20mm;padding:1.2mm 2mm;page-break-after:always;overflow:hidden;display:flex;flex-direction:column;align-items:center}' +
    '.bc svg{width:36mm;height:9mm;display:block}.cd{font-size:8pt;font-weight:700;letter-spacing:.3px;margin-top:.6mm}.nm{font-size:6.5pt;white-space:nowrap;overflow:hidden;max-width:36mm}' +
    '@media screen{body{background:#eee;padding:10px}.lb{background:#fff;margin:0 0 6px;outline:1px dashed #aaa}.tip{font:13px sans-serif;margin-bottom:10px}}@media print{.tip{display:none}}</style></head><body>' +
    '<div class="tip">인쇄 설정: 프린터 4B-2054N · 용지 40×20mm · 여백 없음 · 배율 100% (기본값). ' + L.length + '장</div>' + cells + "<script>setTimeout(function(){print()},400)<\/script></body></html>");
  w.document.close();
}
function expandLocs(txt) {
  var out = [];
  String(txt || "").split(/[,\s]+/).forEach(function (part) {
    var m = part.toUpperCase().match(/^([A-Z]+)-(\d+)~(?:[A-Z]+-)?(\d+)$/);
    if (m) { for (var i = +m[2]; i <= +m[3] && out.length < 300; i++) out.push(m[1] + "-" + String(i).padStart(m[2].length, "0")); }
    else if (part.trim()) out.push(part.trim().toUpperCase());
  });
  return out;
}

/* ---------- 버튼 ---------- */
ERP.acts.stnew = function () { open(); };
ERP.acts.stlocclear = function () { v.stLoc = ""; v.stMsg = "위치를 해제했어요"; ERP.render(); };
ERP.acts.stlabel = function () { var L = picked(); if (!L.length) { ERP.toast("표에서 라벨을 뽑을 상품에 체크해 주세요."); return; } printLabels(L); };
ERP.acts.stloclabel = function () {
  var d = D(), t = window.prompt("출력할 위치를 적어 주세요 (예: A-01~A-05, B-01~B-03)", d.locs || "A-01~A-05"); if (t == null) return;
  var L = expandLocs(t); if (!L.length) return; d.locs = t; save();
  printLabels(L.map(function (x) { return { code: "LOC-" + x }; }), true);
};
ERP.acts.stfinish = function () {
  var d = D(), c = d.count; if (!c) return;
  var diffs = items().map(function (it) { return { it: it, n: c.scans[it.code] || 0 }; }).filter(function (x) { return x.n !== (Number(x.it.qty) || 0); });
  var rows = diffs.map(function (x) { var df = x.n - (Number(x.it.qty) || 0); return "<tr><td>" + esc(x.it.code) + "</td><td>" + esc(label(x.it)) + '</td><td class="r num">' + (x.it.qty || 0) + '</td><td class="r num">' + x.n + '</td><td class="r num neg">' + (df > 0 ? "+" : "") + df + "</td></tr>"; }).join("");
  var html = '<p>' + (diffs.length ? "장부와 실물이 다른 상품 <b>" + diffs.length + "개</b>예요. 실사에서 0개인 상품은 찍지 못한(없는) 상품이에요." : "장부와 실물이 모두 같아요 👍") + "</p>" +
    (diffs.length ? '<div class="table-wrap"><table><thead><tr><th>바코드</th><th>상품</th><th class="r">장부</th><th class="r">실사</th><th class="r">차이</th></tr></thead><tbody>' + rows + "</tbody></table></div>" : "");
  ERP.openDrawer("실사 마감", html, "stockfin", c, true, { saveLabel: "실사 수량으로 재고 반영" });
};
ERP.forms.stockfin = { open: function () {}, commit: async function () { var d = D(), c = d.count; items().forEach(function (it) { it.qty = c.scans[it.code] || 0; }); d.lastCount = c.at; d.count = null; v.stMode = "조회"; await save(true); v.stMsg = "실사 결과를 재고에 반영했어요."; return true; } };
ERP.acts.stcancel = function () { D().count = null; v.stMode = "조회"; save(); v.stMsg = "실사를 취소했어요 (재고는 그대로)."; ERP.render(); };
ERP.acts.stxls = function () {
  var A = [["바코드", "자체발급", "브랜드", "상품명", "품번", "시리얼", "사이즈·컬러", "위치", "재고", "메모", "수정일"]];
  items().forEach(function (it) { A.push([it.code, it.own ? "Y" : "", brandName(it.brand), it.name, it.model, it.serial, it.opt, it.loc, Number(it.qty) || 0, it.memo, (it.at || "").slice(0, 10)]); });
  var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(A), "실물재고"); XLSX.writeFile(wb, "로우나_실물재고_" + U.today() + ".xlsx");
};
ERP.acts.stsabang = function () {
  var sk = S.SET.sabang_skus;
  if (!sk || !sk.skus) { ERP.toast("네이버 자동소싱 메뉴에서 사방넷 파일을 먼저 올려 주세요."); return; }
  var set = {}; sk.skus.forEach(function (x) { set[norm(x)] = 1; });
  var inS = [], notS = [];
  items().forEach(function (it) { var k = norm(it.model); (k && (set[k] || Object.keys(set).some(function (s) { return k.length >= 6 && s.indexOf(k) !== -1; })) ? inS : notS).push(it); });
  var li = function (L) { return L.map(function (it) { return "<li>" + esc(it.code + " · " + label(it) + (it.model ? " · " + it.model : " · 품번 없음")) + " · 재고 " + (it.qty || 0) + "</li>"; }).join(""); };
  var html = "<p>사방넷 파일: " + esc(sk.file || "") + " (" + esc((sk.at || "").slice(0, 10)) + ")</p><h3>사방넷에 있는 상품 " + inS.length + "개</h3><ul>" + li(inS) + "</ul><h3>사방넷에 없는 상품 " + notS.length + "개 — 판매 등록 필요</h3><ul>" + li(notS) + "</ul><p><small>품번으로 대조해요. 품번이 비어 있으면 '없음'으로 나와요.</small></p>";
  ERP.openDrawer("사방넷 대조", html, "stockview", {}, true, { saveLabel: "닫기" });
};
ERP.forms.stockview = { open: function () {}, commit: async function () { return true; } };

ERP.page({ id: "stock", title: "재고실사", wide: true, render: render, bind: bind,
  live: function () { var ae = document.activeElement; if (ae && ae.matches && ae.matches("input:not(#st-scan),select")) return; if (!ERP.drawer()) ERP.render(); },
  badge: function () { return D().count ? "실사중" : ""; } });
})();
