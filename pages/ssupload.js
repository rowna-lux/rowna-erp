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
function tagMul() { return Number(set("ss_tag_mul", 1.2)) || 1.2; }
function tagPrice(sp) { return sp ? Math.ceil(sp * tagMul() / 1000) * 1000 : 0; }
function calcLine(cost, manual) {
  var sp = num(manual) || price(cost), tp = tagPrice(sp), f = feeRate();
  if (!num(cost)) return "매입가를 넣으면 판매가·태그가가 계산돼요.";
  if (!sp) return "수수료율을 설정해야 판매가가 계산돼요.";
  return "판매가 <b>" + won(sp) + "</b>원 · 태그가 <b>" + won(tp) + "</b>원 (판매가×" + tagMul() + ")" + (f == null ? "" : " · 예상 이익 " + won(sp * (1 - f) - num(cost)) + "원");
}
function profit(d) { var f = feeRate(); return d.salePrice && f != null ? Math.round(d.salePrice * (1 - f) - num(d.cost)) : null; }

function title(d) {
  return [d.brand, d.model, d.code, d.color, d.box && d.box.dept ? "백화점" : "", "정품"].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
/* 상세: 가운데 정렬, 사진, 정품 안내(입력한 항목만). 소재·사이즈 등 입력하지 않은 사양은 쓰지 않음 */
function detail(d, urls) {
  var c = 'style="text-align:center"', box = BOX.filter(function (b) { return d.box && d.box[b[0]] && b[0] !== "gift"; }).map(function (b) { return "· " + b[1]; });
  var h = '<div ' + c + '><p><b>' + esc(d.name) + "</b></p>";
  (urls || []).forEach(function (u) { h += '<p><img src="' + esc(u) + '" style="max-width:100%"></p>'; });
  h += "<p>품번 " + esc(d.code) + (d.color ? "<br>색상 " + esc(d.color) : "") + (d.option ? "<br>" + esc(d.option) : "") + "</p>";
  if (d.note) h += "<p>" + esc(d.note).replace(/\n/g, "<br>") + "</p>";
  h += '<div style="border:1px solid #ccc;padding:16px;margin:16px auto;max-width:480px"><p>로우나명품은 정품만 판매하는 명품 판매처예요.</p>' + (box.length ? "<p>" + box.join("<br>") + "</p>" : "") + "</div>";
  if (d.box && d.box.gift) h += "<p>선물포장을 원하시면 옵션에서 선택해 주세요.</p>";
  return h + "</div>";
}

function list() {
  var D = drafts(), f = feeRate();
  var st = { "초안": 0, "승인": 0, "등록완료": 0, "오류": 0 }; D.forEach(function (d) { st[d.status] = (st[d.status] || 0) + 1; });
  var basis = set("ss_margin_basis", "cost");
  return '<div class="head"><div><h1>스마트스토어 매입상품 등록</h1><p>사진·정보 입력 → 초안 → 승인 → PC에서 등록 (샤넬 지갑류 상품을 틀로 복사)</p></div><div class="tools">' +
    '<button class="btn primary" data-act="ssunew">새 상품</button><button class="btn" data-act="ssuexport">승인분 내보내기 (' + st["승인"] + ')</button><button class="btn" data-act="ssuimport">결과 불러오기</button></div></div>' +
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
        return "<tr><td>" + esc(d.date) + "</td><td>" + esc(d.status) + (d.error ? '<br><small class="warn">' + esc(d.error) + "</small>" : "") + "</td><td>" + (d.photos || []).length + "장</td><td>" + (d.productNo ? '<a href="' + STORE + esc(d.productNo) + '" target="_blank" rel="noopener">' + esc(d.name) + "</a>" : esc(d.name)) +
          '</td><td class="num">' + won(d.cost) + '</td><td class="num">' + (d.salePrice ? won(d.salePrice) : "–") + '</td><td class="num">' + (d.salePrice ? won(d.tagPrice || tagPrice(d.salePrice)) : "–") + '</td><td class="num">' + (p == null ? "–" : won(p)) + '</td><td><button class="btn sm" data-act="ssuopen" data-id="' + esc(d.id) + '">열기</button></td></tr>';
      }).join("") + "</tbody></table></div>" : '<p class="muted">아직 등록할 상품이 없어요. [새 상품]을 눌러 사진과 정보를 넣어 주세요.</p>');
}

function editor() {
  var d = V.edit, ro = d.status === "등록완료";
  var w = function (l, k, v, type) { return '<div class="fd"><label for="se-' + k + '">' + l + '</label><input class="ctl" id="se-' + k + '" type="' + (type || "text") + '" value="' + esc(v == null ? "" : v) + '"' + (ro ? " disabled" : "") + "></div>"; };
  return '<div class="head"><div><h1>' + (d.name ? esc(d.name) : "새 상품") + "</h1><p>" + esc(d.status) + " · " + esc(d.date) + '</p></div><div class="tools"><button class="btn" data-act="ssuback">목록</button>' +
    (ro ? "" : '<button class="btn" data-act="ssusave">초안 저장</button><button class="btn primary" data-act="ssuapprove">' + (d.status === "승인" ? "승인 취소" : "확인 완료 · 승인") + "</button>") +
    '<button class="btn danger" data-act="ssudel">삭제</button></div></div>' +
    '<div class="grid2">' + w("브랜드", "brand", d.brand) + w("모델명", "model", d.model) + w("품번", "code", d.code) + w("색상 (확실한 것만)", "color", d.color) + w("옵션·사이즈 (있으면)", "option", d.option) +
    w("매입가 (원)", "cost", d.cost, "number") + w("매입일", "pdate", d.pdate, "date") + w("매입처 (백화점·지점)", "vendor", d.vendor) +
    w("판매가 (비우면 자동 계산)", "salePrice", d.priceManual ? d.salePrice : "", "number") +
    '<div class="fd full"><div class="card" id="se-calc" aria-live="polite">' + calcLine(d.cost, d.priceManual ? d.salePrice : "") + "</div></div>" +
    '<div class="fd full"><label>정품 안내 상자에 넣을 것 (실제로 있는 것만)</label><div>' + BOX.map(function (b) { return '<label style="margin-right:12px"><input type="checkbox" class="se-box" data-k="' + b[0] + '"' + (d.box && d.box[b[0]] ? " checked" : "") + (ro ? " disabled" : "") + "> " + b[1] + "</label>"; }).join("") + "</div></div>" +
    '<div class="fd full"><label for="se-note">상세 추가 문구 (선택 · 사실만)</label><textarea class="ctl" rows="3" id="se-note"' + (ro ? " disabled" : "") + ">" + esc(d.note || "") + "</textarea></div>" +
    '<div class="fd full"><label for="se-name">상품명 (비우면 자동: ' + esc(title(d)) + ')</label><input class="ctl" id="se-name" maxlength="100" value="' + esc(d.nameManual ? d.name : "") + '"' + (ro ? " disabled" : "") + "></div>" +
    '<div class="fd full"><label>사진 (첫 장 = 대표, 최대 10장)</label><div>' + (d.photos || []).map(function (p, i) { return '<span style="display:inline-block;margin:4px;text-align:center"><img data-path="' + esc(p.path) + '" alt="" style="width:96px;height:96px;object-fit:cover;border-radius:6px;background:#eee"><br>' + (i === 0 ? "대표" : i + 1) + (ro ? "" : ' <button class="btn sm" data-act="ssuphdel" data-i="' + i + '">빼기</button>') + "</span>"; }).join("") + "</div>" +
    (ro ? "" : '<input type="file" id="se-files" accept="image/*" multiple>') + "</div>" +
    '<div class="fd full"><label>상세 미리보기</label><div class="card" style="max-height:420px;overflow:auto">' + detail(d, []) + "</div></div></div>";
}
function render() { return V.edit ? editor() : list(); }

function grab() {
  var d = V.edit, g = function (k) { var e = document.getElementById("se-" + k); return e ? e.value.trim() : ""; };
  ["brand", "model", "code", "color", "option", "vendor", "pdate"].forEach(function (k) { d[k] = g(k); });
  d.code = d.code.toUpperCase(); d.cost = num(g("cost")); d.note = g("note");
  d.box = {}; document.querySelectorAll(".se-box").forEach(function (c) { d.box[c.dataset.k] = c.checked; });
  var sp = num(g("salePrice")); d.priceManual = !!sp; d.salePrice = sp || price(d.cost);
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

ERP.acts.ssunew = function () { V.edit = { id: U.uid(), date: U.today(), status: "초안", brand: "", model: "", code: "", color: "", option: "", cost: "", pdate: U.today(), vendor: "", box: { fullset: true, dept: true }, photos: [], note: "" }; ERP.render(); };
ERP.acts.ssuopen = function (b) { V.edit = drafts().filter(function (d) { return d.id === b.dataset.id; })[0] || null; ERP.render(); };
ERP.acts.ssuback = function () { V.edit = null; ERP.render(); };
ERP.acts.ssusave = async function () { await store(); ERP.render(); };
ERP.acts.ssuphdel = async function (b) { grab(); var p = V.edit.photos.splice(Number(b.dataset.i), 1)[0]; if (p) await S.sb.storage.from(BUCKET).remove([p.path]); await store(); ERP.render(); };
ERP.acts.ssuapprove = async function () {
  grab(); var d = V.edit;
  if (d.status === "승인") { d.status = "초안"; await store(); ERP.render(); return; }
  var miss = []; if (!d.brand) miss.push("브랜드"); if (!d.code) miss.push("품번"); if (!d.cost) miss.push("매입가"); if (!d.salePrice) miss.push("판매가(수수료율 설정 필요)"); if (!(d.photos || []).length) miss.push("사진");
  if (miss.length) { ERP.toast("빠진 정보: " + miss.join(", ")); return; }
  if (!S.SET.ss_template_no) { ERP.toast("가격·틀 설정에서 틀 상품번호(샤넬 지갑류)를 넣어 주세요."); return; }
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
/* 승인분 → PC 스크립트용 JSON (사진은 24시간짜리 다운로드 주소) */
ERP.acts.ssuexport = async function () {
  var A = drafts().filter(function (d) { return d.status === "승인"; }); if (!A.length) { ERP.toast("승인된 상품이 없어요."); return; }
  var out = { exportedAt: new Date().toISOString(), templateChannelProductNo: String(S.SET.ss_template_no || ""), returnFee: num(set("ss_return_fee", 25000)), exchangeFee: num(set("ss_exchange_fee", 50000)), items: [] };
  for (var i = 0; i < A.length; i++) {
    var d = A[i], urls = [];
    for (var j = 0; j < (d.photos || []).length; j++) { var r = await S.sb.storage.from(BUCKET).createSignedUrl(d.photos[j].path, 86400); if (r.error) { ERP.toast("사진 주소 만들기 실패: " + d.name); return; } urls.push(r.data.signedUrl); }
    out.items.push({ id: d.id, name: d.name, salePrice: d.salePrice, tagPrice: d.tagPrice || tagPrice(d.salePrice), sellerCode: d.code + (d.color ? "-" + d.color : ""), photos: urls, detailHtml: detail(d, ["{{IMG}}"]).replace(/<p><img src="\{\{IMG\}\}"[^>]*><\/p>/, "{{IMAGES}}") });
  }
  ERP.downloadBlob("ss_upload_" + U.today() + ".json", new Blob([JSON.stringify(out, null, 1)], { type: "application/json" }));
  ERP.toast(A.length + "개 내보냈어요. PC에서 ss_upload.py로 등록해 주세요(사진 주소는 24시간 유효).");
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
  var sv = function (id, key, fn) { var el = root.querySelector("#" + id); if (el) el.onchange = async function () { await ERP.saveSetting(key, fn(el.value)); ERP.render(); }; };
  sv("ssu-fee", "ss_fee_rate", function (x) { return x === "" ? "" : num(x) / 100; });
  sv("ssu-m", "ss_margin", function (x) { return num(x) / 100; });
  sv("ssu-b", "ss_margin_basis", String); sv("ssu-tpl", "ss_template_no", function (x) { return x.replace(/\D/g, ""); });
  sv("ssu-rf", "ss_return_fee", num); sv("ssu-tag", "ss_tag_mul", function (x) { return num(x) || 1.2; }); sv("ssu-xf", "ss_exchange_fee", num);
  var ci = root.querySelector("#se-cost"), si = root.querySelector("#se-salePrice"), out = root.querySelector("#se-calc");
  var live = function () { if (out) out.innerHTML = calcLine(ci ? ci.value : 0, si ? si.value : ""); };
  if (ci) ci.oninput = live; if (si) si.oninput = live;
  var fi = root.querySelector("#se-files");
  if (fi) fi.onchange = async function () { grab(); fi.disabled = true; await uploadPhotos(fi.files); await store(); ERP.render(); };
  if (V.edit) thumbs(root);
}
ERP.page({ id: "ss-upload", title: "매입상품 등록", wide: true, roles: ["owner"], render: render, bind: bind });
})();
