/* 스마트스토어 매입상품 등록 (백화점 하이엔드 매입 → 스마트스토어 커머스API 직접 등록)
   - 대표님이 사진·정보 입력 → 판매가(매입가·마진율·수수료)·상품명·상세 자동 → '초안' 저장
   - 대표님 확인 → '승인' → [승인분 내보내기] JSON → PC에서 tools/ss-upload/ss_upload.py 실행
     (샤넬 지갑류 기존 상품을 틀로 복사: 카테고리·배송·A/S·고시정보) → 결과 JSON을 [결과 불러오기]로 반영
   - 기록: app_settings 'ss_upload_drafts' · 사진: storage 'evidence' 버킷 ssup/ 폴더
   - 키는 ERP에 넣지 않아요(공개 웹페이지). API 호출은 PC 스크립트만. */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, esc = U.esc, won = U.won, num = U.num;
var STORE = "https://smartstore.naver.com/lowna/products/", BUCKET = "evidence";
var V = { edit: null, files: [] };
var BOX = [["fullset", "매장 풀구성품/인보이스"], ["kca", "한국명품감정원 보증서"], ["dept", "국내백화점/국내재고"], ["quick", "서울·경기 당일 퀵"], ["gift", "선물포장 가능"]];
/* 11/21 추가: 지금까진 "샤넬 지갑류"만 가정하고 속성분류코드(004)·성별(여성) 고정이었음 →
   가방/신발/의류 매입 올리면 사방넷에 카테고리·성별이 잘못 들어감. 품목종류·성별을 직접 고르게 함 */
var KINDS = [["wallet", "지갑/잡화", "004"], ["bag", "가방", "003"], ["shoes", "신발", "002"], ["clothing", "의류", "001"]];
var GENDERS = [["female", "여성", 2], ["male", "남성", 1], ["unisex", "공용", 3]];
function kindInfo(k) { return KINDS.filter(function (x) { return x[0] === k; })[0] || KINDS[0]; }
function genderInfo(g) { return GENDERS.filter(function (x) { return x[0] === g; })[0] || GENDERS[0]; }

function drafts() { return (S.SET.ss_upload_drafts || []).slice(); }
async function saveDrafts(d) { await ERP.saveSetting("ss_upload_drafts", d); }
function set(k, d) { return S.SET[k] == null || S.SET[k] === "" ? d : S.SET[k]; }
function feeRate() { var f = S.SET.ss_fee_rate; return f === "" || f == null ? null : Number(f); }

/* 판매가: 수수료 제외 마진율. basis 'cost' = 매입가 대비, 'price' = 판매가 대비. 1,000원 단위 올림 */
function price(cost) {
  var f = feeRate(), m = Number(set("ss_margin", 0.15)), b = set("ss_margin_basis", "cost");
  cost = num(cost); if (!cost || f == null) return 0;
  var p = b === "price" ? cost / (1 - f - m) : cost * (1 + m) / (1 - f);
  return p > 0 && isFinite(p) ? Math.ceil(p / 1000) * 1000 : 0;
}
/* 시세(크림 최근 체결가 등)를 넣으면 판매가 = min(마진 가격, 시세) — 제안① 2026-11-23 */
function autoPrice(cost, market) { var p = price(cost); market = num(market); return market && p ? Math.min(p, Math.floor(market / 1000) * 1000) : p; }
function tagMul() { return Number(set("ss_tag_mul", 1.2)) || 1.2; }
function tagPrice(sp) { return sp ? Math.ceil(sp * tagMul() / 1000) * 1000 : 0; }
function calcLine(cost, manual, market) {
  var sp = num(manual) || autoPrice(cost, market), tp = tagPrice(sp), f = feeRate(), mp = price(cost);
  if (!num(cost)) return "매입가를 넣으면 판매가·태그가가 계산돼요.";
  if (!sp) return "수수료율을 설정해야 판매가가 계산돼요.";
  var pf = f == null ? null : sp * (1 - f) - num(cost), pr = pf == null ? null : pf / sp;
  var warn = pr == null ? "" : pr < 0 ? ' <b style="color:#ff6b6b">⚠ 손해 판매</b>' : pr < 0.05 ? ' <b style="color:#ffb020">⚠ 마진 ' + (pr * 100).toFixed(1) + "% — 크림·교환 검토</b>" : "";
  var mk = num(market) && !num(manual) && sp < mp ? " · 시세 " + won(num(market)) + "원에 맞춤(마진 가격 " + won(mp) + "원)" : "";
  return "판매가 <b>" + won(sp) + "</b>원 · 태그가 <b>" + won(tp) + "</b>원 (판매가×" + tagMul() + ")" + (pf == null ? "" : " · 예상 이익 " + won(pf) + "원") + mk + warn;
}
function profit(d) { var f = feeRate(); return d.salePrice && f != null ? Math.round(d.salePrice * (1 - f) - num(d.cost)) : null; }

function title(d) {
  return [d.brand, kindInfo(d.kind)[1], d.model, d.code, d.color, d.box && d.box.dept ? "백화점" : "", "정품"].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
/* 상세: 가운데 정렬, 사진, 정품 안내(입력한 항목만). 소재·사이즈 등 입력하지 않은 사양은 쓰지 않음 */
function detail(d, urls) {
  var c = 'style="text-align:center"', box = BOX.filter(function (b) { return d.box && d.box[b[0]] ; }).map(function (b) { return "· " + b[1]; });
  var h = '<div ' + c + '><p><b>' + esc(d.name) + "</b></p>";
  (urls || []).forEach(function (u) { h += '<p><img src="' + esc(u) + '" style="max-width:100%"></p>'; });
  h += "<p>품번 " + esc(d.code) + (d.color ? "<br>색상 " + esc(d.color) : "") + (d.option ? "<br>" + esc(d.option) : "") + "</p>";
  if (d.note) h += "<p>" + esc(d.note).replace(/\n/g, "<br>") + "</p>";
  h += '<div style="border:1px solid #ccc;padding:16px;margin:16px auto;max-width:480px"><p>로우나명품은 정품만 판매하는 명품 판매처예요.</p>' + (box.length ? "<p>" + box.join("<br>") + "</p>" : "") + "</div>";
  return h + "</div>";
}

function list() {
  var D = drafts(), f = feeRate();
  var st = { "초안": 0, "승인": 0, "등록완료": 0, "오류": 0, "판매완료": 0 }; D.forEach(function (d) { st[d.status] = (st[d.status] || 0) + 1; });
  var basis = set("ss_margin_basis", "cost");
  return '<div class="head"><div><h1>스마트스토어 매입상품 등록</h1><p>사진·정보 입력 → 초안 → 승인 → PC에서 등록 (샤넬 지갑류 상품을 틀로 복사)</p></div><div class="tools">' +
    '<button class="btn primary" data-act="ssuload">기존 상품 불러오기</button><button class="btn" data-act="ssunew">새 상품</button><button class="btn primary" data-act="ssuserver">스스 등록·판매중지 (' + (st["승인"] + (st["오류"] || 0)) + ')</button><button class="btn" data-act="ssucheck" title="등록하지 않고 틀·가격만 확인">점검만</button><button class="btn" data-act="ssusold">판매 확인</button><button class="btn" data-act="ssusabang">사방넷 엑셀 + 사진 (' + st["승인"] + ')</button><button class="btn" data-act="ssuexport" title="스마트스토어 API 직등록용(PC 스크립트)">API용 내보내기 (' + st["승인"] + ')</button><button class="btn" data-act="ssuimport">결과 불러오기</button></div></div>' +
    '<p class="warn">시험 운영 중이에요. 이상한 점은 알려주세요. 스마트스토어 실제 등록은 PC 스크립트에서 --apply를 붙일 때만 돼요.</p>' +
    '<div class="card"><h3>가격·틀 설정</h3><div class="grid2">' +
    '<div class="fd"><label for="ssu-fee">스마트스토어 수수료율 (%)</label><input class="ctl" id="ssu-fee" type="number" step="0.01" value="' + (f == null ? "" : +(f * 100).toFixed(2)) + '" placeholder="정산 내역 기준으로 입력">' + (f == null ? '<small class="warn">수수료율을 넣어야 판매가가 계산돼요.</small>' : "") + "</div>" +
    '<div class="fd"><label for="ssu-m">마진율 (%) · 수수료 제외</label><input class="ctl" id="ssu-m" type="number" step="0.1" value="' + +(Number(set("ss_margin", 0.15)) * 100).toFixed(2) + '"></div>' +
    '<div class="fd"><label for="ssu-b">마진 기준</label><select class="ctl" id="ssu-b"><option value="cost"' + (basis === "cost" ? " selected" : "") + '>매입가 대비 (판매가 = 매입가×(1+마진)÷(1−수수료))</option><option value="price"' + (basis === "price" ? " selected" : "") + '>판매가 대비 (판매가 = 매입가÷(1−수수료−마진))</option></select></div>' +
    '<div class="fd"><label for="ssu-tag">태그가 배수 (판매가×)</label><input class="ctl" id="ssu-tag" type="number" step="0.01" value="' + tagMul() + '"></div>' +
    '<div class="fd"><label for="ssu-tpl">틀 상품번호 (샤넬 지갑류 · 스마트스토어 상품번호)</label><input class="ctl" id="ssu-tpl" value="' + esc(set("ss_template_no", "")) + '" placeholder="예: 11603299884"></div>' +
    '<div class="fd"><label for="ssu-rf">반품 배송비 (편도)</label><input class="ctl" id="ssu-rf" type="number" value="' + num(set("ss_return_fee", 25000)) + '"></div>' +
    '<div class="fd"><label for="ssu-xf">교환 배송비 (왕복)</label><input class="ctl" id="ssu-xf" type="number" value="' + num(set("ss_exchange_fee", 50000)) + '"></div></div></div>' +
    (D.length ? '<div class="table-wrap"><table><thead><tr><th>날짜</th><th>상태</th><th>사진</th><th>상품명</th><th class="num">매입가</th><th class="num">판매가</th><th class="num">태그가</th><th class="num">예상 이익</th><th></th></tr></thead><tbody>' +
      D.slice().reverse().map(function (d) {
        var p = profit(d);
        return "<tr><td>" + esc(d.date) + "</td><td>" + esc(d.status) + (d.error ? '<br><small class="warn">' + esc(d.error) + "</small>" : "") + "</td><td>" + ((d.photos || []).length + (d.images || []).length) + "장</td><td>" + (d.productNo ? '<a href="' + STORE + esc(d.productNo) + '" target="_blank" rel="noopener">' + esc(d.name) + "</a>" : esc(d.name)) +
          '</td><td class="num">' + won(d.cost) + '</td><td class="num">' + (d.salePrice ? won(d.salePrice) : "–") + '</td><td class="num">' + (d.salePrice ? won(d.tagPrice || tagPrice(d.salePrice)) : "–") + '</td><td class="num">' + (p == null ? "–" : won(p)) + '</td><td><button class="btn sm" data-act="ssuopen" data-id="' + esc(d.id) + '">열기</button></td></tr>';
      }).join("") + "</tbody></table></div>" : '<p class="muted">아직 등록할 상품이 없어요. [새 상품]을 눌러 사진과 정보를 넣어 주세요.</p>');
}

function editor() {
  var d = V.edit, ro = d.status === "등록완료";
  var w = function (l, k, v, type) { return '<div class="fd"><label for="se-' + k + '">' + l + '</label><input class="ctl" id="se-' + k + '" type="' + (type || "text") + '" value="' + esc(v == null ? "" : v) + '"' + (ro ? " disabled" : "") + "></div>"; };
  return '<div class="head"><div><h1>' + (d.name ? esc(d.name) : "새 상품") + "</h1><p>" + esc(d.status) + " · " + esc(d.date) + '</p></div><div class="tools"><button class="btn" data-act="ssuback">목록</button>' +
    (ro ? "" : '<button class="btn" data-act="ssusave">초안 저장</button><button class="btn primary" data-act="ssuapprove">' + (d.status === "승인" ? "승인 취소" : "확인 완료 · 승인") + "</button>") +
    '<button class="btn danger" data-act="ssudel">삭제</button></div></div>' +
    '<div class="grid2">' + w("브랜드", "brand", d.brand) +
    '<div class="fd"><label for="se-kind">품목종류</label><select class="ctl" id="se-kind"' + (ro ? " disabled" : "") + ">" + KINDS.map(function (k) { return '<option value="' + k[0] + '"' + (k[0] === (d.kind || "wallet") ? " selected" : "") + ">" + k[1] + "</option>"; }).join("") + "</select></div>" +
    '<div class="fd"><label for="se-gender">성별</label><select class="ctl" id="se-gender"' + (ro ? " disabled" : "") + ">" + GENDERS.map(function (g) { return '<option value="' + g[0] + '"' + (g[0] === (d.gender || "female") ? " selected" : "") + ">" + g[1] + "</option>"; }).join("") + "</select></div>" +
    w("모델명", "model", d.model) + w("품번", "code", d.code) + w("색상 (확실한 것만)", "color", d.color) + w("옵션·사이즈 (있으면)", "option", d.option) +
    w("매입가 (원)", "cost", d.cost, "number") + w("매입일", "pdate", d.pdate, "date") + w("매입처 (백화점·지점)", "vendor", d.vendor) +
    w("시세 (크림 최근 체결가 등, 선택)", "market", d.market || "", "number") + w("판매가 (비우면 자동 계산)", "salePrice", d.priceManual ? d.salePrice : "", "number") +
    '<div class="fd full"><div class="card" id="se-calc" aria-live="polite">' + calcLine(d.cost, d.priceManual ? d.salePrice : "", d.market) + "</div></div>" +
    '<div class="fd full"><label>정품 안내 상자에 넣을 것 (실제로 있는 것만)</label><div>' + BOX.map(function (b) { return '<label style="margin-right:12px"><input type="checkbox" class="se-box" data-k="' + b[0] + '"' + (d.box && d.box[b[0]] ? " checked" : "") + (ro ? " disabled" : "") + "> " + b[1] + "</label>"; }).join("") + "</div></div>" +
    '<div class="fd full"><label for="se-note">상세 추가 문구 (선택 · 사실만)</label><textarea class="ctl" rows="3" id="se-note"' + (ro ? " disabled" : "") + ">" + esc(d.note || "") + "</textarea></div>" +
    '<div class="fd full"><label for="se-name">상품명 (비우면 자동: ' + esc(title(d)) + ')</label><input class="ctl" id="se-name" maxlength="100" value="' + esc(d.nameManual ? d.name : "") + '"' + (ro ? " disabled" : "") + "></div>" +
    '<div class="fd full"><label>사진 (첫 장 = 대표, 최대 10장)</label><div>' + (d.photos || []).map(function (p, i) { return '<span style="display:inline-block;margin:4px;text-align:center"><img data-path="' + esc(p.path) + '" alt="" style="width:96px;height:96px;object-fit:cover;border-radius:6px;background:#eee"><br>' + (i === 0 ? "대표" : i + 1) + (ro ? "" : ' <button class="btn sm" data-act="ssuphdel" data-i="' + i + '">빼기</button>') + "</span>"; }).join("") + "</div>" +
    (ro ? "" : '<input type="file" id="se-files" accept="image/*" multiple>') + "</div>" +
    '<div class="fd full"><label>상세 미리보기</label><div class="card" style="max-height:420px;overflow:auto">' + detail(d, []) + "</div></div></div>";
}
function render() { return V.edit ? (V.edit.mode === "copy" ? copyEditor() : editor()) : list(); }

function grab() {
  var d = V.edit, g = function (k) { var e = document.getElementById("se-" + k); return e ? e.value.trim() : ""; };
  ["brand", "model", "code", "color", "option", "vendor", "pdate", "kind", "gender"].forEach(function (k) { d[k] = g(k); });
  d.code = d.code.toUpperCase(); d.cost = num(g("cost")); d.note = g("note");
  d.box = {}; document.querySelectorAll(".se-box").forEach(function (c) { d.box[c.dataset.k] = c.checked; });
  d.market = num(g("market")); var sp = num(g("salePrice")); d.priceManual = !!sp; d.salePrice = sp || autoPrice(d.cost, d.market);
  d.tagPrice = tagPrice(d.salePrice); var nm = g("name"); d.nameManual = !!nm; d.name = nm || title(d);
}
async function store() {
  grab(); var D = drafts(), k = D.findIndex(function (x) { return x.id === V.edit.id; });
  V.edit.updatedAt = new Date().toISOString(); if (k >= 0) D[k] = V.edit; else D.push(V.edit); await saveDrafts(D);
}
async function uploadPhotos(files) {
  var d = V.edit; d.photos = d.photos || [];
  for (var i = 0; i < files.length && d.photos.length < 10; i++) {
    var f = files[i], path = "ssup/" + d.id + "/" + Date.now() + "_" + i + "." + ((f.name.split(".").pop() || "jpg").toLowerCase());
    var up = await S.sb.storage.from(BUCKET).upload(path, f, { contentType: f.type || "image/jpeg", upsert: false });
    if (up.error) { ERP.toast("사진 올리기 실패: " + ERP.errMsg(up.error)); return; }
    d.photos.push({ path: path, name: f.name });
  }
}
async function thumbs(root) {
  var imgs = root.querySelectorAll("img[data-path]");
  for (var i = 0; i < imgs.length; i++) { var r = await S.sb.storage.from(BUCKET).createSignedUrl(imgs[i].dataset.path, 600); if (!r.error) imgs[i].src = r.data.signedUrl; }
}

ERP.acts.ssunew = function () { V.edit = { id: U.uid(), date: U.today(), status: "초안", brand: "", model: "", code: "", color: "", option: "", cost: "", pdate: U.today(), vendor: "", kind: "wallet", gender: "female", box: { fullset: true, dept: true }, photos: [], note: "" }; ERP.render(); };
ERP.acts.ssuopen = function (b) { V.edit = drafts().filter(function (d) { return d.id === b.dataset.id; })[0] || null; ERP.render(); };
ERP.acts.ssuback = function () { V.edit = null; ERP.render(); };
ERP.acts.ssusave = async function () { await store(); ERP.render(); };
ERP.acts.ssuphdel = async function (b) { grab(); var p = V.edit.photos.splice(Number(b.dataset.i), 1)[0]; if (p) await S.sb.storage.from(BUCKET).remove([p.path]); await store(); ERP.render(); };
ERP.acts.ssuapprove = async function () {
  grab(); var d = V.edit;
  if (d.status === "승인") { d.status = "초안"; await store(); ERP.render(); return; }
  var miss = []; if (!d.brand) miss.push("브랜드"); if (!d.code) miss.push("품번"); if (!d.cost) miss.push("매입가"); if (!d.salePrice) miss.push("판매가(수수료율 설정 필요)"); if (!(d.photos || []).length) miss.push("사진");
  if (miss.length) { ERP.toast("빠진 정보: " + miss.join(", ")); return; }
  if (!confirm(d.name + "\n판매가 " + won(d.salePrice) + "원으로 승인할까요?")) return;
  d.status = "승인"; d.error = ""; await store();
  if (!d.purchaseId && ERP.canWrite("purchases") && confirm("ERP 매입 기록(재고)에도 저장할까요?")) {
    var p = await ERP.save("purchases", { id: U.uid(), date: d.pdate || U.today(), vendor: d.vendor || "백화점", brand: d.brand, itemCode: d.code, option: [d.color, d.option].filter(Boolean).join(" "), serialNo: "", category: "하이엔드상품류", qty: 1, unitCost: d.cost, cardId: "", effectiveUnitCost: "", status: "in_stock", soldSaleId: "", buyer: "신소희", rexOrderNo: "", rexStatus: "", source: "ssupload", memo: "스마트스토어 등록 초안 " + d.id, extra: { buyType: "business", ssDraftId: d.id } });
    if (p) { d.purchaseId = p.id; await store(); }
  }
  ERP.render();
};
ERP.acts.ssudel = async function () {
  var d = V.edit; if (!confirm("이 초안과 사진을 삭제할까요?" + (d.productNo ? "\n(스마트스토어에 이미 등록된 상품은 그대로 남아요)" : ""))) return;
  var paths = (d.photos || []).map(function (p) { return p.path; }); if (paths.length) await S.sb.storage.from(BUCKET).remove(paths);
  await saveDrafts(drafts().filter(function (x) { return x.id !== d.id; })); V.edit = null; ERP.render();
};
/* ───── 기존 스스 상품 불러와서 고쳐 새로 등록 (대표 2026-11-23 "기존상품 불러와서 만드는건데", "스마트스토어 처럼 똑같이") ───── */
async function tokenNow() { var ss = await S.sb.auth.getSession(); return ss.data && ss.data.session && ss.data.session.access_token; }
async function xpost(path, body) { var r = await fetch(SOHEE + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.assign({ token: await tokenNow() }, body)) }); return r.json(); }
ERP.acts.ssuload = async function () {
  var no = prompt("불러올 스마트스토어 상품번호 (판매자센터 상품조회의 '상품번호')", String(S.SET.ss_template_no || "")); if (!no) return;
  no = no.replace(/\D/g, ""); ERP.toast("불러오는 중이에요…");
  try {
    var r = await xpost("/x/ss_load", { no: no }); if (!r.ok) { alert("불러오기 실패: " + r.error); return; }
    var s = r.src, d = { id: U.uid(), date: U.today(), status: "초안", mode: "copy", srcNo: s.no, srcName: s.name, name: s.name, price: s.price, discount: s.discount || 0, discountNote: s.discountNote || "", stock: 1,
      images: s.images || [], photos: [], detailHtml: s.detail || "", sellerCode: "", brand: s.brand || "", model: s.model || "", fixed: s.fixed || {}, cost: "", pdate: U.today(), vendor: "", market: "" };
    var D = drafts(); D.push(d); await saveDrafts(D); V.edit = d; ERP.render();
  } catch (e) { alert("서버 연결 실패: " + e.message); }
};
function cf(l, k, v, type, extra) { var ro = V.edit.status === "등록완료" || V.edit.status === "판매완료"; return '<div class="fd"><label for="sc-' + k + '">' + l + '</label><input class="ctl" id="sc-' + k + '" type="' + (type || "text") + '" value="' + esc(v == null ? "" : v) + '"' + (ro ? " disabled" : "") + (extra || "") + "></div>"; }
function copyCalc(d) {
  var p = num(d.price), dc = num(d.discount), fin = p - dc, f = feeRate(), c = num(d.cost);
  var s = "최종 결제가 <b>" + won(fin) + "</b>원" + (p && dc ? " (할인 " + Math.round(dc / p * 100) + "%)" : "");
  if (c && f != null) { var pf = fin * (1 - f) - c, pr = fin ? pf / fin : 0; s += " · 예상 이익 <b>" + won(pf) + "</b>원 (수수료 " + +(f * 100).toFixed(2) + "%)" + (pf < 0 ? ' <b style="color:#ff6b6b">⚠ 손해</b>' : pr < 0.05 ? ' <b style="color:#ffb020">⚠ 마진 ' + (pr * 100).toFixed(1) + "%</b>" : ""); }
  var rec = c ? autoPrice(c, d.market) : 0; if (rec) s += "<br>추천 결제가 " + won(rec) + "원 (마진 " + Math.round(Number(set("ss_margin", 0.15)) * 100) + "%" + (num(d.market) ? "·시세 반영" : "") + ') <button class="btn sm" data-act="ssucrec">추천가 적용 (판매가 ' + won(tagPrice(rec)) + " · 할인 " + won(tagPrice(rec) - rec) + ")</button>";
  else if (!c) s += "<br><small>매입가를 넣으면 이익·추천가가 나와요.</small>";
  return s;
}
function copyEditor() {
  var d = V.edit, ro = d.status === "등록완료" || d.status === "판매완료", sec = function (t, body) { return '<div class="card"><h3>' + t + "</h3>" + body + "</div>"; };
  var imgs = (d.images || []).map(function (u, i) { return { kind: "old", i: i, html: '<img src="' + esc(u) + '" alt="" style="width:110px;height:110px;object-fit:cover">' }; })
    .concat((d.photos || []).map(function (p, i) { return { kind: "new", i: i, html: '<img data-path="' + esc(p.path) + '" alt="" style="width:110px;height:110px;object-fit:cover">' }; }));
  var fx = d.fixed || {};
  return '<div class="head"><div><h1>' + esc(d.name || "불러온 상품") + "</h1><p>" + esc(d.status) + " · 원본 상품번호 " + esc(d.srcNo) + " (" + esc(d.srcName || "") + ") — 원본은 바뀌지 않아요" + (d.productNo ? ' · 새 상품번호 <a href="' + STORE + esc(d.productNo) + '" target="_blank" rel="noopener">' + esc(d.productNo) + "</a>" : "") + "</p>" + (d.error ? '<p class="warn">' + esc(d.error) + "</p>" : "") + '</div><div class="tools"><button class="btn" data-act="ssuback">목록</button>' +
    (ro ? "" : '<button class="btn" data-act="ssucsave">저장</button><button class="btn primary" data-act="ssucreg">새 상품으로 등록 (판매중지)</button>') + '<button class="btn danger" data-act="ssudel">삭제</button></div></div>' +
    sec("매입 정보 <small>(ERP 전용 · 스마트스토어엔 안 올라가요)</small>", '<div class="grid2">' + cf("매입가 (원)", "cost", d.cost, "number") + cf("매입일", "pdate", d.pdate, "date") + cf("매입처", "vendor", d.vendor) + cf("시세 (크림 최근 체결가 등, 선택)", "market", d.market, "number") + "</div>") +
    sec("상품명", cf("상품명 <small id=\"sc-namecnt\">" + String(d.name || "").length + "/100</small>", "name", d.name, "text", ' maxlength="100"')) +
    sec("판매가", '<div class="grid2">' + cf("판매가 (원)", "price", d.price, "number") + cf("즉시할인 (원)", "discount", d.discount, "number") + "</div>" + (d.discountNote ? '<p class="warn">' + esc(d.discountNote) + "</p>" : "") + '<div class="card" id="sc-calc" aria-live="polite">' + copyCalc(d) + "</div>") +
    sec("재고수량", cf("재고수량", "stock", d.stock, "number")) +
    sec("판매자상품코드", cf("판매자상품코드 (예: 품번-색상 · 같은 코드는 두 번 등록 안 돼요)", "sellerCode", d.sellerCode)) +
    sec("상품이미지 <small>(대표이미지 1장 + 추가이미지 최대 9장 · 상세설명과 따로)</small>", "<div>" + imgs.map(function (x, n) { return '<span style="display:inline-block;margin:4px;text-align:center">' + x.html + "<br>" + (n === 0 ? "<small><b>대표이미지</b></small>" : "<small>추가이미지 " + n + "</small><br>") + (n === 0 || ro ? "" : '<button class="btn sm" data-act="ssucimg" data-op="main" data-k="' + x.kind + '" data-i="' + x.i + '">대표로</button>') + (ro ? "" : ' <button class="btn sm" data-act="ssucimg" data-op="del" data-k="' + x.kind + '" data-i="' + x.i + '">빼기</button>') + "</span>"; }).join("") + "</div>" + (ro ? "" : '<input type="file" id="sc-files" accept="image/*" multiple>')) +
    sec("상세설명 <small>(스마트에디터처럼 바로 고치기 · 사진은 커서 위치에 들어가요)</small>", ro ? '<div class="card" style="background:#fff;color:#111;max-width:860px;margin:0 auto">' + (d.detailHtml || "") + "</div>" :
      '<div id="sc-tb" style="position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:4px;padding:6px;background:var(--panel,#111a2e);border:1px solid #2a3a5c;border-radius:6px">' +
      '<button class="btn sm primary" data-ed="photo">📷 사진 넣기</button><input type="file" id="sc-edfile" accept="image/*" multiple style="display:none">' +
      '<select class="ctl" id="sc-fs" style="width:auto"><option value="">글자 크기</option><option value="2">작게</option><option value="3">보통</option><option value="4">크게</option><option value="5">더 크게</option><option value="6">제목</option></select>' +
      '<button class="btn sm" data-ed="bold"><b>B</b></button><button class="btn sm" data-ed="italic"><i>I</i></button><button class="btn sm" data-ed="underline"><u>U</u></button>' +
      '<input type="color" id="sc-fc" value="#000000" title="글자색" style="width:34px;height:30px;padding:0;border:0"><input type="color" id="sc-bg" value="#fff200" title="형광펜" style="width:34px;height:30px;padding:0;border:0">' +
      '<button class="btn sm" data-ed="justifyLeft">왼쪽</button><button class="btn sm" data-ed="justifyCenter">가운데</button><button class="btn sm" data-ed="justifyRight">오른쪽</button>' +
      '<button class="btn sm" data-ed="insertHorizontalRule">구분선</button><button class="btn sm" data-ed="text">글 상자 추가</button><button class="btn sm" data-ed="removeFormat">서식 지우기</button>' +
      '<button class="btn sm" data-ed="undo">↶</button><button class="btn sm" data-ed="redo">↷</button><button class="btn sm" data-ed="html">HTML 보기</button></div>' +
      '<p class="muted" style="margin:4px 0">사진·글을 클릭해서 고치고, 사진은 클릭 후 Delete로 지워요. 사진 위치에 <code>{{사진}}</code>을 쓰면 대표·추가이미지가 그 자리에 들어가요.</p>' +
      '<div id="sc-ed" contenteditable="true" style="background:#fff;color:#111;max-width:860px;min-height:400px;margin:0 auto;padding:12px;outline:2px solid #3b82f6;overflow:auto">' + (d.detailHtml || "") + "</div>" +
      '<textarea class="ctl" id="sc-detail" rows="16" style="display:none;font-family:monospace;font-size:12px">' + esc(d.detailHtml || "") + "</textarea>") +
    sec("상품주요정보", '<div class="grid2">' + cf("브랜드", "brand", d.brand) + cf("모델명", "model", d.model) + "</div>") +
    sec("원본 그대로 복사되는 정보 <small>(바꾸려면 원본 상품에서 수정 후 다시 불러오기)</small>", '<table><tbody>' + Object.keys(fx).map(function (k) { return "<tr><th style=\"text-align:left;padding-right:12px\">" + esc(k) + "</th><td>" + esc(fx[k] == null ? "" : String(fx[k])) + "</td></tr>"; }).join("") + "</tbody></table>");
}
function grabCopy() {
  var d = V.edit, g = function (k) { var e = document.getElementById("sc-" + k); return e ? e.value : null; };
  ["name", "sellerCode", "brand", "model", "vendor", "pdate"].forEach(function (k) { var v = g(k); if (v != null) d[k] = v.trim(); });
  ["price", "discount", "stock", "cost", "market"].forEach(function (k) { var v = g(k); if (v != null) d[k] = num(v); });
  var ed = document.getElementById("sc-ed"), ta = document.getElementById("sc-detail");
  if (ed && ta) d.detailHtml = ta.style.display === "none" ? ed.innerHTML : ta.value;
}
async function storeCopy() { grabCopy(); var D = drafts(), k = D.findIndex(function (x) { return x.id === V.edit.id; }); if (k < 0) D.push(V.edit); else D[k] = V.edit; await saveDrafts(D); }
ERP.acts.ssucsave = async function () { await storeCopy(); ERP.toast("저장했어요."); ERP.render(); };
ERP.acts.ssucrec = async function () { grabCopy(); var d = V.edit, rec = autoPrice(d.cost, d.market); if (!rec) return; d.price = tagPrice(rec); d.discount = d.price - rec; await storeCopy(); ERP.render(); };
ERP.acts.ssucimg = async function (b) {
  grabCopy(); var d = V.edit, i = +b.dataset.i, arr = b.dataset.k === "old" ? d.images : d.photos;
  if (b.dataset.op === "del") arr.splice(i, 1);
  else { var x = arr.splice(i, 1)[0]; if (b.dataset.k === "old") d.images.unshift(x); else { d.photos.unshift(x); d.newFirst = true; } }
  if (b.dataset.k === "old") d.newFirst = false;
  await storeCopy(); ERP.render();
};
ERP.acts.ssucreg = async function () {
  await storeCopy(); var d = V.edit, miss = [];
  if (!d.name) miss.push("상품명"); if (!num(d.price)) miss.push("판매가"); if (!d.sellerCode) miss.push("판매자상품코드"); if (!(d.images || []).length && !(d.photos || []).length) miss.push("사진");
  if (miss.length) { ERP.toast("빠진 정보: " + miss.join(", ")); return; }
  if (!confirm("새 상품으로 등록할게요 (판매중지 상태).\n\n" + d.name + "\n판매가 " + won(d.price) + " − 할인 " + won(d.discount) + " = 결제가 " + won(num(d.price) - num(d.discount)) + "원\n원본 " + d.srcNo + "은 바뀌지 않아요.")) return;
  try {
    ERP.toast("등록 중이에요… (사진이 많으면 1분쯤 걸려요)");
    var np = []; for (var j = 0; j < (d.photos || []).length; j++) { var s = await S.sb.storage.from(BUCKET).createSignedUrl(d.photos[j].path, 3600); if (!s.error) np.push(s.data.signedUrl); }
    var imgs = d.images || [], box = document.createElement("div"); box.innerHTML = d.detailHtml || "";
    var dimg = box.querySelectorAll("img[data-path]"); for (var q = 0; q < dimg.length; q++) { var sg = await S.sb.storage.from(BUCKET).createSignedUrl(dimg[q].getAttribute("data-path"), 3600); if (!sg.error) dimg[q].setAttribute("src", sg.data.signedUrl); }
    var r = await xpost("/x/ss_copy", { no: d.srcNo, edit: { name: d.name, price: d.price, discount: d.discount, stock: d.stock, images: imgs, newFirst: !!d.newFirst, newPhotos: np, detail: box.innerHTML, sellerCode: d.sellerCode, brand: d.brand, model: d.model } });
    if (r.ok) { d.status = "등록완료"; d.productNo = String(r.channelProductNo || ""); d.originNo = String(r.originProductNo || ""); d.registeredAt = r.at; d.error = ""; d.salePrice = num(d.price) - num(d.discount); d.code = d.sellerCode; }
    else { d.status = "오류"; d.error = String(r.error || "").slice(0, 1500); }
    await storeCopy(); ERP.render();
    if (!r.ok) { alert("등록 오류\n" + d.error); return; }
    ERP.toast("등록 완료 — 판매자센터에서 확인 후 판매중으로 바꿔 주세요. 상품번호 " + d.productNo);
    if (num(d.cost) && !d.purchaseId && ERP.canWrite("purchases") && confirm("ERP 매입 기록(재고)에도 저장할까요?")) {
      var p = await ERP.save("purchases", { id: U.uid(), date: d.pdate || U.today(), vendor: d.vendor || "백화점", brand: d.brand, itemCode: d.sellerCode, option: "", serialNo: "", category: "하이엔드상품류", qty: 1, unitCost: d.cost, cardId: "", effectiveUnitCost: "", status: "in_stock", soldSaleId: "", buyer: "신소희", rexOrderNo: "", rexStatus: "", source: "ssupload", memo: "스마트스토어 불러오기 등록 " + d.id, extra: { buyType: "business", ssDraftId: d.id } });
      if (p) { d.purchaseId = p.id; await storeCopy(); }
    }
  } catch (e) { alert("서버 연결 실패: " + e.message); }
};
function bindCopy(root) {
  var calc = root.querySelector("#sc-calc"), nm = root.querySelector("#sc-name"), cnt = root.querySelector("#sc-namecnt");
  var ed = root.querySelector("#sc-ed"), ta = root.querySelector("#sc-detail"), ef = root.querySelector("#sc-edfile"), range = null;
  if (ed) {
    var keep = function () { var sel = window.getSelection(); if (sel.rangeCount && ed.contains(sel.anchorNode)) range = sel.getRangeAt(0).cloneRange(); };
    var back = function () { ed.focus(); if (range) { var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); } };
    ed.onkeyup = keep; ed.onmouseup = keep; ed.oninput = keep;
    ed.onclick = function (e) { if (e.target.tagName === "IMG") { var r = document.createRange(); r.selectNode(e.target); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); range = r.cloneRange(); } };
    root.querySelectorAll("#sc-tb [data-ed]").forEach(function (bt) { bt.onmousedown = function (e) { e.preventDefault(); }; bt.onclick = function (e) {
      e.preventDefault(); e.stopPropagation(); var c = bt.dataset.ed;
      if (c === "photo") { keep(); ef.click(); return; }
      if (c === "html") { var on = ta.style.display === "none"; if (on) { ta.value = ed.innerHTML; ta.style.display = ""; ed.style.display = "none"; bt.textContent = "편집 화면"; } else { ed.innerHTML = ta.value; ta.style.display = "none"; ed.style.display = ""; bt.textContent = "HTML 보기"; } return; }
      back();
      if (c === "text") document.execCommand("insertHTML", false, '<p style="text-align:center">여기에 글을 쓰세요</p>');
      else document.execCommand(c, false, null);
      keep();
    }; });
    var fs = root.querySelector("#sc-fs"); if (fs) fs.onchange = function () { if (!fs.value) return; back(); document.execCommand("fontSize", false, fs.value); fs.value = ""; keep(); };
    var fc = root.querySelector("#sc-fc"); if (fc) fc.oninput = function () { back(); document.execCommand("foreColor", false, fc.value); keep(); };
    var bg = root.querySelector("#sc-bg"); if (bg) bg.oninput = function () { back(); document.execCommand("hiliteColor", false, bg.value); keep(); };
    if (ef) ef.onchange = async function () {
      var d = V.edit, html = "";
      for (var i = 0; i < ef.files.length; i++) {
        var f = ef.files[i], path = "ssup/" + d.id + "/detail_" + Date.now() + "_" + i + "." + ((f.name.split(".").pop() || "jpg").toLowerCase());
        var up = await S.sb.storage.from(BUCKET).upload(path, f, { contentType: f.type || "image/jpeg", upsert: false });
        if (up.error) { ERP.toast("사진 올리기 실패: " + ERP.errMsg(up.error)); return; }
        var sg = await S.sb.storage.from(BUCKET).createSignedUrl(path, 604800); if (sg.error) continue;
        html += '<p style="text-align:center"><img src="' + sg.data.signedUrl + '" data-path="' + path + '" style="max-width:100%"></p>';
      }
      ef.value = ""; back(); document.execCommand("insertHTML", false, html); keep(); ERP.toast("사진을 넣었어요. [저장]을 눌러 주세요.");
    };
  }
  ["price", "discount", "cost", "market"].forEach(function (k) { var e = root.querySelector("#sc-" + k); if (e) e.oninput = function () { grabCopy(); if (calc) calc.innerHTML = copyCalc(V.edit); }; });
  if (nm && cnt) nm.oninput = function () { cnt.textContent = nm.value.length + "/100"; };
  var fi = root.querySelector("#sc-files"); if (fi) fi.onchange = async function () { grabCopy(); fi.disabled = true; var n = (V.edit.images || []).length; V.edit.photos = V.edit.photos || []; var room = 10 - n - V.edit.photos.length; if (room <= 0) { ERP.toast("사진은 최대 10장이에요."); fi.disabled = false; return; } await uploadPhotos(Array.prototype.slice.call(fi.files, 0, room)); await storeCopy(); ERP.render(); };
  thumbs(root);
}
/* 승인분 → 소희봇 서버가 스마트스토어에 바로 등록 (PC·파일 없음, 2026-11-21) */
var SOHEE = "https://54-180-19-139.sslip.io";
async function apiItem(d) {
  var urls = [];
  for (var j = 0; j < (d.photos || []).length; j++) { var r = await S.sb.storage.from(BUCKET).createSignedUrl(d.photos[j].path, 3600); if (r.error) throw new Error("사진 주소 만들기 실패"); urls.push(r.data.signedUrl); }
  return { id: d.id, name: d.name, salePrice: d.salePrice, tagPrice: d.tagPrice || tagPrice(d.salePrice), sellerCode: d.code + (d.color ? "-" + d.color : ""), photos: urls, detailHtml: detail(d, ["{{IMG}}"]).replace(/<p><img src="\{\{IMG\}\}"[^>]*><\/p>/, "{{IMAGES}}"),
    brand: d.brand || "", model: d.model || "", code: d.code || "", color: d.color || "", note: d.note || "",
    boxHtml: BOX.filter(function (b) { return d.box && d.box[b[0]]; }).map(function (b) { return "· " + b[1]; }).join("<br>") };
}
async function serverCall(item, opt) {
  var ss = await S.sb.auth.getSession(), tk = ss.data && ss.data.session && ss.data.session.access_token;
  var res = await fetch(SOHEE + "/x/ss_register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.assign({ token: tk, item: item, templateChannelProductNo: String(S.SET.ss_template_no || ""), returnFee: num(set("ss_return_fee", 25000)), exchangeFee: num(set("ss_exchange_fee", 50000)) }, opt)) });
  return res.json();
}
ERP.acts.ssuserver = async function () {
  if (!S.SET.ss_template_no) { ERP.toast("가격·틀 설정에서 틀 상품번호를 넣어 주세요."); return; }
  var A = drafts().filter(function (d) { return d.mode !== "copy" && (d.status === "승인" || d.status === "오류"); }); if (!A.length) { ERP.toast("승인된 상품이 없어요."); return; }
  try {
    if (!confirm(A.length + "개를 스마트스토어에 '판매중지' 상태로 등록할게요.\n등록 후 판매자센터에서 상세설명을 다듬고 판매중으로 바꿔 주세요.\n\n" + A.map(function (d) { return "· " + d.name; }).join("\n"))) return;
    var sus = true;
    var D = drafts(), ok = 0, bad = [];
    for (var i = 0; i < A.length; i++) {
      ERP.toast("등록 중 " + (i + 1) + "/" + A.length + " · " + A[i].name);
      var r; try { r = await serverCall(await apiItem(A[i]), { suspend: sus }); } catch (e) { r = { ok: false, error: e.message }; }
      var d = D.filter(function (x) { return x.id === A[i].id; })[0]; if (!d) continue;
      if (r.ok) { ok++; d.status = "등록완료"; d.productNo = String(r.channelProductNo || ""); d.originNo = String(r.originProductNo || ""); d.registeredAt = r.at; d.error = ""; d.suspended = !!r.suspended; }
      else { d.status = "오류"; d.error = String(r.error || "").slice(0, 1500); bad.push(d.name + ": " + d.error); }
      await saveDrafts(D);
    }
    ERP.render(); ERP.toast(ok + "개 등록 완료" + (bad.length ? " · 오류 " + bad.length + "개" : ""));
    if (bad.length) alert("오류\n" + bad.join("\n"));
  } catch (e) { ERP.toast("서버 연결 실패: " + e.message); }
};
/* 승인분 → PC 스크립트용 JSON (사진은 24시간짜리 다운로드 주소) */
/* 등록완료 상품 판매 여부 — 재고 0·품절이면 '판매완료' (제안③ 2026-11-23). 목록을 열 때 30분에 한 번 자동 */
ERP.acts.ssusold = async function (silent) {
  var D = drafts(), R = D.filter(function (d) { return d.status === "등록완료" && d.productNo; }); if (!R.length) { if (silent !== true) ERP.toast("확인할 등록완료 상품이 없어요."); return; }
  try {
    var ss = await S.sb.auth.getSession(), tk = ss.data && ss.data.session && ss.data.session.access_token;
    var res = await (await fetch(SOHEE + "/x/ss_check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tk, nos: R.map(function (d) { return d.productNo; }) }) })).json();
    if (!res.ok) { if (silent !== true) ERP.toast("판매 확인 실패: " + res.error); return; }
    var n = 0; R.forEach(function (d) { var x = res.items[d.productNo]; if (x && !x.error && (x.stock === 0 || x.status === "OUTOFSTOCK")) { d.status = "판매완료"; d.soldAt = new Date().toISOString(); n++; } });
    V.soldChecked = Date.now(); if (n) { await saveDrafts(D); ERP.render(); } if (silent !== true || n) ERP.toast(n ? n + "개 판매완료로 바꿨어요." : "새로 팔린 상품이 없어요.");
  } catch (e) { if (silent !== true) ERP.toast("서버 연결 실패: " + e.message); }
};
ERP.acts.ssucheck = async function () {
  var A = drafts().filter(function (d) { return d.status !== "등록완료" && d.status !== "판매완료" && d.salePrice && (d.photos || []).length; }); if (!A.length) { ERP.toast("점검할 상품이 없어요 (판매가·사진이 있는 미등록 상품 필요)."); return; }
  try { ERP.toast("점검 중이에요… (등록 안 함)"); var c = await serverCall(await apiItem(A[0]), { dryRun: true }); alert(c.ok ? "점검 결과 — 등록 안 됨 (" + A[0].name + ")\n" + JSON.stringify(c.check, null, 1) : "점검 실패: " + c.error); } catch (e) { ERP.toast("서버 연결 실패: " + e.message); }
};
ERP.acts.ssuexport = async function () {
  if (!S.SET.ss_template_no) { ERP.toast("API용은 가격·틀 설정에서 틀 상품번호(샤넬 지갑류)를 넣어야 해요."); return; }
  var A = drafts().filter(function (d) { return d.status === "승인"; }); if (!A.length) { ERP.toast("승인된 상품이 없어요."); return; }
  var out = { exportedAt: new Date().toISOString(), templateChannelProductNo: String(S.SET.ss_template_no || ""), returnFee: num(set("ss_return_fee", 25000)), exchangeFee: num(set("ss_exchange_fee", 50000)), items: [] };
  for (var i = 0; i < A.length; i++) {
    var d = A[i], urls = [];
    for (var j = 0; j < (d.photos || []).length; j++) { var r = await S.sb.storage.from(BUCKET).createSignedUrl(d.photos[j].path, 604800); if (r.error) { ERP.toast("사진 주소 만들기 실패: " + d.name); return; } urls.push(r.data.signedUrl); }
    out.items.push({ id: d.id, name: d.name, salePrice: d.salePrice, tagPrice: d.tagPrice || tagPrice(d.salePrice), sellerCode: d.code + (d.color ? "-" + d.color : ""), photos: urls, detailHtml: detail(d, ["{{IMG}}"]).replace(/<p><img src="\{\{IMG\}\}"[^>]*><\/p>/, "{{IMAGES}}") });
  }
  ERP.downloadBlob("ss_upload_" + U.today() + ".json", new Blob([JSON.stringify(out, null, 1)], { type: "application/json" }));
  ERP.toast(A.length + "개 내보냈어요. PC에서 ss_upload.py로 등록해 주세요(사진 주소는 7일 유효).");
};
/* 사방넷 대량등록: 승인분 → 사방넷 엑셀(소싱폼과 같은 119칸 양식) + ESM 이미지호스팅에 올릴 사진 zip
   사진 주소 = gi.esmplus.com/djsouplim/{작업폴더}/{순번  품번}/{2..}.jpg (렉스몬드 업로드와 같은 규칙) */
var ESM = "djsouplim";
var SBC = { name: 0, model: 2, modelNo: 3, brandEn: 4, sku: 5, kw: 6, kind: 8, maker: 12, origin: 13, gender: 17, state: 18, region: 19, tax: 20, shipKind: 21, shipFee: 22, cost: 24, sale: 25, tag: 26, opt1: 27, opt1v: 28, img: 31, add6: 37, add7: 38, add8: 39, detail: 42, certNo: 44, certField: 50, stock: 51, memo: 68, optEdit: 69, attrCode: 79 };
var CRC = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t.push(c >>> 0); } return t; })();
function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
/* 압축 없는(store) zip — 파일 이름 UTF-8 */
function makeZip(files) {
  var te = new TextEncoder(), parts = [], cen = [], off = 0;
  files.forEach(function (f) {
    var nm = te.encode(f.name), d = f.data, crc = crc32(d), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(h.buffer), nm, d);
    var c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    cen.push(new Uint8Array(c.buffer), nm); off += 30 + nm.length + d.length;
  });
  var csz = cen.reduce(function (a, b) { return a + b.length; }, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csz, true); e.setUint32(16, off, true);
  return new Blob(parts.concat(cen, [new Uint8Array(e.buffer)]), { type: "application/zip" });
}
/* 어떤 형식이든 JPG로 (흰 바탕, 긴 변 최대 2000px) */
function toJpg(blob) {
  return new Promise(function (res, rej) {
    var url = URL.createObjectURL(blob), im = new Image();
    im.onload = function () { var k = Math.min(1, 2000 / Math.max(im.width, im.height)), cv = document.createElement("canvas"); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k); var x = cv.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(im, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); cv.toBlob(function (b) { b ? b.arrayBuffer().then(function (a) { res(new Uint8Array(a)); }) : rej(new Error("JPG 변환 실패")); }, "image/jpeg", 0.92); };
    im.onerror = function () { URL.revokeObjectURL(url); rej(new Error("사진을 열 수 없어요(HEIC 등)")); };
    im.src = url;
  });
}
function esmUrl(folder, no, code, n) { return "https://gi.esmplus.com/" + ESM + "/" + encodeURIComponent(folder) + "/" + encodeURIComponent(no + "  " + code) + "/" + n + ".jpg"; }
ERP.acts.ssusabang = async function () {
  var A = drafts().filter(function (d) { return d.status === "승인"; }); if (!A.length) { ERP.toast("승인된 상품이 없어요."); return; }
  var t = U.today(), folder = prompt("ESM 이미지 폴더 이름 (이 이름으로 ESM에 올려요)", t.slice(2, 4) + t.slice(5, 7) + t.slice(8, 10) + " 하이엔드"); if (!folder) return;
  folder = folder.trim().replace(/[\\\/:*?"<>|]/g, " ");
  var H; try { H = await ERP.loadFile("sabang_head"); } catch (e) { ERP.toast(e.message); return; }
  var rows = [], files = [], warn = [];
  ERP.toast("사진을 모으는 중이에요… (" + A.length + "개)");
  for (var i = 0; i < A.length; i++) {
    var d = A[i], no = i + 1, code = String(d.code || "").trim(), ns = [];
    for (var j = 0; j < (d.photos || []).length; j++) {
      var dl = await S.sb.storage.from(BUCKET).download(d.photos[j].path);
      if (dl.error) { warn.push(code + ": 사진 " + (j + 1) + " 내려받기 실패"); continue; }
      try { var n = 2 + ns.length; files.push({ name: folder + "/" + no + "  " + code + "/" + n + ".jpg", data: await toJpg(dl.data) }); ns.push(n); } catch (e) { warn.push(code + ": 사진 " + (j + 1) + " " + e.message); }
    }
    if (!ns.length) { warn.push(code + ": 사진이 없어 뺐어요"); continue; }
    var urls = ns.map(function (n) { return esmUrl(folder, no, code, n); });
    var r = new Array(H[1].length).fill("");
    var ki = kindInfo(d.kind), gi = genderInfo(d.gender);
    r[SBC.name] = d.name || title(d); r[SBC.model] = d.model || code; r[SBC.modelNo] = code; r[SBC.brandEn] = ""; r[SBC.sku] = code; r[SBC.kw] = d.brand || "";
    r[SBC.kind] = 3; r[SBC.maker] = d.brand || ""; r[SBC.origin] = "상세참조"; r[SBC.gender] = gi[2];
    r[SBC.state] = 2; r[SBC.region] = 1; r[SBC.tax] = 1; r[SBC.shipKind] = 1; r[SBC.shipFee] = 0;
    r[SBC.cost] = num(d.cost); r[SBC.sale] = d.salePrice; r[SBC.tag] = d.tagPrice || tagPrice(d.salePrice);
    r[SBC.opt1] = "색상"; r[SBC.opt1v] = d.color || "상세참조";
    r[SBC.img] = urls[0]; [SBC.add6, SBC.add7, SBC.add8].forEach(function (c, k) { if (urls[k + 1]) r[c] = urls[k + 1]; });
    r[SBC.detail] = detail(d, urls);
    r[SBC.certNo] = "없음"; r[SBC.certField] = "없음"; r[SBC.stock] = "N"; r[SBC.memo] = "로우나 하이엔드"; r[SBC.optEdit] = 2; r[SBC.attrCode] = ki[2];
    for (var q = 1; q <= 14; q++) r[SBC.attrCode + q] = "상세참조";
    rows.push({ d: d, no: no, r: r });
  }
  if (!rows.length) { alert("만들 상품이 없어요.\n" + warn.join("\n")); return; }
  var ws = XLSX.utils.aoa_to_sheet(H.concat(rows.map(function (z) { return z.r; }))); ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } }];
  var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "사방넷상품대량등록_샘플파일");
  var day = t.replace(/-/g, "."), fname = "사방넷_하이엔드_" + day + ".xlsx";
  ERP.downloadBlob(fname, new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  setTimeout(function () { ERP.downloadBlob("ESM사진_" + folder + ".zip", makeZip(files)); }, 1200);
  var now = new Date().toISOString(), D = drafts().map(function (x) { var z = rows.filter(function (y) { return y.d.id === x.id; })[0]; return z ? Object.assign({}, x, { sabang: { file: fname, folder: folder, no: z.no, at: now } }) : x; });
  await saveDrafts(D);
  ERP.toast(rows.length + "개 · 사방넷 엑셀 + ESM 사진 zip을 만들었어요. ESM에 사진을 먼저 올린 뒤 사방넷에 엑셀을 올려 주세요.");
  if (warn.length) setTimeout(function () { alert("확인할 것\n" + warn.join("\n")); }, 300);
};
/* PC 결과 → 상태 반영 */
ERP.acts.ssuimport = function () {
  var inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json";
  inp.onchange = async function () {
    try {
      var res = JSON.parse(await inp.files[0].text()), D = drafts(), n = 0;
      (res.results || []).forEach(function (r) { var d = D.filter(function (x) { return x.id === r.id; })[0]; if (!d || r.dryRun) return; n++;
        if (r.ok) { d.status = "등록완료"; d.productNo = String(r.channelProductNo || ""); d.originNo = String(r.originProductNo || ""); d.registeredAt = r.at; d.error = ""; } else { d.status = "오류"; d.error = String(r.error || "").slice(0, 200); } });
      await saveDrafts(D); ERP.toast(n + "개 결과를 반영했어요."); ERP.render();
    } catch (e) { ERP.toast("결과 파일을 읽지 못했어요: " + e.message); }
  };
  inp.click();
};
function bind(root) {
  if (V.edit && V.edit.mode === "copy") { bindCopy(root); return; }
  var sv = function (id, key, fn) { var el = root.querySelector("#" + id); if (el) el.onchange = async function () { await ERP.saveSetting(key, fn(el.value)); ERP.render(); }; };
  sv("ssu-fee", "ss_fee_rate", function (x) { return x === "" ? "" : num(x) / 100; });
  sv("ssu-m", "ss_margin", function (x) { return num(x) / 100; });
  sv("ssu-b", "ss_margin_basis", String); sv("ssu-tpl", "ss_template_no", function (x) { return x.replace(/\D/g, ""); });
  sv("ssu-rf", "ss_return_fee", num); sv("ssu-tag", "ss_tag_mul", function (x) { return num(x) || 1.2; }); sv("ssu-xf", "ss_exchange_fee", num);
  var ci = root.querySelector("#se-cost"), si = root.querySelector("#se-salePrice"), mi = root.querySelector("#se-market"), out = root.querySelector("#se-calc");
  var live = function () { if (out) out.innerHTML = calcLine(ci ? ci.value : 0, si ? si.value : "", mi ? mi.value : ""); };
  if (ci) ci.oninput = live; if (si) si.oninput = live; if (mi) mi.oninput = live;
  var fi = root.querySelector("#se-files");
  if (fi) fi.onchange = async function () { grab(); fi.disabled = true; await uploadPhotos(fi.files); await store(); ERP.render(); };
  if (V.edit) thumbs(root);
  else if (!V.soldChecked || Date.now() - V.soldChecked > 1800000) { V.soldChecked = Date.now(); setTimeout(function () { ERP.acts.ssusold(true); }, 500); }
}
ERP.page({ id: "ss-upload", title: "매입상품 등록 (시험)", wide: true, roles: ["owner"], render: render, bind: bind, live: function () { if (!V.edit) ERP.render(); } });
})();
