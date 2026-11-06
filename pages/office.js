/* 메뉴: 픽셀 사무실 — 로우나 업무를 직원(픽셀 아바타)으로 보여주는 화면
   - 재고관리·매입매출정산 직원은 ERP 데이터(재고실사·매출·매입)를 바로 읽어 상태를 표시
   - 나머지 직원은 app_settings.office_board 에 Claude가 작업할 때 남긴 기록(단계·메모·할 일)을 표시
   - 전광판 모드: ?kiosk=office (office.html) — 메뉴 없이 전체 화면, 직원을 차례로 보여줌 */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, esc = U.esc;
var KEY = "office_board";
var KIOSK = /[?&]kiosk=office/.test(location.search);
var v = ERP.view; v.ofSel = v.ofSel || "";

/* ---------- 스타일 (이 화면 전용) ---------- */
(function () {
  if (document.getElementById("of-style")) return;
  var st = document.createElement("style"); st.id = "of-style";
  st.textContent = [
    ".of-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(280px,1fr);gap:16px;align-items:start}",
    ".of-room{position:relative;border-radius:14px;overflow:hidden;box-shadow:0 0 0 1px rgba(70,140,230,.35),0 18px 40px -20px rgba(0,0,0,.9);background:#18263e}",
    ".of-room canvas{display:block;width:100%;height:auto;image-rendering:pixelated;image-rendering:crisp-edges}",
    ".of-tag{all:unset;box-sizing:border-box;position:absolute;cursor:pointer;padding:3px 6px;border-radius:8px;background:rgba(5,11,24,.78);color:#eaf2ff;font-size:clamp(9px,.85vw,13px);line-height:1.3;text-align:center;border:1px solid rgba(124,200,255,.25);overflow:hidden}",
    ".of-tag:hover,.of-tag.on{border-color:#7cc8ff;background:rgba(16,40,80,.92)}",
    ".of-tag:focus-visible{outline:2px solid #7cc8ff}",
    ".of-tag .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:0}",
    ".of-tag em{display:block;font-style:normal;color:#9cc2ee;font-size:.92em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".of-card{background:var(--surface,#0b1830);border-radius:14px;padding:16px 18px;box-shadow:0 0 0 1px rgba(70,140,230,.3)}",
    ".of-card-h{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:17px}",
    ".of-st{color:#fff;font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px}",
    ".of-bubble{margin:12px 0;padding:10px 12px;border-radius:12px;background:rgba(124,200,255,.1);font-size:14px}",
    ".of-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;margin-bottom:6px}",
    ".of-stats div{background:rgba(255,255,255,.04);border-radius:10px;padding:8px 10px}.of-stats small{display:block;color:var(--muted,#93a8c8);font-size:11px}.of-stats b{font-size:16px}",
    ".of-card h4{margin:14px 0 6px;font-size:12.5px;color:var(--muted,#93a8c8);letter-spacing:.04em}",
    ".of-steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px}",
    ".of-steps li{display:flex;gap:8px;align-items:center;font-size:13.5px;color:var(--muted,#93a8c8)}",
    ".of-steps li span{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,.08);font-size:11px;flex:none}",
    ".of-steps li.ok{color:#a7f3d0}.of-steps li.ok span{background:#16a34a;color:#fff}",
    ".of-steps li.now{color:#fff;font-weight:700}.of-steps li.now span{background:#3c96ff;color:#fff}.of-steps li.now b{color:#7cc8ff;font-weight:600}",
    ".of-todo{margin:0;font-size:13.5px}",
    ".of-log{list-style:none;margin:0 0 12px;padding:0;font-size:13px;display:flex;flex-direction:column;gap:4px}.of-log small{color:var(--muted,#93a8c8)}",
    ".of-ticker{margin-top:14px;overflow:hidden;white-space:nowrap;border-radius:10px;background:rgba(5,11,24,.7);box-shadow:0 0 0 1px rgba(70,140,230,.25);padding:9px 0;font-size:14px}",
    ".of-ticker-in{display:inline-block;padding-left:100%;animation:of-run 60s linear infinite}",
    "@keyframes of-run{to{transform:translateX(-100%)}}",
    "@media (prefers-reduced-motion:reduce){.of-ticker-in{animation:none;padding-left:12px}}",
    ".of-clock{font-size:20px;font-weight:700;color:#9cc2ee}",
    "@media (max-width:980px){.of-grid{grid-template-columns:1fr}}",
    /* 전광판 모드 */
    "html.kiosk .rail{display:none!important}html.kiosk .main{max-width:none!important;padding:18px 24px!important}html.kiosk .main::before,html.kiosk .main::after{display:none!important}",
    "html.kiosk #to-top{display:none!important}html.kiosk .of-wrap .head h1{font-size:28px}html.kiosk .of-card{font-size:15px}"
  ].join("\n");
  document.head.appendChild(st);
})();

/* ---------- 직원 ---------- */
var STAFF = [
  { id: "stock", name: "바코", role: "재고관리", hair: "#2b1d14", shirt: "#3c96ff", skin: "#f2c9a0", tab: "stock",
    steps: ["위치 바코드 찍기", "택·자체 바코드 등록", "입고일·매입가 입력", "라벨 출력·부착", "출고 −1", "실사 마감·사방넷 대조"] },
  { id: "books", name: "장부", role: "매입·매출정산", hair: "#111", shirt: "#20b486", skin: "#e9bb8f", tab: "sales",
    steps: ["사방넷 주문 가져오기", "렉스몬드 매입 연결(원가)", "카드전표 확인", "쇼핑몰 정산 확정", "반품·취소 반영", "월 마감·부가세"] },
  { id: "sync", name: "맞춤", role: "재고정합성", hair: "#6b3e1f", shirt: "#8b5cf6", skin: "#f5d0a9",
    steps: ["사방넷 상품 다운로드", "일시중지 → 품절 확인", "완전품절 → 재입고 확인", "몰별 판매중 대조", "사방넷 대량수정 파일", "몰별 품절 처리"] },
  { id: "rex", name: "렉스", role: "렉스몬드 소싱", hair: "#333", shirt: "#f59e0b", skin: "#eec39a", tab: "rex-sourcing",
    steps: ["인기상품 수집(찜·리뷰순)", "사방넷·소싱폼 중복 제외", "후보 엑셀", "대표 선택", "사방넷 등록"] },
  { id: "domestic", name: "국내", role: "국내사이트 소싱", hair: "#4a2a12", shirt: "#ef4444", skin: "#f1c7a1", tab: "kream-yeolmu",
    steps: ["국내몰·크림 시세 수집", "마진 계산", "결제카드 배정", "후보 확정", "등록·주문"] },
  { id: "store", name: "스토어", role: "스토어 소싱", hair: "#1f2937", shirt: "#22c55e", skin: "#e8b88a", tab: "sourcing",
    steps: ["스마트스토어 후보 수집", "속성 입력", "상세 연결", "상품 등록", "승인 확인"] },
  { id: "photo", name: "픽셀", role: "사진", hair: "#a16207", shirt: "#ec4899", skin: "#f6d3b0",
    steps: ["참고사진 수집", "테스트 3장", "대표 OK", "생성 (비용 한도)", "판독기 검수", "업로드 폴더"] },
  { id: "detail", name: "카피", role: "상세페이지", hair: "#3f2a1d", shirt: "#06b6d4", skin: "#f0c49b",
    steps: ["상품정보 정리", "문구 작성", "이미지컷 기획", "공통블록 결합", "업로드"] },
  { id: "blog", name: "블리", role: "블로그", hair: "#7c2d12", shirt: "#f97316", skin: "#f7d6b4", tab: "blog",
    steps: ["상품 선정", "제목·본문·태그", "사진 배치", "발행", "유입 확인"] },
  { id: "ads", name: "애드", role: "광고", hair: "#0f172a", shirt: "#eab308", skin: "#e6b487",
    steps: ["광고 상품 선정", "예산 설정", "캠페인 등록", "효과 확인", "조정"] },
  { id: "bot", name: "봇찌", role: "스토어봇", hair: "#475569", shirt: "#64748b", skin: "#efc59c",
    steps: ["스크립트 누락 상품 찾기", "대량수정 파일", "사방넷 업로드", "연동 확인"] },
  { id: "veloa", name: "벨라", role: "벨로아컴퍼니", hair: "#3b2416", shirt: "#a7b3a1", skin: "#f3cfa8",
    steps: ["거래처·소싱 건 확인", "서류 정리", "벨로아 ERP 기록", "보고"] }
];

/* ---------- 데이터 ---------- */
function board() { var b = S.SET[KEY]; return b && b.staff ? b : { staff: {} }; }
function rec(id) { return board().staff[id] || {}; }
function today() { return U.today(); }
function num(x) { var n = Number(String(x == null ? "" : x).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; }
function ago(iso) {
  if (!iso) return "";
  var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "방금"; if (m < 60) return m + "분 전"; var h = Math.round(m / 60); if (h < 24) return h + "시간 전"; return Math.round(h / 24) + "일 전";
}
function safe(f, d) { try { return f(); } catch (e) { return d; } }

/* ERP에서 바로 읽는 직원 */
function liveStock() {
  var d = S.SET.stock_inventory; if (!d || !d.items) return null;
  var T = today(), sku = 0, units = 0, tin = 0, tout = 0, noPrice = 0;
  Object.values(d.items).forEach(function (it) {
    sku++;
    (it.lots || []).forEach(function (x) {
      if (!x.out) { units++; if (x.price === "" || x.price == null) noPrice++; if ((x.at || "").slice(0, 10) === T) tin++; }
      else if (x.out === T && x.outType === "출고") tout++;
    });
  });
  var st = noPrice ? "alert" : (tin || tout ? "work" : "idle");
  return { status: st, bubble: noPrice ? "매입가 미입력 " + noPrice + "개" : (tin || tout ? "오늘 입고 " + tin + " · 출고 " + tout : "재고 " + units + "개 보관 중"),
    stats: [["상품", sku + "종"], ["보유", units + "개"], ["오늘 입고", tin + "개"], ["오늘 출고", tout + "개"], ["매입가 미입력", noPrice + "개"]],
    todo: noPrice ? "재고실사에서 '매입가 미입력' 줄에 매입가 넣기" : "" };
}
function liveBooks() {
  var sales = safe(function () { return ERP.list("sales"); }, null); if (!sales) return null;
  var T = today(), M = T.slice(0, 7), td = 0, noCost = 0, pend = 0, mon = 0;
  sales.forEach(function (s) {
    if (ERP.excluded && safe(function () { return ERP.excluded(s); }, false)) return;
    if (s.date === T) td++;
    if ((s.date || "").slice(0, 7) === M) mon++;
    if (num(s.salePrice) > 0 && !num(s.cost)) noCost++;
    if ((s.settleStatus || "미확인") !== "확정" && (s.date || "").slice(0, 7) === M) pend++;
  });
  var pur = safe(function () { return ERP.list("purchases").filter(function (p) { return (p.date || "").slice(0, 7) === M; }).length; }, 0);
  var st = noCost ? "alert" : (td ? "work" : "idle");
  return { status: st, bubble: noCost ? "원가 미입력 " + noCost + "건" : (td ? "오늘 주문 " + td + "건 정리 중" : "이번 달 " + mon + "건"),
    stats: [["오늘 주문", td + "건"], ["이번 달 매출", mon + "건"], ["원가 미입력", noCost + "건"], ["정산 미확정(이번 달)", pend + "건"], ["이번 달 매입", pur + "건"]],
    todo: noCost ? "매출에서 원가 미입력 주문에 렉스몬드 매입 연결" : "" };
}
function info(p) {
  var r = rec(p.id), live = p.id === "stock" ? liveStock() : p.id === "books" ? liveBooks() : null;
  var step = r.step == null ? -1 : Number(r.step);
  var st = r.status || (live && live.status) || (r.updatedAt ? "idle" : "none");
  if (live && !r.status) st = live.status;
  if (live && live.status === "alert") st = "alert";
  var bubble = (live && live.status === "alert" ? live.bubble : "") || r.note || (live && live.bubble) || (st === "none" ? "아직 기록 없음" : "대기 중");
  return { r: r, live: live, step: step, status: st, bubble: bubble, todo: (live && live.todo) || r.todo || "", log: (r.log || []).slice(-8).reverse() };
}

/* ---------- 픽셀 그림 ---------- */
var W = 352, H = 236, COLS = 4, ROWS = 3, CW = 86, RH = 66, TOP = 34, LEFT = 4;
function cell(i) { var c = i % COLS, r = Math.floor(i / COLS); return { x: LEFT + c * CW, y: TOP + r * RH }; }
var frame = 0, raf = null, cv = null, ctx = null;
function R(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
function drawRoom() {
  /* 바닥 (체크 타일) */
  for (var y = 0; y < H; y += 8) for (var x = 0; x < W; x += 8) R(x, y, 8, 8, ((x + y) / 8) % 2 ? "#1b2a44" : "#18263e");
  /* 벽 */
  R(0, 0, W, 28, "#263a5e"); R(0, 26, W, 3, "#3a5585");
  /* 창문 2개 */
  [[18, 4], [262, 4]].forEach(function (p) { R(p[0], p[1], 70, 18, "#9fd3ff"); R(p[0] + 34, p[1], 2, 18, "#d8ecff"); R(p[0], p[1] + 8, 70, 2, "#d8ecff"); R(p[0] - 2, p[1] - 2, 74, 2, "#cbd5e1"); R(p[0] - 2, p[1] + 18, 74, 3, "#cbd5e1");
    R(p[0] + 6 + (frame >> 5) % 50, p[1] + 3, 10, 3, "#ffffff"); });
  /* 간판 */
  R(126, 5, 100, 16, "#0b1428"); R(127, 6, 98, 14, "#10203d");
  ctx.fillStyle = "#7cc8ff"; ctx.font = "bold 10px monospace"; ctx.textBaseline = "middle"; ctx.fillText("LOWNA OFFICE", 138, 13.5);
  /* 시계 */
  R(236, 6, 14, 14, "#e2e8f0"); R(237, 7, 12, 12, "#f8fafc"); var d = new Date(), a = (d.getMinutes() / 60) * Math.PI * 2;
  ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(243, 13); ctx.lineTo(243 + Math.sin(a) * 5, 13 - Math.cos(a) * 5); ctx.stroke();
  /* 화분 */
  [[2, 30], [340, 30]].forEach(function (p) { R(p[0] + 2, p[1] + 8, 8, 6, "#9a5b2e"); R(p[0], p[1], 12, 9, "#2f9e55"); R(p[0] + 3, p[1] - 3, 6, 4, "#3fbf68"); });
}
function drawPerson(x, y, p, st, t) {
  var bob = st === "work" ? ((t >> 3) % 2) : 0, hair = p.hair, shirt = p.shirt, skin = p.skin;
  /* 의자 등받이 */
  R(x - 2, y + 6, 16, 12, "#334155"); R(x - 1, y + 7, 14, 10, "#3f4f66");
  /* 몸 */
  R(x, y + 10 - bob, 12, 9, shirt); R(x + 4, y + 10 - bob, 4, 2, "#ffffff");
  /* 머리 */
  R(x + 2, y + 1 - bob, 8, 9, skin); R(x + 1, y - bob, 10, 4, hair); R(x + 1, y + 3 - bob, 2, 4, hair); R(x + 9, y + 3 - bob, 2, 4, hair);
  var blink = (t + x) % 120 < 4;
  R(x + 4, y + 5 - bob, 1, blink ? 1 : 2, "#111"); R(x + 7, y + 5 - bob, 1, blink ? 1 : 2, "#111");
  if (st === "done") R(x + 5, y + 8 - bob, 2, 1, "#b45353");
  /* 팔 */
  if (st === "work") { var k = (t >> 2) % 2; R(x - 1, y + 13 + k, 3, 3, shirt); R(x + 10, y + 14 - k, 3, 3, shirt); R(x - 1, y + 16 + k, 3, 2, skin); R(x + 10, y + 17 - k, 3, 2, skin); }
  else if (st === "idle" || st === "none") { R(x - 1, y + 14, 3, 4, shirt); R(x + 10, y + 12, 3, 4, shirt); var sip = (t >> 5) % 4 === 0; R(x + 10, y + (sip ? 8 : 11), 4, 4, "#f8fafc"); R(x + 11, y + (sip ? 9 : 12), 2, 2, "#8b5a2b");
    if (sip && (t >> 2) % 2) R(x + 11, y + (sip ? 5 : 8), 1, 2, "#cbd5e1"); }
  else { R(x - 1, y + 14, 3, 4, shirt); R(x + 10, y + 14, 3, 4, shirt); }
  /* 상태 표시 */
  if (st === "alert" && (t >> 4) % 2) { R(x + 4, y - 12, 4, 8, "#ef4444"); R(x + 4, y - 3, 4, 2, "#ef4444"); }
  if (st === "done") { R(x + 3, y - 9, 2, 2, "#22c55e"); R(x + 5, y - 7, 2, 2, "#22c55e"); R(x + 7, y - 9, 2, 2, "#22c55e"); R(x + 9, y - 11, 2, 2, "#22c55e"); }
}
function drawDesk(x, y, st, t, sel) {
  /* 책상 */
  R(x, y + 18, 44, 4, "#a0703f"); R(x, y + 22, 44, 8, "#7a522b"); R(x + 2, y + 30, 3, 6, "#5c3d20"); R(x + 39, y + 30, 3, 6, "#5c3d20");
  /* 모니터 */
  var scr = st === "alert" ? ((t >> 4) % 2 ? "#ef4444" : "#7f1d1d") : st === "work" ? "#22c55e" : st === "done" ? "#38bdf8" : "#334155";
  R(x + 24, y + 6, 16, 11, "#0f172a"); R(x + 25, y + 7, 14, 9, scr); R(x + 31, y + 17, 3, 2, "#0f172a");
  if (st === "work") for (var i = 0; i < 3; i++) R(x + 26, y + 8 + i * 3, 4 + ((t >> 2) + i * 3) % 9, 1, "#bbf7d0");
  /* 키보드·종이 */
  R(x + 6, y + 19, 12, 2, "#e2e8f0"); R(x + 20, y + 19, 4, 2, "#94a3b8");
  if (sel) { ctx.strokeStyle = "#7cc8ff"; ctx.lineWidth = 1; ctx.strokeRect(x - 3.5, y - 16.5, 50, 56); }
}
function draw() {
  if (!cv || !document.body.contains(cv)) { raf = null; return; }
  frame++;
  drawRoom();
  STAFF.forEach(function (p, i) {
    var c = cell(i), inf = info(p), x = c.x + 18, y = c.y + 12;
    drawPerson(x + 8, y - 2, p, inf.status, frame + i * 7);
    drawDesk(x - 6, y, inf.status, frame + i * 5, v.ofSel === p.id);
  });
  /* 프린터(라벨) */
  raf = requestAnimationFrame(function () { setTimeout(draw, 66); });
}

/* ---------- 화면 ---------- */
var SN = { work: "일하는 중", idle: "대기", alert: "확인 필요", done: "완료", none: "기록 없음" };
var SC = { work: "#22c55e", idle: "#94a3b8", alert: "#ef4444", done: "#38bdf8", none: "#64748b" };
function card(p) {
  var inf = info(p), r = inf.r;
  var steps = p.steps.map(function (s, i) {
    var cls = i < inf.step ? "ok" : i === inf.step ? "now" : "";
    return '<li class="' + cls + '"><span>' + (i < inf.step ? "✔" : i + 1) + "</span>" + esc(s) + (i === inf.step ? " <b>← 지금</b>" : "") + "</li>";
  }).join("");
  var stats = inf.live ? '<div class="of-stats">' + inf.live.stats.map(function (s) { return "<div><small>" + esc(s[0]) + "</small><b>" + esc(s[1]) + "</b></div>"; }).join("") + "</div>" : "";
  var log = inf.log.length ? "<ul class=\"of-log\">" + inf.log.map(function (l) { return "<li><small>" + esc(ago(l.at)) + "</small> " + esc(l.text) + "</li>"; }).join("") + "</ul>" : '<p class="muted">아직 작업 기록이 없어요. Claude가 이 일을 하면 여기에 남아요.</p>';
  return '<div class="of-card"><div class="of-card-h"><div><b>' + esc(p.name) + '</b> <span class="muted">' + esc(p.role) + '</span></div><span class="of-st" style="background:' + SC[inf.status] + '">' + SN[inf.status] + "</span></div>" +
    '<div class="of-bubble">💬 ' + esc(inf.bubble) + (r.updatedAt ? ' <small class="muted">· ' + esc(ago(r.updatedAt)) + "</small>" : "") + "</div>" + stats +
    '<h4>업무 단계</h4><ol class="of-steps">' + steps + "</ol>" +
    (inf.todo ? '<h4>다음 할 일</h4><p class="of-todo">' + esc(inf.todo) + "</p>" : "") +
    "<h4>최근 기록</h4>" + log +
    (p.tab && !KIOSK && ERP.pages[p.tab] ? '<button class="btn sm" data-ofgo="' + esc(p.tab) + '">' + esc(ERP.pages[p.tab].title) + " 화면 열기</button>" : "") + "</div>";
}
function ticker() {
  var all = [];
  STAFF.forEach(function (p) { (rec(p.id).log || []).forEach(function (l) { all.push({ at: l.at, t: p.name + " · " + l.text }); }); });
  all.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
  return all.slice(0, 10).map(function (x) { return esc(ago(x.at)) + " " + esc(x.t); }).join("　　｜　　") || "아직 작업 기록이 없어요";
}
function render() {
  if (!v.ofSel) v.ofSel = STAFF[0].id;
  var sel = STAFF.find(function (p) { return p.id === v.ofSel; }) || STAFF[0];
  var counts = { work: 0, alert: 0, idle: 0, done: 0, none: 0 };
  STAFF.forEach(function (p) { counts[info(p).status]++; });
  var tags = STAFF.map(function (p, i) {
    var c = cell(i), inf = info(p);
    return '<button type="button" class="of-tag' + (v.ofSel === p.id ? " on" : "") + '" data-ofsel="' + p.id + '" style="left:' + ((c.x + 2) / W * 100) + "%;top:" + ((c.y + 50) / H * 100) + "%;width:" + (78 / W * 100) + '%" aria-label="' + esc(p.name + " " + p.role + " " + SN[inf.status]) + '">' +
      '<span class="dot" style="background:' + SC[inf.status] + '"></span><b>' + esc(p.name) + "</b> " + esc(p.role) + '<em>' + esc(inf.bubble) + "</em></button>";
  }).join("");
  var h = '<div class="of-wrap' + (KIOSK ? " kiosk" : "") + '">' +
    '<div class="head"><div><h1>🏢 로우나 픽셀 사무실</h1><p>직원 ' + STAFF.length + "명 · 일하는 중 " + counts.work + " · 확인 필요 " + counts.alert + " · 대기 " + (counts.idle + counts.none) + "</p></div>" +
    '<div class="tools">' + (KIOSK ? '<span class="of-clock" id="of-clock"></span>' : '<a class="btn" href="office.html" target="_blank" rel="noopener">전광판으로 열기 (모니터용)</a>') + "</div></div>" +
    '<div class="of-grid"><div class="of-room"><canvas id="of-cv" width="' + W + '" height="' + H + '" aria-label="픽셀 사무실 그림"></canvas>' + tags + "</div>" +
    '<div class="of-side" id="of-side">' + card(sel) + "</div></div>" +
    '<div class="of-ticker"><div class="of-ticker-in">📢 ' + ticker() + "</div></div></div>";
  return h;
}
function bind(root) {
  cv = root.querySelector("#of-cv"); ctx = cv && cv.getContext("2d"); if (ctx) ctx.imageSmoothingEnabled = false;
  if (cv && !raf) draw();
  root.querySelectorAll("[data-ofsel]").forEach(function (b) { b.onclick = function () { v.ofSel = b.dataset.ofsel; userPick = Date.now(); ERP.render(); }; });
  var side = root.querySelector("#of-side"); if (side) side.onclick = function (e) { var b = e.target.closest("[data-ofgo]"); if (b) { ERP.go(b.dataset.ofgo); window.scrollTo(0, 0); } };
}
/* 전광판: 15초마다 다음 직원 · 시계 */
var userPick = 0;
setInterval(function () {
  if (ERP.view.tab !== "office") return;
  var ck = document.getElementById("of-clock"); if (ck) { var d = new Date(); ck.textContent = d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" }) + " " + d.toTimeString().slice(0, 5); }
}, 1000);
setInterval(function () {
  if (ERP.view.tab !== "office" || ERP.drawer()) return;
  if (KIOSK && Date.now() - userPick > 30000) {
    var i = STAFF.findIndex(function (p) { return p.id === v.ofSel; });
    var order = STAFF.filter(function (p) { var s = info(p).status; return s === "alert" || s === "work"; });
    var list = order.length ? order : STAFF, j = list.findIndex(function (p) { return p.id === v.ofSel; });
    v.ofSel = list[(j + 1) % list.length].id; if (i < 0) v.ofSel = list[0].id;
    var side = document.getElementById("of-side"); var p = STAFF.find(function (x) { return x.id === v.ofSel; });
    if (side && p) { side.innerHTML = card(p); document.querySelectorAll("[data-ofsel]").forEach(function (b) { b.classList.toggle("on", b.dataset.ofsel === v.ofSel); }); }
  }
}, 15000);

/* 전광판 모드: 로그인 뒤 바로 사무실, 메뉴 숨김, 화면 꺼짐 방지, 새 버전이면 새로고침 */
if (KIOSK) {
  document.documentElement.classList.add("kiosk");
  ERP.afterLoginHooks = (ERP.afterLoginHooks || []).concat([function () { ERP.go("office"); }]);
  var lock = null, getLock = function () { try { if (navigator.wakeLock && document.visibilityState === "visible") navigator.wakeLock.request("screen").then(function (l) { lock = l; }).catch(function () {}); } catch (e) {} };
  document.addEventListener("visibilitychange", getLock); setTimeout(getLock, 3000);
  var me = ((document.querySelector('script[src*="pages/office.js"]') || {}).src || "").match(/office\.js\?v=([^&"]+)/), cur = me && me[1];
  setInterval(async function () { try { var t = await (await fetch("index.html?ts=" + Date.now(), { cache: "no-store" })).text(), nv = (t.match(/pages\/office\.js\?v=([^"&]+)/) || [])[1]; if (cur && nv && nv !== cur) location.reload(); } catch (e) {} }, 600000);
  /* 하루 한 번 새로 읽기 (로그인 유지·메모리 정리) */
  setTimeout(function () { location.reload(); }, 6 * 3600 * 1000);
}

/* Claude가 작업 기록을 남길 때 쓰는 함수 — 대표 계정 브라우저에서만 저장됨
   ERP.officeLog("photo", { step: 3, status: "work", note: "11장 재생성 중", todo: "판독기 검수", text: "톰브라운 11장 생성 시작" }) */
ERP.officeLog = async function (id, o) {
  var g = await S.sb.from("app_settings").select("value").eq("key", KEY).maybeSingle();
  if (g.error) throw g.error;
  var b = (g.data && g.data.value) || { staff: {} }; b.staff = b.staff || {};
  var r = b.staff[id] || {}; o = o || {};
  ["step", "status", "note", "todo"].forEach(function (k) { if (o[k] !== undefined) r[k] = o[k]; });
  r.updatedAt = new Date().toISOString();
  if (o.text) { r.log = (r.log || []).concat([{ at: r.updatedAt, text: String(o.text).slice(0, 200) }]).slice(-50); }
  b.staff[id] = r; b.updatedAt = r.updatedAt;
  var u = await S.sb.from("app_settings").upsert({ key: KEY, value: b }).select("key");
  if (u.error || !u.data || !u.data.length) throw (u.error || new Error("저장 안 됨(권한)"));
  S.SET[KEY] = b; return r;
};
ERP.OFFICE_STAFF = STAFF;

ERP.page({ id: "office", title: "픽셀 사무실", wide: true, render: render, bind: bind,
  live: function () { if (ERP.drawer()) return; var side = document.getElementById("of-side"), p = STAFF.find(function (x) { return x.id === v.ofSel; }); if (side && p) side.innerHTML = card(p); var tk = document.querySelector(".of-ticker-in"); if (tk) tk.innerHTML = "📢 " + ticker(); document.querySelectorAll("[data-ofsel]").forEach(function (b) { var q = STAFF.find(function (x) { return x.id === b.dataset.ofsel; }), inf = info(q); var em = b.querySelector("em"), dt = b.querySelector(".dot"); if (em) em.textContent = inf.bubble; if (dt) dt.style.background = SC[inf.status]; }); } });
})();
