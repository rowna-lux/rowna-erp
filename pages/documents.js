/* 메뉴: 증빙 보관함 (인보이스·영수증·수입신고필증·세금계산서·보증서) */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, C = ERP.C, esc = U.esc, won = U.won, num = U.num;
var KINDS = ["인보이스", "영수증", "수입신고필증", "세금계산서", "보증서·감정서", "기타"];
var v = ERP.view; v.docKind = v.docKind || ""; v.docQ = v.docQ || "";

/* 매입·매출 입력창 안에 들어가는 '증빙' 칸 */
ERP.docsBlock = function (type, id, itemCode) {
  var ds = ERP.docsFor(type, id), more = itemCode ? ERP.list("documents").filter(function (d) { return !(d.linkedType === type && d.linkedId === id) && d.itemCode && U.norm(d.itemCode) === U.norm(itemCode); }) : [];
  var btn = function (d) { return '<button type="button" class="btn sm" data-doc="' + esc(d.id) + '">' + esc(d.kind) + " · " + esc(d.title || d.fileName || "") + "</button>"; };
  return '<div class="sect">증빙 (인보이스·영수증·수입신고필증)</div><div class="linked">' + (ds.length ? ds.map(btn).join("") : '<span class="note" style="margin:0">아직 붙인 증빙이 없어요.</span>') +
    (more.length ? '<span class="note" style="margin:4px 0 0">같은 품번의 다른 증빙</span>' + more.slice(0, 5).map(btn).join("") : "") +
    (ERP.canWrite("documents") ? '<button type="button" class="btn sm pri" data-adddoc="' + type + ":" + esc(id) + '" data-item="' + esc(itemCode || "") + '">+ 증빙 붙이기</button>' : "") + "</div>";
};
ERP.bindDocLinks = function (root) {
  root.querySelectorAll("[data-doc]").forEach(function (b) { b.onclick = function () { var d = ERP.DATA.documents.get(b.dataset.doc); if (d) open(d); }; });
  root.querySelectorAll("[data-adddoc]").forEach(function (b) { b.onclick = function () { var t = b.dataset.adddoc.split(":"); open(null, { linkedType: t[0], linkedId: t.slice(1).join(":"), itemCode: b.dataset.item }); }; });
};

function render() {
  var q = v.docQ.trim().toLowerCase(), w = ERP.canWrite("documents"), all = ERP.list("documents");
  var list = all.filter(function (d) { if (v.docKind && d.kind !== v.docKind) return false; if (q && ((d.title || "") + " " + (d.vendor || "") + " " + (d.itemCode || "") + " " + (d.fileName || "") + " " + (d.memo || "")).toLowerCase().indexOf(q) === -1) return false; return true; })
    .sort(function (a, b) { return String(b.docDate || b.createdAt || "").localeCompare(String(a.docDate || a.createdAt || "")); });
  var by = {}; all.forEach(function (d) { by[d.kind] = (by[d.kind] || 0) + 1; });
  var noDoc = ERP.list("purchases").filter(function (p) { return p.status !== "cancelled" && !ERP.docsFor("purchase", p.id).length; }).length;
  var h = '<div class="head"><div><h1>증빙 보관함</h1><p>인보이스·영수증·수입신고필증을 상품별로 모아 둬요 · 가품 문의가 오면 품번으로 바로 찾아요</p></div><div class="tools">' + (w ? '<button class="btn pri" data-act="newdoc">+ 증빙 올리기</button>' : "") + "</div></div>";
  h += '<div class="tiles">' + ERP.tile("보관 중인 증빙", all.length + "건", KINDS.filter(function (k) { return by[k]; }).map(function (k) { return k + " " + by[k]; }).join(" · ")) + ERP.tile("증빙 없는 매입", noDoc + "건", "매입·재고에서 상품을 열어 붙일 수 있어요") + "</div>";
  h += '<div class="tools filters">' + ERP.chips("data-view", "docKind=" + v.docKind, [["docKind=", "전체"]].concat(KINDS.map(function (k) { return ["docKind=" + k, k]; }))) + '<input class="ctl search" data-search="docQ" type="search" aria-label="검색" placeholder="품번·거래처·제목" value="' + esc(v.docQ) + '"></div>';
  return h + (list.length ? '<div class="docs">' + list.map(function (d) {
    var link = d.linkedType === "purchase" ? ERP.DATA.purchases.get(d.linkedId) : d.linkedType === "sale" ? ERP.DATA.sales.get(d.linkedId) : null;
    return '<button type="button" class="doc" data-doc="' + esc(d.id) + '"><div class="k"><span class="pill p-acc">' + esc(d.kind) + '</span><small class="num">' + esc(d.docDate || "") + "</small></div><b>" + esc(d.title || d.fileName || "제목 없음") + "</b><small>" + esc([d.vendor, d.itemCode, d.amount != null ? won(d.amount) + "원" : ""].filter(Boolean).join(" · ")) + "</small><small>" + (link ? "연결: " + esc(d.linkedType === "purchase" ? "매입 " + (link.date || "") + " " + (link.itemCode || "") : "매출 " + (link.date || "") + " " + ERP.platName(link.platformId)) : "연결 안 됨") + "</small></button>";
  }).join("") + "</div>" : '<div class="panel empty"><b>보관된 증빙이 없어요</b>' + (w ? "‘증빙 올리기’로 PDF·사진을 올리세요. 폰에서는 카메라로 바로 찍어 올릴 수 있어요." : "") + "</div>");
}
function bind(root) { ERP.bindDocLinks(root); }

function open(d, preset) {
  var isNew = !d, fd = ERP.fd, sel = ERP.sel; preset = preset || {};
  d = d || { id: "", kind: "인보이스", title: "", docDate: U.today(), vendor: "", amount: "", itemCode: preset.itemCode || "", linkedType: preset.linkedType || "", linkedId: preset.linkedId || "", memo: "" };
  var purch = ERP.list("purchases").filter(function (p) { return p.id === d.linkedId || p.status !== "cancelled"; }).sort(function (a, b) { return b.date.localeCompare(a.date); }).slice(0, 400);
  var f = (isNew ? '<div class="drop" id="drop" tabindex="0" role="button">파일을 끌어다 놓거나 눌러서 선택하세요<br><small>PDF · JPG · PNG · 최대 50MB</small><input type="file" id="doc-file" accept="image/*,application/pdf" hidden></div><p class="note" id="file-name"></p>' : '<div class="tools"><button type="button" class="btn sm" id="doc-open">새 창에서 열기</button><button type="button" class="btn sm" id="doc-dl">내려받기</button></div><div class="preview-file" id="doc-prev"></div>') +
    '<div class="fg" style="margin-top:12px">' + sel("종류", "kind", KINDS, d.kind) + fd("문서 날짜", "docDate", "date", d.docDate) + fd("제목", "title", "text", d.title, "full") + fd("거래처", "vendor", "text", d.vendor) + fd("금액", "amount", "number", d.amount) + fd("품번", "itemCode", "text", d.itemCode) +
    '<div class="fd full"><label for="i-linkedId">연결할 매입 상품</label><select id="i-linkedId" name="linkedId"><option value="">연결 안 함</option>' + purch.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === d.linkedId && d.linkedType !== "sale" ? " selected" : "") + ">" + esc(p.date + " · " + (p.itemCode || "") + " " + (p.option || "") + " · " + won(C.effCost(p))) + "</option>"; }).join("") + (d.linkedType === "sale" && d.linkedId ? '<option value="sale:' + esc(d.linkedId) + '" selected>매출 연결 유지</option>' : "") + "</select></div>" + fd("메모", "memo", "text", d.memo, "full") + "</div>";
  ERP.openDrawer(isNew ? "증빙 올리기" : "증빙", f, "documents", d, isNew, { saveLabel: isNew ? "올리기" : "저장" });
}
async function openFile(d, mode) {
  if (!d.filePath) { if (mode !== "inline") ERP.toast("파일이 없어요."); return; }
  var res = await S.sb.storage.from("evidence").createSignedUrl(d.filePath, 600, mode === "download" ? { download: d.fileName || true } : undefined);
  if (res.error) { ERP.toast(ERP.errMsg(res.error)); return; }
  var url = res.data.signedUrl;
  if (mode === "inline") { var pv = U.$("doc-prev"); if (!pv) return; if (/^image\//.test(d.fileType || "")) pv.innerHTML = '<img src="' + esc(url) + '" alt="' + esc(d.title || "증빙 이미지") + '">'; else if (/pdf/.test(d.fileType || "")) pv.innerHTML = '<iframe src="' + esc(url) + '" title="' + esc(d.title || "증빙 PDF") + '"></iframe>'; return; }
  var a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
}
function safeName(n) { var ext = (n.match(/\.[A-Za-z0-9]+$/) || [""])[0].toLowerCase(); return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8) + ext; }
ERP.forms.documents = {
  open: open,
  afterOpen: function (body, d, isNew) {
    var st = ERP.drawer();
    if (isNew) {
      var drop = U.$("drop"), inp = U.$("doc-file");
      var pick = function (file) { if (file.size > 50 * 1024 * 1024) { ERP.toast("50MB 이하 파일만 올릴 수 있어요."); return; } st.file = file; U.$("file-name").textContent = "선택한 파일: " + file.name + " (" + Math.round(file.size / 1024) + "KB)"; var t = body.querySelector("#i-title"); if (!t.value) t.value = file.name.replace(/\.[^.]+$/, ""); };
      drop.onclick = function () { inp.click(); }; drop.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inp.click(); } };
      drop.ondragover = function (e) { e.preventDefault(); drop.classList.add("over"); }; drop.ondragleave = function () { drop.classList.remove("over"); };
      drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]); };
      inp.onchange = function () { if (inp.files[0]) pick(inp.files[0]); };
    } else { openFile(d, "inline"); U.$("doc-open").onclick = function () { openFile(d, "tab"); }; U.$("doc-dl").onclick = function () { openFile(d, "download"); }; }
  },
  commit: async function (body, o, st) {
    if (o.linkedId && /^sale:/.test(o.linkedId)) { o.linkedType = "sale"; o.linkedId = o.linkedId.slice(5); }
    else if (o.linkedId) { o.linkedType = "purchase"; var lp = ERP.DATA.purchases.get(o.linkedId); if (lp && !o.itemCode) o.itemCode = lp.itemCode || ""; }
    else { o.linkedType = null; o.linkedId = null; }
    if (!st.isNew) { if (await ERP.save("documents", o)) { ERP.toast("증빙 정보를 저장했어요."); return true; } return false; }
    if (!st.file) throw new Error("올릴 파일을 선택해 주세요.");
    var dt = new Date(), path = dt.getFullYear() + "/" + U.p2(dt.getMonth() + 1) + "/" + safeName(st.file.name);
    ERP.sync("busy", "파일 올리는 중");
    var up = await S.sb.storage.from("evidence").upload(path, st.file, { contentType: st.file.type || undefined, upsert: false });
    if (up.error) throw up.error;
    o.filePath = path; o.fileName = st.file.name; o.fileType = st.file.type || ""; delete o.id;
    var ins = await S.sb.from("documents").insert(ERP.toRow("documents", o)).select().single();
    if (ins.error) { await S.sb.storage.from("evidence").remove([path]); throw ins.error; }
    ERP.applyRow("documents", ins.data); ERP.sync("ok", "저장됨"); ERP.toast("증빙을 올렸어요."); return true;
  },
  remove: async function (rec) { if (rec.filePath) await S.sb.storage.from("evidence").remove([rec.filePath]); return ERP.remove("documents", rec.id); }
};
ERP.acts.newdoc = function () { open(); };
ERP.page({ id: "documents", title: "증빙 보관함", render: render, bind: bind });
})();
