/* 메뉴: 크림 › 열무 크림도매 (열무·무우 등 도매처별) — 크림 조회는 전용 확장 ‘로우나 열무 크림도매 도우미’(통로 rownaW)
   도매 리스트 사진을 올리면 ChatGPT로 표를 읽고(크롬 확장 '로우나 크림 도우미'),
   크림 상세페이지를 한 장씩 열어 모델번호를 끝자리까지 확인한 뒤 즉시구매가·최근 체결가·거래량을 채워요.
   크림 가격이 바뀔 때마다 시세 기록(kream_price_log)에 쌓여 추이를 볼 수 있어요. */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, C = ERP.C, esc = U.esc, won = U.won, pct = U.pct, num = U.num;
var v = ERP.view;
function KB(it) { return ((it && it.extra) || {}).kreamBasis || {}; }   /* 크림 가격 2칸: 보판가(빠른배송·사업자) / 일반가 — 95점 제외 */
function SUP() { return v.kSup || "열무"; }
/* 국내몰(리셀 소싱): 세일 목록을 할인율 높은 순으로 1장 열어 후보를 담고, 크림 시세와 비교 */
var MALLS = { "무신사": { label: "무신사 신발 세일", url: "https://www.musinsa.com/category/103?gf=A&sortCode=DISCOUNT_RATE" } };
function isMall(s) { return !!MALLS[s]; }
function KIND() { return isMall(SUP()) ? "mall" : "whole"; }
function suppliers() { var d = { "열무": 1, "무우": 1 }; Object.keys(MALLS).forEach(function (k) { d[k] = 1; }); ERP.list("kream_wholesale").forEach(function (x) { if (x.supplier) d[x.supplier] = 1; }); return Object.keys(d).filter(function (x) { return (KIND() === "mall") === isMall(x); }); }
var MALL_BRANDS = "나이키,조던,아디다스,뉴발란스,아식스,살로몬,오니츠카타이거,컨버스,반스,푸마,호카,메종 마르지엘라,커먼프로젝트,어그,닥터마틴,알렉산더 맥퀸,발렌시아가,오프화이트";
function mallMin() { return S.SET.kream_mall_min == null ? 30 : num(S.SET.kream_mall_min); }
function mallMax() { return S.SET.kream_mall_max == null ? 30 : num(S.SET.kream_mall_max); }
function mallBrandsStr() { return S.SET.kream_mall_brands == null ? MALL_BRANDS : String(S.SET.kream_mall_brands); }
function mallBrands() { return mallBrandsStr().split(/[,\n]/).map(function (s) { return s.trim(); }).filter(Boolean); }
function mallVat() { return S.SET.kream_mall_vat_deduct == null ? true : !!S.SET.kream_mall_vat_deduct; }   /* 기본: 국내 매입이라 매입세액 공제됨 (대표님 확인 2026-11-10) */
/* 크림 보관판매 보관료: 월 3,000원 (대표님 확인 2026-11-10) × 예상 보관 개월 — 매입가에 더해 계산 */
function storMonths() { return S.SET.kream_storage_months == null ? 1 : num(S.SET.kream_storage_months); }
function storFee() { return 3000 * storMonths(); }
var DECISIONS = ["검토", "매입", "보류", "제외"];
function rate() { return S.SET.kream_fee_rate == null ? 0.06 : Number(S.SET.kream_fee_rate); }
function cap() { return S.SET.kream_fee_cap == null ? 300000 : num(S.SET.kream_fee_cap); }
function base() { return S.SET.kream_fee_base == null ? 2500 : num(S.SET.kream_fee_base); }
/* 크림 프리미엄 카테고리(샤넬·에르메스 가방, 롤렉스 등 시계): 기본 20,000원 + 3% */
function premium(it) { var t = ((it.brand || "") + " " + (it.name || "")).toUpperCase(); return (/CHANEL|샤넬|HERMES|HERMÈS|에르메스/.test(t) && /백|BAG|토트|숄더|클러치|버킨|켈리|플랩/.test(t)) || /ROLEX|롤렉스|AUDEMARS|오데마|PATEK|파텍|VACHERON|바쉐론/.test(t); }
/* 국내몰 실제 매입가 = 목록 세일가 × (1−등급할인) × (1−쿠폰) × (1−카드 청구할인·적립) — 대표님 등급·카드에 맞춰 설정칸에서 입력 */
function mallDisc(k) { return num(S.SET["kream_mall_" + k]) / 100; }
/* 카드표: 한 줄에 '카드명, 할인·적립 %, 월 한도(원, 0=무제한), 이번 달 이미 쓴 혜택(원)' */
function mallCards() { return String(S.SET.kream_mall_cards || "").split("\n").map(function (l) { var a = l.split(","); return { name: (a[0] || "").trim(), pct: num(a[1]) / 100, limit: num(a[2]), used: num(a[3]) }; }).filter(function (c) { return c.name && c.pct > 0; }); }
var CARD = {};   /* 상품 id → {name, save} : 화면 그릴 때마다 남은 한도 안에서 다시 배정 */
function preCard(it) { return Math.round(num(it.wholesalePrice) * (1 - mallDisc("grade")) * (1 - mallDisc("coupon"))); }
function assignCards(list) {
  CARD = {}; var cards = mallCards(); if (!cards.length) return;
  var left = cards.map(function (c) { return c.limit ? Math.max(0, c.limit - c.used) : Infinity; });
  /* 크림 기준가 대비 마진이 좋은 상품부터 카드 혜택을 배정 */
  list.filter(function (it) { return isMall(it.supplier) && it.decision !== "제외"; }).map(function (it) { var b = preCard(it); return { it: it, b: b, m: num(it.kreamPrice) ? num(it.kreamPrice) / b : 0 }; })
    .sort(function (x, y) { return y.m - x.m; }).forEach(function (x) {
      var best = -1, save = 0; cards.forEach(function (c, i) { var s = Math.min(x.b * c.pct, left[i]); if (s > save) { save = s; best = i; } });
      if (best >= 0) { left[best] -= save; CARD[x.it.id] = { name: cards[best].name, save: Math.round(save) }; }
    });
}
function cost(it) { var w = num(it.wholesalePrice); if (!isMall(it.supplier)) return w; var b = preCard(it); if (mallCards().length) return b - ((CARD[it.id] || {}).save || 0); return Math.round(b * (1 - mallDisc("card"))); }
function calc(it) { var p = premium(it), wh = cost(it); if (isMall(it.supplier) && !mallVat()) wh = wh * 1.1; wh = num(wh) + storFee();   /* kream()은 매입가÷1.1을 빼므로 ×1.1 = 매입가 전액을 원가로 */
  return C.kream(it.kreamPrice, wh, p ? 0.03 : rate(), cap(), p ? 20000 : base()); }
/* 이익률 8%가 나오는 매입가(협상 목표) */
function tgt(it) { var sell = num(it.kreamPrice); if (!sell) return null; var p = premium(it), r = p ? 0.03 : rate(), b = p ? 20000 : base(), fee = Math.min(b + sell * r, (cap() || Infinity) / 1.1), w = 1.1 * (sell / 1.1 * 0.92 - fee) - storFee(); return w > 0 ? Math.floor(w / 1000) * 1000 : null; }
function items() { return ERP.list("kream_wholesale").filter(function (x) { return (x.supplier || "열무") === SUP(); }); }
/* 거래 속도: 최근 체결 5건 날짜로 한 달 거래 수 추정 */
function tdate(s) { s = String(s || ""); var m = s.match(/^(\d{2})\/(\d{2})\/(\d{2})$/); if (m) return new Date(2000 + +m[1], +m[2] - 1, +m[3]); m = s.match(/(\d+)\s*(분|시간|일)\s*전/); if (m) return new Date(Date.now() - +m[1] * (m[2] === "분" ? 6e4 : m[2] === "시간" ? 36e5 : 864e5)); return null; }
function speed(k) { var tr = (k && k.trades) || []; if (!tr.length) return null; var ds = tr.map(function (t) { return tdate(t.date); }).filter(Boolean); if (!ds.length) return null; var old = Math.min.apply(null, ds), days = Math.max(1, (Date.now() - old) / 864e5), n30 = ds.filter(function (d) { return Date.now() - d <= 30 * 864e5; }).length; return { perMonth: Math.round(ds.length * 30 / days * 10) / 10, n30: n30, days: Math.round(days) }; }
function recQty(it, c) { var k = (it.extra || {}).kream, sp = speed(k), q = isMall(it.supplier) ? 99 : num(it.qty); if (k && k.needConfirm && !(it.extra || {}).confirmed) return 0; if (!c || c.verdict === "비추천" || !(k && k.verified)) return 0; if (!sp) return Math.min(q, 1); return Math.min(q, Math.max(1, Math.floor(sp.perMonth * (c.verdict === "추천" ? 1.5 : 1)))); }
function listDates() { var d = {}; items().forEach(function (x) { if (x.listDate) d[x.listDate] = 1; }); return Object.keys(d).sort().reverse(); }
function vpill(c) { if (!c) return '<span class="pill p-mute">크림가 필요</span>'; return c.verdict === "추천" ? '<span class="pill p-good">✓ 추천</span>' : c.verdict === "검토" ? '<span class="pill p-warn">△ 검토</span>' : '<span class="pill p-crit">✕ 비추천</span>'; }

function helperOn() { return document.documentElement.dataset.rownaKream === "1"; }
/* 국내몰 리셀은 전용 확장 ‘로우나 리셀 도우미’만 씀 — 기존 도우미(스마트스토어 속성·크림 도매)와 통로·대기줄·탭이 모두 따로 */
function wholesaleOn() { return document.documentElement.dataset.rownaWholesale === "1"; }
function resellOn() { return document.documentElement.dataset.rownaResell === "1"; }
function kcell(it) {
  var k = (it.extra || {}).kream;
  if (!k) return '<span class="muted">' + (busy[it.id] ? "확인 중…" : "–") + "</span>";
  if (k.error) return '<span class="pill p-crit" title="' + esc(k.error) + '">확인 실패</span>';
  var th = k.img ? '<img src="' + esc(String(k.img).split("?")[0] + "?type=m_webp") + '" referrerpolicy="no-referrer" alt="" loading="lazy" style="width:56px;height:56px;object-fit:cover;border-radius:6px;display:block;margin-bottom:4px">' : "";
  if (k.needConfirm && !(it.extra || {}).confirmed) return th + '<span class="pill p-warn" title="리스트 품번으로는 못 찾아서 상품명으로 찾았어요. 리스트 사진과 같은 상품·색상인지 확인해 주세요">🔍 사진 확인 필요</span><small class="num">크림 ' + esc(k.model || "") + "</small>" + (k.url ? '<small><a href="' + esc(k.url) + '" target="_blank" rel="noopener">크림 상품 보기 ↗</a></small>' : "") + (ERP.canWrite("kream_wholesale") ? '<button class="btn sm" data-kconf="' + esc(it.id) + '">같은 상품 맞음</button> <button class="btn sm" data-kno="' + esc(it.id) + '">아님</button>' : "");
  return th + (k.needConfirm ? '<span class="pill p-good">✅ 사진 확인함</span>' : "") + (k.verified ? (k.exact ? '<span class="pill p-good" title="크림 모델번호 ' + esc(k.model) + '">✅ 품번 일치</span>' : '<span class="pill p-warn" title="크림 모델번호 ' + esc(k.model) + ' (0/O·1/I 등 비슷한 글자 차이)">△ 거의 일치</span>') : '<span class="pill p-crit" title="크림에서 같은 모델번호를 못 찾았어요">⚠ 품번 다름</span>') +
    '<small class="num">' + esc(k.model || "") + "</small>";
}
var busy = {};
function render() {
  var dates = listDates(); if (!v.kList || dates.indexOf(v.kList) === -1) v.kList = dates[0] || "";
  var w = ERP.canWrite("kream_wholesale"), list = items().filter(function (x) { return x.listDate === v.kList; });
  var groups = {}, order = [];
  list.forEach(function (x) { var k = x.sku || x.name || x.id; if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(x); });
  var T = { qty: 0, whole: 0, real: 0, recQty: 0, recReal: 0, recWhole: 0, buyQty: 0, buyWhole: 0, buyReal: 0 }, cand = [];
  if (KIND() === "mall") assignCards(list);
  var body = order.map(function (key) {
    var g = groups[key].sort(function (a, b) { return String(a.size).localeCompare(String(b.size), "ko", { numeric: true }); }), f = g[0];
    return g.map(function (it, i) {
      var c = calc(it), q = num(it.qty), tot = c ? c.real * q : 0, k = (it.extra || {}).kream || {}, sp = speed(k), rq = recQty(it, c);
      T.qty += q; T.whole += cost(it) * q; T.real += tot;
      if (rq) { T.recQty += rq; T.recReal += c.real * rq; T.recWhole += cost(it) * rq; cand.push({ it: it, c: c, rq: rq }); }
      if (it.decision === "매입") { T.buyQty += q; T.buyWhole += cost(it) * q; T.buyReal += tot; }
      var flags = (it.extra || {}).ocr || {};
      var prod = i ? "" : '<td class="name" rowspan="' + g.length + '"><b>' + esc(f.brand || "") + "</b> " + esc(f.name || "") + '<small class="num">' + esc(f.sku || "") + (flags.skuUnsure ? ' <span class="pill p-warn" title="사진에서 글자가 흐려 확실하지 않아요">글자 확인</span>' : "") + "</small>" + (f.kreamUrl ? '<small><a href="' + esc(f.kreamUrl) + '" target="_blank" rel="noopener">크림에서 보기 ↗</a></small>' : "") + (((f.extra || {}).mall || {}).url ? '<small><a href="' + esc(f.extra.mall.url) + '" target="_blank" rel="noopener">' + esc(f.supplier) + " " + esc(String(f.extra.mall.disc || "")) + "% 세일 ↗</a></small>" : "") + "</td><td rowspan=\"" + g.length + "\">" + kcell(f) + "</td>";
      var trades = (k.trades || []).slice(0, 5).map(function (t) { return t.date.replace(/^26\//, "") + " " + won(t.price); }).join("<br>");
      return '<tr class="' + (it.decision === "제외" ? "off" : "") + '">' + prod + '<td class="click" data-edit="kream_wholesale:' + esc(it.id) + '" tabindex="0">' + esc(it.size || "F") + '</td><td class="r num">' + q + '</td><td class="r num">' + won(cost(it)) + (isMall(it.supplier) && cost(it) !== num(it.wholesalePrice) ? '<small class="muted">목록 ' + won(it.wholesalePrice) + "</small>" : "") + (CARD[it.id] ? '<small class="muted">' + esc(CARD[it.id].name) + " −" + won(CARD[it.id].save) + "</small>" : "") + '</td>' +
        '<td class="r num">' + (KB(it).fast ? won(KB(it).fast) : "–") + '</td><td class="r num">' + (KB(it).normal ? won(KB(it).normal) : "–") + '</td><td class="r"><small class="num">' + (trades || "–") + '</small>' + (KB(it).trade && num(it.kreamPrice) > KB(it).trade * 1.08 ? '<span class="pill p-warn" title="계산 기준가(판매입찰)가 최근 체결 중간값보다 높아요 — 실제로 이 값에 안 팔릴 수 있음">체결가보다 ' + Math.round((num(it.kreamPrice) / KB(it).trade - 1) * 100) + "% 높음</span>" : "") + '</td><td class="r num">' + (k.tradeCount != null && k.model ? "전체 " + U.esc(String(k.tradeCount)) + "건" : "–") + (sp ? '<small class="muted">' + (k.sizeRead ? esc(it.size) + " " : "") + "월 " + sp.perMonth + "건 · 30일 " + sp.n30 + "건</small>" + (q > 1 && sp.perMonth ? '<small class="muted">' + q + "개 소진 약 " + (Math.round(q / sp.perMonth * 10) / 10) + "개월</small>" : "") : (k.model && !szFree(it.size) ? '<small class="muted">' + esc(it.size) + " 체결 없음</small>" : "")) + "</td>" +
        '<td class="r kp">' + (w ? '<input class="cell-in num" type="number" inputmode="numeric" aria-label="' + esc((f.brand || "") + " " + (it.size || "") + " 크림 기준가") + '" data-kp="' + esc(it.id) + '" value="' + (it.kreamPrice == null ? "" : Math.round(it.kreamPrice)) + '" placeholder="입력">' : '<span class="num">' + (it.kreamPrice == null ? "–" : won(it.kreamPrice)) + "</span>") + "</td>" +
        '<td class="r num ' + (c && c.real < 0 ? "neg" : "") + '">' + (c ? won(c.real) : "–") + '</td><td class="r num">' + (c ? pct(c.rate) : "–") + '</td><td class="r num">' + (c ? won(c.breakeven) : "–") + (c && tgt(it) ? '<small class="muted">8% 목표 ' + won(tgt(it)) + "</small>" : "") + "</td><td>" + vpill(c) + '</td><td class="r num"><b>' + (rq ? rq + "개" : "–") + "</b></td><td>" +
        (w ? '<select class="ctl sm" data-dec="' + esc(it.id) + '" aria-label="결정">' + DECISIONS.map(function (d) { return "<option" + (d === (it.decision || "검토") ? " selected" : "") + ">" + d + "</option>"; }).join("") + "</select>" : esc(it.decision || "검토")) + "</td></tr>";
    }).join("");
  }).join("");
  /* 예산 안에서 이익률 높은 순으로 추천수량만큼 담기 */
  var budget = num(S.SET.kream_budget) || 10000000, pick = { qty: 0, whole: 0, real: 0, lines: [] };
  cand.sort(function (a, b) { return b.c.rate - a.c.rate; }).forEach(function (x) { var price = cost(x.it), n = Math.min(x.rq, Math.floor((budget - pick.whole) / price)); if (n > 0) { pick.qty += n; pick.whole += n * price; pick.real += n * x.c.real; pick.lines.push((x.it.brand || "") + " " + (x.it.name || x.it.sku || "").slice(0, 18) + " ×" + n); } });
  var sups = suppliers();
  var mall = KIND() === "mall";
  var h = '<div class="head"><div><h1>' + (mall ? "크림 리셀 소싱 (국내몰)" : "열무 크림도매") + '</h1><p>' + (mall ? "국내몰 세일 목록을 할인율 높은 순으로 읽어 크림 시세·거래량·이익과 비교해요 · " : "도매 리스트 사진을 올리면 크림 시세·거래량·이익을 자동으로 채워요 · ") + (mall ? (resellOn() ? '<span class="pill p-good">리셀 도우미 켜짐</span>' : '<span class="pill p-crit" title="국내몰은 전용 확장 ‘로우나 리셀 도우미’로만 돌아가요 (기존 도우미는 안 씀)">리셀 도우미 꺼짐</span>') : (helperOn() ? '<span class="pill p-good">사진 읽기 도우미 켜짐</span>' : '<span class="pill p-crit" title="사진 읽기(ChatGPT)는 크롬 확장 ‘로우나 도우미’로 해요">사진 읽기 도우미 꺼짐</span>') + ' ' + (wholesaleOn() ? '<span class="pill p-good">열무 크림도매 도우미 켜짐</span>' : '<span class="pill p-crit" title="크림 시세(빠른배송·일반배송·95점 제외)는 전용 확장 ‘로우나 열무 크림도매 도우미’로 읽어요">열무 크림도매 도우미 꺼짐</span>')) + '</p></div><div class="tools">' +
    '<select class="ctl" id="k-kind" aria-label="구분"><option value="whole"' + (mall ? "" : " selected") + '>도매처</option><option value="mall"' + (mall ? " selected" : "") + '>국내몰</option></select>' +
    '<select class="ctl" id="k-sup" aria-label="도매처">' + sups.map(function (x) { return "<option" + (x === SUP() ? " selected" : "") + ">" + esc(x) + "</option>"; }).join("") + (mall ? "" : '<option value="__new">+ 도매처 추가</option>') + "</select>" +
    (dates.length ? '<select class="ctl" id="k-list" aria-label="리스트 날짜">' + dates.map(function (d) { return "<option" + (d === v.kList ? " selected" : "") + ' value="' + d + '">' + d.replace(/-/g, ".") + " 리스트</option>"; }).join("") + "</select>" : "") +
    (w ? (mall ? '<button class="btn pri" data-act="kreammall">🛒 ' + esc(MALLS[SUP()].label) + " 불러오기</button>" : '<button class="btn pri" data-act="kreamphoto">📷 리스트 사진 올리기</button>') + (list.length ? '<button class="btn" data-act="kreamfetch">크림 시세 다시 가져오기</button>' : "") + '<button class="btn" data-act="kreamadd">+ 직접 추가</button>' : "") + (list.length ? '<button class="btn" data-act="kreamexport">엑셀 내보내기</button>' : "") + "</div></div>";
  if (queue().length) h += '<div class="panel"><b>📱 휴대폰에서 올린 리스트 사진 ' + queue().length + '장 대기 중</b> — ' + (helperOn() ? '이 PC에서 지금 읽는 중이에요.' : 'PC1 ERP(로우나 도우미 켜짐)가 켜져 있으면 1~2분 안에 자동으로 읽어서 넣어요.') + '</div>';
  if (!list.length) return h + '<div class="panel empty"><b>' + esc(SUP()) + (mall ? " 후보가 아직 없어요</b>" + (w ? "‘🛒 불러오기’를 누르면 세일 목록 1장을 열어 조건에 맞는 상품만 담고, 크림에서 한 상품씩(10~12초 간격) 확인해요." : "") : ' 도매 리스트가 아직 없어요</b>' + (w ? "‘📷 리스트 사진 올리기’로 도매처가 보낸 사진을 올리면 표를 읽고 크림 시세까지 채워요." : "")) + "</div>" + feeNote(w);
  h += '<div class="tiles">' + ERP.tile("리스트 전체", T.qty + "개", won(T.whole) + "원 · 전부 사면 예상 이익 " + won(T.real) + "원") + ERP.tile("추천 수량만 사면", T.recQty + "개", won(T.recWhole) + "원 → 이익 " + won(T.recReal) + "원", "hl") +
    ERP.tile("예산 " + won(budget) + "원 안에서", pick.qty + "개", won(pick.whole) + "원 → 이익 " + won(pick.real) + "원<br><small>" + esc(pick.lines.join(" · ")) + "</small>") + ERP.tile("매입 결정", T.buyQty + "개", won(T.buyWhole) + "원 · 예상 이익 " + won(T.buyReal) + "원") + "</div>";
  h += '<div class="table-wrap"><table style="min-width:1500px"><thead><tr><th>상품</th><th>크림 품번 확인</th><th>사이즈</th><th class="r">수량</th><th class="r">' + (mall ? "실제 매입가" : "도매가") + '</th><th class="r">보판가(빠른)</th><th class="r">일반가</th><th class="r">최근 체결</th><th class="r">누적 거래</th><th class="r">계산 기준가</th><th class="r">개당 실이익</th><th class="r">이익률</th><th class="r">손익분기가</th><th>판단</th><th class="r">추천 수량</th><th>결정</th></tr></thead><tbody>' + body + "</tbody></table></div>";
  h += '<p class="note">계산 기준가 = 최근 체결 5건 중간값과 지금 즉시구매가 중 낮은 값(보수적으로). 추천 수량 = 최근 체결 속도로 한 달 안에 팔 수 있을 만큼(추천은 1.5배). ✅ 품번 일치가 아닌 줄은 크림 링크를 직접 확인해 주세요.</p>';
  return h + (KIND() === "mall" ? "" : tgPanel()) + feeNote(w);
}
function mallNote(w) {
  if (KIND() !== "mall") return "";
  var dis = w ? "" : " disabled", f = function (id, label, val, extra) { return '<div class="fd"><label for="' + id + '">' + label + '</label><input id="' + id + '" ' + (extra || 'type="number" step="0.1"') + ' value="' + esc(String(val)) + '"' + dis + "></div>"; };
  return '<div class="panel"><h2>국내몰 매입 조건</h2><div class="fg narrow">' +
    f("km-grade", "등급 할인 %", num(S.SET.kream_mall_grade)) + f("km-coupon", "쿠폰 할인 % (장바구니·상품 쿠폰)", num(S.SET.kream_mall_coupon)) + f("km-card", "카드 청구할인·적립 %", num(S.SET.kream_mall_card)) +
    f("km-stor", "보관판매 예상 보관 개월 (월 3,000원)", storMonths(), 'type="number"') + f("km-min", "할인율 몇 % 이상만", mallMin(), 'type="number"') + f("km-max", "한 번에 확인할 상품 수", mallMax(), 'type="number"') +
    '<div class="fd"><label for="km-vat">매입 부가세</label><select class="ctl" id="km-vat"' + dis + '><option value="1"' + (mallVat() ? " selected" : "") + '>공제됨 (국내 매입)</option><option value="0"' + (mallVat() ? "" : " selected") + ">공제 안 됨</option></select></div></div>" +
    '<div class="fd"><label for="km-cards">결제 카드표 — 한 줄에 카드명, 무신사 할인·적립 %, 월 한도(원, 0=무제한), 이번 달 이미 받은 혜택(원). 적어 두면 위 ‘카드 %’ 대신 이 표로 상품마다 남은 한도 안에서 가장 많이 깎이는 카드를 자동 배정해요.</label><textarea id="km-cards" class="ctl" rows="6" placeholder="디어쇼퍼, 5, 200000, 0"' + dis + ">" + esc(String(S.SET.kream_mall_cards || "")) + "</textarea></div>" +
    '<div class="fd"><label for="km-brands">이 브랜드만 크림에서 확인 (쉼표로 구분, 비우면 전부)</label><textarea id="km-brands" class="ctl" rows="2"' + dis + ">" + esc(mallBrandsStr()) + "</textarea></div>" +
    '<p class="note">실제 매입가 = 목록 세일가 × (1−등급 할인) × (1−쿠폰) − 카드 혜택(카드표가 있으면 남은 월 한도 안에서 자동 배정, 없으면 카드 % 적용). 쿠폰은 상품마다 적용 여부가 달라 평균값으로 넣어 주세요. 정확한 금액은 무신사 상품 페이지의 회원 최저가로 확인. 매입 부가세 ‘공제 안 됨’이면 매입가 전액을 원가로 계산해요. 크림은 한 상품씩 10~12초 간격으로 열고, 차단·경고 화면이 보이면 바로 멈춰요. 스마트스토어 속성 작업과 도우미를 같이 쓰니 동시에 돌리지 마세요.</p></div>';
}
function feeNote(w) {
  return mallNote(w) + '<div class="panel"><h2>계산 기준</h2><div class="fg narrow"><div class="fd"><label for="k-rate">크림 판매 수수료 % (부가세 별도)</label><input id="k-rate" type="number" step="0.1" value="' + (rate() * 100).toFixed(1) + '"' + (ERP.isOwner() ? "" : " disabled") + '></div><div class="fd"><label for="k-base">크림 기본 수수료(원, 부가세 별도)</label><input id="k-base" type="number" value="' + base() + '"' + (ERP.isOwner() ? "" : " disabled") + '></div><div class="fd"><label for="k-cap">수수료 최대 금액(원, 부가세 포함)</label><input id="k-cap" type="number" value="' + cap() + '"' + (ERP.isOwner() ? "" : " disabled") + '></div><div class="fd"><label for="k-bud">매입 예산(원)</label><input id="k-bud" type="number" value="' + (num(S.SET.kream_budget) || 10000000) + '"></div></div>' +
    '<p class="note">실이익 = 크림 판매가 ÷ 1.1 − 수수료 − 도매가 ÷ 1.1 (도매 세금계산서 매입세액 공제, 크림 매출 부가세 반영). 판단: 이익률 8% 이상 추천 · 3~8% 검토 · 3% 미만 비추천. 크림 검수센터로 보내는 택배비는 빠져 있어요. 수수료 기준: 크림 FAQ ‘판매자 등급 및 수수료 기준(2026.3.2 적용)’ — Level 1 기본 2,500원 + 6.0%(부가세 별도, 부가세 포함 최대 30만원), 샤넬·에르메스 가방·고급시계는 프리미엄 20,000원 + 3%로 자동 계산. 등급이 오르면 % 칸을 고쳐 주세요.</p></div>';
}
function bind(root) {
  var kl = root.querySelector("#k-list"); if (kl) kl.onchange = function () { v.kList = kl.value; ERP.render(); };
  var kk = root.querySelector("#k-kind"); if (kk) kk.onchange = function () { v.kSup = kk.value === "mall" ? Object.keys(MALLS)[0] : "열무"; v.kList = ""; ERP.render(); };
  [["km-stor", "kream_storage_months"], ["km-grade", "kream_mall_grade"], ["km-coupon", "kream_mall_coupon"], ["km-card", "kream_mall_card"], ["km-min", "kream_mall_min"], ["km-max", "kream_mall_max"]].forEach(function (a) { var el = root.querySelector("#" + a[0]); if (el) el.onchange = async function () { await ERP.saveSetting(a[1], num(el.value)); ERP.render(); }; });
  var kv = root.querySelector("#km-vat"); if (kv) kv.onchange = async function () { await ERP.saveSetting("kream_mall_vat_deduct", kv.value === "1"); ERP.render(); };
  var kcd = root.querySelector("#km-cards"); if (kcd) kcd.onchange = async function () { await ERP.saveSetting("kream_mall_cards", kcd.value.trim()); ERP.render(); };
  var kbr = root.querySelector("#km-brands"); if (kbr) kbr.onchange = async function () { await ERP.saveSetting("kream_mall_brands", kbr.value.trim()); ERP.render(); };
  var ks = root.querySelector("#k-sup"); if (ks) ks.onchange = function () { if (ks.value === "__new") { var n = (prompt("도매처 이름") || "").trim(); if (n) v.kSup = n; } else v.kSup = ks.value; v.kList = ""; ERP.render(); };
  var kb = root.querySelector("#k-base"); if (kb) kb.onchange = function () { ERP.saveSetting("kream_fee_base", num(kb.value)); ERP.render(); };
  var kbu = root.querySelector("#k-bud"); if (kbu) kbu.onchange = function () { ERP.saveSetting("kream_budget", num(kbu.value)); ERP.render(); };
  root.querySelectorAll("[data-kp]").forEach(function (el) { el.onchange = async function () { var it = ERP.DATA.kream_wholesale.get(el.dataset.kp); if (!it) return; var val = el.value === "" ? null : num(el.value); await savePrice(it, val, it.kreamRecent); }; });
  root.querySelectorAll("[data-kconf]").forEach(function (el) { el.onclick = async function () { var it = ERP.DATA.kream_wholesale.get(el.dataset.kconf); if (!it) return; var k = (it.extra || {}).kream || {}; await ERP.save("kream_wholesale", Object.assign({}, it, { sku: k.model || it.sku, kreamUrl: k.url || it.kreamUrl, extra: Object.assign({}, it.extra, { confirmed: true, skuList: it.sku }) })); ERP.render(); }; });
  root.querySelectorAll("[data-kno]").forEach(function (el) { el.onclick = async function () { var it = ERP.DATA.kream_wholesale.get(el.dataset.kno); if (!it) return; var x = Object.assign({}, it.extra); delete x.kream; delete x.kreamBasis; await ERP.save("kream_wholesale", Object.assign({}, it, { kreamPrice: null, kreamRecent: "", kreamUrl: "", extra: x })); ERP.toast("크림 링크를 직접 넣어 주세요 (행 사이즈 칸 클릭 → 크림 링크)."); ERP.render(); }; });
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
window.addEventListener("message", function (e) { if (e.source !== window || !e.data || (e.data.rownaK !== "res" && e.data.rownaR !== "res" && e.data.rownaW !== "res")) return; var f = waits[e.data.id]; if (f) { delete waits[e.data.id]; f(e.data); } });
function ask(type, payload) {
  return new Promise(function (res, rej) {
    if (!helperOn()) { rej(new Error("크롬 확장 ‘로우나 도우미’가 꺼져 있어요. 설치 후 ERP를 새로고침(F5)해 주세요.")); return; }
    var id = U.uid(); waits[id] = function (d) { d.ok ? res(d.data) : rej(new Error(d.error || "실패")); };
    window.postMessage(Object.assign({ rownaK: "req", id: id, type: type }, payload), location.origin);
  });
}
function askW(type, payload) {
  return new Promise(function (res, rej) {
    if (!wholesaleOn()) { rej(new Error("크롬 확장 ‘로우나 열무 크림도매 도우미’가 꺼져 있어요. 설치 후 ERP를 새로고침(F5)해 주세요. (ERP 저장소 tools/kream-wholesale-helper)")); return; }
    var id = U.uid(); waits[id] = function (d) { d.ok ? res(d.data) : rej(new Error(d.error || "실패")); };
    window.postMessage(Object.assign({ rownaW: "req", id: id, type: type }, payload), location.origin);
  });
}
function askR(type, payload) {
  return new Promise(function (res, rej) {
    if (!resellOn()) { rej(new Error("크롬 확장 ‘로우나 리셀 도우미’가 꺼져 있어요. 설치 후 ERP를 새로고침(F5)해 주세요.")); return; }
    var id = U.uid(); waits[id] = function (d) { d.ok ? res(d.data) : rej(new Error(d.error || "실패")); };
    window.postMessage(Object.assign({ rownaR: "req", id: id, type: type }, payload), location.origin);
  });
}
/* ---------- 읽는 규칙 (ERP 안에 있어서 고치면 모든 PC에 바로 반영) ---------- */
var OCR_PROMPT = [
  "이 이미지는 한국 명품 도매업체가 보낸 도매 리스트(표)입니다. 표의 상품 줄만 json(JSON)으로 옮기세요.",
  "규칙:",
  "1) 품번(SKU)은 이미지에 보이는 글자를 한 글자씩 그대로 옮기세요. 하이픈·띄어쓰기도 그대로. 0(숫자)과 O(영문), 1과 I, 8과 B가 헷갈리면 skuUnsure를 true로.",
  "2) 도매가는 1개당 금액(원, 숫자만). 합계 금액이 아니라 단가입니다. VAT 포함 여부는 vatIncluded에.",
  "3) 수량은 숫자. 사이즈는 표기 그대로(F, TU, 85, 270 등). 없으면 \"F\".",
  "4) 크림 링크는 이미지에 kream.co.kr/products/숫자 가 '글자로 직접' 적혀 있을 때만 넣으세요. 'KREAM ↗' 같은 버튼 글자만 있으면 kreamUrl은 빈 값입니다(숫자를 지어내지 마세요). 크림 링크(kream.co.kr/products/숫자)가 보이면 kreamUrl에 https://kream.co.kr/products/숫자 형태로. 숫자가 흐리면 kreamUrlUnsure를 true로.",
  "5) 합계·안내사항 줄은 넣지 마세요. 추측해서 없는 값을 만들지 마세요.",
  "6) 한 상품 칸 안에 사이즈가 여러 개 적혀 있으면(예: L 2개, XL 3개, 합계 5) 사이즈마다 items 한 줄씩 따로 넣고, 도매가는 같은 단가를 넣으세요. 사이즈 칸의 '합계' 숫자는 넣지 마세요.",
  "7) 품번이 '11046-AB-SAB/11046-00A02'처럼 / 로 두 개 적혀 있으면 그대로 옮기세요. 크림 링크가 있으면 링크가 우선입니다.",
  "8) 표 제목이 'OO 도매 리스트'면 supplier에 OO(예: 무우, 열무)를(로고에 업체명이 있으면 그 이름), 거래 조건에 '테이크올'이 있으면 takeAll을 true로, 날짜(예: 2026.10.27)가 보이면 listDate에 2026-10-27 형식으로.",
  "출력 형식: {\"supplier\":\"\",\"listDate\":\"\",\"takeAll\":false,\"vatIncluded\":true,\"items\":[{\"brand\":\"\",\"sku\":\"\",\"skuUnsure\":false,\"name\":\"\",\"size\":\"F\",\"qty\":1,\"wholesalePrice\":0,\"kreamUrl\":\"\",\"kreamUrlUnsure\":false}]}"
].join("\n");
async function ocrList(dataUrl) {
  var r = await ask("ai", { body: { response_format: { type: "json_object" }, messages: [{ role: "user", content: [{ type: "text", text: OCR_PROMPT }, { type: "image_url", image_url: { url: dataUrl, detail: "high" } }] }] } });
  return JSON.parse(r.content || "{}");
}
var BLOCK_RE = /비정상적인 (접근|요청)|접근이 (차단|제한)|Access Denied|자동입력 방지|보안 문자|too many requests|잠시 후 다시 시도/i;
async function pageSafe(opt, chan) { var p = await (chan === "R" ? askR : chan === "W" ? askW : ask)("page", opt); if (BLOCK_RE.test(String((p && p.text) || "").slice(0, 3000))) throw new Error("차단·경고 화면이 보여서 멈췄어요 (" + String(opt.url).split("?")[0] + ")"); return p; }
function knorm(s) { return String(s || "").toUpperCase().replace(/[\s\-_.\/]/g, ""); }
function kloose(s) { return knorm(s).replace(/O/g, "0").replace(/[IL]/g, "1").replace(/B/g, "8").replace(/S/g, "5").replace(/Z/g, "2"); }
function kdist(a, b) { var d = [], i, j; for (i = 0; i <= a.length; i++) { d[i] = [i]; } for (j = 1; j <= b.length; j++) d[0][j] = j; for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
function ksame(a, b) { if (!a || !b) return 0; if (knorm(a) === knorm(b)) return 2; if (kloose(a) === kloose(b)) return 1; return 0; }
/* 사이즈 비교: "7" = "UK 7", "F"·"ONE SIZE" = 전체 */
function szn(x) { return String(x || "").toUpperCase().replace(/\s/g, ""); }
function szFree(x) { return !x || /^(F|FREE|TU|OS|ONESIZE)$/.test(szn(x)); }
function szSame(a, b) { a = szn(a); b = szn(b); if (szFree(a) || szFree(b)) return szFree(a) && szFree(b) || szFree(a); var na = a.replace(/^[A-Z]+/, ""), nb = b.replace(/^[A-Z]+/, ""); return a === b || (/^\d/.test(na) && na === nb); }   /* "UK7"="7" 은 같게, "XXL"≠"L" (2026-11-13 수정) */
function parseProduct(p) {
  var t = p.text || "", m = p.meta || {}, model = ((t.match(/모델번호\s*\n*\s*([^\n]+)/) || [])[1] || "").trim();
  var trades = [], i = t.indexOf("거래일"), j = t.indexOf("거래 내역 더보기");
  if (i >= 0) { var seg = t.slice(i + 3, j > i ? j : i + 1500), re = /([^\n]+)\n([\d,]+)원\n([^\n]+)/g, mm; while ((mm = re.exec(seg)) && trades.length < 10) trades.push({ size: mm[1].trim(), price: Number(mm[2].replace(/,/g, "")), date: mm[3].trim() }); }
  var tc = t.match(/\n거래\s+([\d,.]+)(만)?\s*\n/) || [];
  /* 95점(하자) 가격 — 계산에 절대 안 씀 (대표님 지시 2026-11-09) */
  var p95 = [], a95 = t.indexOf("95점 동일 상품"), b95 = t.indexOf("95점 동일 상품 더보기");
  if (a95 >= 0) (t.slice(a95, b95 > a95 ? b95 : a95 + 600).match(/[\d,]{5,}원/g) || []).forEach(function (x) { p95.push(Number(x.replace(/[^\d]/g, ""))); });
  /* 판매 입찰 목록(리셀 도우미가 숨은 탭에서 읽어 줌): 빠른배송·사업자(아이콘 있음) / 일반배송 — 95점 가격과 같은 빠른배송 1건은 95점 상품이라 뺌 */
  var asks = [], g = p.kream && p.kream.groups, left95 = p95.slice();
  if (g && g[1]) g[1].forEach(function (a) { var k95 = a.fast ? left95.indexOf(a.price) : -1; if (k95 >= 0) { left95.splice(k95, 1); return; } asks.push({ size: a.opt, price: a.price, fast: !!a.fast }); });
  var res = { url: String(p.url || "").split("?")[0], productId: (String(p.url || "").match(/products\/(\d+)/) || [])[1] || "", name: String(p.title || "").replace(/\s*정품 안심 거래\s*\|\s*KREAM\s*$/, "").trim(), nameEn: m["og:title"] || "", brand: m["product:brand"] || "",
    img: m["og:image"] || "", model: model, price: Number(m["product:price:amount"]) || null, availability: m["product:availability"] || "", p95: p95, asks: asks, asksRead: !!(g && g[1]), tradeCount: tc[1] ? Math.round(Number(tc[1].replace(/,/g, "")) * (tc[2] ? 10000 : 1)) : 0, trades: trades, loggedIn: /로그아웃/.test(t.slice(0, 400)) };
  /* 열무 크림도매 도우미: 거래 내역 창 전체 목록 + 95점 목록(사이즈별). 95점과 사이즈·가격이 같은 빠른배송 판매입찰은 1건씩 뺌 */
  var fu = p.kream && p.kream.full;
  if (fu) {
    var x95 = (p.kream.p95 || []).map(function (q) { return { s: q.opt, price: q.price }; }), all95 = x95.map(function (q) { return q.price; });
    res.p95 = all95; res.asks = []; res.asksRead = true; res.full = true;
    fu.asks.forEach(function (a) { var j = -1; x95.forEach(function (q, n) { if (j < 0 && q.price === a.price && (!q.s || szSame(q.s, a.opt) || szFree(a.opt))) j = n; }); if (j >= 0 && a.fast) { x95.splice(j, 1); return; } res.asks.push({ size: a.opt, price: a.price, fast: a.fast }); });
    res.bids = fu.bids.map(function (b) { return { size: b.opt, price: b.price }; });
    res.trades = fu.trades.filter(function (x) { return all95.indexOf(x.price) < 0; }).map(function (x) { return { size: x.opt, price: x.price, date: x.tail, fast: x.fast }; });
  } else if (p.kream && p.kream.step) res.readNote = p.kream.step;
  return res;
}
function parseSearch(p) {
  if (/검색 결과가 없습니다/.test(p.text || "")) return [];
  var seen = {}, out = []; (p.links || []).forEach(function (a) { var id = (String(a.href).match(/kream\.co\.kr\/products\/(\d+)/) || [])[1]; if (id && !seen[id]) { seen[id] = 1; out.push({ id: id, text: a.text }); } });
  return out.slice(0, 6);
}
async function kreamLookup(sku, url, chan, name, sz) {
  sku = String(sku || "").trim(); var tried = [], best = null, hit = null, seen = {};
  async function check(pid, via) {
    if (!pid || tried.indexOf(pid) >= 0) return null; tried.push(pid);
    var d = parseProduct(await pageSafe({ url: "https://kream.co.kr/products/" + pid + (sz ? "?size=" + encodeURIComponent(sz) : ""), waitFor: "모델번호|발매가", minLen: 300 }, chan));
    d.via = via; d.match = ksame(d.model, sku); seen[pid] = d; if (!best || d.match > best.match) best = d; return d.match ? d : null;
  }
  async function search(q, via) { var c = parseSearch(await pageSafe({ url: "https://kream.co.kr/search?keyword=" + encodeURIComponent(q), waitFor: "관심|검색 결과가 없습니다", minLen: 200 }, chan)).slice(0, 3); for (var k = 0; k < c.length && !hit; k++) hit = await check(c[k].id, via); }
  var id = (String(url || "").match(/products\/(\d+)/) || [])[1];
  if (id) hit = await check(id, "리스트 링크");
  if (!hit && sku) await search(sku, "품번 검색");
  if (!hit && sku.split(/[\s\-]/).length > 1) await search(sku.split(/[\s\-]/).slice(0, 2).join("-"), "품번 앞부분 검색");
  /* 사진 글자 오인식(1YGV9Y↔1VG9Y, FACCG↔FACQC 등): 리스트에 붙은 크림 링크 상품의 모델번호와 3글자 이내로만 다르면 같은 상품으로 보고 품번을 크림 것으로 고침 */
  if (!hit && best && best.via === "리스트 링크" && best.model && kdist(knorm(best.model), knorm(sku)) <= 3) { hit = best; hit.ocrFixed = best.model; }
  /* 리스트 품번이 사람 실수로 틀렸을 때: 상품명으로 크림 검색 → 첫 후보를 '사진 확인 필요'로 표시 (대표님이 사진 대조 후 확정해야 추천 수량이 나옴) */
  if (!hit && name) {
    var nm = String(name).replace(/\s*-\s*\d{2}(FW|SS)\s*$/i, "").replace(/[^\w가-힣 .]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(function (w, i, a) { return a.indexOf(w) === i; }).slice(0, 6).join(" ");
    var c2 = parseSearch(await pageSafe({ url: "https://kream.co.kr/search?keyword=" + encodeURIComponent(nm), waitFor: "관심|검색 결과가 없습니다", minLen: 200 }, chan)).slice(0, 3);
    for (var q = 0; q < c2.length && !hit; q++) { var d2 = await check(c2[q].id, "상품명 검색"); if (d2) hit = d2; }
    if (!hit && c2.length) { var nb = seen[c2[0].id]; if (nb) { hit = nb; hit.needConfirm = true; hit.cands = c2; } }
  }
  var r = hit || best || {}; r.verified = !!hit; r.exact = !!(hit && hit.match === 2); r.tried = tried; r.checkedAt = new Date().toISOString(); return r;
}
ERP.helperAsk = ask; ERP.helperOn = helperOn;   /* 소싱 메뉴(메투 카페)에서도 같이 씀 */
function shrink(file) {   /* 사진을 긴 변 2000px JPEG로 줄여서 보냄 (글자는 충분히 읽힘) */
  return new Promise(function (res, rej) {
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () { var k = Math.min(1, 2000 / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.92)); };
    img.onerror = function () { rej(new Error("사진을 열 수 없어요: " + file.name)); }; img.src = url;
  });
}
function median(a) { a = a.slice().sort(function (x, y) { return x - y; }); var n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null; }
function sizeTrades(k, size) { var tr = k.trades || [], s = String(size || "").toUpperCase(); if (!s || /^(F|FREE|TU|OS|ONE ?SIZE)$/.test(s)) return tr; return tr.filter(function (t) { return szSame(size, t.size); }); }   /* 다른 사이즈 거래는 절대 안 빌려 씀 */
/* 계산 기준가: 빠른배송·사업자 최저 판매입찰가, 없으면 일반배송 — 95점·즉시구매가 대표값은 안 씀 */
function basisPrices(k, size) {
  var all = k.asks || [], free = szFree(size);
  var a = free ? all : all.filter(function (x) { return szSame(size, x.size); });
  function mn(f) { var v = a.filter(f).map(function (x) { return x.price; }); return v.length ? Math.min.apply(null, v) : null; }
  var bs = (k.bids || []).filter(function (x) { return free || szSame(size, x.size); }).map(function (x) { return x.price; });
  return { fast: mn(function (x) { return x.fast; }), normal: mn(function (x) { return !x.fast; }), bid: bs.length ? Math.max.apply(null, bs) : null };
}
async function fetchKream(rows, opt) {
  var bySku = {}, keys = [];
  rows.forEach(function (it) { var key = (it.sku || it.name || it.id) + "|" + (it.kreamUrl || ""); if (!bySku[key]) { bySku[key] = []; keys.push(key); } bySku[key].push(it); });
  for (var i = 0; i < keys.length; i++) {
    if (i && opt && opt.gap) { var sec = opt.gap[0] + Math.random() * (opt.gap[1] - opt.gap[0]); ERP.toast("차단 방지로 " + Math.round(sec) + "초 쉬는 중 · 다음 " + (i + 1) + "/" + keys.length); await new Promise(function (r) { setTimeout(r, sec * 1000); }); }
    var g = bySku[keys[i]], f = g[0]; g.forEach(function (it) { busy[it.id] = 1; }); ERP.render();
    ERP.toast("크림 확인 중 " + (i + 1) + "/" + keys.length + " · " + (f.brand || "") + " " + (f.sku || ""));
    if (opt && opt.onProgress) try { opt.onProgress(i + 1, keys.length, (f.brand || "") + " " + (f.sku || "")); } catch (e) {}
    var k; try { k = await kreamLookup(f.sku, f.kreamUrl, opt && opt.chan, ((f.brand || "") + " " + (f.name || "")).trim(), (g.filter(function (x) { return !szFree(x.size); })[0] || {}).size); } catch (e) { k = { error: e.message }; if (/멈췄|멈춤|꺼져/.test(e.message)) { g.forEach(function (it) { delete busy[it.id]; }); ERP.toast("⚠ " + e.message); break; } }
    /* 사이즈별로 크림 페이지(?size=XL)를 따로 열어 그 사이즈의 판매입찰·체결·구매입찰만 읽음 (2026-11-13 대표님 지시) */
    if (k && !k.error && k.verified && k.url) {
      k.bySize = {}; var szs = []; g.forEach(function (it) { if (!szFree(it.size) && szs.indexOf(it.size) < 0) szs.push(it.size); });
      for (var si = 0; si < szs.length; si++) {
        var sz = szs[si];
        if (si === 0) {   /* 첫 사이즈는 품번 확인 때 이미 ?size= 페이지로 읽었음 → 다시 안 엶 (속도) */
          k.bySize[sz] = { asks: (k.asks || []).filter(function (a) { return szSame(sz, a.size); }), bids: (k.bids || []).filter(function (b) { return szSame(sz, b.size); }), trades: (k.trades || []).filter(function (t) { return szSame(sz, t.size); }), p95: k.p95 || [], sizeRead: true };
          continue;
        }
        try {
          ERP.toast("사이즈별 시세 읽는 중 · " + (f.sku || "") + " " + sz);
          await new Promise(function (r) { setTimeout(r, 1500 + Math.random() * 1500); });
          var sp = await pageSafe({ url: String(k.url).split("?")[0] + "?size=" + encodeURIComponent(sz), waitFor: "모델번호|발매가", minLen: 300 }, opt && opt.chan);
          if (!(sp.kream && sp.kream.full) && sp.kg && sp.kg.length) { sp.kream = sp.kream || {}; sp.kream.groups = sp.kg; }
          var pr = parseProduct(sp), kg = sp.kg || [];
          var trs = (pr.trades || []).filter(function (t) { return szSame(sz, t.size); });
          if (!trs.length && kg[0]) trs = kg[0].filter(function (t) { return szSame(sz, t.opt) && pr.p95.indexOf(t.price) < 0; }).map(function (t) { return { size: t.opt, price: t.price, date: "" }; });
          var bds = pr.bids ? pr.bids : (kg[2] || []).map(function (b) { return { size: b.opt, price: b.price }; });
          k.bySize[sz] = { asks: (pr.asks || []).filter(function (a) { return szSame(sz, a.size); }), bids: bds.filter(function (b) { return szSame(sz, b.size); }), trades: trs, p95: pr.p95 || [], sizeRead: true };
        } catch (e) { k.bySize[sz] = { err: e.message }; if (/멈췄|멈춤|꺼져|차단/.test(e.message)) { ERP.toast("⚠ " + e.message); break; } }
      }
    }
    var out = [], logs = [];
    g.forEach(function (it) {
      delete busy[it.id];
      var bs = k && k.bySize && k.bySize[it.size], kk = bs && bs.sizeRead ? Object.assign({}, k, bs, { bySize: undefined }) : k;
      var o = Object.assign({}, it, { extra: Object.assign({}, it.extra || {}, { kream: kk }) });
      if (k && !k.error && k.verified) {
        var x95 = kk.p95 || [], tr = sizeTrades(kk, it.size).filter(function (t) { return x95.indexOf(t.price) < 0; }).map(function (t) { return t.price; }), md = median(tr.slice(0, 5));
        var ba = basisPrices(kk, it.size), ref;
        if (ba.fast || ba.normal) { ref = ba.fast || ba.normal; o.extra.kreamBasis = { fast: ba.fast, normal: ba.normal, bid: ba.bid, trade: md, by: ba.fast ? "빠른배송·사업자" : "일반배송", full: !!k.full }; }
        else { var mp = !szFree(it.size) ? null : k.price && x95.indexOf(k.price) < 0 ? k.price : null; ref = md && mp ? Math.min(md, mp) : (md || mp); o.extra.kreamBasis = { by: "최근 체결가(빠른·일반 판매가 못 읽음" + (k.asksRead ? "" : " — 리셀 도우미 필요") + ")" }; }
        o.kreamPrice = ref || null; o.kreamUrl = k.url || o.kreamUrl;
        if (k.ocrFixed) { o.extra.skuOcr = o.sku; o.sku = k.ocrFixed; }
        o.kreamRecent = (ba.fast || ba.normal ? "빠른 " + (ba.fast ? Number(ba.fast).toLocaleString() : "-") + " · 일반 " + (ba.normal ? Number(ba.normal).toLocaleString() : "-") + " · 바로판매 " + (ba.bid ? Number(ba.bid).toLocaleString() : "-") + (k.p95 && k.p95.length ? " · 95점 제외 " + k.p95.length + "건" : "") + " | " : "") + sizeTrades(kk, it.size).filter(function (t) { return x95.indexOf(t.price) < 0; }).slice(0, 5).map(function (t) { return t.date + " " + Number(t.price).toLocaleString(); }).join(" · ");
        o.kreamCheckedAt = new Date().toISOString();
        if (!o.name && k.name) o.name = k.name;
        logs.push({ sku: it.sku || it.name || "", size: it.size || "", kream_url: o.kreamUrl || "", last_trade: md, lowest_ask: o.kreamPrice, trades: o.kreamRecent, source: "helper" });
      }
      out.push(o);
    });
    var rowsDb = out.map(function (o) { return ERP.toRow("kream_wholesale", o); });
    try { await ERP.saveBatch("kream_wholesale", rowsDb); rowsDb.forEach(function (r) { ERP.applyRow("kream_wholesale", r); }); if (logs.length) await S.sb.from("kream_price_log").insert(logs); } catch (e) { ERP.toast(ERP.errMsg(e)); }
  }
  ERP.render(); ERP.toast("크림 확인을 마쳤어요.");
}
ERP.kreamFetch = fetchKream;
ERP.acts.kreamfetch = function () { var list = items().filter(function (x) { return x.listDate === v.kList; }); if (!list.length) return; if (!isMall(SUP()) && !wholesaleOn()) { ERP.toast("‘로우나 열무 크림도매 도우미’ 확장을 설치해야 빠른배송·일반배송·95점을 나눠 읽어요 (ERP 저장소 tools/kream-wholesale-helper)."); return; } fetchKream(list, isMall(SUP()) ? { gap: [10, 12], chan: "R" } : { chan: "W" }); };
/* 사진 → 표 읽기(ChatGPT, '로우나 도우미') → 도매 리스트 저장 → 크림 시세. pics = [{data: dataURL, name}] */
async function importPhotos(pics, sup, day, opt) {
  opt = opt || {}; var made = [], meta = { takeAll: false, supplier: "" };
  for (var i = 0; i < pics.length; i++) {
    ERP.toast("사진 읽는 중 " + (i + 1) + "/" + pics.length + " (20~60초)");
    try {
      var r = await ocrList(pics[i].data), vat = r.vatIncluded !== false; if (r.takeAll) meta.takeAll = true; if (r.supplier) meta.supplier = String(r.supplier).trim();
      var sp = sup === "auto" ? (String(r.supplier || "").trim() || "열무") : sup;
      (r.items || []).forEach(function (x) {
        var price = num(x.wholesalePrice); if (!price || !(x.sku || x.name)) return;
        made.push({ id: U.uid(), supplier: sp, listDate: day, brand: String(x.brand || "").trim(), sku: String(x.sku || "").trim(), name: String(x.name || "").trim(), kreamUrl: x.kreamUrlUnsure ? "" : String(x.kreamUrl || "").trim(), size: String(x.size || "F").trim() || "F", qty: num(x.qty) || 1, wholesalePrice: vat ? price : Math.round(price * 1.1), kreamPrice: null, kreamRecent: "", decision: "검토", memo: (vat ? "" : "사진 도매가 VAT 별도 → ×1.1 반영 · ") + "사진: " + pics[i].name, extra: { ocr: { skuUnsure: !!x.skuUnsure, urlUnsure: !!x.kreamUrlUnsure, rawUrl: x.kreamUrl || "", file: pics[i].name } } });
      });
    } catch (e) { ERP.toast("⚠ " + pics[i].name + ": " + e.message); }
  }
  /* 같은 사진을 두 번 올려도 중복 안 들어가게: 같은 공급처·날짜에 (크림링크 또는 품번)·사이즈·도매가가 같으면 건너뜀 */
  var dkey = function (o) { return [o.kreamUrl || String(o.sku).toUpperCase().replace(/[^A-Z0-9]/g, ""), String(o.size).toUpperCase(), num(o.wholesalePrice)].join("|"); };
  var had = {}; ERP.list("kream_wholesale").forEach(function (x) { if (x.listDate === day) had[(x.supplier || "열무") + "|" + dkey(x)] = x; });
  var before = made.length, dups = []; made = made.filter(function (o) { var k = o.supplier + "|" + dkey(o); if (had[k]) { if (had[k].id) dups.push(had[k]); return false; } had[k] = 1; return true; });
  if (before && !made.length) { ERP.toast("이미 올린 리스트예요 (" + before + "줄 모두 중복이라 안 넣었어요)."); return opt.wait ? { rows: dups, dup: true, meta: meta } : 0; }
  if (before > made.length) ERP.toast((before - made.length) + "줄은 이미 있어서 뺐어요.");
  if (!made.length) { ERP.toast("사진에서 상품 줄을 찾지 못했어요."); return opt.wait ? { rows: [], meta: meta } : 0; }
  var rowsDb = made.map(function (o) { return ERP.toRow("kream_wholesale", o); });
  try { await ERP.saveBatch("kream_wholesale", rowsDb); rowsDb.forEach(function (r) { ERP.applyRow("kream_wholesale", r); }); } catch (e) { ERP.toast(ERP.errMsg(e)); return opt.wait ? { rows: [], meta: meta, err: ERP.errMsg(e) } : 0; }
  v.kSup = made[0].supplier; v.kList = day; ERP.render(); ERP.toast(made.length + "줄을 넣었어요. 이제 크림에서 한 상품씩 확인해요 (상품당 10~30초).");
  if (opt.wait) { if (wholesaleOn()) await fetchKream(made, { chan: "W", onProgress: opt.onProgress }); return { rows: made, meta: meta }; }
  if (wholesaleOn()) fetchKream(made, { chan: "W" }).then(function () { tgNotifyRows(made, meta); }); else ERP.toast("크림 시세는 ‘로우나 열무 크림도매 도우미’를 켠 뒤 [크림 시세 다시 가져오기]로 채워 주세요.");
  return made.length;
}
function fileToData(f) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(f); }); }
/* 휴대폰(도우미 없음): 사진을 저장소에 올려 두면 PC1 ERP(도우미 켜짐)가 1분 안에 알아서 읽어서 넣음 (대표님 지시 2026-11-12) */
var QKEY = "kream_photo_queue";
function queue() { return Array.isArray(S.SET[QKEY]) ? S.SET[QKEY] : []; }
async function queuePhotos(files, sup, day) {
  var Q = queue().slice(), n = 0;
  for (var i = 0; i < files.length; i++) {
    ERP.toast("사진 올리는 중 " + (i + 1) + "/" + files.length);
    try {
      var data = await shrink(files[i]), blob = await (await fetch(data)).blob(), path = "kream-queue/" + day + "/" + U.uid() + ".jpg";
      var up = await S.sb.storage.from("evidence").upload(path, blob, { contentType: "image/jpeg", upsert: false }); if (up.error) throw up.error;
      Q.push({ path: path, name: files[i].name, sup: sup, day: day, at: new Date().toISOString() }); n++;
    } catch (e) { ERP.toast("⚠ " + files[i].name + ": " + ERP.errMsg(e)); }
  }
  if (n) { await ERP.saveSetting(QKEY, Q); ERP.render(); ERP.toast("사진 " + n + "장을 올렸어요. PC1 ERP가 켜져 있으면 1~2분 안에 읽어서 리스트에 넣어요."); }
}
var qBusy = false;
async function drainQueue() {
  if (qBusy || !helperOn()) return; var Q = queue(); if (!Q.length) return;
  qBusy = true;
  try {
    var by = {};
    Q.forEach(function (q) { var k = q.sup + "|" + q.day; (by[k] = by[k] || []).push(q); });
    for (var k in by) {
      var pics = [];
      for (var i = 0; i < by[k].length; i++) { var d = await S.sb.storage.from("evidence").download(by[k][i].path); if (d.error) continue; pics.push({ data: await fileToData(d.data), name: by[k][i].name + " (휴대폰)" }); }
      if (pics.length) await importPhotos(pics, by[k][0].sup, by[k][0].day);
      var done = by[k].map(function (q) { return q.path; });
      await ERP.saveSetting(QKEY, queue().filter(function (q) { return done.indexOf(q.path) < 0; }));
      await S.sb.storage.from("evidence").remove(done);
    }
  } finally { qBusy = false; }
}
setInterval(function () { try { if (S.SET && queue().length) drainQueue(); } catch (e) {} }, 15 * 1000);   /* 휴대폰 사진 15초마다 확인 (속도) */
ERP.acts.kreamphoto = function () {
  var inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.multiple = true;
  inp.onchange = async function () {
    var files = Array.prototype.slice.call(inp.files || []); if (!files.length) return;
    var day = U.today(), sup = SUP();
    if (!helperOn()) { await queuePhotos(files, sup, day); return; }
    var pics = []; for (var i = 0; i < files.length; i++) { try { pics.push({ data: await shrink(files[i]), name: files[i].name }); } catch (e) { ERP.toast("⚠ " + e.message); } }
    await importPhotos(pics, sup, day);
  };
  inp.click();
};
/* ---------- 국내몰 세일 목록 → 후보 ---------- */
function mallSku(name) {
  var t = String(name || "").trim(), m = t.match(/\/\s*([A-Za-z0-9][A-Za-z0-9\-]*\d[A-Za-z0-9\-]*)\s*$/) || t.match(/[_(]\s*([A-Za-z0-9\-]*\d[A-Za-z0-9\-_]{3,})\s*\)?\s*$/) || t.match(/\b([A-Za-z]{1,4}\d{2,}[A-Za-z0-9\-]{2,})\s*$/);
  return m && m[1].replace(/[^0-9]/g, "").length >= 2 ? m[1].trim() : "";
}
function parseMusinsa(p) {
  var ids = {}, out = [], L = String(p.text || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
  (p.links || []).forEach(function (a) { var id = (String(a.href || "").match(/musinsa\.com\/products\/(\d+)/) || [])[1], t = String(a.text || "").trim(); if (id && t && !ids[t]) ids[t] = id; });
  for (var i = 2; i < L.length - 1; i++) {
    var d = L[i].match(/^(\d{1,2})%$/), pr = (L[i + 1].match(/^([\d,]+)원$/) || [])[1]; if (!d || !pr) continue;
    var name = L[i - 1], id = ids[name] || "";
    out.push({ brand: L[i - 2], name: name, disc: +d[1], price: Number(pr.replace(/,/g, "")), id: id, url: id ? "https://www.musinsa.com/products/" + id : "" });
  }
  return out;
}
var mallRunning = false;
ERP.acts.kreammall = async function () {
  if (!resellOn()) { ERP.toast("크롬 확장 ‘로우나 리셀 도우미’가 꺼져 있어요. 설치 후 새로고침(F5)해 주세요."); return; }
  if (mallRunning) { ERP.toast("이미 진행 중이에요."); return; }
  var sup = SUP(), M = MALLS[sup]; if (!M) return; mallRunning = true;
  try {
    ERP.toast(M.label + " 목록 여는 중…");
    var all = parseMusinsa(await pageSafe({ url: M.url, waitFor: "할인율순", minLen: 1000, tries: 15 }, "R"));
    if (!all.length) { ERP.toast("⚠ 목록에서 상품을 읽지 못했어요 (화면 구조가 바뀌었을 수 있어요)."); return; }
    var day = U.today(), have = {}, brands = mallBrands(), skip = { disc: 0, brand: 0, sku: 0, dup: 0 }, made = [];
    ERP.list("kream_wholesale").forEach(function (x) { var m = (x.extra || {}).mall; if (m && m.id && x.supplier === sup && x.listDate === day) have[m.id] = 1; });
    all.forEach(function (x) {
      if (made.length >= mallMax()) return;
      if (x.disc < mallMin()) { skip.disc++; return; }
      var t = (x.brand + " " + x.name).toUpperCase();
      if (brands.length && !brands.some(function (b) { return t.indexOf(b.toUpperCase()) >= 0; })) { skip.brand++; return; }
      var sku = mallSku(x.name); if (!sku) { skip.sku++; return; }
      if (x.id && have[x.id]) { skip.dup++; return; }
      made.push({ id: U.uid(), supplier: sup, listDate: day, brand: x.brand, sku: sku, name: x.name, kreamUrl: "", size: "F", qty: 1, wholesalePrice: x.price, kreamPrice: null, kreamRecent: "", decision: "검토",
        memo: sup + " " + x.disc + "% 세일 · 목록가 " + x.price.toLocaleString("ko-KR") + "원 · 정가 약 " + Math.round(x.price / (1 - x.disc / 100) / 100) * 100 + "원",
        extra: { mall: { site: sup, id: x.id, url: x.url, disc: x.disc, price: x.price, at: new Date().toISOString() } } });
    });
    var why = "목록 " + all.length + "개 중 " + made.length + "개 확인 (할인율 미달 " + skip.disc + " · 브랜드 제외 " + skip.brand + " · 품번 없음 " + skip.sku + " · 오늘 이미 담음 " + skip.dup + ")";
    if (!made.length) { ERP.toast(why); return; }
    var rowsDb = made.map(function (o) { return ERP.toRow("kream_wholesale", o); });
    await ERP.saveBatch("kream_wholesale", rowsDb); rowsDb.forEach(function (r) { ERP.applyRow("kream_wholesale", r); });
    v.kList = day; ERP.render(); ERP.toast(why);
    await fetchKream(made, { gap: [10, 12], chan: "R" });
  } catch (e) { ERP.toast("⚠ " + e.message); }
  finally { mallRunning = false; }
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
/* ===================== 텔레그램 자동계산 봇 (대표님 지시 2026-11-13) =====================
   흐름: 텔레그램 봇에 리스트 사진(또는 이미지 파일) 전송 → PC1 ERP가 5초마다 확인 → 사진 읽기(로우나 도우미)
        → 크림 사이즈별 시세(열무 크림도매 도우미) → 계산 → 진행 상황·결과를 같은 대화방에 답장
   보안: 봇 토큰은 이 PC 브라우저에만 저장(서버·드라이브에 안 올림). 처음 /start 보낸 대화방 1곳만 응답, 나머지는 무시.
   한 PC에서만 켜기(두 PC가 같이 켜면 메시지를 나눠 가져가요). */
var TGK = { tok: "rowna_tg_token", chat: "rowna_tg_chat", off: "rowna_tg_off", on: "rowna_tg_on", log: "rowna_tg_log" };
var TG = { busy: false, lastPoll: 0, err: "", jobs: [] };
function lsg(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
function lss(k, v) { try { if (v === "" || v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
function tgOn() { return !!(lsg(TGK.tok) && lsg(TGK.on) === "1"); }
function tgLog(t) { var a = []; try { a = JSON.parse(lsg(TGK.log) || "[]"); } catch (e) {} a.unshift({ at: new Date().toISOString(), t: String(t).slice(0, 300) }); lss(TGK.log, JSON.stringify(a.slice(0, 40))); }
async function tgApi(m, body) {
  /* JSON 헤더를 쓰면 브라우저 사전요청(CORS)에 막혀서, 폼 형식으로 보냄 */
  var fd = new URLSearchParams(); Object.keys(body || {}).forEach(function (k) { var x = body[k]; if (x != null) fd.append(k, typeof x === "object" ? JSON.stringify(x) : String(x)); });
  var r = await fetch("https://api.telegram.org/bot" + lsg(TGK.tok) + "/" + m, { method: "POST", body: fd });
  var j = await r.json(); if (!j.ok) throw new Error("텔레그램: " + (j.description || r.status)); return j.result;
}
function th(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function tgSend(text, extra) { if (!lsg(TGK.chat)) return Promise.resolve(null); return tgApi("sendMessage", Object.assign({ chat_id: lsg(TGK.chat), text: text, parse_mode: "HTML", disable_web_page_preview: true }, extra || {})).catch(function (e) { tgLog("보내기 실패 " + e.message); return null; }); }
function tgEdit(msg, text) { if (!msg) return tgSend(text); return tgApi("editMessageText", { chat_id: lsg(TGK.chat), message_id: msg.message_id, text: text, parse_mode: "HTML", disable_web_page_preview: true }).catch(function () { return null; }); }
async function tgPhoto(fid) {
  var f = await tgApi("getFile", { file_id: fid });
  var r = await fetch("https://api.telegram.org/file/bot" + lsg(TGK.tok) + "/" + f.file_path); if (!r.ok) throw new Error("사진 내려받기 실패 " + r.status);
  var b = await r.blob(); return await shrink(new File([b], "tg.jpg", { type: b.type || "image/jpeg" }));
}
var w0 = function (n) { return n == null || isNaN(n) ? "–" : Math.round(n).toLocaleString("ko-KR"); };
/* 결과 메시지: 상품별 판단 + 리스트 전체(테이크올) 판단 */
function tgReport(rows, meta, sec) {
  rows = rows.map(function (r) { return ERP.DATA.kream_wholesale.get(r.id) || r; });
  var L = [], T = { q: 0, w: 0, ask: 0, trd: 0, rq: 0, rqReal: 0, miss: 0, conf: 0 };
  rows.forEach(function (it) {
    var c = calc(it), q = num(it.qty), k = (it.extra || {}).kream || {}, b = KB(it), sp = speed(k), rq = recQty(it, c);
    var ct = b.trade ? calc(Object.assign({}, it, { kreamPrice: b.trade })) : null;
    var useT = ct && c && ct.real < c.real ? ct : c;   /* 보수적으로: 체결가 기준이 더 낮으면 그걸로 합계 */
    T.q += q; T.w += cost(it) * q; if (c) T.ask += c.real * q; if (useT) T.trd += useT.real * q; if (rq) { T.rq += rq; T.rqReal += (useT || c).real * rq; }
    var head = (c ? (c.verdict === "추천" ? "✅" : c.verdict === "검토" ? "🟡" : "❌") : "❓") + " <b>" + th((it.brand || "") + " " + (it.sku || "")) + "</b> " + th(it.size || "F") + " ×" + q;
    var body = [];
    if (k.needConfirm && !(it.extra || {}).confirmed) { T.conf++; body.push("🔍 리스트 품번으로 못 찾아 상품명으로 찾음 → 크림 " + th(k.model) + " 사진 확인 필요"); }
    if (!c) { T.miss++; body.push(k.error ? "크림 확인 실패: " + th(k.error) : !k.verified ? "크림에서 같은 품번을 못 찾음" : th(it.size) + " 판매입찰 없음"); }
    else {
      body.push("도매 " + w0(cost(it)) + " → 보판 " + w0(b.fast) + " / 일반 " + w0(b.normal) + (b.trade ? " · 체결 " + w0(b.trade) : ""));
      body.push("개당 <b>" + (c.real >= 0 ? "+" : "") + w0(c.real) + "</b> (" + (c.rate * 100).toFixed(1) + "%)" + (ct ? " · 체결가면 " + (ct.real >= 0 ? "+" : "") + w0(ct.real) : ""));
      body.push((sp ? (k.sizeRead ? th(it.size) + " " : "") + "월 " + sp.perMonth + "건" + (q > 1 && sp.perMonth ? " · " + q + "개 소진 " + (Math.round(q / sp.perMonth * 10) / 10) + "개월" : "") : "최근 체결 없음") + " · 추천 " + (rq || 0) + "개" + (tgt(it) ? " · 8% 목표가 " + w0(tgt(it)) : ""));
      if (b.trade && num(it.kreamPrice) > b.trade * 1.08) body.push("⚠ 보판가가 체결가보다 " + Math.round((num(it.kreamPrice) / b.trade - 1) * 100) + "% 높음");
    }
    L.push(head + "\n   " + body.join("\n   "));
  });
  var sup = (rows[0] && rows[0].supplier) || meta.supplier || "", day = (rows[0] && rows[0].listDate) || U.today();
  var all = "📦 리스트 전체 " + T.q + "개 · 도매 " + w0(T.w) + "원\n💰 전부 사면 예상 이익 <b>" + w0(T.trd) + "원</b> (보수적·체결가 기준)" + (Math.round(T.ask) !== Math.round(T.trd) ? " / 보판가 기준 " + w0(T.ask) + "원" : "");
  var verdict = T.miss ? "❓ 시세 못 찾은 상품 " + T.miss + "개 — 확인 후 판단" : T.trd > 0 && T.trd / T.w >= 0.08 ? "👉 <b>테이크올 추천</b> (전체 이익률 " + (T.trd / T.w * 100).toFixed(1) + "%)" : T.trd > 0 ? "👉 <b>테이크올 검토</b> (전체 이익률 " + (T.trd / T.w * 100).toFixed(1) + "% — 얇음, 단가 협상 권장)" : "👉 <b>테이크올 비추천</b> (전체 손실 예상)";
  if (!meta.takeAll) verdict += "\n🛒 골라 사면: 추천 " + T.rq + "개 · 예상 이익 " + w0(T.rqReal) + "원";
  if (T.conf) verdict += "\n🔍 사진 확인 필요 " + T.conf + "건 (ERP에서 [같은 상품 맞음] 눌러야 확정)";
  return "🧾 <b>" + th(sup) + " " + th(day) + "</b>" + (meta.takeAll ? " · 테이크올 조건" : "") + "\n\n" + L.join("\n\n") + "\n\n" + all + "\n" + verdict + "\n\n⏱ " + Math.round(sec) + "초 · <a href=\"" + location.origin + location.pathname + "#kream-yeolmu\">ERP에서 보기</a>";
}
function tgNotifyRows(rows, meta) { if (!tgOn() || !rows || !rows.length) return; tgSend(tgReport(rows, meta || {}, 0).replace(/\n\n⏱ 0초 · /, "\n\n")); }
async function tgJob(msgs) {
  var t0 = Date.now(), cap = msgs.map(function (m) { return m.caption || ""; }).join(" ").trim();
  var sup = (cap.match(/(?:공급처|업체)\s*[:：]?\s*([^\s,]+)/) || [])[1] || (suppliers().filter(function (s) { return cap.indexOf(s) >= 0; })[0]) || "auto";
  var pm = await tgSend("📥 리스트 사진 " + msgs.length + "장 받았어요 · 읽는 중… (20~60초)");
  if (!helperOn()) { await tgEdit(pm, "⚠ PC1 ERP에서 ‘로우나 도우미’(사진 읽기)가 꺼져 있어요. 크롬 확장을 켜 주세요."); return; }
  if (!wholesaleOn()) await tgSend("⚠ ‘열무 크림도매 도우미’가 꺼져 있어 크림 시세는 못 읽어요. 사진만 ERP에 넣을게요.");
  var pics = [];
  for (var i = 0; i < msgs.length; i++) {
    var m = msgs[i], fid = m.photo ? m.photo[m.photo.length - 1].file_id : m.document && /^image\//.test(m.document.mime_type || "") ? m.document.file_id : null;
    if (!fid) continue;
    try { pics.push({ data: await tgPhoto(fid), name: "텔레그램 " + (i + 1) }); } catch (e) { await tgSend("⚠ " + th(e.message)); }
  }
  if (!pics.length) { await tgEdit(pm, "⚠ 사진을 못 받았어요."); return; }
  var res = await importPhotos(pics, sup, U.today(), { wait: true, onProgress: function (n, tot, label) { tgEdit(pm, "🔎 크림 확인 중 " + n + "/" + tot + " · " + th(label)); } });
  if (!res.rows.length) { await tgEdit(pm, "⚠ 사진에서 상품 줄을 못 찾았어요" + (res.err ? " (" + th(res.err) + ")" : "") + ". 표가 잘 보이게 다시 보내 주세요."); return; }
  if (res.dup) { var miss = res.rows.filter(function (r) { return r.kreamPrice == null; }); if (miss.length && wholesaleOn()) await fetchKream(miss, { chan: "W" }); }
  await tgEdit(pm, (res.dup ? "♻ 이미 받은 리스트라 지난 계산을 보여드려요." : "✅ 계산 끝") + " · " + res.rows.length + "줄");
  await tgSend(tgReport(res.rows, res.meta || {}, (Date.now() - t0) / 1000));
  tgLog("처리 " + res.rows.length + "줄 " + Math.round((Date.now() - t0) / 1000) + "초");
}
async function tgText(m) {
  var t = String(m.text || "").trim();
  if (/^\/start/.test(t)) { await tgSend("🤖 로우나 크림 계산봇이에요.\n도매 리스트 <b>사진(여러 장 가능)</b>을 보내면 크림 사이즈별 시세·거래량으로 계산해서 답장해요.\n캡션에 공급처를 적으면(예: 수고개) 그 이름으로 저장해요.\n\n/status 상태 · /last 마지막 리스트 다시 보기"); return; }
  if (/^\/status/.test(t)) { await tgSend("상태: 사진 읽기 도우미 " + (helperOn() ? "✅" : "❌") + " · 열무 크림도매 도우미 " + (wholesaleOn() ? "✅" : "❌") + " · 대기 " + TG.jobs.length + "건" + (TG.err ? "\n최근 오류: " + th(TG.err) : "")); return; }
  if (/^\/last/.test(t)) { var ds = ERP.list("kream_wholesale").map(function (x) { return x.listDate + "|" + (x.supplier || "열무"); }).sort().reverse()[0]; if (!ds) { await tgSend("리스트가 없어요."); return; } var p = ds.split("|"); await tgSend(tgReport(ERP.list("kream_wholesale").filter(function (x) { return x.listDate === p[0] && (x.supplier || "열무") === p[1]; }), {}, 0)); return; }
  await tgSend("사진을 보내 주세요. (/status · /last)");
}
async function tgPoll() {
  if (TG.busy || !tgOn()) return; TG.busy = true;
  try {
    var ups = await tgApi("getUpdates", { offset: Number(lsg(TGK.off) || 0), timeout: 0, allowed_updates: ["message"] }); TG.lastPoll = Date.now(); TG.err = "";
    var groups = {}, order = [];
    for (var i = 0; i < ups.length; i++) {
      var u = ups[i], m = u.message; lss(TGK.off, String(u.update_id + 1)); if (!m) continue;
      var cid = String(m.chat && m.chat.id);
      if (!lsg(TGK.chat)) { if (/^\/start/.test(m.text || "")) { lss(TGK.chat, cid); tgLog("대화방 연결 " + cid); } else continue; }
      if (cid !== lsg(TGK.chat)) { tgLog("다른 대화방 무시 " + cid); continue; }
      if (m.photo || (m.document && /^image\//.test(m.document.mime_type || ""))) { var gk = m.media_group_id || ("m" + m.message_id); if (!groups[gk]) { groups[gk] = []; order.push(gk); } groups[gk].push(m); }
      else if (m.text) await tgText(m);
    }
    order.forEach(function (gk) { TG.jobs.push(groups[gk]); });
  } catch (e) { TG.err = e.message; } finally { TG.busy = false; }
  tgRun();
}
async function tgRun() {   /* 리스트는 한 번에 하나씩(크림 차단 방지) */
  if (TG.running || !TG.jobs.length) return; TG.running = true;
  try { while (TG.jobs.length) { var j = TG.jobs.shift(); try { await tgJob(j); } catch (e) { TG.err = e.message; tgLog("오류 " + e.message); await tgSend("⚠ 처리 중 오류: " + th(e.message)); } } } finally { TG.running = false; }
}
setInterval(function () { try { if (S.SET && tgOn()) tgPoll(); } catch (e) {} }, 5000);
ERP.tgReport = tgReport;
/* 안전장치: 사진은 읽혔는데 크림 시세가 안 채워진 줄(최근 2일)이 있으면 1분마다 자동으로 다시 확인 (PC1·열무 도우미 켜진 곳만) */
var autoBusy = false;
setInterval(async function () {
  try {
    if (autoBusy || !S.SET || !wholesaleOn() || qBusy || TG.running) return;
    var lo = U.shiftDay ? U.shiftDay(U.today(), -1) : U.today();
    var rows = ERP.list("kream_wholesale").filter(function (x) { return !isMall(x.supplier) && (x.listDate || "") >= lo && x.kreamPrice == null && !(x.extra || {}).kream && !busy[x.id] && Date.now() - new Date(x.createdAt || 0) > 90 * 1000; });
    if (!rows.length) return;
    autoBusy = true; await fetchKream(rows, { chan: "W" }); tgNotifyRows(rows, {});
  } catch (e) {} finally { autoBusy = false; }
}, 60 * 1000);
function tgPanel() {
  var on = tgOn(), has = !!lsg(TGK.tok), log = []; try { log = JSON.parse(lsg(TGK.log) || "[]"); } catch (e) {}
  return '<div class="panel"><h2>🤖 텔레그램 자동계산 봇 <small class="muted">(이 PC에서만 · PC1 권장)</small></h2>' +
    '<p>' + (on ? '<span class="pill p-good">켜짐</span> ' : '<span class="pill p-mute">꺼짐</span> ') + (lsg(TGK.chat) ? '대화방 연결됨' : (has ? '봇에게 <b>/start</b>를 보내면 연결돼요' : '')) + (TG.lastPoll ? ' · 마지막 확인 ' + new Date(TG.lastPoll).toLocaleTimeString("ko-KR") : "") + (TG.err ? ' · <span class="neg">' + esc(TG.err) + "</span>" : "") + "</p>" +
    '<div class="fg narrow"><div class="fd"><label for="tg-tok">봇 토큰 (BotFather에서 받은 값 · 이 PC에만 저장)</label><input id="tg-tok" type="password" autocomplete="off" placeholder="' + (has ? "저장됨 — 바꿀 때만 입력" : "123456:ABC…") + '"></div></div>' +
    '<div class="tools"><button class="btn pri" data-act="tgsave">저장하고 켜기</button> <button class="btn" data-act="tgoff">' + (on ? "끄기" : "켜기") + '</button> <button class="btn" data-act="tgtest">테스트 메시지</button> <button class="btn" data-act="tgreset">연결 초기화</button></div>' +
    (log.length ? '<details><summary>최근 기록</summary><small>' + log.slice(0, 10).map(function (x) { return esc(x.at.slice(5, 16).replace("T", " ") + " " + x.t); }).join("<br>") + "</small></details>" : "") + "</div>";
}
ERP.acts.tgsave = async function () { var v2 = (document.getElementById("tg-tok") || {}).value || ""; v2 = v2.trim(); if (v2) lss(TGK.tok, v2); if (!lsg(TGK.tok)) { ERP.toast("토큰을 넣어 주세요."); return; } try { var me = await tgApi("getMe"); await tgApi("deleteWebhook", {}); lss(TGK.on, "1"); ERP.toast("@" + me.username + " 연결됨. 텔레그램에서 봇에게 /start 를 보내세요."); } catch (e) { ERP.toast("⚠ " + e.message); } ERP.render(); };
ERP.acts.tgoff = function () { lss(TGK.on, tgOn() ? "" : "1"); ERP.render(); };
ERP.acts.tgtest = async function () { if (!lsg(TGK.chat)) { ERP.toast("먼저 봇에게 /start 를 보내 주세요."); return; } await tgSend("✅ ERP 연결 테스트 — " + new Date().toLocaleString("ko-KR")); ERP.toast("보냈어요."); };
ERP.acts.tgreset = function () { lss(TGK.chat, ""); lss(TGK.off, ""); ERP.toast("대화방 연결을 지웠어요. 봇에게 /start 를 다시 보내세요."); ERP.render(); };
ERP.page({ id: "kream-yeolmu", title: "열무 크림도매", roles: ["owner", "accountant", "staff", "ai"], render: render, bind: bind });
})();
