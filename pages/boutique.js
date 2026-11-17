/* 메뉴: 계산기 › 부티크 오더 계산기 (대표님 지시 2026-11-17)
   - 부티크 오더시트(엑셀) 업로드 → 열 자동 인식(브랜드·품번·상품명·사이즈·수량·코스트·리테일), 사이즈가 가로로 펼쳐진 시트도 인식
   - 한국도착가 = 코스트 × 마크업 × 환율 × (1+관세) × (1+부가세)  ※운송비 제외 (대표님 식)
     FTA 기본 Y(관세 0%). 가방·시계는 (과세가격+관세) 200만원 초과분에 개소세 20% + 교육세(개소세의 30%)
   - 선적: 매입 EUR 기준 한도(기본 €6,000)로 위에서부터 나눔. 한 줄이 넘치면 수량을 쪼개 다음 선적으로
   - [크림 시세 비교] → 열무 크림도매 화면(kream_wholesale, 도매처 '부티크 ○○')에 한국도착가를 도매가로 넣고 크림 조회
     → 이 화면에서 크림가·실이익·이익률·판정(추천/검토/비추천)을 같이 보여줌 (계산: calc.js kream())
   - 저장: app_settings 'boutique_calc' (설정 + 현재 오더) */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, C = ERP.C, esc = U.esc, won = U.won, pct = U.pct, num = U.num;
var v = ERP.view, KEY = "boutique_calc";
var CATS = [["가방", 0.08, 1], ["지갑·액세서리", 0.08, 0], ["스카프·선글라스", 0.08, 0], ["시계", 0.08, 1], ["의류", 0.13, 0], ["신발", 0.13, 0], ["벨트", 0.13, 0], ["기타", 0.08, 0]];
var DEF = { fx: 1650, markup: 1.1, fta: "Y", limit: 6000, vat: 0.1, gxBase: 2000000, gxRate: 0.2, edu: 0.3, rates: {}, brandMk: {} };
CATS.forEach(function (c) { DEF.rates[c[0]] = c[1]; });

function D() { var d = S.SET[KEY]; if (!d || typeof d !== "object") d = {}; var set = Object.assign({}, DEF, d.set || {}); set.rates = Object.assign({}, DEF.rates, (d.set || {}).rates || {}); set.brandMk = Object.assign({}, (d.set || {}).brandMk || {}); return { set: set, order: d.order || { name: "", date: U.today(), rows: [] } }; }
var saveT = null;
function save(d, now) { S.SET[KEY] = d; clearTimeout(saveT); var go = async function () { var res = await S.sb.from("app_settings").upsert({ key: KEY, value: d }); if (res.error) ERP.toast(ERP.errMsg(res.error)); }; if (now) return go(); saveT = setTimeout(go, 600); }

/* ---------- 숫자: 1.234,50 / 1,234.50 / €1234 모두 ---------- */
function eur(x) {
  if (typeof x === "number") return x; var s = String(x == null ? "" : x).replace(/[^\d.,\-]/g, ""); if (!s) return 0;
  var c = s.lastIndexOf(","), d = s.lastIndexOf(".");
  if (c > -1 && d > -1) s = c > d ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (c > -1) s = /,\d{3}$/.test(s) && s.split(",").length > 1 && s.length - c === 4 ? s.replace(/,/g, "") : s.replace(",", ".");
  else if (d > -1 && /\.\d{3}$/.test(s) && s.split(".").length > 2) s = s.replace(/\./g, "");
  return Number(s) || 0;
}

/* ---------- 엑셀 읽기 ---------- */
var FIELDS = [
  ["brand", "브랜드", ["brand", "marca", "designer", "maison", "브랜드"]],
  ["sku", "품번", ["sku", "model", "modello", "article", "articolo", "codice", "code", "style", "reference", "ref", "품번", "모델"]],
  ["name", "상품명", ["description", "descrizione", "productname", "product", "name", "item", "상품명", "상품"]],
  ["color", "컬러", ["colour", "color", "colore", "컬러", "색상"]],
  ["cat", "카테고리", ["category", "categoria", "type", "tipo", "dept", "카테고리", "품목"]],
  ["size", "사이즈", ["size", "taglia", "misura", "사이즈"]],
  ["qty", "수량", ["quantity", "qty", "q.ty", "quantità", "pcs", "pz", "units", "수량"]],
  ["retail", "리테일", ["retail", "rrp", "msrp", "pvp", "prezzopubblico", "publicprice", "리테일", "소비자가"]],
  ["cost", "코스트", ["cost", "wholesale", "whs", "netprice", "prezzonetto", "price", "prezzo", "코스트", "도매가", "매입가"]]
];
var NOT = /ean|barcode|upc|image|photo|foto|url|link|total|totale|합계|gender|season|stagione/;
var SIZE_RE = /^(xxxs|xxs|xs|s|m|l|xl|xxl|xxxl|tu|os|one ?size|uni|u|(it|eu|uk|us|fr)?\s?\d{1,2}([.,]5)?\+?)$/i;
function hnorm(h) { return String(h || "").toLowerCase().replace(/\s+/g, ""); }
function autoMap(head) {
  var map = {}, used = {};
  FIELDS.forEach(function (f) {
    for (var i = 0; i < head.length; i++) { var h = hnorm(head[i]); if (!h || used[i] || NOT.test(h) || SIZE_RE.test(String(head[i]).trim())) continue;
      if (f[2].some(function (k) { return h.indexOf(k) !== -1; })) { map[f[0]] = i; used[i] = 1; break; } }
  });
  var runs = []; head.forEach(function (h, i) { if (!used[i] && SIZE_RE.test(String(h || "").trim())) runs.push(i); });
  if (map.size == null && runs.length >= 2) map.sizeRun = runs;
  return map;
}
function findHeader(aoa) { var best = 0, at = 0; aoa.slice(0, 25).forEach(function (r, i) { var m = autoMap(r), n = Object.keys(m).length + (m.sizeRun ? 1 : 0); if (n > best) { best = n; at = i; } }); return at; }
function guessCat(t) {
  t = String(t || "").toLowerCase();
  if (/watch|orologio|시계/.test(t)) return "시계";
  if (/wallet|portafogli|card ?holder|cardholder|porta ?carte|key|pouch|지갑|카드|키링|charm|bracelet|necklace|earring|ring\b|jewel|액세서리/.test(t)) return "지갑·액세서리";
  if (/belt|cintur|벨트/.test(t)) return "벨트";
  if (/scarf|sciarp|foulard|stole|shawl|sunglass|occhial|eyewear|스카프|머플러|선글라스/.test(t)) return "스카프·선글라스";
  if (/shoe|sneaker|scarp|loafer|mocassin|boot|stival|sandal|pump|décolleté|decollete|mule|slide|ballerin|신발|스니커즈|로퍼|부츠|샌들|뮬/.test(t)) return "신발";
  if (/bag|borsa|tote|shoulder|crossbody|clutch|backpack|zaino|hobo|bucket|백|가방|토트|숄더|크로스|클러치|백팩/.test(t)) return "가방";
  if (/shirt|camicia|t-shirt|tee|dress|abito|jacket|giacca|coat|cappotto|blazer|pant|pantal|trouser|jean|skirt|gonna|knit|maglia|sweater|cardigan|hoodie|felpa|top|polo|short|vest|gilet|셔츠|티셔츠|원피스|자켓|재킷|코트|팬츠|바지|스커트|니트|가디건|후드/.test(t)) return "의류";
  return "기타";
}
function rowsFromSheet(aoa, hr, map) {
  var out = [], get = function (r, k) { return map[k] == null || map[k] === "" ? "" : r[map[k]]; };
  aoa.slice(hr + 1).forEach(function (r) {
    if (!r || !r.some(function (c) { return String(c).trim(); })) return;
    var cost = eur(get(r, "cost")); if (!cost) return;
    var base = { brand: String(get(r, "brand")).trim(), sku: String(get(r, "sku")).trim(), name: String(get(r, "name")).trim(), color: String(get(r, "color")).trim(), cost: cost, retail: eur(get(r, "retail")) };
    if (!base.sku && !base.name) return;
    base.cat = guessCat(get(r, "cat") + " " + base.name);
    if (map.sizeRun) { map.sizeRun.forEach(function (ci) { var q = eur(r[ci]); if (q > 0) out.push(Object.assign({ id: U.uid(), size: String(aoa[hr][ci]).trim(), qty: Math.round(q) }, base)); }); }
    else out.push(Object.assign({ id: U.uid(), size: String(get(r, "size")).trim() || "F", qty: Math.max(1, Math.round(eur(get(r, "qty")) || 1)) }, base));
  });
  return out;
}

/* ---------- 브랜드별 마크업 (부티크 '마크업 시트': 브랜드 + 마크업만 있는 시트) ----------
   값: "10%" / "+10" / 10 → ×1.10,  0.1 → ×1.10,  1.12 → ×1.12 */
function bkey(b) { return String(b || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9가-힣]/g, ""); }
function mkVal(x) { var s = String(x == null ? "" : x).trim(); if (!s) return null; var n = eur(s); if (!n) return null; if (/%/.test(s) || n >= 3) return 1 + n / 100; if (n < 1) return 1 + n; return n; }
function brandMk(set, brand) { var m = set.brandMk || {}, k = bkey(brand); if (!k) return null; if (m[k] != null) return num(m[k]); var hit = Object.keys(m).find(function (x) { return k.indexOf(x) === 0 || x.indexOf(k) === 0; }); return hit ? num(m[hit]) : null; }
var MK_B = /brand|marca|designer|maison|브랜드/, MK_M = /markup|mark-up|ricarico|maggiorazione|^%$|마크업|percent|margin/, MK_S = /sku|model|modello|article|articolo|codice|품번|style|price|prezzo|cost/;
function isMkSheet(aoa) { for (var i = 0; i < Math.min(25, aoa.length); i++) { var head = (aoa[i] || []).map(hnorm); if (head.some(function (h) { return MK_B.test(h); }) && head.some(function (h) { return MK_M.test(h); }) && !head.some(function (h) { return MK_S.test(h); })) return i; } return -1; }
function readMk(aoa, hr) { var head = (aoa[hr] || []).map(hnorm), bi = head.findIndex(function (h) { return MK_B.test(h); }), mi = head.findIndex(function (h) { return MK_M.test(h); }), out = {};
  aoa.slice(hr + 1).forEach(function (r) { var b = bkey(r[bi]), m = mkVal(r[mi]); if (b && m) out[b] = Math.round(m * 10000) / 10000; }); return out; }

/* ---------- 계산 ---------- */
function catOf(n) { return CATS.find(function (c) { return c[0] === n; }) || CATS[CATS.length - 1]; }
function calc(r, set) {
  var bm = brandMk(set, r.brand), mk = r.markup !== "" && r.markup != null ? num(r.markup) : bm != null ? bm : num(set.markup), fta = (r.fta || set.fta) === "Y";
  var unitEur = num(r.cost) * mk, krw = unitEur * num(set.fx), rate = fta ? 0 : num(set.rates[r.cat] != null ? set.rates[r.cat] : catOf(r.cat)[1]), duty = krw * rate;
  var gx = catOf(r.cat)[2] && krw + duty > num(set.gxBase) ? (krw + duty - num(set.gxBase)) * num(set.gxRate) * (1 + num(set.edu)) : 0;
  var vat = (krw + duty + gx) * num(set.vat), landed = krw + duty + gx + vat;
  return { mk: mk, mkSrc: r.markup !== "" && r.markup != null ? "직접" : bm != null ? "브랜드" : "기본", fta: fta, unitEur: unitEur, lineEur: unitEur * num(r.qty), krw: krw, rate: rate, duty: duty, gx: gx, vat: vat, landed: Math.round(landed), off: num(r.retail) ? unitEur / num(r.retail) : null };
}
/* 선적 나누기: 매입 EUR 누적이 한도를 넘기 전에 다음 선적. 한 줄이 넘치면 수량을 쪼갬 */
function ships(rows, set) {
  var lim = num(set.limit) || Infinity, cur = 1, used = 0, alloc = {}, tot = {};
  rows.forEach(function (r) {
    var u = calc(r, set).unitEur, left = num(r.qty); alloc[r.id] = [];
    if (!u) return;
    while (left > 0) {
      var fit = Math.floor((lim - used) / u + 1e-9);
      if (fit <= 0) { if (used === 0) fit = 1; else { cur++; used = 0; continue; } }   /* 1개가 한도보다 비싸면 혼자 1선적 */
      var n = Math.min(fit, left); alloc[r.id].push([cur, n]); used += n * u; left -= n;
      tot[cur] = tot[cur] || { eur: 0, qty: 0, krw: 0 }; tot[cur].eur += n * u; tot[cur].qty += n; tot[cur].krw += n * calc(r, set).landed;
    }
  });
  return { alloc: alloc, tot: tot };
}

/* ---------- 크림 비교 ---------- */
function SUP(o) { return "부티크 " + (o.name || "오더"); }
function kRow(id) { var hit = null; ERP.list("kream_wholesale").forEach(function (x) { if ((x.extra || {}).bq === id) hit = x; }); return hit; }
function premium(r) { var t = ((r.brand || "") + " " + (r.name || "")).toUpperCase(); return (/CHANEL|샤넬|HERMES|HERMÈS|에르메스/.test(t) && /백|BAG|토트|숄더|클러치|버킨|켈리|플랩/.test(t)) || /ROLEX|롤렉스|AUDEMARS|오데마|PATEK|파텍|VACHERON|바쉐론/.test(t); }
function kc(r, landed) {
  var k = kRow(r.id); if (!k || !num(k.kreamPrice)) return { k: k };
  var p = premium(r), rate = p ? 0.03 : (S.SET.kream_fee_rate == null ? 0.06 : Number(S.SET.kream_fee_rate)), base = p ? 20000 : (S.SET.kream_fee_base == null ? 2500 : num(S.SET.kream_fee_base)), cap = S.SET.kream_fee_cap == null ? 300000 : num(S.SET.kream_fee_cap);
  return { k: k, c: C.kream(num(k.kreamPrice), landed, rate, cap, base) };
}
function vpill(x) { if (!x.k) return '<span class="pill p-mute">비교 전</span>'; if (!x.c) return '<span class="pill p-mute">' + (num(x.k.kreamPrice) ? "" : "크림가 없음") + "</span>"; return x.c.verdict === "추천" ? '<span class="pill p-good">✓ 추천</span>' : x.c.verdict === "검토" ? '<span class="pill p-warn">△ 검토</span>' : '<span class="pill p-crit">✕ 비추천</span>'; }

/* ---------- 화면 ---------- */
function render() {
  var d = D(), set = d.set, o = d.order, rows = o.rows, sh = ships(rows, set), w = ERP.canWrite("kream_wholesale");
  var filt = v.bqF || "all", list = rows.map(function (r) { var c = calc(r, set); return { r: r, c: c, x: kc(r, c.landed) }; });
  if (filt === "rec") list = list.filter(function (z) { return z.x.c && z.x.c.verdict === "추천"; });
  if (filt === "ok") list = list.filter(function (z) { return z.x.c && z.x.c.verdict !== "비추천"; });
  if (v.bqSort === "rate") list.sort(function (a, b) { return ((b.x.c || {}).rate || -9) - ((a.x.c || {}).rate || -9); });
  var totEur = 0, totKrw = 0, totQ = 0, nRec = 0, realSum = 0;
  rows.forEach(function (r) { var c = calc(r, set), x = kc(r, c.landed); totEur += c.lineEur; totKrw += c.landed * num(r.qty); totQ += num(r.qty); if (x.c && x.c.verdict === "추천") { nRec++; realSum += x.c.real * num(r.qty); } });
  var nShip = Object.keys(sh.tot).length;
  var h = '<div class="head"><div><h1>부티크 오더 계산기</h1><p>시트 2종: ① 브랜드별 마크업 ② 상품 가격(코스트) · 한국도착가 = 코스트 × 마크업 × 환율 × (1+관세) × (1+부가세) · 운송비 제외 · 크림 시세와 비교해 살 상품을 골라요</p></div>' +
    '<div class="tools">' + (w ? '<button class="btn pri" data-act="bqup">📄 부티크 엑셀 올리기</button>' + (rows.length ? '<button class="btn" data-act="bqkream">🔎 크림 시세 비교</button><button class="btn" data-act="bqgokream">열무 크림도매에서 보기</button><button class="btn" data-act="bqclear">새 오더</button>' : "") : "") + '<input type="file" id="bq-file" accept=".xlsx,.xls,.csv" hidden></div></div>';
  /* 설정 */
  h += '<div class="panel"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">' +
    sfd("부티크/오더 이름", "o:name", o.name, "text") + sfd("오더일", "o:date", o.date, "date") + sfd("환율 (EUR→원)", "s:fx", set.fx) + sfd("기본 마크업 (배수)", "s:markup", set.markup) +
    '<div class="fd"><label>FTA 기본값</label><select class="ctl" data-bs="s:fta"><option' + (set.fta === "Y" ? " selected" : "") + '>Y</option><option' + (set.fta === "N" ? " selected" : "") + ">N</option></select></div>" +
    sfd("선적 한도 (EUR)", "s:limit", set.limit) + sfd("부가세율", "s:vat", set.vat) +
    '</div><details style="margin-top:8px"' + (Object.keys(set.brandMk).length ? "" : " open") + '><summary>브랜드별 마크업 (' + Object.keys(set.brandMk).length + '개) — 마크업 시트를 올리면 자동 저장, 상품 가격 시트에 브랜드별로 적용</summary><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">' + Object.keys(set.brandMk).sort().map(function (k) { return '<span class="pill">' + esc(k) + ' ×<input class="ctl sm num" style="width:60px" data-bm="' + esc(k) + '" value="' + esc(set.brandMk[k]) + '">' + (w ? '<button class="btn sm" data-bmdel="' + esc(k) + '" aria-label="삭제">✕</button>' : "") + "</span>"; }).join("") + (w ? '<button class="btn sm" data-act="bqmkadd">+ 브랜드 추가</button>' : "") + '</div><p class="muted" style="font-size:12px">우선순위: 줄에 직접 넣은 마크업 › 브랜드별 마크업 › 기본 마크업. 10% 마크업 = 1.1</p></details>' +
    '<details style="margin-top:8px"><summary>품목별 관세율 (FTA N일 때만 적용)</summary><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">' + CATS.map(function (c) { return sfd(c[0] + (c[2] ? " · 개소세" : ""), "r:" + c[0], set.rates[c[0]]); }).join("") + '</div><p class="muted" style="font-size:12px">가방·지갑·시계·스카프 8%, 의류·신발 13% — 비드바이 수입통관 안내·glasswallet 관세율표 기준. 정확한 세율은 HS코드별 관세청 확인. 6,000유로 초과 선적은 수출자가 인증수출자여야 FTA 원산지신고가 유효(한국무역협회).</p></details></div>';
  /* 요약 */
  h += '<div class="tiles">' + ERP.tile("총 수량", won(totQ) + "개", rows.length + "줄") + ERP.tile("매입 합계", "€" + won(totEur), "코스트×마크업") + ERP.tile("한국도착가 합계", won(totKrw) + "원", "운송비 제외") + ERP.tile("선적", nShip + "건", "한도 €" + won(set.limit)) + ERP.tile("크림 추천", nRec + "줄", nRec ? "실이익 합계 " + won(realSum) + "원" : "크림 시세 비교 후 표시") + "</div>";
  if (nShip) h += '<div class="panel"><b>선적별</b><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">' + Object.keys(sh.tot).map(function (k) { var t = sh.tot[k], over = t.eur > num(set.limit); return '<span class="pill ' + (over ? "p-crit" : "p-good") + '">' + k + "차 · " + t.qty + "개 · €" + won(t.eur) + " · " + won(t.krw) + "원" + (over ? " · 1개가 한도 초과" : "") + "</span>"; }).join("") + "</div></div>";
  if (!rows.length) return h + '<div class="panel empty"><b>부티크 엑셀을 올려 주세요</b>① 브랜드별 마크업 시트(브랜드·마크업) → 마크업 저장 ② 상품 가격 시트 → 브랜드 마크업·환율·관세·부가세를 붙여 한국도착가 자동 계산.<br>브랜드·품번·상품명·사이즈·수량·코스트·리테일 열을 자동으로 찾아요. 사이즈가 가로로 펼쳐진 시트(38·39·40… 칸에 수량)도 읽어요.</div>';
  h += '<div class="tools" style="margin:8px 0">' + ERP.chips("data-bqf", filt, [["all", "전체"], ["ok", "추천+검토"], ["rec", "추천만"]]) + '<span style="flex:1"></span>' + ERP.chips("data-bqs", v.bqSort || "", [["", "시트 순서"], ["rate", "이익률 높은 순"]]) + "</div>";
  var body = list.map(function (z) {
    var r = z.r, c = z.c, x = z.x, al = (sh.alloc[r.id] || []).map(function (a) { return a[1] === num(r.qty) ? a[0] + "차" : a[0] + "차×" + a[1]; }).join(", ");
    var kp = x.k && num(x.k.kreamPrice), kurl = x.k && x.k.kreamUrl;
    return "<tr><td><b>" + esc(r.brand) + "</b><br>" + esc(r.sku) + (r.color ? " · " + esc(r.color) : "") + '<br><small class="muted">' + esc(r.name).slice(0, 40) + "</small></td>" +
      '<td><select class="ctl sm" data-bc="' + esc(r.id) + ':cat">' + CATS.map(function (k) { return "<option" + (k[0] === r.cat ? " selected" : "") + ">" + k[0] + "</option>"; }).join("") + "</select></td>" +
      '<td>' + esc(r.size) + '</td><td class="r"><input class="ctl sm num" style="width:56px" data-bc="' + esc(r.id) + ':qty" value="' + esc(r.qty) + '"></td>' +
      '<td class="r">€' + won2(r.cost) + (r.retail ? '<br><small class="muted">리테일 €' + won2(r.retail) + (c.off ? " · " + pct(c.off) : "") + "</small>" : "") + "</td>" +
      '<td class="r"><input class="ctl sm num" style="width:56px" placeholder="' + esc(c.mk) + '" title="' + c.mkSrc + ' 마크업" data-bc="' + esc(r.id) + ':markup" value="' + esc(r.markup == null ? "" : r.markup) + '"><br><small class="muted">' + c.mkSrc + "</small></td>" +
      '<td><select class="ctl sm" data-bc="' + esc(r.id) + ':fta"><option value=""' + (!r.fta ? " selected" : "") + ">기본(" + set.fta + ")</option><option" + (r.fta === "Y" ? " selected" : "") + ">Y</option><option" + (r.fta === "N" ? " selected" : "") + ">N</option></select></td>" +
      '<td class="r">€' + won2(c.unitEur) + '</td><td class="r">' + (c.duty ? won(c.duty) : "–") + (c.gx ? '<br><small class="muted">개소세 ' + won(c.gx) + "</small>" : "") + '</td><td class="r"><b>' + won(c.landed) + "</b></td><td>" + al + "</td>" +
      '<td class="r">' + (kp ? (kurl ? '<a href="' + esc(kurl) + '" target="_blank" rel="noopener">' + won(kp) + "</a>" : won(kp)) : "–") + "</td>" +
      '<td class="r">' + (x.c ? won(x.c.real) + "<br><small>" + pct(x.c.rate) + "</small>" : "–") + '</td><td class="r">' + (x.c ? won(x.c.breakeven) : "–") + "</td><td>" + vpill(x) + "</td>" +
      (w ? '<td><button class="btn sm" data-bdel="' + esc(r.id) + '" aria-label="줄 삭제">✕</button></td>' : "<td></td>") + "</tr>";
  }).join("");
  h += '<div class="table-wrap"><table style="min-width:1500px"><thead><tr><th>상품</th><th>품목</th><th>사이즈</th><th class="r">수량</th><th class="r">코스트</th><th class="r">마크업</th><th>FTA</th><th class="r">매입단가</th><th class="r">관세·개소세</th><th class="r">한국도착가(개당)</th><th>선적</th><th class="r">크림가</th><th class="r">실이익 · 이익률</th><th class="r">손익분기 크림가</th><th>판정</th><th></th></tr></thead><tbody>' + (body || '<tr><td colspan="16" class="empty">조건에 맞는 줄이 없어요</td></tr>') + "</tbody></table></div>";
  h += '<p class="muted" style="font-size:12px">크림 판정은 열무 크림도매와 같은 식(calc.js kream(): 판매가/1.1 − 수수료×1.1 − 한국도착가/1.1, 이익률 8%↑ 추천·3~8% 검토). 한국도착가의 수입부가세는 매입세액공제 전제. 개소세·교육세는 공제되지 않지만 이 식에선 /1.1로 함께 나눠져 실이익이 아주 조금 높게 나올 수 있어요(추측 아님: 식 구조상).</p>';
  return h;
}
function won2(n) { return (Math.round(num(n) * 100) / 100).toLocaleString("ko-KR", { maximumFractionDigits: 2 }); }
function sfd(label, key, val, type) { return '<div class="fd"><label>' + esc(label) + '</label><input class="ctl' + (type ? "" : " num") + '" style="width:' + (type === "text" ? 160 : 110) + 'px" type="' + (type || "text") + '"' + (type ? "" : ' inputmode="decimal"') + ' data-bs="' + esc(key) + '" value="' + esc(val == null ? "" : val) + '"></div>'; }

function bind(root) {
  root.querySelectorAll("[data-bs]").forEach(function (el) { el.onchange = function () {
    var d = D(), k = el.dataset.bs.split(":"), val = el.value;
    if (k[0] === "o") d.order[k[1]] = val; else if (k[0] === "r") d.set.rates[k[1]] = eur(val); else d.set[k[1]] = k[1] === "fta" ? val : eur(val);
    save({ set: d.set, order: d.order }); ERP.render(); }; });
  root.querySelectorAll("[data-bc]").forEach(function (el) { el.onchange = function () {
    var d = D(), k = el.dataset.bc.split(":"), r = d.order.rows.find(function (x) { return x.id === k[0]; }); if (!r) return;
    r[k[1]] = k[1] === "qty" ? Math.max(0, Math.round(eur(el.value))) : k[1] === "markup" ? (el.value === "" ? null : eur(el.value)) : el.value;
    save({ set: d.set, order: d.order }); ERP.render(); }; });
  root.querySelectorAll("[data-bdel]").forEach(function (el) { el.onclick = function () { var d = D(); d.order.rows = d.order.rows.filter(function (x) { return x.id !== el.dataset.bdel; }); save({ set: d.set, order: d.order }); ERP.render(); }; });
  root.querySelectorAll("[data-bm]").forEach(function (el) { el.onchange = function () { var d = D(), m = mkVal(el.value); if (m) d.set.brandMk[el.dataset.bm] = m; save({ set: d.set, order: d.order }); ERP.render(); }; });
  root.querySelectorAll("[data-bmdel]").forEach(function (el) { el.onclick = function () { var d = D(); delete d.set.brandMk[el.dataset.bmdel]; save({ set: d.set, order: d.order }); ERP.render(); }; });
  root.querySelectorAll("[data-bqf]").forEach(function (el) { el.onclick = function () { v.bqF = el.dataset.bqf; ERP.render(); }; });
  root.querySelectorAll("[data-bqs]").forEach(function (el) { el.onclick = function () { v.bqSort = el.dataset.bqs; ERP.render(); }; });
  var fi = root.querySelector("#bq-file"); if (fi) fi.onchange = function () { if (fi.files[0]) upload(fi.files[0]); fi.value = ""; };
}

async function upload(file) {
  try {
    var wb = XLSX.read(await file.arrayBuffer(), { type: "array" }), sn = wb.SheetNames[0];
    if (wb.SheetNames.length > 1) { var pick = prompt("시트가 " + wb.SheetNames.length + "개예요. 번호를 입력하세요:\n" + wb.SheetNames.map(function (n, i) { return (i + 1) + ". " + n; }).join("\n"), "1"); if (pick == null) return; sn = wb.SheetNames[Math.max(0, Math.min(wb.SheetNames.length - 1, (parseInt(pick, 10) || 1) - 1))]; }
    var aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: "" }), mh = isMkSheet(aoa);
    if (mh >= 0) {   /* ① 마크업 시트 */
      var mk = readMk(aoa, mh), ks = Object.keys(mk); if (!ks.length) { ERP.toast("브랜드별 마크업 줄을 찾지 못했어요."); return; }
      if (!confirm("브랜드별 마크업 시트로 읽었어요 (" + ks.length + "개 브랜드)\n예: " + ks.slice(0, 5).map(function (k) { return k + " ×" + mk[k]; }).join(", ") + "\n저장할까요? 같은 브랜드는 새 값으로 바뀌어요.")) return;
      var dm = D(); dm.set.brandMk = Object.assign({}, dm.set.brandMk, mk); await save({ set: dm.set, order: dm.order }, true); ERP.render(); ERP.toast(ks.length + "개 브랜드 마크업을 저장했어요. 이제 상품 가격 시트를 올리면 자동으로 적용돼요."); return;
    }
    var hr = findHeader(aoa), map = autoMap(aoa[hr] || []);

    if (map.cost == null) { ERP.toast("코스트(가격) 열을 찾지 못했어요. 첫 줄 제목에 Cost/Wholesale/Price 같은 말이 있는지 확인해 주세요."); return; }
    var head = aoa[hr], found = FIELDS.filter(function (f) { return map[f[0]] != null; }).map(function (f) { return f[1] + "=" + String(head[map[f[0]]]).trim(); });
    if (map.sizeRun) found.push("사이즈(가로)=" + map.sizeRun.map(function (i) { return String(head[i]).trim(); }).join("/"));
    var rows = rowsFromSheet(aoa, hr, map); if (!rows.length) { ERP.toast("상품 줄을 찾지 못했어요."); return; }
    if (!confirm("읽은 열: " + found.join(", ") + "\n상품 " + rows.length + "줄. " + (map.retail == null ? "\n(리테일 열은 없어요)" : "") + "\n이대로 넣을까요?")) return;
    var d = D(), keep = d.order.rows.length && confirm("지금 오더에 이어 붙일까요? (취소 = 새 오더로 바꿈)");
    if (!keep) d.order = { name: d.order.name || file.name.replace(/\.[^.]+$/, ""), date: U.today(), rows: [] };
    d.order.rows = d.order.rows.concat(rows); await save({ set: d.set, order: d.order }, true); ERP.render(); ERP.toast(rows.length + "줄을 넣었어요. [크림 시세 비교]를 누르면 살 만한 상품을 골라요.");
  } catch (e) { ERP.toast("엑셀을 읽지 못했어요: " + e.message); }
}
ERP.acts.bqmkadd = function () { var b = (prompt("브랜드 (예: PRADA)") || "").trim(); if (!b) return; var m = mkVal(prompt("마크업 (예: 10% 또는 1.1)") || ""); if (!m) return; var d = D(); d.set.brandMk[bkey(b)] = m; save({ set: d.set, order: d.order }); ERP.render(); };
ERP.acts.bqup = function () { var f = document.getElementById("bq-file"); if (f) f.click(); };
ERP.acts.bqclear = function () { if (!confirm("현재 오더를 비울까요? (열무 크림도매에 넘긴 줄은 그대로 남아요)")) return; var d = D(); save({ set: d.set, order: { name: "", date: U.today(), rows: [] } }, true); ERP.render(); };
ERP.acts.bqgokream = function () { var o = D().order; ERP.go("kream-yeolmu", { kSup: SUP(o), kList: o.date || U.today() }); };
ERP.acts.bqkream = async function () {
  var d = D(), o = d.order, set = d.set; if (!o.rows.length) return;
  if (!ERP.kreamImportRows) { ERP.toast("크림 화면이 아직 안 불러와졌어요. 새로고침(F5) 후 다시 눌러 주세요."); return; }
  if (!o.name) { var n = (prompt("부티크 이름 (열무 크림도매에 '부티크 ○○'로 들어가요)", "") || "").trim(); if (!n) return; o.name = n; await save({ set: set, order: o }, true); }
  var day = o.date || U.today(), sk = "bq:" + (o.name || "") + ":" + day;
  var made = o.rows.filter(function (r) { return num(r.qty) > 0 && (r.sku || r.name); }).map(function (r) { var c = calc(r, set);
    return { id: U.uid(), supplier: SUP(o), listDate: day, brand: r.brand, sku: r.sku, name: r.name + (r.color ? " " + r.color : ""), kreamUrl: "", size: r.size || "F", qty: num(r.qty), wholesalePrice: c.landed, kreamPrice: null, kreamRecent: "", decision: "검토",
      memo: "부티크 오더: 코스트 €" + won2(r.cost) + " × 마크업 " + c.mk + " × 환율 " + set.fx + (c.fta ? " · FTA" : " · 관세 " + pct(c.rate)), extra: { bq: r.id, sheet: sk, sheetName: o.name, boutique: { cost: r.cost, retail: r.retail, markup: c.mk, fx: set.fx, fta: c.fta, cat: r.cat } } }; });
  ERP.toast("크림 비교를 시작해요 (" + made.length + "줄)…");
  await ERP.kreamImportRows(made, day);
  ERP.go("boutique-calc");
};

ERP.page({ id: "boutique-calc", title: "부티크 오더 계산기", wide: true, roles: ["owner", "accountant", "staff", "ai"], render: render, bind: bind });
})();
