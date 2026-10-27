/* 로우나 ERP · 공통 뼈대 (로그인·데이터·메뉴·입력창·내보내기)
   메뉴 화면은 pages/*.js 에 하나씩 따로 있고, ERP.page({...}) 로 등록합니다. */
(function () {
"use strict";
var C = window.RownaCalc, CFG = window.ROWNA_CONFIG || {};
var ERP = window.ERP = { C: C, pages: {}, forms: {}, acts: {} };
var S = ERP.S = { sb: null, user: null, profile: null, PLATS: [], CARDS: [], SET: { goal_target: 0, default_shipping_fee: 4000, kream_fee_rate: 0.06, kream_fee_cap: 300000 }, PROFILES: [], IMPORTS: [], report: null, retBySale: new Map() };
var DATA = ERP.DATA = { sales: new Map(), purchases: new Map(), returns: new Map(), documents: new Map(), kream_wholesale: new Map(), price_items: new Map() };
ERP.CATS = ["하이엔드상품류", "일반명품류", "브랜드류"];
ERP.ROLE_NAME = { owner: "대표", accountant: "세무사(보기 전용)", staff: "직원", ai: "AI 직원", pending: "승인 대기" };
var COLS = ERP.COLS = {
  sales: ["id","date","order_time","platform_id","product_name","item_code","brand","category","sale_price","cost","settled_amount","settle_status","adjustment","shipping_fee","etc_amount","vat_creditable","deferred_status","deferred_final_amount","sabang_order_no","mall_order_no","purchase_id","ship_status","customer_id","source","memo","extra"],
  purchases: ["id","date","vendor","brand","item_code","option","serial_no","category","qty","unit_cost","card_id","effective_unit_cost","status","sold_sale_id","buyer","rex_order_no","rex_status","source","memo","extra"],
  returns: ["id","date","type","status","sale_id","order_no","platform_id","product_name","sale_price","ship_cost","ship_income","refund_loss","restocked","memo","dates","source","extra"],
  documents: ["id","kind","title","doc_date","vendor","amount","file_path","file_name","file_type","linked_type","linked_id","item_code","memo"],
  platforms: ["id","name","fee","settlement","deferred_rate","multiplier","tiered","tiered_threshold","tiered_rate_below","tiered_rate_above","verified","sort"],
  cards: ["id","name","discount_rate","point_rate"],
  price_items: ["id","status","tier","sku","buy_link","vendor","brand","category","name","buy_price","card_rate","margin","fee_rate","fixed_price","store_price","memo","extra"],
  kream_wholesale: ["id","supplier","list_date","brand","sku","name","kream_url","size","qty","wholesale_price","kream_price","kream_recent","kream_checked_at","decision","memo","extra"]
};
var WRITE_ROLES = { staff: ["purchases","returns","documents","kream_wholesale","price_items","sourcing_items"], ai: ["purchases","returns","documents","kream_wholesale","price_items","sourcing_items"] };
ERP.view = { tab: "home", month: C.ym(today()), year: today().slice(0, 4) };
try { var sv = JSON.parse(localStorage.getItem("rowna-erp-view") || "null"); if (sv && sv.tab) ERP.view.tab = sv.tab; } catch (e) {}

/* ---------- 도우미 ---------- */
function today() { var d = new Date(); return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
function p2(n) { return String(n).padStart(2, "0"); }
var U = ERP.U = {
  today: today, p2: p2, num: C.num, ym: C.ym,
  won: function (n) { return Math.round(Number(n) || 0).toLocaleString("ko-KR"); },
  pct: function (n) { return isFinite(n) ? (n * 100).toFixed(1) + "%" : "–"; },
  esc: function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); },
  uid: function () { return "id_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },
  shortWon: function (n) { n = Math.round(Number(n) || 0); var a = Math.abs(n); if (a >= 1e8) return (n / 1e8).toFixed(2).replace(/0+$/, "").replace(/\.$/, "") + "억"; if (a >= 1e4) return Math.round(n / 1e4).toLocaleString("ko-KR") + "만"; return n.toLocaleString("ko-KR"); },
  shiftMonth: function (m, d) { var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + d; y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12; return y + "-" + p2(mo + 1); },
  norm: function (x) { return String(x || "").replace(/\s+/g, "").toUpperCase(); },
  $: function (id) { return document.getElementById(id); }
};
var esc = U.esc, won = U.won, $ = U.$;
ERP.list = function (k) { return Array.from(DATA[k].values()); };
ERP.toast = function (msg) { var t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, msg.length > 60 ? 7000 : 3200); };
ERP.sync = function (state, text) { var el = $("sync"); if (el) el.innerHTML = '<span class="dot ' + state + '"></span>' + esc(text); };
ERP.isOwner = function () { return S.profile && S.profile.role === "owner"; };
ERP.canWrite = function (t) { var r = S.profile && S.profile.role; if (!r) return false; if (r === "owner") return true; return (WRITE_ROLES[r] || []).indexOf(t) !== -1; };
ERP.plat = function (id) { return S.PLATS.find(function (p) { return p.id === id; }); };
ERP.platName = function (id) { var p = ERP.plat(id); return p ? p.name : (id || "미지정"); };
ERP.card = function (id) { return S.CARDS.find(function (c) { return c.id === id; }); };
ERP.cardRate = function (c) { return c ? (Number(c.discountRate) || 0) + (Number(c.pointRate) || 0) : 0; };
ERP.derive = function (s) { return C.derive(s, ERP.plat(s.platformId)); };
ERP.excluded = function (s) { return C.isExcluded(s, S.retBySale); };
ERP.aggregate = function (fn) { return C.aggregate(ERP.list("sales"), ERP.list("returns"), ERP.plat, S.retBySale, fn); };
ERP.docsFor = function (type, id) { return ERP.list("documents").filter(function (d) { return d.linkedType === type && d.linkedId === id; }); };
function rebuildIndex() { S.retBySale = new Map(); DATA.returns.forEach(function (r) { if (r.saleId) S.retBySale.set(r.saleId, r); }); }
ERP.errMsg = function (e) {
  var m = (e && (e.message || e.error_description)) || "";
  if (/Invalid login credentials/i.test(m)) return "이메일 또는 비밀번호가 맞지 않아요.";
  if (/Email not confirmed/i.test(m)) return "가입 확인 메일의 링크를 먼저 눌러 주세요.";
  if (/row-level security|permission denied/i.test(m)) return "이 작업을 할 권한이 없어요.";
  if (/duplicate key.*sabang/i.test(m)) return "같은 사방넷 주문번호가 이미 있어요.";
  if (/relation .* does not exist|Could not find the table/i.test(m)) return "DB에 이 메뉴용 표가 아직 없어요. 추가 SQL(schema_02)을 실행해 주세요.";
  if (/Failed to fetch|NetworkError|network/i.test(m)) return "인터넷 연결을 확인해 주세요.";
  if (/Password should be/i.test(m)) return "비밀번호는 6자 이상이어야 해요.";
  if (/User already registered/i.test(m)) return "이미 가입된 이메일이에요. 로그인해 주세요.";
  if (/rate limit/i.test(m)) return "요청이 많아요. 잠시 후 다시 시도해 주세요.";
  return "처리하지 못했어요. (" + (m || "알 수 없는 오류") + ")";
};

/* ---------- 데이터 ---------- */
function fromRow(t, row) { return C.toCamel(row); }
ERP.toRow = function (table, obj) {
  var r = C.toSnake(obj, COLS[table]);
  ["date", "doc_date", "list_date"].forEach(function (k) { if (k in r && !r[k]) r[k] = null; });
  ["platform_id", "card_id", "sale_id", "purchase_id", "sold_sale_id", "linked_type", "linked_id", "customer_id", "deferred_status", "kream_checked_at"].forEach(function (k) { if (k in r && r[k] === "") r[k] = null; });
  ["effective_unit_cost", "amount", "kream_price", "buy_price", "card_rate", "margin", "fee_rate", "fixed_price", "store_price"].forEach(function (k) { if (!(k in r)) return; var ck = k.replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); }); if (obj[ck] === "" || obj[ck] == null) r[k] = null; });
  return r;
};
async function fetchAll(table, order, optional) {
  var out = [], from = 0, size = 1000;
  while (true) {
    var q = S.sb.from(table).select("*").range(from, from + size - 1);
    if (order) q = q.order(order, { ascending: true });
    var res = await q;
    if (res.error) { if (optional) return []; throw res.error; }
    out = out.concat(res.data || []);
    if (!res.data || res.data.length < size) break;
    from += size;
  }
  return out;
}
ERP.fetchAll = fetchAll;
ERP.loadAll = async function () {
  ERP.sync("busy", "불러오는 중");
  var r = await Promise.all([fetchAll("platforms", "sort"), fetchAll("cards"), fetchAll("app_settings"), fetchAll("sales", "id"), fetchAll("purchases", "id"), fetchAll("returns", "id"), fetchAll("documents", "id"), fetchAll("kream_wholesale", "id", true), fetchAll("price_items", "id", true)]);
  S.PLATS = r[0].map(function (x) { return fromRow("platforms", x); });
  S.CARDS = r[1].map(function (x) { return fromRow("cards", x); });
  r[2].forEach(function (x) { S.SET[x.key] = x.value; });
  ["sales", "purchases", "returns", "documents", "kream_wholesale", "price_items"].forEach(function (t, i) { var m = new Map(); r[3 + i].forEach(function (row) { m.set(row.id, fromRow(t, row)); }); DATA[t] = m; });
  rebuildIndex();
  if (ERP.isOwner()) { var pr = await S.sb.from("profiles").select("*").order("created_at"); S.PROFILES = pr.data || []; var il = await S.sb.from("import_log").select("*").order("at", { ascending: false }).limit(10); S.IMPORTS = il.data || []; }
  await ERP.loadReport();
  ERP.sync("ok", "실시간 동기화");
};
ERP.loadReport = async function () { var res = await S.sb.rpc("build_daily_report", { d: today() }); S.report = res.error ? null : res.data; };
ERP.save = async function (table, obj) {
  if (!ERP.canWrite(table)) { ERP.toast("이 작업을 할 권한이 없어요."); return null; }
  ERP.sync("busy", "저장 중");
  var res = await S.sb.from(table).upsert(ERP.toRow(table, obj)).select().single();
  if (res.error) { ERP.sync("err", "저장 실패"); ERP.toast(ERP.errMsg(res.error)); return null; }
  ERP.applyRow(table, res.data); ERP.sync("ok", "저장됨");
  return fromRow(table, res.data);
};
ERP.saveBatch = async function (table, rows, onProgress) {
  for (var i = 0; i < rows.length; i += 400) {
    var res = await S.sb.from(table).upsert(rows.slice(i, i + 400));
    if (res.error) throw res.error;
    if (onProgress) onProgress(Math.min(i + 400, rows.length), rows.length);
  }
};
ERP.remove = async function (table, id) {
  var res = await S.sb.from(table).delete().eq("id", id);
  if (res.error) { ERP.toast(ERP.errMsg(res.error)); return false; }
  if (DATA[table]) DATA[table].delete(id); if (table === "returns") rebuildIndex(); scheduleRender(); return true;
};
ERP.applyRow = function (table, row, del) {
  if (DATA[table]) { if (del) DATA[table].delete(row.id); else DATA[table].set(row.id, fromRow(table, row)); if (table === "returns") rebuildIndex(); }
  else if (table === "platforms") { S.PLATS = S.PLATS.filter(function (p) { return p.id !== row.id; }); if (!del) S.PLATS.push(fromRow(table, row)); S.PLATS.sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); }); }
  else if (table === "cards") { S.CARDS = S.CARDS.filter(function (p) { return p.id !== row.id; }); if (!del) S.CARDS.push(fromRow(table, row)); }
  else if (table === "app_settings" && !del) S.SET[row.key] = row.value;
  scheduleRender();
};
ERP.saveSetting = async function (key, value) { var res = await S.sb.from("app_settings").upsert({ key: key, value: value }); if (res.error) ERP.toast(ERP.errMsg(res.error)); else { S.SET[key] = value; ERP.toast("저장했어요."); } };
var channel = null;
function subscribe() {
  if (channel) S.sb.removeChannel(channel);
  channel = S.sb.channel("rowna-erp");
  ["sales", "purchases", "returns", "documents", "kream_wholesale", "price_items", "platforms", "cards", "app_settings"].forEach(function (t) {
    channel.on("postgres_changes", { event: "*", schema: "public", table: t }, function (p) { if (p.eventType === "DELETE") ERP.applyRow(t, p.old, true); else ERP.applyRow(t, p.new); });
  });
  channel.subscribe(function (st) { if (st === "SUBSCRIBED") ERP.sync("ok", "실시간 동기화"); else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") ERP.sync("err", "실시간 연결 끊김 · 새로고침"); });
}
var renderTimer = null;
function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(function () { var p = ERP.pages[ERP.view.tab]; if ($("dbody")) renderNav(); else if (p && p.live) { renderNav(); p.live(); } else ERP.render(); }, 80); }
ERP.scheduleRender = scheduleRender;

/* ---------- 로그인 ---------- */
function renderSetupMissing() { $("root").innerHTML = '<div class="auth"><div class="auth-card"><div class="mark big">RN</div><h1>연결 설정이 필요해요</h1><p>config.js 에 Supabase 주소와 공개 키를 넣은 뒤 다시 열어 주세요.</p></div></div>'; }
function renderLogin(mode, msg) {
  mode = mode || "login";
  var t = { login: ["로그인", "로우나 ERP에 오신 걸 환영해요."], signup: ["계정 만들기", "가입 후 대표님이 승인하면 사용할 수 있어요."], reset: ["비밀번호 재설정", "가입한 이메일로 재설정 링크를 보내드려요."], newpw: ["새 비밀번호 설정", "새로 사용할 비밀번호를 입력해 주세요."] }[mode];
  var h = '<div class="auth"><form class="auth-card" id="auth-form" novalidate><div class="mark big">RN</div><div><h1>' + t[0] + "</h1><p>" + t[1] + "</p></div>";
  if (mode !== "newpw") h += '<div class="fd"><label for="a-email">이메일</label><input id="a-email" type="email" autocomplete="username" required></div>';
  if (mode !== "reset") h += '<div class="fd"><label for="a-pw">' + (mode === "newpw" ? "새 비밀번호" : "비밀번호") + '</label><input id="a-pw" type="password" autocomplete="' + (mode === "login" ? "current-password" : "new-password") + '" required minlength="6"></div>';
  var ok = msg && /^ok:/.test(msg);
  h += '<div class="err" id="a-err" role="alert">' + (msg && !ok ? esc(msg) : "") + "</div>" + (ok ? '<div class="ok">' + esc(msg.slice(3)) + "</div>" : "");
  h += '<button class="btn pri wide" type="submit" id="a-go">' + { login: "로그인", signup: "가입하기", reset: "재설정 메일 보내기", newpw: "비밀번호 저장" }[mode] + "</button>";
  if (mode === "login") h += '<div class="tools" style="justify-content:space-between"><button type="button" class="linkbtn" data-m="reset">비밀번호를 잊었어요</button><button type="button" class="linkbtn" data-m="signup">계정 만들기</button></div>';
  else if (mode !== "newpw") h += '<button type="button" class="linkbtn" data-m="login">로그인으로 돌아가기</button>';
  $("root").innerHTML = h + "</form></div>";
  document.querySelectorAll("[data-m]").forEach(function (b) { b.onclick = function () { renderLogin(b.dataset.m); }; });
  var first = document.querySelector("#auth-form input"); if (first) first.focus();
  $("auth-form").onsubmit = async function (e) {
    e.preventDefault();
    var email = $("a-email") ? $("a-email").value.trim() : "", pw = $("a-pw") ? $("a-pw").value : "", btn = $("a-go"), err = $("a-err");
    err.textContent = "";
    if (mode !== "newpw" && !/^\S+@\S+\.\S+$/.test(email)) { err.textContent = "이메일 형식을 확인해 주세요."; return; }
    if (mode !== "reset" && pw.length < 6) { err.textContent = "비밀번호는 6자 이상이어야 해요."; return; }
    btn.disabled = true;
    try {
      var sb = S.sb, res, back = location.href.split("#")[0];
      if (mode === "login") res = await sb.auth.signInWithPassword({ email: email, password: pw });
      else if (mode === "signup") res = await sb.auth.signUp({ email: email, password: pw, options: { emailRedirectTo: back } });
      else if (mode === "reset") res = await sb.auth.resetPasswordForEmail(email, { redirectTo: back });
      else res = await sb.auth.updateUser({ password: pw });
      if (res.error) throw res.error;
      if (mode === "signup") { renderLogin("login", res.data.session ? "ok:가입했어요. 대표님 승인 후 사용할 수 있어요." : "ok:가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요."); return; }
      if (mode === "reset") { renderLogin("login", "ok:재설정 메일을 보냈어요. 메일의 링크를 눌러 주세요."); return; }
      if (mode === "newpw") { recovering = false; ERP.toast("비밀번호를 바꿨어요."); }
      await afterLogin();
    } catch (ex) { err.textContent = ERP.errMsg(ex); btn.disabled = false; }
  };
}
function renderPending() {
  $("root").innerHTML = '<div class="auth"><div class="auth-card"><div class="mark big">RN</div><h1>승인을 기다리고 있어요</h1><p>' + esc(S.user.email) + ' 계정은 아직 권한이 없어요. 대표님이 [사용자·권한]에서 승인하면 바로 사용할 수 있어요.</p><button class="btn wide" id="pd-re">다시 확인</button><button class="linkbtn" id="pd-out">로그아웃</button></div></div>';
  $("pd-re").onclick = afterLogin; $("pd-out").onclick = function () { S.sb.auth.signOut(); };
}
async function afterLogin() {
  var s = await S.sb.auth.getSession();
  if (!s.data.session) { renderLogin(); return; }
  S.user = s.data.session.user;
  var pr = await S.sb.from("profiles").select("*").eq("id", S.user.id).maybeSingle();
  if (pr.error) { renderLogin("login", ERP.errMsg(pr.error)); return; }
  S.profile = pr.data || { role: "pending", email: S.user.email };
  if (S.profile.role === "pending") { renderPending(); return; }
  $("root").innerHTML = '<div class="shell"><aside class="rail"><div class="brand"><div class="mark">RN</div><div><b>로우나 ERP</b><small>LOWNA LUXURY</small></div></div><nav class="nav" id="nav" aria-label="메뉴"></nav><div class="rail-foot"><div id="sync"><span class="dot"></span>연결 중</div><div>' + esc(S.profile.email || S.user.email) + " · " + esc(ERP.ROLE_NAME[S.profile.role] || S.profile.role) + '</div><button class="linkbtn" id="logout">로그아웃</button><div>v' + esc(CFG.APP_VERSION || "") + '</div></div></aside><main class="main" id="main"><div class="panel empty"><b>불러오는 중</b>매출·매입 기록을 가져오고 있어요.</div></main></div>';
  $("logout").onclick = function () { S.sb.auth.signOut(); };
  renderNav();
  try { await ERP.loadAll(); subscribe(); }
  catch (e) { ERP.sync("err", "불러오기 실패"); $("main").innerHTML = '<div class="panel empty"><b>데이터를 불러오지 못했어요</b>' + esc(ERP.errMsg(e)) + '<div style="margin-top:12px"><button class="btn" id="retry">다시 시도</button></div></div>'; $("retry").onclick = afterLogin; return; }
  ERP.render();
  if (ERP.afterLoginHooks) ERP.afterLoginHooks.forEach(function (f) { try { f(); } catch (e) {} });
}

/* ---------- 메뉴 ---------- */
/* 메뉴 순서·묶음은 여기서만 정합니다. 화면 내용은 pages/*.js */
var MENU = ERP.MENU = [
  { g: "운영" }, { id: "home" }, { id: "sales" }, { id: "purchases" }, { id: "returns" }, { id: "stock" }, { id: "documents" },
  { g: "소싱관리" }, { id: "rex-sourcing" }, { id: "sourcing" }, { id: "naver-auto" }, { id: "ss-attr" },
  { g: "크림" }, { id: "kream-yeolmu" }, { soon: "크림 시세 소싱" },
  { g: "분석", roles: ["owner", "accountant"] }, { id: "reports" }, { id: "channels" },
  { g: "설정", roles: ["owner", "accountant"] }, { id: "settings" }, { id: "users" }, { id: "activity" }, { id: "data" },
  { g: "준비 중", roles: ["owner"] }, { soon: "자산·현금" }, { soon: "정산 대사" }, { soon: "사방넷·택배" }, { soon: "병행수입 원가" }, { soon: "하이엔드 발주" }, { soon: "고객 관리" }
];
ERP.page = function (p) { ERP.pages[p.id] = p; };
function allowed(m) {
  var role = S.profile && S.profile.role;
  if (m.id) { var p = ERP.pages[m.id]; return !!p && (!p.roles || p.roles.indexOf(role) !== -1); }
  return !m.roles || m.roles.indexOf(role) !== -1;
}
function renderNav() {
  var nav = $("nav"); if (!nav || !S.profile) return;
  var items = MENU.filter(allowed), html = "";
  items.forEach(function (m, i) {
    if (m.g) { var next = items.slice(i + 1).find(function (x) { return x.g || x.id || x.soon; }); if (next && !next.g) html += '<div class="grp">' + m.g + "</div>"; return; }
    if (m.soon) { if (ERP.isOwner()) html += '<button type="button" class="soon" aria-disabled="true">' + m.soon + '<span class="soon-tag">예정</span></button>'; return; }
    var p = ERP.pages[m.id], badge = p.badge ? p.badge() : "";
    html += '<button type="button" data-tab="' + m.id + '" class="' + (ERP.view.tab === m.id ? "on" : "") + '"' + (ERP.view.tab === m.id ? ' aria-current="page"' : "") + ">" + p.title + (badge ? '<span class="badge">' + badge + "</span>" : "") + "</button>";
  });
  nav.innerHTML = html;
  nav.querySelectorAll("button[data-tab]").forEach(function (b) { b.onclick = function () { ERP.go(b.dataset.tab); window.scrollTo(0, 0); }; });
}
ERP.renderNav = renderNav;
ERP.go = function (tab, opts) { ERP.view.tab = tab; Object.assign(ERP.view, opts || {}); try { localStorage.setItem("rowna-erp-view", JSON.stringify({ tab: tab })); } catch (e) {} ERP.render(); };
ERP.render = function () {
  if (!S.profile || !$("main")) return;
  var ids = MENU.filter(function (m) { return m.id && allowed(m); }).map(function (m) { return m.id; });
  if (ids.indexOf(ERP.view.tab) === -1) ERP.view.tab = ids[0];
  renderNav();
  var p = ERP.pages[ERP.view.tab], main = $("main");
  document.body.classList.toggle("wide", !!(p && p.wide));
  try { main.innerHTML = p.render(); bindCommon(main); if (p.bind) p.bind(main); }
  catch (e) { console.error(e); main.innerHTML = '<div class="panel empty"><b>이 화면을 그리다 문제가 생겼어요</b>' + esc(e.message) + "</div>"; }
};

/* ---------- 화면 조각 ---------- */
ERP.monthBar = function () { return '<div class="tools"><button class="btn sm" data-act="mprev" aria-label="이전 달">‹</button><input class="ctl num" type="month" id="f-month" aria-label="월 선택" value="' + ERP.view.month + '"><button class="btn sm" data-act="mnext" aria-label="다음 달">›</button></div>'; };
ERP.yearSelect = function () { var ys = {}; ys[today().slice(0, 4)] = 1; ERP.list("sales").forEach(function (s) { if (s.date) ys[s.date.slice(0, 4)] = 1; }); return '<select class="ctl" id="f-year" aria-label="연도">' + Object.keys(ys).sort().reverse().map(function (y) { return "<option" + (y === ERP.view.year ? " selected" : "") + ">" + y + "</option>"; }).join("") + "</select>"; };
ERP.platOptions = function (sel, withAll) { return (withAll ? '<option value="">전체 쇼핑몰</option>' : '<option value="">선택</option>') + S.PLATS.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === sel ? " selected" : "") + ">" + esc(p.name) + "</option>"; }).join(""); };
ERP.tile = function (l, v, f, cls) { return '<div class="tile ' + (cls || "") + '"><div class="l">' + l + '</div><div class="v num">' + v + '</div><div class="f">' + (f || "") + "</div></div>"; };
ERP.chips = function (attr, cur, opts) { return opts.map(function (f) { return '<button class="chip ' + (cur === f[0] ? "on" : "") + '" ' + attr + '="' + esc(f[0]) + '">' + f[1] + "</button>"; }).join(""); };
ERP.fd = function (label, name, type, val, cls, extra) { var id = "i-" + name; return '<div class="fd ' + (cls || "") + '"><label for="' + id + '">' + label + '</label><input id="' + id + '" name="' + name + '" type="' + type + '"' + (type === "number" ? ' inputmode="decimal" step="any"' : "") + ' value="' + esc(val == null ? "" : val) + '"' + (extra || "") + "></div>"; };
ERP.sel = function (label, name, opts, val, cls) { return '<div class="fd ' + (cls || "") + '"><label for="i-' + name + '">' + label + '</label><select id="i-' + name + '" name="' + name + '">' + opts.map(function (o) { var v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (String(v) === String(val == null ? "" : val) ? " selected" : "") + ">" + esc(t) + "</option>"; }).join("") + "</select></div>"; };
ERP.readForm = function (body, base) { var o = Object.assign({}, base); body.querySelectorAll("input[name],select[name],textarea[name]").forEach(function (el) { if (el.type === "checkbox") o[el.name] = el.checked; else if (el.type === "number") o[el.name] = el.value === "" ? "" : Number(el.value); else o[el.name] = el.value; }); return o; };

/* ---------- 공통 이벤트 ---------- */
function bindCommon(root) {
  var v = ERP.view;
  root.querySelectorAll("[data-act]").forEach(function (b) { b.onclick = function () { var a = b.dataset.act; if (a === "mprev") { v.month = U.shiftMonth(v.month, -1); ERP.render(); } else if (a === "mnext") { v.month = U.shiftMonth(v.month, 1); ERP.render(); } else if (ERP.acts[a]) ERP.acts[a](b); }; });
  var mi = root.querySelector("#f-month"); if (mi) mi.onchange = function () { if (mi.value) { v.month = mi.value; ERP.render(); } };
  var yi = root.querySelector("#f-year"); if (yi) yi.onchange = function () { v.year = yi.value; ERP.render(); };
  root.querySelectorAll("input[data-search]").forEach(function (el) { el.oninput = function () { v[el.dataset.search] = el.value; clearTimeout(el._t); el._t = setTimeout(function () { var pos = el.selectionStart, sel = '[data-search="' + el.dataset.search + '"]'; ERP.render(); var n = document.querySelector(sel); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } }, 250); }; });
  root.querySelectorAll("[data-view]").forEach(function (b) { b.onclick = function () { var kv = b.dataset.view.split("="); v[kv[0]] = kv[1]; ERP.render(); }; });
  root.querySelectorAll("[data-go]").forEach(function (b) { b.onclick = function () { var g = b.dataset.go.split(":"), opts = {}; (g[1] || "").split("&").forEach(function (pair) { if (!pair) return; var kv = pair.split("="); opts[kv[0]] = kv.slice(1).join("="); }); ERP.go(g[0], opts); }; });
  root.querySelectorAll("[data-edit]").forEach(function (tr) { var open = function (e) { if (e && e.target.closest("a,select,input,button:not([data-edit])")) return; var k = tr.dataset.edit.split(":"), id = k.slice(1).join(":"), rec = DATA[k[0]] && DATA[k[0]].get(id); if (rec && ERP.forms[k[0]]) ERP.forms[k[0]].open(rec); }; tr.addEventListener("click", open); tr.addEventListener("keydown", function (e) { if (e.key === "Enter") open(); }); });
  ERP.Charts && ERP.Charts.bind(root);
}

/* ---------- 입력창(서랍) ---------- */
var drawer = null;
ERP.drawer = function () { return drawer; };
ERP.openDrawer = function (title, inner, kind, rec, isNew, opts) {
  opts = opts || {};
  drawer = { kind: kind, rec: rec, isNew: isNew, file: null, returnFocus: document.activeElement };
  var ro = !ERP.canWrite(kind);
  $("layer").innerHTML = '<div class="scrim" data-close></div><div class="drawer" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><header><h2>' + esc(title) + '</h2><button class="btn sm" data-close aria-label="닫기">닫기</button></header><div class="body" id="dbody">' + inner + '</div><footer><div>' + (!isNew && ERP.isOwner() ? '<button class="btn danger" id="d-del">삭제</button>' : "") + '</div><div class="tools"><button class="btn" data-close>취소</button>' + (ro ? "" : '<button class="btn pri" id="d-save">' + (opts.saveLabel || "저장") + "</button>") + "</div></footer></div>";
  var body = $("dbody");
  if (ro) body.querySelectorAll("input,select,textarea").forEach(function (el) { el.disabled = true; });
  $("layer").querySelectorAll("[data-close]").forEach(function (b) { b.onclick = ERP.closeDrawer; });
  document.addEventListener("keydown", escClose);
  var first = body.querySelector("input:not([type=file]),select"); if (first && !ro) first.focus();
  var f = ERP.forms[kind];
  if (f && f.afterOpen) f.afterOpen(body, rec, isNew);
  var sv = $("d-save"); if (sv) sv.onclick = async function () { sv.disabled = true; try { var ok = await f.commit(body, ERP.readForm(body, rec), drawer); if (ok) ERP.closeDrawer(); else sv.disabled = false; } catch (e) { ERP.sync("ok", "실시간 동기화"); ERP.toast(e && e.message && !/^[A-Za-z]/.test(e.message) ? e.message : ERP.errMsg(e)); sv.disabled = false; } };
  var del = $("d-del"); if (del) del.onclick = async function () { if (!del.dataset.arm) { del.dataset.arm = "1"; del.textContent = "한 번 더 누르면 삭제"; return; } del.disabled = true; var ok = f.remove ? await f.remove(rec) : await ERP.remove(kind, rec.id); if (ok) ERP.toast("삭제했어요."); ERP.closeDrawer(); };
  return body;
};
function escClose(e) { if (e.key === "Escape") ERP.closeDrawer(); }
ERP.closeDrawer = function () { var rf = drawer && drawer.returnFocus; $("layer").innerHTML = ""; document.removeEventListener("keydown", escClose); drawer = null; ERP.render(); if (rf && rf.focus && document.contains(rf)) rf.focus(); };

/* ---------- 파일 내보내기 ---------- */
ERP.pickFile = function (accept, fn) { var inp = document.createElement("input"); inp.type = "file"; inp.accept = accept; inp.onchange = function () { if (inp.files[0]) fn(inp.files[0]); }; inp.click(); };
ERP.downloadBlob = function (name, blob) { var url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000); };
ERP.xlsxBlob = function (sheets) { var wb = XLSX.utils.book_new(); sheets.forEach(function (s) { XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ "": "데이터 없음" }]), s.name); }); return new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }); };

/* ---------- 시작 ---------- */
var recovering = false;
async function boot() {
  if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || !window.supabase) { renderSetupMissing(); return; }
  S.sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  S.sb.auth.onAuthStateChange(function (ev) {
    if (ev === "PASSWORD_RECOVERY") { recovering = true; renderLogin("newpw"); }
    else if (ev === "SIGNED_OUT") { S.user = null; S.profile = null; if (channel) { S.sb.removeChannel(channel); channel = null; } renderLogin(); }
  });
  var s = await S.sb.auth.getSession();
  if (recovering) return;
  if (s.data.session) afterLogin(); else renderLogin();
}
window.addEventListener("online", function () { ERP.sync("ok", "다시 연결됨"); });
window.addEventListener("offline", function () { ERP.sync("err", "오프라인 · 저장 안 됨"); });
ERP.boot = boot;
})();
