/* 메뉴: 크림 › 로우나재고 크림 — 보유 재고를 크림 시세(95점 제외)로 판별해 비싸게 팔기 (대표님 지시 2026-11-12)
   탭 2개: 보판(재고실사 위치 KREAM) / 일반판매(그 밖의 보유 재고)
   - 크림 가격: 같은 옵션(사이즈)의 빠른배송·사업자(보판가) / 일반배송 판매입찰가만. 95점과 같은 옵션·같은 가격은 1건씩 뺌
   - 추천가 2개: ① 최근 체결가 기준(기본, 같은 옵션 최근 5건 중간값) ② 최저가 맞추기. 체결이 3건 미만이면 ①을 최저가로 바꾸고 표시
   - 보판: 보관료 월 3,000원 × 개월 / 일반판매: 택배비 기본 3,500원(합배송은 0원으로 직접 수정)
   - 수수료: 크림 판매자 Level1 (calc.js kream())
   - 시세: 전체는 하루 2번(09시·21시) 자동, 보판 상품은 10분마다(설정) + 새로고침 버튼, 바뀌면 변동 알림
   - 크림 조회는 전용 확장 ‘로우나재고 크림 도우미’(통로 rownaS, tools/kream-stock-helper)로만 — 다른 도우미와 안 겹침 */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, C = ERP.C, esc = U.esc, won = U.won, pct = U.pct, num = U.num;
var v = ERP.view, KEY = "kream_stock", waits = {}, busy = false, CAND = {};
function on() { return document.documentElement.dataset.rownaStock === "1"; }
window.addEventListener("message", function (e) { var d = e.data; if (e.source !== window || !d || d.rownaS !== "res" || !waits[d.id]) return; var f = waits[d.id]; delete waits[d.id]; f(d); });
function askS(url) {
  return new Promise(function (res, rej) {
    if (!on()) { rej(new Error("크롬 확장 ‘로우나재고 크림 도우미’가 꺼져 있어요. 설치 후 ERP를 새로고침(F5)해 주세요. (ERP 저장소 tools/kream-stock-helper)")); return; }
    var id = U.uid(); waits[id] = function (d) { d.ok ? res(d.data) : rej(new Error(d.error || "실패")); };
    window.postMessage({ rownaS: "req", id: id, type: "page", url: url, waitFor: /products/.test(url) ? "모델번호|발매가" : "관심|검색 결과가 없습니다", minLen: 200 }, location.origin);
  });
}
var BLOCK_RE = /비정상적인 (접근|요청)|접근이 (차단|제한)|Access Denied|자동입력 방지|보안 문자|too many requests|잠시 후 다시 시도/i;
async function page(url) { var p = await askS(url); if (BLOCK_RE.test(String((p && p.text) || "").slice(0, 3000))) throw new Error("차단·경고 화면이 보여서 멈췄어요"); return p; }

/* ---------- 저장 (app_settings.kream_stock) ---------- */
function D() { var d = S.SET[KEY]; if (!d || typeof d !== "object") d = {}; ["map", "px", "ship", "alerts", "cand"].forEach(function (k) { if (!d[k]) d[k] = k === "alerts" ? [] : {}; }); return d; }
async function save(d) { var res = await S.sb.from("app_settings").upsert({ key: KEY, value: d }); if (res.error) ERP.toast(ERP.errMsg(res.error)); else S.SET[KEY] = d; }
function months() { return D().months == null ? 1 : num(D().months); }
function SHIP() { return 3500; }
/* 크림 판매자 등급 수수료 (크림 FAQ, 2026.3.2 적용 · 대표님 제공): 기본 2,500원(프리미엄 20,000원) + 등급 %, 모두 VAT 별도, VAT 포함 최대 30만원 */
var KREAM_LEVELS = { 1: [0.06, 0.03], 2: [0.0585, 0.029], 3: [0.057, 0.028], 4: [0.056, 0.027], 5: [0.055, 0.026] };
function klevel() { return num(S.SET.kream_level) || 1; }
function rate() { return S.SET.kream_level ? KREAM_LEVELS[klevel()][0] : S.SET.kream_fee_rate == null ? 0.06 : Number(S.SET.kream_fee_rate); }
function premRate() { return KREAM_LEVELS[klevel()][1]; }
function cap() { return S.SET.kream_fee_cap == null ? 300000 : num(S.SET.kream_fee_cap); }
function base() { return S.SET.kream_fee_base == null ? 2500 : num(S.SET.kream_fee_base); }
function premium(it) { var b = String(it.brand || "").toUpperCase(), t = (it.name || "") + " " + (it.model || ""); return /^(CH|HM|CHANEL|HERMES|샤넬|에르메스)$/.test(b) && /백|BAG|가방|토트|숄더|클러치|버킨|켈리|AS\d{4}/i.test(t); }

/* ---------- 재고 → 행 ---------- */
function inv() { var d = S.SET.stock_inventory; return (d && d.items) || {}; }
/* 오래된 재고 (대표님 지시 2026-11-18: 60일 기준) — 입고일(로트 날짜, 없으면 등록일)부터 오늘까지 */
var OLD_DAYS = 60, MUSTIT_COST = 0.141;   /* 머스트잇 총비용 14.1% (그로스패키지 수수료 기준, 2026-11 계산) */
function lotAge(x) { var d = String(x.date || x.at || "").slice(0, 10); if (!/^\d{4}-\d\d-\d\d$/.test(d)) return 0; return Math.max(0, Math.round((new Date(U.today() + "T00:00:00") - new Date(d + "T00:00:00")) / 864e5)); }
function oldAdvice(r, c) {
  if (r.cost == null) return { t: "매입가 없음 → 재고실사에서 매입가 입력", cls: "" };
  var mu = Math.ceil(r.cost / (1 - MUSTIT_COST) / 1000) * 1000, muTxt = "머스트잇 등 기존 판로: " + won(mu) + "원 이상이면 본전";
  if (!c) return { t: (r.pid ? "크림 시세 새로고침 필요" : "크림 번호 연결 필요") + " · " + muTxt, cls: "" };
  if (c.aP && c.aP.real > 0) return { t: "크림 체결가 " + won(c.a) + "원에 판매 → +" + won(c.aP.real) + "원", cls: "p-good" };
  if (c.bP && c.bP.real > 0) return { t: "크림 최저가 " + won(c.low) + "원 맞추기 → +" + won(c.bP.real) + "원", cls: "p-good" };
  var bp = c.x && c.x.bid ? profit(r, r.sub, c.x.bid) : null;
  if (bp && bp.real > -30000) return { t: "크림 바로판매(구매입찰 " + won(c.x.bid) + ") → " + won(bp.real) + "원 · 재고 빨리 털기", cls: "p-acc" };
  return { t: "크림은 손해 → " + muTxt + (r.sub === "bo" ? " · 크림 창고 보관 중이면 반송 검토" : ""), cls: "p-crit" };
}
function guessSize(opt) { var m = String(opt || "").toUpperCase().match(/(?:^|[\s\/,])(XXXL|XXL|XL|XS|XXS|S|M|L|\d{2,3}(?:\.5)?|\d(?:\.5)?)\s*$/); return m ? m[1] : ""; }
function rows(tab) {
  var out = [], I = inv();
  Object.keys(I).forEach(function (k) {
    var it = I[k]; if (!it) return;
    var L = (it.lots || []).filter(function (x) { return !x.out && (tab === "old" ? lotAge(x) >= OLD_DAYS : (String(x.loc || "").toUpperCase() === "KREAM") === (tab === "bo")); });
    if (!L.length) return;
    var sub = L.every(function (x) { return String(x.loc || "").toUpperCase() === "KREAM"; }) ? "bo" : "nm", days = Math.max.apply(null, L.map(lotAge));
    var pr = L.map(function (x) { return x.price === "" || x.price == null ? null : num(x.price); }).filter(function (x) { return x != null && x > 0; });
    var m = D().map[k] || {};
    out.push({ key: k, it: it, qty: L.length, cost: pr.length ? Math.round(pr.reduce(function (a, b) { return a + b; }, 0) / pr.length) : null, noCost: L.length - pr.length, pid: m.pid || "", size: m.size != null ? m.size : guessSize(it.opt), sub: tab === "old" ? sub : tab, days: days });
  });
  if (tab === "old") return out.sort(function (a, b) { return b.days - a.days; });
  return out.sort(function (a, b) { return (a.it.brand || "").localeCompare(b.it.brand || "") || (a.it.model || "").localeCompare(b.it.model || ""); });
}

/* ---------- 크림 상세 읽기 (전용 도우미가 거래 내역 창 전체 + 95점 목록을 읽어 줌) ---------- */
function szn(x) { return String(x || "").toUpperCase().replace(/\s/g, "").replace(/^UK|^US|^W(?=\d)/, "").replace(/W$/, ""); }
function free(x) { return !x || /^(F|FREE|TU|OS|ONESIZE)$/.test(szn(x)) || /^ONE ?SIZE/i.test(String(x)); }
function same(want, got) { if (free(want)) return true; return szn(want) === szn(got); }
function priceOf(t) { return Number(String(t).replace(/[^\d]/g, "")) || 0; }
function summarize(p, size) {
  var t = p.text || "", k = p.kream || {}, fu = k.full;
  var r = { at: new Date().toISOString(), name: String(p.title || "").replace(/\s*정품 안심 거래\s*\|\s*KREAM\s*$/, "").trim(), model: ((t.match(/모델번호\s*\n*\s*([^\n]+)/) || [])[1] || "").trim(), size: size, img: ((p.meta || {})["og:image"] || "") };
  var tc = t.match(/\n거래\s+([\d,.]+)(만)?\s*\n/) || []; r.tc = tc[1] ? Math.round(Number(tc[1].replace(/,/g, "")) * (tc[2] ? 10000 : 1)) : 0;
  if (!fu && p.kg && p.kg.length >= 2) {
    /* 요약 탭(사이즈 페이지라 그 옵션만, 상위 5건) + 본문 거래 내역(날짜) */
    var tt = [], i0 = t.indexOf("거래일"), j0 = t.indexOf("거래 내역 더보기");
    if (i0 >= 0) { var seg = t.slice(i0 + 3, j0 > i0 ? j0 : i0 + 1500), re = /([^\n]+)\n([\d,]+)원\n([^\n]+)/g, mm; while ((mm = re.exec(seg)) && tt.length < 10) tt.push({ opt: mm[1].trim(), price: priceOf(mm[2]), tail: mm[3].trim() }); }
    fu = { asks: p.kg[1] || [], bids: p.kg[2] || [], trades: tt.length ? tt : (p.kg[0] || []).map(function (x) { return { opt: x.opt, price: x.price, tail: "" }; }) };
  }
  if (!fu) { r.err = "거래 내역을 못 읽었어요" + (k.step ? " (" + k.step + ")" : ""); return r; }
  /* 95점: 같은 옵션(사이즈)·같은 가격인 판매입찰만 1건씩 뺌 */
  var x95 = (k.p95 || []).filter(function (q) { return !q.opt || same(size, q.opt) || free(q.opt); }).map(function (q) { return q.price; }), left = x95.slice(), n95 = 0;
  var asks = fu.asks.filter(function (a) { return same(size, a.opt); }).filter(function (a) { var j = left.indexOf(a.price); if (j >= 0) { left.splice(j, 1); n95++; return false; } return true; });
  var fast = asks.filter(function (a) { return a.fast; }).map(function (a) { return a.price; }).sort(function (a, b) { return a - b; });
  var norm = asks.filter(function (a) { return !a.fast; }).map(function (a) { return a.price; }).sort(function (a, b) { return a - b; });
  var tr = fu.trades.filter(function (x) { return same(size, x.opt) && x95.indexOf(x.price) < 0; }).map(function (x) { return { price: x.price, date: x.tail || "" }; });
  var bids = fu.bids.filter(function (b) { return same(size, b.opt); }).map(function (b) { return b.price; });
  r.fast = fast[0] || null; r.normal = norm[0] || null; r.fastL = fast.slice(0, 3); r.normL = norm.slice(0, 3);
  r.trades = tr.slice(0, 8); r.bid = bids.length ? Math.max.apply(null, bids) : null; r.n95 = n95;
  return r;
}
function median(a) { a = a.slice().sort(function (x, y) { return x - y; }); var n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null; }

/* ---------- 계산 ---------- */
function extra(r, tab) { if (tab === "bo") return 3000 * Math.max(0, months() - 1);   /* 첫 30일 무료 */ var s = D().ship[r.key]; return s == null || s === "" ? SHIP() : num(s); }
function profit(r, tab, sell) { if (!sell || r.cost == null) return null; var p = premium(r.it), c = C.kream(sell, r.cost + extra(r, tab), p ? premRate() : rate(), cap(), p ? 20000 : base()); return c; }
function rec(r, tab) {
  var x = D().px[r.key]; if (!x || x.err) return null;
  var low = tab === "bo" ? (x.fast || x.normal) : (x.normal || x.fast), lowBy = tab === "bo" ? (x.fast ? "보판" : "일반") : (x.normal ? "일반" : "보판");
  var tp = (x.trades || []).slice(0, 5).map(function (t) { return t.price; }), md = tp.length >= 3 ? Math.round(median(tp) / 1000) * 1000 : null;
  var a = md || low, aNote = md ? "체결 " + tp.length + "건 중간값" : "체결 부족 → 최저가";
  return { x: x, low: low, lowBy: lowBy, a: a, aNote: aNote, aP: profit(r, tab, a), bP: profit(r, tab, low), be: profit(r, tab, low || a) };
}

/* ---------- 화면 ---------- */
function T() { return v.ksTab || "bo"; }
function render() {
  var tab = T(), R = rows(tab), d = D(), unseen = d.alerts.filter(function (a) { return !a.seen; });
  var h = '<div class="head"><div><h1>로우나재고 크림</h1><p>보유 재고를 크림 시세(95점 제외, 같은 옵션만)로 판별해요 · ' + (on() ? '<span class="pill p-good">로우나재고 크림 도우미 켜짐</span>' : '<span class="pill p-crit" title="tools/kream-stock-helper 를 크롬 확장으로 설치하세요">로우나재고 크림 도우미 꺼짐</span>') +
    (d.auto ? "" : ' · <span class="pill">자동 확인 꺼짐 — ↻ 버튼으로만</span>') + (d.lastAuto ? ' · 마지막 자동 확인 ' + esc(new Date(d.lastAuto).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })) : "") + '</p></div><div class="tools">' +
    '<button class="btn ' + (tab === "bo" ? "pri" : "") + '" data-act="ksbo">보판 (' + rows("bo").length + ')</button><button class="btn ' + (tab === "nm" ? "pri" : "") + '" data-act="ksnm">일반판매 (' + rows("nm").length + ')</button><button class="btn ' + (tab === "old" ? "pri" : "") + '" data-act="ksold">⏳ ' + OLD_DAYS + '일+ (' + rows("old").length + ')</button>' +
    '<button class="btn" data-act="ksrefresh"' + (busy ? " disabled" : "") + '>' + (busy ? "확인 중…" : "↻ 시세 새로고침") + '</button><button class="btn" data-act="ksfindall"' + (busy ? " disabled" : "") + '>🔍 크림 연결 안 된 재고 후보 찾기</button></div></div>';
  if (unseen.length) h += '<div class="panel"><h2>🔔 시세 변동 ' + unseen.length + '건</h2><ul class="note">' + unseen.slice(-20).reverse().map(function (a) { return "<li>" + esc(a.text) + ' <small class="muted">' + esc(new Date(a.at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })) + "</small></li>"; }).join("") + '</ul><button class="btn sm" data-act="ksseen">모두 확인</button></div>';
  var T0 = { qty: 0, cost: 0, a: 0, b: 0 };
  var body = R.map(function (r) {
    var it = r.it, c = rec(r, r.sub || tab), x = c && c.x, px = D().px[r.key], adv = tab === "old" ? oldAdvice(r, c) : null;
    T0.qty += r.qty; if (r.cost != null) T0.cost += r.cost * r.qty; if (c && c.aP) T0.a += c.aP.real * r.qty; if (c && c.bP) T0.b += c.bP.real * r.qty;
    function pcell(P, price, note) { if (!price) return '<td class="r">–</td>'; return '<td class="r num"><b>' + won(price) + "</b>" + (note ? '<small class="muted">' + esc(note) + "</small>" : "") + (P ? '<small class="' + (P.real < 0 ? "neg" : "") + '">' + won(P.real) + " · " + pct(P.rate) + "</small>" : '<small class="muted">매입가 없음</small>') + "</td>"; }
    var link = r.pid ? '<a href="https://kream.co.kr/products/' + esc(r.pid) + '" target="_blank" rel="noopener">크림 #' + esc(r.pid) + " ↗</a>" : "";
    var cl = CAND[r.key] || D().cand[r.key], cand = cl && cl.length ? '<select class="ctl" data-kspick="' + esc(r.key) + '"><option value="">후보 선택 (색상·하드웨어 꼭 확인)</option>' + cl.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.text) + "</option>"; }).join("") + "</select>" : "";
    var img = it.photo || (D().map[r.key] || {}).img || (px && px.img) || "";
    return "<tr><td style=\"width:64px\">" + (img ? '<img src="' + esc(/pstatic\.net/.test(img) ? img.split("?")[0] + "?type=m_webp" : img) + '" alt="" loading="lazy" referrerpolicy="no-referrer" style="width:56px;height:56px;object-fit:cover;border-radius:8px;background:#f3f3f3">' : '<div style="width:56px;height:56px;border-radius:8px;background:#f1f1f1;display:flex;align-items:center;justify-content:center;font-size:10px;color:#999">사진<br>없음</div>') + "</td><td class=\"name\"><b>" + esc(it.brand || "") + "</b> " + esc(it.name || "") + '<small class="num">' + esc(it.model || "") + " · " + esc(it.opt || "옵션 없음") + "</small>" + (px && px.name ? '<small class="muted">크림: ' + esc(px.name) + (px.model ? " (" + esc(px.model) + ")" : "") + "</small>" : "") + "</td>" +
      '<td><input class="cell-in num" style="width:90px" placeholder="크림 번호" data-kspid="' + esc(r.key) + '" value="' + esc(r.pid) + '"> <input class="cell-in" style="width:64px" placeholder="사이즈" data-kssz="' + esc(r.key) + '" value="' + esc(r.size) + '"><small>' + link + (r.pid ? "" : ' <button class="btn sm" data-ksfind="' + esc(r.key) + '">크림 찾기</button>') + "</small>" + cand + "</td>" +
      '<td class="r num">' + r.qty + (tab === "old" ? '<small class="neg">' + r.days + '일째</small><small class="muted">' + (r.sub === "bo" ? "크림 창고" : "보유") + "</small>" : "") + "</td><td class=\"r num\">" + (r.cost == null ? "–" : won(r.cost)) + (r.noCost ? '<small class="muted">매입가 없는 ' + r.noCost + "개</small>" : "") + "</td>" +
      (tab === "nm" ? '<td class="r"><input class="cell-in num" style="width:70px" type="number" data-ksship="' + esc(r.key) + '" value="' + extra(r, "nm") + '"></td>' : "") +
      '<td class="r num">' + (x && x.fast ? won(x.fast) : "–") + "</td><td class=\"r num\">" + (x && x.normal ? won(x.normal) : "–") + "</td>" +
      '<td class="r"><small class="num">' + (x && x.trades && x.trades.length ? x.trades.slice(0, 3).map(function (t) { return esc(t.date) + " " + won(t.price); }).join("<br>") : "–") + "</small></td>" +
      (c ? pcell(c.aP, c.a, c.aNote) + pcell(c.bP, c.low, c.lowBy + " 최저") : '<td class="r" colspan="2"><small class="muted">' + (px && px.err ? esc(px.err) : r.pid ? "새로고침 필요" : "크림 번호 필요") + "</small></td>") +
      '<td class="r num">' + (c && c.be ? won(c.be.breakeven) : "–") + "</td>" +
      '<td><small class="num muted">' + (px && px.at ? esc(new Date(px.at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })) : "") + (px && px.n95 ? "<br>95점 " + px.n95 + "건 뺌" : "") + "</small></td>" + (adv ? '<td style="min-width:220px"><span class="pill ' + adv.cls + '">' + (adv.cls === "p-good" ? "크림" : adv.cls === "p-acc" ? "바로판매" : adv.cls === "p-crit" ? "다른 판로" : "확인") + "</span><br><small>" + esc(adv.t) + "</small></td>" : "") + "</tr>";
  }).join("");
  h += '<div class="tiles">' + ERP.tile(tab === "bo" ? "보판 재고" : tab === "old" ? OLD_DAYS + "일 넘은 재고" : "일반판매 재고", T0.qty + "개", "매입가 합계 " + won(T0.cost) + "원") + ERP.tile("체결가 기준으로 팔면", won(T0.a) + "원", "예상 실이익 합계", "hl") + ERP.tile("최저가 맞추면", won(T0.b) + "원", "예상 실이익 합계") + "</div>";
  h += '<div class="table-wrap"><table style="min-width:1400px"><thead><tr><th>사진</th><th>상품</th><th>크림 상품·사이즈</th><th class="r">수량</th><th class="r">평균 매입가</th>' + (tab === "nm" ? '<th class="r">택배비</th>' : "") + '<th class="r">보판가(빠른)</th><th class="r">일반가</th><th class="r">최근 체결</th><th class="r">추천가① 체결 기준<br><small>실이익 · 이익률</small></th><th class="r">추천가② 최저가 맞추기<br><small>실이익 · 이익률</small></th><th class="r">손익분기</th><th>확인</th>' + (tab === "old" ? "<th>추천</th>" : "") + '</tr></thead><tbody>' + (body || '<tr><td colspan="13" class="empty">' + (tab === "bo" ? "재고실사에서 위치가 KREAM인 재고가 없어요" : tab === "old" ? OLD_DAYS + "일 넘은 재고가 없어요" : "보유 재고가 없어요") + "</td></tr>") + "</tbody></table></div>";
  h += '<p class="note">' + (tab === "old" ? "⏳ 입고일부터 " + OLD_DAYS + "일 넘은 재고(오래된 순). 크림 창고에 있는 건 보판 기준, 나머지는 일반판매 기준으로 계산 · 추천: 크림에서 남으면 크림, 아니면 머스트잇 등 기존 판로 본전가(머스트잇 총비용 14.1%) · " : "") + (tab === "bo" ? "보판: 매입가 + 보관료 월 3,000원 × " + months() + "개월" : "일반판매: 매입가 + 택배비(기본 3,500원, 합배송이면 0원으로 고쳐 주세요)") + " · 수수료 크림 Level1(기본 2,500원 + 6%, 샤넬·에르메스 가방 20,000원 + 3%, 최대 30만원) · 실이익 = 판매가÷1.1 − 수수료 − (매입가+비용)÷1.1 · 95점은 같은 옵션·같은 가격만 빼요 · 시세는 ERP가 켜져 있으면 매일 09시·21시에 자동으로 다시 확인해요" +
    ' · 보판 상품 가격 확인 <input class="cell-in num" style="width:44px" type="number" id="ks-every" value="' + boEvery() + '">분마다(0이면 끔, 짧을수록 차단 위험↑)' + (D().lastBo ? ' 마지막 ' + esc(new Date(D().lastBo).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })) : '') + ' · 보판 보관 개월 <input class="cell-in num" style="width:44px" type="number" id="ks-mon" value="' + months() + '"></p>';
  return h;
}
function bind(root) {
  root.querySelectorAll("[data-kspid]").forEach(function (el) { el.onchange = async function () { var d = D(), k = el.dataset.kspid, id = (String(el.value).match(/(\d{3,})/) || [])[1] || ""; d.map[k] = Object.assign({}, d.map[k], { pid: id }); delete d.px[k]; await save(d); ERP.render(); }; });
  root.querySelectorAll("[data-kssz]").forEach(function (el) { el.onchange = async function () { var d = D(), k = el.dataset.kssz; d.map[k] = Object.assign({}, d.map[k], { size: el.value.trim() }); delete d.px[k]; await save(d); ERP.render(); }; });
  root.querySelectorAll("[data-ksship]").forEach(function (el) { el.onchange = async function () { var d = D(); d.ship[el.dataset.ksship] = num(el.value); await save(d); ERP.render(); }; });
  root.querySelectorAll("[data-kspick]").forEach(function (el) { el.onchange = async function () { if (!el.value) return; var d = D(), k = el.dataset.kspick; d.map[k] = Object.assign({}, d.map[k], { pid: el.value }); delete CAND[k]; delete d.cand[k]; await save(d); ERP.render(); }; });
  root.querySelectorAll("[data-ksfind]").forEach(function (b) { b.onclick = function () { find(b.dataset.ksfind); }; });
  var ev = root.querySelector("#ks-every"); if (ev) ev.onchange = async function () { var d = D(); d.boEvery = Math.max(0, num(ev.value)); await save(d); ERP.render(); };
  var mo = root.querySelector("#ks-mon"); if (mo) mo.onchange = async function () { var d = D(); d.months = num(mo.value) || 1; await save(d); ERP.render(); };
}
ERP.acts.ksbo = function () { v.ksTab = "bo"; ERP.render(); };
ERP.acts.ksnm = function () { v.ksTab = "nm"; ERP.render(); };
ERP.acts.ksold = function () { v.ksTab = "old"; ERP.render(); };
ERP.acts.ksseen = async function () { var d = D(); d.alerts.forEach(function (a) { a.seen = 1; }); d.alerts = d.alerts.slice(-100); await save(d); ERP.render(); };
ERP.acts.ksrefresh = function () { refresh(false); };
/* 크림에 연결 안 된 재고를 한 번에 검색해 후보만 붙여 둠 (색상·금장/은장은 대표님이 고름) — 10~14초 간격 (2026-11-17) */
ERP.acts.ksfindall = async function () { if (busy) return; if (!on()) { ERP.toast("‘로우나재고 크림 도우미’ 확장을 켜 주세요"); return; } var d = D(), L = rows("nm").concat(rows("bo")).filter(function (r) { return !r.pid && !(d.cand[r.key] && d.cand[r.key].length); }); busy = true;
  for (var i = 0; i < L.length; i++) { ERP.toast("크림 후보 찾는 중 " + (i + 1) + "/" + L.length); try { await find(L[i].key); } catch (e) { if (/차단|꺼져/.test(e.message)) break; } await new Promise(function (r) { setTimeout(r, 10000 + Math.random() * 4000); }); }
  busy = false; ERP.toast("크림 후보 찾기 끝 · 표에서 후보를 골라 주세요"); ERP.render(); };

/* 크림 찾기: 품번으로 검색해 후보만 보여 줌 — 색상·금장/은장은 대표님이 직접 고름 (자동으로 안 고름) */
async function find(k) {
  var it = inv()[k]; if (!it) return;
  try { ERP.toast("크림에서 " + (it.model || "") + " 찾는 중"); var p = await page("https://kream.co.kr/search?keyword=" + encodeURIComponent(String(it.model || it.name || "").split(/\s/)[0]) + "&tab=products"); var seen = {}; CAND[k] = (p.links || []).map(function (a) { var id = (String(a.href).match(/kream\.co\.kr\/products\/(\d+)/) || [])[1]; return id && !seen[id] && (seen[id] = 1) ? { id: id, text: String(a.text || "").replace(/\s+/g, " ").replace(/^최근 본 상품( 연관)?/, "").slice(0, 70) } : null; }).filter(Boolean).slice(0, 10); if (!CAND[k].length) ERP.toast("검색 결과가 없어요"); } catch (e) { ERP.toast("⚠ " + e.message); }
  if (CAND[k] && CAND[k].length) { var dd = D(); dd.cand[k] = CAND[k]; await save(dd); }
  ERP.render();
}

/* 새로고침: 크림 상품 하나씩(도우미가 6~10초 간격), 같은 상품은 한 번만 열고 사이즈별로 나눠 계산 */
async function refresh(auto, only) {
  if (busy) return; if (!on()) { if (!auto) ERP.toast("‘로우나재고 크림 도우미’ 확장을 켜 주세요 (tools/kream-stock-helper)"); return; }
  busy = true; ERP.render();
  var d = D(), all = only === "bo" ? rows("bo") : rows("bo").concat(rows("nm")), byPid = {}, keys = [];
  all.forEach(function (r) { if (!r.pid) return; var u = r.pid + (free(r.size) ? "" : "?size=" + encodeURIComponent(r.size)); if (!byPid[u]) { byPid[u] = []; keys.push(u); } if (!byPid[u].some(function (q) { return q.key === r.key; })) byPid[u].push(r); });
  var changes = [];
  for (var i = 0; i < keys.length; i++) {
    var pid = keys[i]; ERP.toast("크림 시세 확인 " + (i + 1) + "/" + keys.length);
    var p; try { p = await page("https://kream.co.kr/products/" + pid); } catch (e) { ERP.toast("⚠ " + e.message); if (/차단|꺼져/.test(e.message)) break; continue; }
    byPid[pid].forEach(function (r) {
      var old = d.px[r.key], nw = summarize(p, r.size); d.px[r.key] = nw; if (nw.img) d.map[r.key] = Object.assign({}, d.map[r.key], { img: nw.img });
      if (old && !old.err && !nw.err) {
        var nm = ((r.it.brand || "") + " " + (r.it.model || "") + (r.size ? " " + r.size : "")).trim(), parts = [];
        [["fast", "보판가"], ["normal", "일반가"]].forEach(function (f) { var a = old[f[0]], b = nw[f[0]]; if (a !== b && (!a || !b || Math.abs(b - a) / a >= 0.02)) parts.push(f[1] + " " + (a ? won(a) : "없음") + " → " + (b ? won(b) : "없음")); });
        var ot = old.trades && old.trades[0], nt = nw.trades && nw.trades[0]; if (nt && (!ot || ot.price !== nt.price || ot.date !== nt.date)) parts.push("새 체결 " + won(nt.price));
        if (parts.length) changes.push({ at: new Date().toISOString(), key: r.key, text: nm + ": " + parts.join(", ") });
      }
    });
    if (i % 5 === 4) await save(d);
  }
  d.alerts = d.alerts.concat(changes).slice(-200); if (only === "bo") d.lastBo = Date.now(); else if (auto) d.lastAuto = Date.now(); else d.lastManual = Date.now(); if (!only) d.lastBo = Date.now();
  await save(d); busy = false; ERP.render();
  ERP.toast("크림 시세 확인 끝" + (changes.length ? " · 변동 " + changes.length + "건" : ""));
  if (changes.length && "Notification" in window && Notification.permission === "granted") try { new Notification("로우나재고 크림 시세 변동 " + changes.length + "건", { body: changes.slice(0, 3).map(function (c) { return c.text; }).join("\n") }); } catch (e) {}
}
/* 하루 2번 자동(09시·21시): ERP 화면이 켜져 있으면 10분마다 확인해서 지난 시각 이후 안 돌았으면 돌림 */
function lastSlot() { var n = new Date(), s = new Date(n); s.setMinutes(0, 0, 0); if (n.getHours() >= 21) s.setHours(21); else if (n.getHours() >= 9) s.setHours(9); else { s.setDate(s.getDate() - 1); s.setHours(21); } return s.getTime(); }
/* 보판 상품은 판매 가격 확인용으로 따로 N분마다(기본 10분, 0이면 끔) 다시 확인 → 바뀌면 변동 알림 (대표님 지시 2026-11-12) */
function boEvery() { var x = D().boEvery; return x == null ? 10 : num(x); }
/* 2026-11-18 대표님: 자동 시세 확인은 ‘크림 매입’ 상품만 → 여기 자동(하루 2번·보판 10분)은 꺼 둠. 설정에 auto:true 넣으면 다시 켜짐. 버튼 새로고침은 그대로 */
setInterval(function () { try { if (!S.SET || !S.SET[KEY] || !D().auto || busy || !on()) return; var d = D(); if ((d.lastAuto || 0) < lastSlot()) refresh(true); else if (boEvery() > 0 && Date.now() - (d.lastBo || 0) >= boEvery() * 60000) refresh(true, "bo"); } catch (e) {} }, 60 * 1000);

ERP.page({ id: "kream-stock", title: "로우나재고 크림", wide: true, roles: ["owner", "accountant", "staff", "ai"], render: render, bind: bind, badge: function () { return D().alerts.filter(function (a) { return !a.seen; }).length || ""; } });
})();
