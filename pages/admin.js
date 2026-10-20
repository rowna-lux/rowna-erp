/* 메뉴: 채널·카드 설정 · 사용자·권한 · 작업 기록 · 데이터·백업 */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, C = ERP.C, esc = U.esc, won = U.won, pct = U.pct, num = U.num;

/* ----- 채널·카드 ----- */
function renderSettings() {
  var w = ERP.isOwner(), dis = w ? "" : " disabled";
  var pr = S.PLATS.map(function (p) { return '<tr data-pid="' + esc(p.id) + '"><td><input aria-label="쇼핑몰 이름" data-k="name" value="' + esc(p.name) + '"' + dis + '></td><td><input aria-label="수수료 %" data-k="fee" type="number" step="0.001" value="' + (p.tiered ? "" : ((Number(p.fee) || 0) * 100).toFixed(2)) + '"' + dis + (p.tiered ? " disabled" : "") + '></td><td><select aria-label="정산 방식" data-k="settlement"' + dis + "><option" + (p.settlement !== "후정산" ? " selected" : "") + ">선정산</option><option" + (p.settlement === "후정산" ? " selected" : "") + '>후정산</option></select></td><td><input aria-label="후정산 광고비 %" data-k="deferredRate" type="number" step="0.01" value="' + ((Number(p.deferredRate) || 0) * 100).toFixed(2) + '"' + dis + '></td><td><input aria-label="배수" data-k="multiplier" type="number" step="0.01" value="' + (Number(p.multiplier) || 1) + '"' + dis + "></td><td>" + (p.verified ? '<span class="pill p-good">확인됨</span>' : '<span class="pill p-warn">확인 필요</span>') + "</td><td>" + (w ? '<button class="btn sm" data-verify="' + esc(p.id) + '">' + (p.verified ? "미확인으로" : "확인 완료") + "</button>" : "") + "</td></tr>"; }).join("");
  var cr = S.CARDS.map(function (c) { return '<tr data-cid="' + esc(c.id) + '"><td><input aria-label="카드 이름" data-k="name" value="' + esc(c.name) + '"' + dis + '></td><td><input aria-label="즉시할인 %" data-k="discountRate" type="number" step="0.01" value="' + ((Number(c.discountRate) || 0) * 100).toFixed(2) + '"' + dis + '></td><td><input aria-label="포인트적립 %" data-k="pointRate" type="number" step="0.01" value="' + ((Number(c.pointRate) || 0) * 100).toFixed(2) + '"' + dis + "></td></tr>"; }).join("");
  var tiered = S.PLATS.filter(function (p) { return p.tiered; }).map(function (p) { return esc(p.name) + ": " + won(p.tieredThreshold) + "원 이하 " + pct(p.tieredRateBelow) + ", 초과분 " + pct(p.tieredRateAbove); }).join(" / ");
  return '<div class="head"><div><h1>채널·카드 설정</h1><p>값을 고치면 바로 저장되고 모든 계산에 반영돼요</p></div>' + (w ? '<div class="tools"><button class="btn" data-act="addplat">+ 쇼핑몰 추가</button><button class="btn" data-act="addcard">+ 카드 추가</button></div>' : "") + "</div>" +
    '<div class="panel"><h2>쇼핑몰 수수료<span class="sub">%로 입력 · 배수는 수수료에 곱하는 값</span></h2><div class="scroll-x"><table class="set-table" style="min-width:760px"><thead><tr><th>쇼핑몰</th><th>수수료 %</th><th>정산 방식</th><th>후정산 광고비 %</th><th>배수</th><th>상태</th><th></th></tr></thead><tbody>' + pr + "</tbody></table></div>" + (tiered ? '<p class="note">구간 수수료: ' + tiered + "</p>" : "") + '<p class="note">사방넷 주문을 가져올 때 목록에 없는 쇼핑몰이 나오면 자동으로 추가되고 ‘확인 필요’로 표시돼요.</p></div>' +
    '<div class="grid2"><div class="panel"><h2>결제카드<span class="sub">%로 입력</span></h2><div class="scroll-x"><table class="set-table" style="min-width:420px"><thead><tr><th>카드</th><th>즉시할인 %</th><th>포인트적립 %</th></tr></thead><tbody>' + cr + '</tbody></table></div></div><div class="panel"><h2>기본값</h2><div class="fg"><div class="fd"><label for="s-goal">연 매출 목표(원)</label><input id="s-goal" type="number" value="' + num(S.SET.goal_target) + '"' + dis + '></div><div class="fd"><label for="s-ship">기본 배송비(원)</label><input id="s-ship" type="number" value="' + num(S.SET.default_shipping_fee) + '"' + dis + "></div></div></div></div>";
}
function bindSettings(root) {
  root.querySelectorAll("tr[data-pid] input, tr[data-pid] select").forEach(function (el) { el.onchange = function () { var p = Object.assign({}, ERP.plat(el.closest("tr").dataset.pid)), k = el.dataset.k; if (k === "fee" || k === "deferredRate") p[k] = num(el.value) / 100; else if (k === "multiplier") p[k] = num(el.value) || 1; else p[k] = el.value; ERP.save("platforms", p); }; });
  root.querySelectorAll("tr[data-cid] input").forEach(function (el) { el.onchange = function () { var c = Object.assign({}, ERP.card(el.closest("tr").dataset.cid)), k = el.dataset.k; c[k] = k === "name" ? el.value : num(el.value) / 100; ERP.save("cards", c); }; });
  root.querySelectorAll("[data-verify]").forEach(function (b) { b.onclick = function () { var p = Object.assign({}, ERP.plat(b.dataset.verify)); p.verified = !p.verified; ERP.save("platforms", p); }; });
  var g = root.querySelector("#s-goal"); if (g) g.onchange = function () { ERP.saveSetting("goal_target", num(g.value)); };
  var sh = root.querySelector("#s-ship"); if (sh) sh.onchange = function () { ERP.saveSetting("default_shipping_fee", num(sh.value)); };
}
ERP.acts.addplat = function () { ERP.save("platforms", { id: "p_" + Date.now().toString(36), name: "새 쇼핑몰", fee: 0, settlement: "선정산", deferredRate: 0, multiplier: 1, verified: false, tiered: false, sort: 999 }); };
ERP.acts.addcard = function () { ERP.save("cards", { id: "card_" + Date.now().toString(36), name: "새 카드", discountRate: 0, pointRate: 0 }); };

/* ----- 사용자·권한 ----- */
function renderUsers() {
  return '<div class="head"><div><h1>사용자·권한</h1><p>로그인 화면의 ‘계정 만들기’로 가입한 사람을 여기서 승인해요</p></div><div class="tools"><button class="btn" data-act="reloadusers">새로고침</button></div></div>' +
    '<div class="table-wrap"><table style="min-width:560px"><thead><tr><th>이메일</th><th>권한</th><th>가입일</th></tr></thead><tbody>' + S.PROFILES.map(function (p) { return "<tr><td>" + esc(p.email) + (p.id === S.user.id ? ' <span class="pill p-acc">나</span>' : "") + "</td><td>" + (p.id === S.user.id ? esc(ERP.ROLE_NAME[p.role]) : '<select class="ctl" data-role="' + esc(p.id) + '" aria-label="권한">' + ["pending", "accountant", "staff", "ai", "owner"].map(function (r) { return '<option value="' + r + '"' + (p.role === r ? " selected" : "") + ">" + ERP.ROLE_NAME[r] + "</option>"; }).join("") + "</select>") + '</td><td class="num">' + esc((p.created_at || "").slice(0, 10)) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
    '<p class="note">대표: 모든 메뉴 읽기·쓰기 · 세무사: 모든 메뉴 보기만 · 직원·AI 직원: 매입·반품·증빙·크림 입력, 매출은 보기만 · 승인 대기: 아무것도 볼 수 없음. 누가 무엇을 바꿨는지는 [작업 기록]에 남아요.</p>';
}
function bindUsers(root) { root.querySelectorAll("[data-role]").forEach(function (s) { s.onchange = async function () { var res = await S.sb.from("profiles").update({ role: s.value }).eq("id", s.dataset.role); if (res.error) ERP.toast(ERP.errMsg(res.error)); else { ERP.toast("권한을 바꿨어요."); var p = S.PROFILES.find(function (x) { return x.id === s.dataset.role; }); if (p) p.role = s.value; } }; }); }
ERP.acts.reloadusers = async function () { var pr = await S.sb.from("profiles").select("*").order("created_at"); S.PROFILES = pr.data || []; ERP.render(); };

/* ----- 작업 기록 ----- */
var LOG = null, TNAME = { sales: "매출", purchases: "매입", returns: "반품·취소", documents: "증빙", kream_wholesale: "크림 도매", price_items: "가격 관리" };
function renderActivity() {
  if (!LOG) { loadLog(); return '<div class="head"><div><h1>작업 기록</h1><p>누가 언제 무엇을 바꿨는지 남아요 · AI 직원 작업 확인용</p></div></div><div class="panel empty"><b>불러오는 중</b></div>'; }
  var h = '<div class="head"><div><h1>작업 기록</h1><p>최근 300건 · 누가 언제 무엇을 바꿨는지 남아요 · AI 직원 작업 확인용</p></div><div class="tools"><button class="btn" data-act="reloadlog">새로고침</button></div></div>';
  if (LOG.error) return h + '<div class="panel empty"><b>작업 기록을 불러오지 못했어요</b>' + esc(LOG.error) + "</div>";
  return h + (LOG.rows.length ? '<div class="table-wrap"><table style="min-width:760px"><thead><tr><th>시각</th><th>누가</th><th>메뉴</th><th>작업</th><th>내용</th></tr></thead><tbody>' + LOG.rows.map(function (r) { var ai = r.role === "ai"; return '<tr><td class="num">' + esc(new Date(r.at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })) + "</td><td>" + esc(r.user_email || "시스템") + (ai ? ' <span class="pill p-acc">AI</span>' : "") + "</td><td>" + esc(TNAME[r.table_name] || r.table_name) + '</td><td><span class="pill ' + (r.action === "삭제" ? "p-crit" : r.action === "추가" ? "p-good" : "p-mute") + '">' + esc(r.action) + '</span></td><td class="name">' + esc(r.summary || "") + "</td></tr>"; }).join("") + "</tbody></table></div>" : '<div class="panel empty"><b>아직 기록이 없어요</b>매출·매입·반품·증빙·크림 도매를 추가하거나 고치면 여기에 남아요.</div>');
}
async function loadLog() { var res = await S.sb.from("activity_log").select("*").order("id", { ascending: false }).limit(300); LOG = res.error ? { error: ERP.errMsg(res.error), rows: [] } : { rows: res.data || [] }; if (ERP.view.tab === "activity") ERP.render(); }
ERP.acts.reloadlog = function () { LOG = null; ERP.render(); };

/* ----- 데이터·백업 ----- */
function renderData() {
  return '<div class="head"><div><h1>데이터·백업</h1><p>파일로 한꺼번에 가져오기와 전체 백업</p></div></div>' +
    '<div class="panel"><h2>파일 가져오기</h2><p class="note" style="margin-top:0">로우나 ERP 가져오기 파일(.json)을 고르면 종류를 알아서 판단해 넣어요. 기존 렛저 이전 파일(rowna-migration.json), 크림 도매 리스트 파일 모두 같은 버튼이에요. 같은 기록은 덮어쓰기라 여러 번 눌러도 중복되지 않아요.</p><div class="tools" style="margin-top:10px"><button class="btn pri" data-act="importjson">파일 선택해서 가져오기</button></div><p class="note" id="mig-status" role="status"></p></div>' +
    '<div class="panel"><h2>전체 백업</h2><p class="note" style="margin-top:0">매출·매입·반품·증빙 목록·크림 도매·설정을 엑셀 한 파일로 내려받아요.' + (window.rownaDesktop ? " PC 프로그램은 하루에 한 번 문서 폴더의 ‘로우나ERP백업’에 자동 저장해요." : "") + '</p><div class="tools" style="margin-top:10px"><button class="btn" data-act="backup">엑셀 백업 내려받기</button></div></div>' +
    (S.IMPORTS.length ? '<div class="panel"><h2>최근 가져오기 기록</h2>' + S.IMPORTS.map(function (l) { return '<p class="note" style="margin:4px 0"><b class="num">' + esc((l.at || "").slice(0, 16).replace("T", " ")) + "</b> " + esc(l.kind || "") + " · " + esc(l.file_name || "") + (l.summary ? " · " + esc(l.summary) : "") + "</p>"; }).join("") + "</div>" : "");
}
ERP.importers = ERP.importers || {};
ERP.importers["rowna-erp-migration-v1"] = async function (data, say) {
  say("쇼핑몰·카드 저장 중"); await ERP.saveBatch("platforms", data.platforms); await ERP.saveBatch("cards", data.cards);
  await ERP.saveBatch("sales", data.sales, function (n, t) { say("매출 " + n + " / " + t); });
  await ERP.saveBatch("purchases", data.purchases, function (n, t) { say("매입 " + n + " / " + t); });
  say("반품 저장 중"); await ERP.saveBatch("returns", data.returns);
  if (data.settings) for (var k in data.settings) await S.sb.from("app_settings").upsert({ key: k, value: data.settings[k] });
  return { kind: "기존 렛저 이전", summary: "매출 " + data.sales.length + ", 매입 " + data.purchases.length + ", 반품 " + data.returns.length + ", 쇼핑몰 " + data.platforms.length + ", 카드 " + data.cards.length };
};
async function importJson(file) {
  var st = U.$("mig-status"), say = function (t) { if (st) st.textContent = t; };
  var data; try { data = JSON.parse(await file.text()); } catch (e) { say("JSON 파일을 읽지 못했어요."); return; }
  var fn = ERP.importers[data.format];
  if (!fn) { say("로우나 ERP 가져오기 파일이 아니에요."); return; }
  try {
    var r = await fn(data, say);
    await S.sb.from("import_log").insert({ kind: r.kind, file_name: file.name, summary: r.summary });
    try { await S.sb.rpc("trim_activity"); } catch (e) {}
    say("완료: " + r.summary + " · 다시 불러오는 중"); await ERP.loadAll(); ERP.render(); ERP.toast("가져오기를 마쳤어요. " + r.summary);
  } catch (e) { say("중간에 멈췄어요: " + ERP.errMsg(e) + " · 다시 눌러도 중복 없이 이어서 저장돼요."); }
}
ERP.acts.importjson = function () { ERP.pickFile(".json,application/json", importJson); };
function backupSheets() {
  var sh = [{ name: "매출", rows: ERP.saleRowsX(ERP.list("sales")) }, { name: "매입", rows: ERP.purchRowsX(ERP.list("purchases")) },
    { name: "반품취소", rows: ERP.list("returns").map(function (r) { return { "날짜": C.retDate(r), "유형": r.type, "상태": r.status, "쇼핑몰": ERP.platName(r.platformId), "상품": r.productName, "배송비지출": num(r.shipCost), "고객부담배송비": num(r.shipIncome), "환불손실": num(r.refundLoss), "메모": r.memo || "" }; }) },
    { name: "증빙목록", rows: ERP.list("documents").map(function (d) { return { "종류": d.kind, "날짜": d.docDate || "", "제목": d.title, "거래처": d.vendor || "", "금액": d.amount == null ? "" : d.amount, "품번": d.itemCode || "", "파일": d.fileName || "", "저장경로": d.filePath || "" }; }) },
    { name: "쇼핑몰", rows: S.PLATS.map(function (p) { return { "쇼핑몰": p.name, "수수료": p.fee, "정산": p.settlement, "후정산광고비": p.deferredRate, "배수": p.multiplier, "확인": p.verified ? "확인됨" : "확인 필요" }; }) }];
  if (ERP.priceRowsX) sh.push({ name: "가격관리", rows: ERP.priceRowsX() });
  if (ERP.kreamRowsX) sh.push({ name: "크림도매", rows: ERP.kreamRowsX(ERP.list("kream_wholesale")) });
  return sh;
}
ERP.acts.backup = function () { ERP.downloadBlob("로우나ERP_백업_" + U.today() + ".xlsx", ERP.xlsxBlob(backupSheets())); };
ERP.afterLoginHooks = (ERP.afterLoginHooks || []).concat([async function () {
  if (!window.rownaDesktop || !ERP.isOwner()) return;
  var last = await window.rownaDesktop.lastBackupDate(); if (last === U.today()) return;
  var blob = ERP.xlsxBlob(backupSheets()); await window.rownaDesktop.saveBackup("로우나ERP_백업_" + U.today() + ".xlsx", new Uint8Array(await blob.arrayBuffer()));
}]);

ERP.page({ id: "settings", title: "채널·카드", roles: ["owner", "accountant"], render: renderSettings, bind: bindSettings });
ERP.page({ id: "users", title: "사용자·권한", roles: ["owner"], render: renderUsers, bind: bindUsers });
ERP.page({ id: "activity", title: "작업 기록", roles: ["owner", "accountant"], render: renderActivity });
ERP.page({ id: "data", title: "데이터·백업", roles: ["owner"], render: renderData });
})();
