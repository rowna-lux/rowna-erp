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

/* ---------- 스타일 (이 화면 전용 · 따뜻한 원목 사무실 톤) ---------- */
(function () {
  if (document.getElementById("of-style")) return;
  var st = document.createElement("style"); st.id = "of-style";
  st.textContent = [
    ".of-wrap{--of-paper:#fff8ee;--of-paper2:#f6ead8;--of-ink:#4a3426;--of-mute:#8a6f5a;--of-line:#ead8bf;--of-accent:#e07a3f;--of-ok:#3fa36b;--of-warn:#e5484d;--of-work:#3b82f6}",
    ".of-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:14px}",
    ".of-head h1{margin:0;font-size:26px;letter-spacing:-.01em}.of-head p{margin:4px 0 0;color:var(--muted,#93a8c8);font-size:13px}",
    ".of-sum{display:flex;gap:8px;flex-wrap:wrap}.of-sum span{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:var(--of-paper);color:var(--of-ink);font-size:13px;font-weight:600}",
    ".of-sum i{width:9px;height:9px;border-radius:50%;display:inline-block}",
    ".of-grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:16px;align-items:start}",
    ".of-room{container-type:inline-size;position:relative;border-radius:16px;overflow:hidden;background:#d9b384;box-shadow:0 0 0 3px #6b4a2f,0 0 0 6px #3b2a1c,0 24px 48px -24px rgba(0,0,0,.8)}",
    ".of-room canvas{display:block;width:100%;height:auto;image-rendering:pixelated;image-rendering:crisp-edges;cursor:pointer}",
    ".of-name{position:absolute;transform:translate(-50%,0);padding:1px 7px;border-radius:6px;background:rgba(74,52,38,.82);color:#fff8ee;font-size:clamp(6px,1.25cqw,12px);font-weight:700;white-space:nowrap;pointer-events:none;letter-spacing:.02em}",
    ".of-name.on{background:var(--of-accent)}",
    ".of-say{position:absolute;transform:translate(-50%,-100%);max-width:15%;padding:4px 8px;border-radius:10px;background:#fff;color:#3b2a1c;font-size:clamp(6px,1.2cqw,12px);font-weight:600;line-height:1.3;box-shadow:0 2px 0 #3b2a1c;border:2px solid #3b2a1c;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".of-say:after{content:'';position:absolute;left:50%;bottom:-7px;margin-left:-5px;border:5px solid transparent;border-top-color:#3b2a1c}",
    ".of-say.alert{background:#ffe4e4;color:#a11d22}",
    ".of-name.boss{background:#b8860b;color:#fffbe6;font-size:clamp(6px,1.1cqw,11px);padding:1px 5px}",
    "@container (max-width:640px){.of-name .pre{display:none}.of-name{padding:0 4px;border-radius:4px}.of-say{padding:1px 4px;border-width:1px;border-radius:6px;box-shadow:none;max-width:22%}.of-say:after{bottom:-5px;border-width:4px}.of-zone{padding:0 5px}.of-cat{padding:0 3px;border-radius:3px}}",
    ".of-cat{position:absolute;transform:translate(-50%,0);padding:0 5px;border-radius:5px;background:rgba(255,255,255,.9);color:#3b2a1c;font-size:clamp(6px,1.05cqw,11px);font-weight:800;pointer-events:none;white-space:nowrap;border:1px solid #3b2a1c}",
    ".of-chip.boss{background:#fff3cf}",
    ".of-zone{position:absolute;transform:translate(-50%,0);font-size:clamp(6px,1.2cqw,12px);font-weight:800;color:#6b4a2f;background:rgba(255,248,238,.85);padding:1px 8px;border-radius:999px;pointer-events:none;letter-spacing:.04em}",
    ".of-bar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin-top:12px}",
    ".of-chip{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:12px;background:var(--of-paper);color:var(--of-ink);border:2px solid transparent;min-width:0}",
    ".of-chip:hover{border-color:var(--of-line)}.of-chip.on{border-color:var(--of-accent)}.of-chip:focus-visible{outline:2px solid var(--of-accent)}",
    ".of-chip canvas{width:28px;height:28px;image-rendering:pixelated;flex:none;border-radius:8px;background:var(--of-paper2)}",
    ".of-chip b{display:block;font-size:13px}.of-chip small{display:block;font-size:11px;color:var(--of-mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".of-chip .st{width:8px;height:8px;border-radius:50%;flex:none;margin-left:auto}",
    ".of-card{background:var(--of-paper);color:var(--of-ink);border-radius:16px;padding:16px 18px;box-shadow:0 0 0 2px #6b4a2f}",
    ".of-card-h{display:flex;gap:12px;align-items:center}.of-card-h canvas{width:56px;height:56px;image-rendering:pixelated;border-radius:12px;background:var(--of-paper2)}",
    ".of-card-h b{font-size:19px}.of-card-h .muted{color:var(--of-mute);font-size:13px}",
    ".of-st{margin-left:auto;color:#fff;font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;white-space:nowrap}",
    ".of-bubble{margin:12px 0;padding:10px 12px;border-radius:12px;background:var(--of-paper2);font-size:14px}",
    ".of-bubble small{color:var(--of-mute)}",
    ".of-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px}",
    ".of-stats div{background:#fff;border:1px solid var(--of-line);border-radius:10px;padding:7px 10px}.of-stats small{display:block;color:var(--of-mute);font-size:11px}.of-stats b{font-size:16px}",
    ".of-card h4{margin:14px 0 6px;font-size:12px;color:var(--of-mute);letter-spacing:.06em}",
    ".of-steps{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}",
    ".of-steps li{display:flex;gap:8px;align-items:center;font-size:13.5px;color:var(--of-mute)}",
    ".of-steps li span{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:7px;background:var(--of-paper2);font-size:11px;font-weight:700;flex:none}",
    ".of-steps li.ok{color:var(--of-ink)}.of-steps li.ok span{background:var(--of-ok);color:#fff}",
    ".of-steps li.now{color:var(--of-ink);font-weight:800}.of-steps li.now span{background:var(--of-accent);color:#fff}",
    ".of-todo{margin:0;font-size:13.5px;padding:8px 10px;border-radius:10px;background:#fff3e6;border:1px dashed var(--of-accent)}",
    ".of-log{list-style:none;margin:0 0 12px;padding:0;font-size:13px;display:flex;flex-direction:column;gap:5px}.of-log small{color:var(--of-mute)}",
    ".of-card .muted{color:var(--of-mute)}",
    ".of-card .btn{background:var(--of-accent);color:#fff;border:0}",
    ".of-ticker{margin-top:12px;overflow:hidden;white-space:nowrap;border-radius:12px;background:#3b2a1c;color:#fff1dc;padding:9px 0;font-size:14px}",
    ".of-ticker-in{display:inline-block;padding-left:100%;animation:of-run 70s linear infinite}",
    "@keyframes of-run{to{transform:translateX(-100%)}}",
    "@media (prefers-reduced-motion:reduce){.of-ticker-in{animation:none;padding-left:12px}}",
    ".of-clock{font-size:22px;font-weight:800;color:#fff1dc;background:#3b2a1c;padding:6px 14px;border-radius:12px}",
    "@media (max-width:1100px){.of-grid{grid-template-columns:1fr}.of-bar{grid-template-columns:repeat(3,minmax(0,1fr))}}",
    "html.kiosk .rail{display:none!important}html.kiosk .main{max-width:none!important;padding:16px 22px!important}html.kiosk .main::before,html.kiosk .main::after{display:none!important}",
    "html.kiosk #to-top{display:none!important}html.kiosk .of-grid{grid-template-columns:minmax(0,1fr) 380px}html.kiosk .of-card{font-size:15px}"
  ].join("\n");
  document.head.appendChild(st);
})();

/* ---------- 직원 ---------- */
var STAFF = [
  { id: "books", name: "장부", role: "재무관리 (ERP·사방넷 주문·매입매출)", hair: "#111", shirt: "#20b486", skin: "#e9bb8f", tab: "sales",
    steps: ["사방넷 주문 가져오기", "매입 연결(원가)", "매출·매입 기록", "정산 확인", "반품·취소 반영", "월 마감·부가세"],
    tabs: ["sales", "purchases", "returns", "channels", "tax", "reports", "documents"],
    projects: ["예약: 매일 07:47 아침 매출·정산 정리 → ERP", "롯데온·11번가 판매자센터 다시 로그인 (정산 자동 반영용)", "사방넷 클레임 8건 ERP 반품 등록 확인", "홈택스 1~6월 매입자료 → 1기 부가세"] },
  { id: "stock", name: "바코", role: "재고관리 (바코드·선입선출)", hair: "#2b1d14", shirt: "#3c96ff", skin: "#f2c9a0", tab: "stock",
    steps: ["바코드 등록", "입고일·매입가 입력", "라벨 출력·부착", "선입선출 출고 −1", "실사 마감·사방넷 대조"],
    tabs: ["stock", "purchases"],
    projects: ["재고 바코드 작업 (쇼핑몰 PC2 — 스캐너·라벨프린터)", "라벨 도우미: 입고일 줄(sub2) 인쇄 수정", "예약: 매주 월 10:30 재고정합성 리마인드", "재고정리: 품절 728 미반영 원인, 재입고 107, 수동확인 29"] },
  { id: "rex", name: "렉스몬드", role: "렉스몬드의 모든 일 (사진 소싱·AI 썸네일)", hair: "#333", shirt: "#f59e0b", skin: "#eec39a", tab: "rex-sourcing",
    steps: ["상품 소싱", "구글링 사진 수집", "(필요 시) AI 썸네일", "매입 기록", "재고·품절 확인"],
    tabs: ["rex-sourcing", "purchases"],
    projects: ["예약: 매일 09:20 렉스몬드 매입 → ERP", "예약: 3시간마다 소싱 매입가 링크 확인", "로우나몬드 포토 판독기 (첫 시험 대기)", "톰브라운 AI 사진 49개 (쇼핑몰 PC2)", "사방넷 원가 6,400건 업로드 (테스트 3건 먼저)", "렉스몬드 재고정합성 점검 (일시중지·완전품절)"] },
  { id: "musinsa", name: "무신사", role: "무신사의 모든 일", hair: "#1f2937", shirt: "#111827", skin: "#e8b88a", tab: "kream-yeolmu",
    steps: ["세일 상품 수집", "크림 시세 비교", "결제카드 배정", "매입", "기록"],
    tabs: ["kream-yeolmu", "settings"],
    projects: ["로우나 리셀 도우미 (무신사·크림 전용 확장)", "무신사 신발 세일 → 크림 비교", "결제카드 표 (ERP '채널·카드')", "확인 필요: 알림 기준(마진 원/%), 매입 부가세 공제(세무사)"] },
  { id: "kream", name: "크림", role: "크림 관련 모든 일 (열무 크림도매)", hair: "#4a2a12", shirt: "#ef4444", skin: "#f1c7a1", tab: "kream-yeolmu",
    steps: ["도매 리스트 읽기", "크림 시세 조회(95점 제외)", "마진 계산", "매입·판매입찰", "정산"],
    tabs: ["kream-yeolmu"],
    projects: ["열무 크림도매 (열무·무우 등 도매 리스트)", "열무 크림도매 도우미 (메인 PC 크롬에 설치 필요)", "11/9 이전 계산분 다시 조회 (95점 기준 변경)", "확인 필요: 크림 보관·빠른배송 수수료"] },
  { id: "blog", name: "블리", role: "블로그·SNS (로우나명품 홍보)", hair: "#7c2d12", shirt: "#f97316", skin: "#f7d6b4", tab: "blog",
    steps: ["상품 선정", "블로그 글 작성", "SNS 게시물", "발행·게시", "유입 확인"],
    tabs: ["blog"],
    projects: ["예약: 매일 15:37 블로그 자동 글쓰기 (지금 클라우드 실행 → PC로 옮기기 필요)", "글 안에 마케팅 링크 필수", "다음 대상: 셀린느 → 프라다 → 미우미우"] },
  { id: "ads", name: "애드", role: "쇼핑몰별 가격·CM쿠폰·광고", hair: "#0f172a", shirt: "#eab308", skin: "#e6b487",
    steps: ["몰별 가격 점검", "어긋난 가격 수정파일", "CM쿠폰 설정", "광고 운영", "효과 확인"],
    tabs: ["channels", "pricing"],
    projects: ["예약: 매일 09:23 사방넷 몰별가격 아침 자동 점검", "몰별 가격 1,540상품 수정파일 (sabang_mismatch_261105.csv 첨부 대기)", "몰별 가격 81개 추가 수정파일 업로드", "스토어봇 가격식 2주 효과 비교 (11/9)", "에이블리 블프 기획전 신청 (마감 11/11)"] }
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
  if (p.boss) return bossInfo(p);
  var r = rec(p.id), live = p.id === "stock" ? liveStock() : p.id === "books" ? liveBooks() : null;
  var step = r.step == null ? -1 : Number(r.step);
  var st = r.status || (live && live.status) || (r.updatedAt ? "idle" : "none");
  if (live && !r.status) st = live.status;
  if (live && live.status === "alert") st = "alert";
  var bubble = (live && live.status === "alert" ? live.bubble : "") || r.note || (live && live.bubble) || (st === "none" ? "아직 기록 없음" : "대기 중");
  return { r: r, live: live, step: step, status: st, bubble: bubble, todo: (live && live.todo) || r.todo || "", log: (r.log || []).slice(-8).reverse() };
}

function bossInfo(p) {
  var r = rec(p.id), base = { r: r, live: null, step: -1, todo: r.todo || "", log: (r.log || []).slice(-8).reverse() };
  if (p.id === "ceo") {
    var al = STAFF.filter(function (q) { return info(q).status === "alert"; }), wk = STAFF.filter(function (q) { return info(q).status === "work"; });
    return Object.assign(base, { status: al.length ? "alert" : wk.length ? "work" : "idle", bubble: al.length ? "확인할 일 " + al.length + "건" : wk.length ? "직원 " + wk.length + "명 일하는 중" : "오늘도 화이팅!",
      checks: al.map(function (q) { return q.name + " · " + info(q).bubble; }), todo: al.length ? al.map(function (q) { return q.name + "(" + q.role + "): " + (info(q).todo || info(q).bubble); }).join(" / ") : "" });
  }
  return Object.assign(base, { status: r.status || "idle", bubble: r.note || "오늘도 화이팅!" });
}
/* ---------- 팀·자리 ---------- */
var W = 480, H = 270, CORR = 150, MIDX = 240;
var TEAMS = [
  { name: "운영팀", ids: ["books", "stock"], x: 10, y: 52, rug: ["#bcd7ef", "#a6c6e4", "#86acd2"] },
  { name: "소싱팀", ids: ["rex", "musinsa", "kream"], x: 294, y: 52, rug: ["#f5cfae", "#eebd95", "#dba077"] },
  { name: "홍보·가격팀", ids: ["blog", "ads"], x: 10, y: 162, rug: ["#c4e6cf", "#acd9bb", "#8cc39f"] }
];
var HAIRSTYLE = { stock: "short", books: "bob", rex: "cap", musinsa: "short", kream: "bun", blog: "long", ads: "spiky" };
var SEAT = {};
TEAMS.forEach(function (t) { t.ids.forEach(function (id, k) { var dx = t.x + 8 + k * 58; SEAT[id] = { dx: dx, dy: t.y + 40, x: dx + 23, y: t.y + 36, wy: t.y + 8, team: t }; }); });
/* 대표석: 가운데 위 — 대표 신소희 + 옆자리 다정 */
var BOSS = [
  { id: "ceo", name: "신소희", role: "대표", hair: "#2b1d14", shirt: "#e07a3f", skin: "#f6d3b0", boss: true },
  { id: "dj", name: "임다정", role: "대표", hair: "#5a3a22", shirt: "#f4a7b9", skin: "#f3cfa8", boss: true }
];
HAIRSTYLE.ceo = "bob"; HAIRSTYLE.dj = "long";
var BOSSROOM = { name: "대표실" };
SEAT.ceo = { dx: 198, dy: 96, w: 50, x: 223, y: 92, wy: 62, team: BOSSROOM };
SEAT.dj = { dx: 252, dy: 96, w: 36, x: 270, y: 92, wy: 62, team: BOSSROOM };
var ALL = BOSS.concat(STAFF);
function lane(s) { return s.x < MIDX ? 190 : 290; }
var SPOTS = { coffee: { x: 222, y: 58, face: "up" }, water: { x: 258, y: 58, face: "up" }, report: { x: 214, y: 128, face: "up" }, report2: { x: 262, y: 128, face: "up" }, meet2x: { x: 252, y: 100, face: "left" }, sofa: { x: 240, y: 228, sit: true }, window: { x: 120, y: 58, face: "up" } };

/* ---------- 그리기 도구 ---------- */
var cv = null, ctx = null, raf = null, frame = 0, last = 0;
function R(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); }
function shade(hex, f) { var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; r = Math.max(0, Math.min(255, Math.round(r * f))); g = Math.max(0, Math.min(255, Math.round(g * f))); b = Math.max(0, Math.min(255, Math.round(b * f))); return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1); }

/* 직원 그림 (16×24) — dir: down/up/left/right, walk: 걷는 프레임, seated: 책상에 앉음 */
function drawChar(c, x, y, p, o) {
  o = o || {};
  var hair = p.hair, skin = p.skin, shirt = p.shirt, pants = shade(p.shirt, 0.45), hs = HAIRSTYLE[p.id] || "short";
  var dir = o.dir || "down", t = o.t || 0, step = o.walk ? ((t >> 2) % 4) : 0, bob = o.walk && (step % 2) ? -1 : 0;
  y += bob;
  /* 그림자 */
  if (!o.seated) { c.fillStyle = "rgba(60,35,15,.25)"; c.fillRect(x + 2, y + 23 - bob, 12, 2); }
  /* 다리 */
  if (!o.seated) {
    var l1 = step === 1 ? 1 : 0, l2 = step === 3 ? 1 : 0;
    R(c, x + 4, y + 18, 3, 4 - l1, pants); R(c, x + 9, y + 18, 3, 4 - l2, pants);
    R(c, x + 4, y + 22 - l1, 3, 1, "#2b1d14"); R(c, x + 9, y + 22 - l2, 3, 1, "#2b1d14");
  }
  /* 몸통 */
  R(c, x + 3, y + 12, 10, 7, shirt); R(c, x + 3, y + 18, 10, 1, shade(shirt, 0.8));
  if (dir !== "up") { R(c, x + 6, y + 12, 4, 2, "#fff8ee"); R(c, x + 7, y + 12, 2, 1, skin); }
  /* 팔 */
  if (o.typing) { var k = (t >> 2) % 2; R(c, x + 1, y + 13, 2, 4, shirt); R(c, x + 13, y + 13, 2, 4, shirt); R(c, x + 2, y + 17 + k, 3, 2, skin); R(c, x + 11, y + 18 - k, 3, 2, skin); }
  else if (o.cup) { R(c, x + 1, y + 13, 2, 5, shirt); R(c, x + 13, y + 12, 2, 3, shirt); var up = (t >> 5) % 3 === 0; R(c, x + 13, y + (up ? 9 : 12), 4, 4, "#fff"); R(c, x + 14, y + (up ? 10 : 13), 2, 1, "#7a4a24"); R(c, x + 17, y + (up ? 10 : 13), 1, 2, "#fff"); if ((t >> 3) % 2) R(c, x + 14, y + (up ? 6 : 9), 1, 2, "rgba(255,255,255,.7)"); }
  else if (o.wave) { var wv = (t >> 3) % 2; R(c, x + 1, y + 13, 2, 5, shirt); R(c, x + 13, y + 9 - wv, 2, 5, shirt); R(c, x + 13, y + 7 - wv, 3, 3, skin); }
  else { var sw = o.walk ? (step === 1 ? 1 : step === 3 ? -1 : 0) : 0; R(c, x + 1, y + 13 + sw, 2, 5, shirt); R(c, x + 13, y + 13 - sw, 2, 5, shirt); R(c, x + 1, y + 18 + sw, 2, 1, skin); R(c, x + 13, y + 18 - sw, 2, 1, skin); }
  /* 머리 */
  R(c, x + 3, y + 3, 10, 9, skin);
  R(c, x + 2, y + 1, 12, 4, hair); R(c, x + 3, y, 10, 1, hair);
  if (dir === "up") R(c, x + 2, y + 1, 12, 10, hair);
  else {
    if (hs === "long") { R(c, x + 1, y + 3, 2, 10, hair); R(c, x + 13, y + 3, 2, 10, hair); }
    if (hs === "bob") { R(c, x + 1, y + 3, 2, 7, hair); R(c, x + 13, y + 3, 2, 7, hair); R(c, x + 3, y + 4, 4, 1, hair); }
    if (hs === "short") { R(c, x + 2, y + 4, 2, 3, hair); R(c, x + 12, y + 4, 2, 3, hair); R(c, x + 9, y + 4, 3, 1, hair); }
    if (hs === "spiky") { R(c, x + 3, y - 1, 2, 2, hair); R(c, x + 7, y - 2, 2, 2, hair); R(c, x + 11, y - 1, 2, 2, hair); R(c, x + 2, y + 4, 2, 2, hair); }
  }
  if (hs === "bun") { R(c, x + 6, y - 3, 4, 3, hair); R(c, x + 7, y - 4, 2, 1, hair); }
  if (hs === "cap") { R(c, x + 2, y, 12, 3, shade(shirt, 1.15)); R(c, x + (dir === "left" ? -1 : 6), y + 3, 9, 1, shade(shirt, 0.8)); }
  if (dir !== "up") {
    var ex = dir === "left" ? -1 : dir === "right" ? 1 : 0, blink = ((t + x * 3) % 140) < 5;
    R(c, x + 5 + ex, y + 6, 2, blink ? 1 : 2, "#2b1d14"); R(c, x + 9 + ex, y + 6, 2, blink ? 1 : 2, "#2b1d14");
    R(c, x + 5 + ex, y + 6, 1, 1, blink ? "#2b1d14" : "#fff");
    R(c, x + 4, y + 9, 2, 1, "rgba(240,120,110,.55)"); R(c, x + 10, y + 9, 2, 1, "rgba(240,120,110,.55)");
    R(c, x + 7 + ex, y + 10, 2, 1, o.happy ? "#b5483f" : shade(skin, 0.75));
  }
}
function avatar(canvas, p) {
  var c = canvas.getContext("2d"); c.imageSmoothingEnabled = false; c.clearRect(0, 0, canvas.width, canvas.height);
  drawChar(c, 0, 2, p, { dir: "down", t: 0 });
}

/* ---------- 방 ---------- */
function drawWall(c) {
  R(c, 0, 0, W, 46, "#f3e3c3");
  for (var x = 0; x < W; x += 6) R(c, x, 0, 2, 40, "#efdab5");
  R(c, 0, 40, W, 3, "#c79a6a"); R(c, 0, 43, W, 4, "#8a5a33");
  /* 창문 + 하늘 + 구름 */
  [[28, 6], [372, 6]].forEach(function (w) {
    R(c, w[0] - 3, w[1] - 3, 86, 34, "#8a5a33"); R(c, w[0], w[1], 80, 28, "#9fd8ff"); R(c, w[0], w[1] + 18, 80, 10, "#c8ecff");
    var cx = w[0] + ((frame >> 3) % 100) - 10; c.save(); c.beginPath(); c.rect(w[0], w[1], 80, 28); c.clip(); R(c, cx, w[1] + 6, 14, 4, "#fff"); R(c, cx + 3, w[1] + 4, 8, 2, "#fff"); R(c, cx + 46, w[1] + 12, 12, 3, "#fff"); c.restore();
    R(c, w[0] + 39, w[1], 2, 28, "#b98656"); R(c, w[0], w[1] + 13, 80, 2, "#b98656");
    R(c, w[0] - 6, w[1] - 4, 8, 34, "#e57a5c"); R(c, w[0] + 78, w[1] - 4, 8, 34, "#e57a5c"); R(c, w[0] - 6, w[1] - 4, 8, 3, "#c95e43"); R(c, w[0] + 78, w[1] - 4, 8, 3, "#c95e43");
    R(c, w[0] - 3, w[1] + 28, 86, 3, "#c79a6a");
  });
  /* 책장 */
  R(c, 128, 4, 54, 38, "#7a4a24"); R(c, 130, 6, 50, 34, "#5c3518");
  var books = ["#e5484d", "#3b82f6", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#0ea5e9", "#f97316"];
  for (var s = 0; s < 3; s++) { R(c, 130, 16 + s * 11, 50, 2, "#7a4a24"); for (var b = 0; b < 9; b++) R(c, 132 + b * 5, 7 + s * 11, 4, 9, books[(b + s * 3) % books.length]); }
  /* 간판 */
  R(c, 196, 6, 88, 20, "#7a4a24"); R(c, 198, 8, 84, 16, "#fff1dc");
  c.fillStyle = "#7a4a24"; c.font = "bold 11px monospace"; c.textBaseline = "middle"; c.textAlign = "center"; c.fillText("LOWNA", 240, 16.5); c.textAlign = "left";
  R(c, 212, 28, 56, 10, "#6b4a2f"); c.fillStyle = "#fff1dc"; c.font = "6px monospace"; c.fillText("TIMELESS · NEW VALUE", 214, 33.5);
  /* 화이트보드 (오늘 매출 막대) */
  R(c, 296, 6, 62, 34, "#cbd5e1"); R(c, 298, 8, 58, 30, "#fff");
  var bars = [8, 14, 10, 18, 12, 20, 16]; bars.forEach(function (h, i) { R(c, 302 + i * 7, 34 - h, 5, h, i === bars.length - 1 ? "#e07a3f" : "#93c5fd"); });
  R(c, 300, 34, 54, 1, "#475569");
  /* 벽시계 */
  R(c, 102, 10, 16, 16, "#7a4a24"); R(c, 103, 11, 14, 14, "#fff"); var d = new Date(), a = d.getMinutes() / 60 * Math.PI * 2, ah = (d.getHours() % 12 + d.getMinutes() / 60) / 12 * Math.PI * 2;
  c.strokeStyle = "#3b2a1c"; c.lineWidth = 1; c.beginPath(); c.moveTo(110, 18); c.lineTo(110 + Math.sin(a) * 6, 18 - Math.cos(a) * 6); c.moveTo(110, 18); c.lineTo(110 + Math.sin(ah) * 4, 18 - Math.cos(ah) * 4); c.stroke();
}
function drawFloor(c) {
  for (var y = 47; y < H; y += 6) { R(c, 0, y, W, 6, (y / 6) % 2 ? "#c99a66" : "#c4945f"); for (var x = ((y / 6) % 3) * 23; x < W; x += 70) R(c, x, y, 1, 6, "#a97a49"); }
  TEAMS.forEach(function (t) {
    var w = 176, h = 86; R(c, t.x, t.y, w, h, t.rug[2]); R(c, t.x + 3, t.y + 3, w - 6, h - 6, t.rug[0]);
    for (var i = 0; i < w - 12; i += 8) { R(c, t.x + 6 + i, t.y + 5, 4, 2, t.rug[1]); R(c, t.x + 6 + i, t.y + h - 7, 4, 2, t.rug[1]); }
  });
  /* 가운데 러그 (라운지) */
  R(c, 204, 196, 72, 44, "#e9a87c"); R(c, 207, 199, 66, 38, "#f4c9a4");
}
function plant(c, x, y, big) {
  R(c, x + 2, y + (big ? 16 : 10), big ? 12 : 8, big ? 9 : 7, "#b5693a"); R(c, x + 2, y + (big ? 16 : 10), big ? 12 : 8, 2, "#d0824f");
  var g = ["#2f8f4e", "#3fae63", "#5cc77c"], s = big ? 1.6 : 1;
  R(c, x + 6 * s - 4, y, 6, 8 * s, g[0]); R(c, x, y + 4 * s, 8, 7 * s, g[1]); R(c, x + 6 * s, y + 3 * s, 8, 8 * s, g[2]); R(c, x + 3 * s, y + 7 * s, 7, 6 * s, g[1]);
}
function drawProps(c) {
  /* 탕비실: 커피머신·정수기·냉장고 */
  R(c, 206, 40, 28, 16, "#6b4a2f"); R(c, 208, 30, 12, 14, "#334155"); R(c, 210, 33, 8, 4, "#ef4444"); R(c, 221, 34, 10, 6, "#e2e8f0"); R(c, 223, 36, 6, 3, "#7a4a24");
  if ((frame >> 3) % 2) R(c, 213, 26, 1, 3, "rgba(255,255,255,.8)");
  R(c, 250, 28, 14, 26, "#e2e8f0"); R(c, 252, 22, 10, 8, "#7dd3fc"); R(c, 253, 40, 8, 2, "#3b82f6");
  R(c, 268, 22, 16, 32, "#f8fafc"); R(c, 268, 36, 16, 1, "#cbd5e1"); R(c, 281, 26, 1, 6, "#94a3b8"); R(c, 281, 40, 1, 8, "#94a3b8");
  /* 대표실 러그 */
  R(c, 194, 66, 92, 56, "#d4a72c"); R(c, 196, 68, 88, 52, "#f6e2b3"); for (var i = 0; i < 84; i += 8) { R(c, 199 + i, 70, 4, 2, "#ecd08a"); R(c, 199 + i, 116, 4, 2, "#ecd08a"); }
  /* 라운지 소파·테이블 */
  R(c, 212, 214, 56, 18, "#e07a3f"); R(c, 212, 210, 56, 6, "#c6612c"); R(c, 208, 212, 6, 20, "#c6612c"); R(c, 266, 212, 6, 20, "#c6612c");
  R(c, 228, 238, 24, 8, "#8a5a33"); R(c, 236, 236, 6, 3, "#fff");
  /* 라벨 프린터 + 택배 박스 (왼쪽 아래 구석) */
  R(c, 12, 256, 22, 12, "#6b4a2f"); R(c, 14, 250, 16, 8, "#e2e8f0"); R(c, 16, 252, 12, 2, "#475569"); R(c, 18, 258, 8, 2, "#fff");
  [[40, 256], [50, 256], [45, 247]].forEach(function (b) { R(c, b[0], b[1], 10, 10, "#d6a86e"); R(c, b[0], b[1] + 4, 10, 1, "#b0844c"); R(c, b[0] + 4, b[1], 2, 10, "#e9c38f"); });
  /* 화분 */
  plant(c, 2, 46, true); plant(c, 462, 46, true); plant(c, 184, 232, false); plant(c, 284, 232, false);
}
function drawDesk(c, s, st, t, sel) {
  var x = s.dx, y = s.dy, w = s.w || 46, mx = x + Math.round(w / 2) - 23;
  /* 책상 상판 + 다리 */
  R(c, x, y, w, 4, s === SEAT.ceo ? "#8a5a33" : "#b98251"); R(c, x, y + 4, w, 12, s === SEAT.ceo ? "#6b4120" : "#9a6337"); R(c, x, y + 4, w, 1, "#7a4a24");
  R(c, x + 3, y + 16, 3, 6, "#6b4120"); R(c, x + w - 6, y + 16, 3, 6, "#6b4120"); R(c, x + w - 16, y + 6, 12, 8, "#87542c"); R(c, x + w - 11, y + 9, 2, 1, "#e9c38f");
  if (s === SEAT.ceo) { R(c, x + 4, y + 7, 18, 6, "#d4a72c"); R(c, x + 5, y + 8, 16, 4, "#fff3c4"); c.fillStyle = "#7a4a24"; c.font = "bold 4px monospace"; c.fillText("CEO", x + 8, y + 10.5); }
  x = mx;
  /* 노트북 (뒷면) — 화면 불빛 색 = 상태 */
  var glow = st === "alert" ? ((t >> 3) % 2 ? "#ff6b6b" : "#ffb4b4") : st === "work" ? "#7dd3fc" : st === "done" ? "#86efac" : "#cbd5e1";
  R(c, x + 16, y - 7, 15, 8, "#4b5563"); R(c, x + 17, y - 6, 13, 6, "#6b7280"); R(c, x + 22, y - 4, 3, 2, glow); R(c, x + 14, y + 1, 19, 2, "#9ca3af");
  if (st === "work" || st === "alert") { c.fillStyle = st === "alert" ? "rgba(255,80,80,.18)" : "rgba(125,211,252,.18)"; c.fillRect(x + 12, y - 12, 23, 6); }
  /* 서류·머그·작은 화분 */
  R(c, x + 3, y + 1, 8, 2, "#fff"); R(c, x + 4, y, 8, 2, "#fef3c7"); R(c, x + 37, y - 2, 4, 4, "#fff"); R(c, x + 38, y - 1, 2, 1, "#7a4a24");
  if (sel) { c.strokeStyle = "#e07a3f"; c.lineWidth = 1; c.setLineDash([2, 2]); c.strokeRect(s.dx - 3.5, y - 30.5, w + 7, 56); c.setLineDash([]); }
}
function drawChair(c, s) {
  if (s === SEAT.ceo) { R(c, s.x - 9, s.y - 20, 18, 13, "#3b2a1c"); R(c, s.x - 8, s.y - 19, 16, 11, "#5c3a22"); R(c, s.x - 7, s.y - 18, 14, 2, "#7a4a24"); R(c, s.x - 10, s.y - 8, 20, 4, "#2b1d14"); return; } R(c, s.x - 7, s.y - 16, 14, 9, "#7a4a24"); R(c, s.x - 6, s.y - 15, 12, 7, "#a86f3e"); R(c, s.x - 5, s.y - 14, 10, 1, "#c48a55"); R(c, s.x - 8, s.y - 8, 16, 4, "#6b4120"); }

/* ---------- 움직임 ---------- */
var ACT = {};
function actor(p) {
  var a = ACT[p.id], s = SEAT[p.id];
  if (!a) a = ACT[p.id] = { x: s.x, y: s.y, mode: "seat", path: [], wait: 60 + Math.random() * 200, dir: "down", spot: null };
  return a;
}
function goSpot(a, s, name) { var sp = SPOTS[name], L = lane(s); a.path = [{ x: s.x, y: s.wy }, { x: L, y: s.wy }, { x: L, y: sp.y }, { x: sp.x, y: sp.y }]; a.mode = "walk"; a.target = name; }
function goHome(a, s) { var L = lane(s); a.path = [{ x: L, y: a.y }, { x: L, y: s.wy }, { x: s.x, y: s.wy }, { x: s.x, y: s.y }]; a.mode = "walk"; a.target = "seat"; }
function stepActor(p, st) {
  var a = actor(p), s = SEAT[p.id], sp = 1.4;
  if (p.boss) return a;
  if (a.mode === "walk") {
    var q = a.path[0];
    if (!q) { a.mode = a.target === "seat" ? "seat" : "spot"; a.spot = a.target; a.wait = 90 + Math.random() * 120; a.dir = a.target === "seat" ? "down" : (SPOTS[a.target] && SPOTS[a.target].face) || "down"; return a; }
    var dx = q.x - a.x, dy = q.y - a.y, dist = Math.abs(dx) + Math.abs(dy);
    if (dist <= sp) { a.x = q.x; a.y = q.y; a.path.shift(); }
    else if (Math.abs(dx) > 0.5) { a.x += Math.sign(dx) * Math.min(sp, Math.abs(dx)); a.dir = dx > 0 ? "right" : "left"; }
    else { a.y += Math.sign(dy) * Math.min(sp, Math.abs(dy)); a.dir = dy > 0 ? "down" : "up"; }
    return a;
  }
  var wantSeat = st === "work" || st === "alert";
  if (wantSeat && a.mode !== "seat") { goHome(a, s); return a; }
  if (st === "done" && a.mode === "seat") { a.wait--; if (a.wait <= 0) goSpot(a, s, "sofa"); return a; }
  if (st === "done") return a;
  if (a.mode === "spot") { a.wait--; if (a.wait <= 0) goHome(a, s); return a; }
  if (!wantSeat) { a.wait--; if (a.wait <= 0) { var opts = ["coffee", "water", "report", "report2", "window", "coffee"]; goSpot(a, s, opts[Math.floor(Math.random() * opts.length)]); a.wait = 0; } }
  return a;
}

function drawScene() {
  var c = ctx; c.imageSmoothingEnabled = false;
  drawWall(c); drawFloor(c); drawProps(c);
  var list = ALL.map(function (p) { var inf = info(p), a = stepActor(p, inf.status); return { p: p, inf: inf, a: a }; });
  /* 의자 → 앉은 직원 → 책상 순서로 (책상이 다리를 가림) */
  list.forEach(function (o) { drawChair(c, SEAT[o.p.id]); });
  list.forEach(function (o, i) {
    var s = SEAT[o.p.id], st = o.inf.status, t = frame + i * 9;
    if (o.a.mode === "seat") drawChar(c, s.x - 8, s.y - 24, o.p, { dir: "down", t: t, seated: true, typing: st === "work" || st === "alert", cup: st === "idle" || st === "none", happy: st === "done" });
    drawDesk(c, s, st, t, v.ofSel === o.p.id);
    if (o.a.mode === "seat" && st === "alert" && (t >> 4) % 2) { R(c, s.x - 2, s.y - 40, 4, 8, "#e5484d"); R(c, s.x - 2, s.y - 30, 4, 3, "#e5484d"); }
  });
  /* 돌아다니는 직원은 y 순서대로 */
  list.filter(function (o) { return o.a.mode !== "seat"; }).sort(function (m, n) { return m.a.y - n.a.y; }).forEach(function (o, i) {
    var sit = o.a.mode === "spot" && o.a.spot === "sofa";
    drawChar(ctx, o.a.x - 8, o.a.y - (sit ? 20 : 24), o.p, { dir: o.a.mode === "walk" ? o.a.dir : (sit ? "down" : o.a.dir), t: frame + i * 7, walk: o.a.mode === "walk", seated: sit, cup: o.a.spot === "coffee" || o.a.spot === "water", happy: sit || o.inf.status === "done" });
    if (sit && (frame >> 5) % 3 === 0) { ctx.fillStyle = "#e07a3f"; ctx.font = "8px monospace"; ctx.fillText("♪", o.a.x + 6, o.a.y - 24); }
  });
  /* 사무실 고양이 */
  drawCat(c);
  /* 말풍선·이름표 위치 갱신 */
  list.forEach(function (o) { var el = document.getElementById("of-say-" + o.p.id); if (el) el.style.display = o.a.mode === "seat" && (o.inf.status === "alert" || o.inf.status === "work") ? "" : "none"; });
}
/* 사무실 고양이 잭슨 (젖소무늬) — 복도를 돌아다니다 가끔 대표님 자리 앞에서 쉼 */
var CAT = { x: 120, y: 150, tx: 360, ty: 150, wait: 0, dir: 1 };
function drawCat(c) {
  if (CAT.wait > 0) CAT.wait--;
  else {
    var dx = CAT.tx - CAT.x, dy = CAT.ty - CAT.y;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) { CAT.wait = 140 + Math.random() * 260; var r = Math.random(); if (r < 0.25) { CAT.tx = 240; CAT.ty = 126; } else if (r < 0.4) { CAT.tx = 236; CAT.ty = 246; } else { CAT.tx = 20 + Math.random() * 440; CAT.ty = 150; } if (CAT.ty !== 150 && Math.abs(CAT.y - 150) > 1 === false) {} }
    else if (Math.abs(dx) > 0.5 && Math.abs(CAT.y - 150) < 1) { CAT.x += Math.sign(dx) * 0.6; CAT.dir = Math.sign(dx); }
    else if (Math.abs(dx) > 0.5) { CAT.y += Math.sign(150 - CAT.y) * 0.6; }
    else { CAT.y += Math.sign(dy) * 0.6; }
  }
  var x = Math.round(CAT.x), y = Math.round(CAT.y), f = CAT.wait > 0 ? 0 : (frame >> 2) % 2, W1 = "#fbfbf8", K = "#1f1f1f", P = "#f4a3a8", rt = CAT.dir > 0;
  var hx = rt ? x + 8 : x - 4;
  /* 꼬리 */ R(c, rt ? x - 2 : x + 10, y + 1 + f, 2, 4, K);
  /* 몸 (흰 바탕 + 검은 점) */ R(c, x, y + 3, 10, 5, W1); R(c, x + 2, y + 3, 3, 2, K); R(c, x + 6, y + 5, 3, 2, K); R(c, x, y + 4, 1, 2, K);
  /* 다리 */ R(c, x + 1, y + 8, 1, 2 - f, K); R(c, x + 3, y + 8, 1, 1 + f, W1); R(c, x + 7, y + 8, 1, 1 + f, W1); R(c, x + 8, y + 8, 1, 2 - f, K);
  /* 머리 */ R(c, hx, y, 6, 5, W1); R(c, rt ? hx + 3 : hx, y, 3, 2, K); R(c, hx, y - 1, 1, 1, K); R(c, hx + 5, y - 1, 1, 1, rt ? W1 : K);
  R(c, rt ? hx + 4 : hx + 1, y + 2, 1, 1, K); R(c, rt ? hx + 5 : hx, y + 3, 1, 1, P);
  if (CAT.wait > 0 && (frame >> 4) % 6 === 0) { c.fillStyle = "#3b2a1c"; c.font = "6px monospace"; c.fillText("z", x + 10, y - 2); }
  var el = document.getElementById("of-cat"); if (el) { el.style.left = ((x + 5) / W * 100) + "%"; el.style.top = ((y + 11) / H * 100) + "%"; }
}
function loop(ts) {
  if (!cv || !document.body.contains(cv)) { raf = null; return; }
  if (ts - last > 66) { last = ts; frame++; drawScene(); }
  raf = requestAnimationFrame(loop);
}
function pick(ev) {
  var r = cv.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * W, y = (ev.clientY - r.top) / r.height * H, best = null, bd = 1e9;
  ALL.forEach(function (p) { var a = actor(p), d = Math.abs(a.x - x) + Math.abs(a.y - 12 - y); if (d < bd) { bd = d; best = p; } });
  if (best && bd < 40) { v.ofSel = best.id; userPick = Date.now(); showCard(); }
}

/* ---------- 화면 ---------- */
var SN = { work: "일하는 중", idle: "대기", alert: "확인 필요", done: "완료", none: "기록 없음" };
var SC = { work: "#3b82f6", idle: "#a8a29e", alert: "#e5484d", done: "#3fa36b", none: "#c7b8a6" };
var userPick = 0;
function pct(x, n) { return (x / n * 100).toFixed(2) + "%"; }
function card(p) {
  var inf = info(p), r = inf.r;
  if (p.boss) {
    var chk = p.id === "ceo" ? (inf.checks && inf.checks.length ? '<h4>대표님 확인할 일</h4><ul class="of-log">' + inf.checks.map(function (x) { return "<li>❗ " + esc(x) + "</li>"; }).join("") + "</ul>" : '<h4>대표님 확인할 일</h4><p class="muted" style="font-size:13px;margin:0 0 12px">지금은 확인할 일이 없어요 ☕</p>') : "";
    var team = p.id === "ceo" ? '<h4>오늘 사무실</h4><div class="of-stats">' + [["work", "일하는 중"], ["alert", "확인 필요"], ["done", "완료"], ["idle", "대기"]].map(function (k) { var n = STAFF.filter(function (q) { var st = info(q).status; return k[0] === "idle" ? (st === "idle" || st === "none") : st === k[0]; }).length; return "<div><small>" + k[1] + "</small><b>" + n + "명</b></div>"; }).join("") + "</div>" : "";
    var lg = inf.log.length ? '<h4>최근 기록</h4><ul class="of-log">' + inf.log.map(function (l) { return "<li><small>" + esc(ago(l.at)) + "</small> · " + esc(l.text) + "</li>"; }).join("") + "</ul>" : "";
    return '<div class="of-card"><div class="of-card-h"><canvas width="16" height="26" data-ava="' + p.id + '"></canvas><div><b>' + esc(p.name) + '</b><div class="muted">' + esc(p.role) + ' · 대표실</div></div><span class="of-st" style="background:' + SC[inf.status] + '">' + SN[inf.status] + "</span></div>" +
      '<div class="of-bubble">💬 ' + esc(inf.bubble) + "</div>" + team + chk + lg + "</div>";
  }
  var steps = p.steps.map(function (s, i) {
    var cls = i < inf.step ? "ok" : i === inf.step ? "now" : "";
    return '<li class="' + cls + '"><span>' + (i < inf.step ? "✔" : i + 1) + "</span>" + esc(s) + "</li>";
  }).join("");
  var stats = inf.live ? '<h4>오늘 숫자 (ERP에서 바로)</h4><div class="of-stats">' + inf.live.stats.map(function (s) { return "<div><small>" + esc(s[0]) + "</small><b>" + esc(s[1]) + "</b></div>"; }).join("") + "</div>" : "";
  var log = inf.log.length ? '<ul class="of-log">' + inf.log.map(function (l) { return "<li><small>" + esc(ago(l.at)) + "</small> · " + esc(l.text) + "</li>"; }).join("") + "</ul>" : '<p class="muted" style="font-size:13px;margin:0 0 12px">아직 기록이 없어요. Claude가 이 일을 하면 여기에 쌓여요.</p>';
  return '<div class="of-card"><div class="of-card-h"><canvas width="16" height="26" data-ava="' + p.id + '"></canvas><div><b>' + esc(p.name) + '</b><div class="muted">' + esc(p.role) + " · " + esc(SEAT[p.id].team.name) + '</div></div><span class="of-st" style="background:' + SC[inf.status] + '">' + SN[inf.status] + "</span></div>" +
    '<div class="of-bubble">💬 ' + esc(inf.bubble) + (r.updatedAt ? ' <small>· ' + esc(ago(r.updatedAt)) + "</small>" : "") + "</div>" + stats +
    "<h4>업무 단계</h4><ol class=\"of-steps\">" + steps + "</ol>" +
    (inf.todo ? '<h4>다음 할 일</h4><p class="of-todo">' + esc(inf.todo) + "</p>" : "") +
    (p.projects && p.projects.length ? '<h4>연관 프로젝트</h4><ul class="of-log">' + p.projects.map(function (x) { return "<li>📁 " + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
    "<h4>최근 기록</h4>" + log +
    (!KIOSK ? '<div style="display:flex;gap:6px;flex-wrap:wrap">' + (p.tabs || (p.tab ? [p.tab] : [])).filter(function (t) { return ERP.pages[t]; }).map(function (t) { return '<button class="btn sm" data-ofgo="' + esc(t) + '">' + esc(ERP.pages[t].title) + " 열기</button>"; }).join("") + "</div>" : "") + "</div>";
}
function ticker() {
  var all = [];
  STAFF.forEach(function (p) { (rec(p.id).log || []).forEach(function (l) { all.push({ at: l.at, t: p.name + " · " + l.text }); }); });
  all.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
  return all.slice(0, 12).map(function (x) { return esc(ago(x.at)) + " " + esc(x.t); }).join("　·　") || "오늘도 로우나 사무실 영업 중 ☕ — 작업 기록이 생기면 여기에 흘러가요";
}
function counts() { var c = { work: 0, alert: 0, idle: 0, done: 0, none: 0 }; STAFF.forEach(function (p) { c[info(p).status]++; }); return c; }
function sumHtml() { var c = counts(); return [["work", "일하는 중"], ["alert", "확인 필요"], ["done", "완료"], ["idle", "대기"]].map(function (k) { var n = c[k[0]] + (k[0] === "idle" ? c.none : 0); return '<span><i style="background:' + SC[k[0]] + '"></i>' + k[1] + " " + n + "</span>"; }).join(""); }
function overlays() {
  var h = "";
  TEAMS.forEach(function (t) { h += '<div class="of-zone" style="left:' + pct(t.x + 88, W) + ";top:" + pct(t.y + 74, H) + '">' + esc(t.name) + "</div>"; });
  h += '<div class="of-cat" id="of-cat">잭슨</div>';
  ALL.forEach(function (p) {
    var s = SEAT[p.id], inf = info(p);
    h += '<div class="of-name' + (p.boss ? " boss" : "") + (v.ofSel === p.id ? " on" : "") + '" data-name="' + p.id + '" style="left:' + pct(s.x, W) + ";top:" + pct(s.dy + 22, H) + '">' + (p.boss ? '<span class="pre">대표 </span>' : "") + esc(p.name) + "</div>";
    h += '<div class="of-say' + (inf.status === "alert" ? " alert" : "") + '" id="of-say-' + p.id + '" style="left:' + pct(s.x, W) + ";top:" + pct(s.y - 26, H) + '">' + esc(inf.bubble) + "</div>";
  });
  return h;
}
function bar() {
  return ALL.map(function (p) {
    var inf = info(p);
    return '<button type="button" class="of-chip' + (p.boss ? " boss" : "") + (v.ofSel === p.id ? " on" : "") + '" data-ofsel="' + p.id + '"><canvas width="16" height="16" data-ava="' + p.id + '"></canvas><span style="min-width:0"><b>' + esc(p.name) + "</b><small>" + esc(p.role) + '</small></span><span class="st" style="background:' + SC[inf.status] + '" title="' + SN[inf.status] + '"></span></button>';
  }).join("");
}
function paintAvatars(root) { (root || document).querySelectorAll("canvas[data-ava]").forEach(function (cnv) { var p = ALL.find(function (x) { return x.id === cnv.dataset.ava; }); if (p) avatar(cnv, p); }); }
function showCard() {
  var p = ALL.find(function (x) { return x.id === v.ofSel; }) || ALL[0], side = document.getElementById("of-side");
  if (side) { side.innerHTML = card(p); paintAvatars(side); }
  document.querySelectorAll("[data-ofsel]").forEach(function (b) { b.classList.toggle("on", b.dataset.ofsel === p.id); });
  document.querySelectorAll("[data-name]").forEach(function (b) { b.classList.toggle("on", b.dataset.name === p.id); });
}
function render() {
  if (!v.ofSel) v.ofSel = "ceo";
  var sel = ALL.find(function (p) { return p.id === v.ofSel; }) || ALL[0];
  return '<div class="of-wrap">' +
    '<div class="of-head"><div><h1>🏢 로우나 사무실</h1><p>직원을 누르면 하는 일과 진행 단계가 보여요</p></div><div class="of-sum" id="of-sum">' + sumHtml() + "</div>" +
    (KIOSK ? '<span class="of-clock" id="of-clock"></span>' : '<a class="btn" href="office.html" target="_blank" rel="noopener">모니터용 전광판 열기</a>') + "</div>" +
    '<div class="of-grid"><div><div class="of-room"><canvas id="of-cv" width="' + W + '" height="' + H + '" aria-label="로우나 픽셀 사무실"></canvas><div id="of-ov">' + overlays() + "</div></div>" +
    '<div class="of-bar" id="of-bar">' + bar() + "</div></div>" +
    '<div id="of-side">' + card(sel) + "</div></div>" +
    '<div class="of-ticker"><div class="of-ticker-in" id="of-tk">📢 ' + ticker() + "</div></div></div>";
}
function bind(root) {
  cv = root.querySelector("#of-cv"); ctx = cv && cv.getContext("2d");
  if (cv) { cv.onclick = pick; if (!raf) raf = requestAnimationFrame(loop); }
  paintAvatars(root);
  root.querySelectorAll("[data-ofsel]").forEach(function (b) { b.onclick = function () { v.ofSel = b.dataset.ofsel; userPick = Date.now(); showCard(); }; });
  var side = root.querySelector("#of-side"); if (side) side.onclick = function (e) { var b = e.target.closest("[data-ofgo]"); if (b) { ERP.go(b.dataset.ofgo); window.scrollTo(0, 0); } };
}
function live() {
  if (ERP.drawer()) return;
  var ov = document.getElementById("of-ov"); if (ov) ov.innerHTML = overlays();
  var sm = document.getElementById("of-sum"); if (sm) sm.innerHTML = sumHtml();
  var br = document.getElementById("of-bar"); if (br) { br.innerHTML = bar(); paintAvatars(br); br.querySelectorAll("[data-ofsel]").forEach(function (b) { b.onclick = function () { v.ofSel = b.dataset.ofsel; userPick = Date.now(); showCard(); }; }); }
  var tk = document.getElementById("of-tk"); if (tk) tk.innerHTML = "📢 " + ticker();
  showCard();
}
/* 시계 · 전광판 순환 */
setInterval(function () {
  if (ERP.view.tab !== "office") return;
  var ck = document.getElementById("of-clock"); if (ck) { var d = new Date(); ck.textContent = d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" }) + " " + d.toTimeString().slice(0, 5); }
}, 1000);
setInterval(function () {
  if (ERP.view.tab !== "office" || ERP.drawer() || !KIOSK || Date.now() - userPick < 30000) return;
  var hot = STAFF.filter(function (p) { var s = info(p).status; return s === "alert" || s === "work"; }), list = hot.length ? hot : STAFF;
  var j = list.findIndex(function (p) { return p.id === v.ofSel; }); v.ofSel = list[(j + 1) % list.length].id; showCard();
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
   ERP.officeLog("rex", { step: 2, status: "work", note: "11장 재생성 중", todo: "판독기 검수", text: "톰브라운 11장 생성 시작" }) */
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

ERP.page({ id: "office", title: "픽셀 사무실", wide: true, render: render, bind: bind, live: live });
})();
