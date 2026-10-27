/* 네이버 블로그 작업 (blog.naver.com/shinmy6)
   - 후보: data/blog_items.json (스마트스토어 판매중 상품 중 겨울 아이템, 팔린 상품 먼저) · 사진 = 로우나명품 상품 사진(사방넷 이미지)
   - 상품 3~5개(브랜드 추천) 또는 1개 골라 → ChatGPT 초안 → 마케팅 링크 넣기 → 발행
   - 기록: app_settings 'blog_posts' (발행한 상품은 후보에서 표시) */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, esc = U.esc, S = ERP.S;
var BLOG = "https://blog.naver.com/shinmy6", STORE = "https://smartstore.naver.com/lowna/products/";
var ROWS = null, SEL = [], V = { q: "", brand: "", page: 1, edit: null };
async function load() { if (ROWS) return ROWS; var r = await fetch("data/blog_items.json?v=1027z"); var j = await r.json(); ROWS = j.rows.map(function (a) { return { ch: a[0], code: a[1], name: a[2], cat: a[3], brand: a[4], sold: a[5] || 0, imgs: a[6] || [] }; }); return ROWS; }
function posts() { return (S.SET.blog_posts || []).slice(); }
async function savePosts(p) { await ERP.saveSetting("blog_posts", p); }
function used() { var m = {}; posts().forEach(function (p) { if (p.status === "발행") (p.items || []).forEach(function (i) { m[i.ch] = p.date; }); }); return m; }
function link(i) { return i.mkt || (STORE + i.ch); }

var PROMPT = [
  "너는 명품 편집숍 '로우나명품' 블로그 글을 쓰는 에디터야. 네이버 블로그에 올릴 겨울 상품 소개 글을 써줘.",
  "규칙:",
  "- 사실만: 아래 상품명·카테고리·브랜드에 있는 정보와, 그 브랜드/아이템에 대해 널리 알려진 일반적인 특징만 써. 소재·핏·사이즈 등 모르는 사양은 지어내지 마.",
  "- 직접 입어봤다/고객 후기 같은 체험담·후기·평점은 절대 쓰지 마(가짜 후기 금지). 가격·할인·재고 수량도 쓰지 마.",
  "- '최고', '최저가', '100% 정품 보장' 같은 과장·단정 표현 금지. 자연스럽고 읽기 쉬운 말투(~해요체).",
  "- 제목: 32자 이내, 브랜드명 + 아이템 + 겨울 키워드. 검색에 잘 걸리게.",
  "- intro: 2~3문장. outro: 1~2문장(스토어에서 자세히 볼 수 있다는 안내).",
  "- 상품마다 desc: 3~4문장, 코디·활용 팁 위주.",
  "- tags: 10개, # 없이, 띄어쓰기 없이.",
  "JSON으로만 답해: {\"title\":\"\",\"intro\":\"\",\"items\":[{\"ch\":\"\",\"head\":\"짧은 소제목\",\"desc\":\"\"}],\"outro\":\"\",\"tags\":[]}"
].join("\n");

async function draft(items) {
  var list = items.map(function (i) { return "- ch:" + i.ch + " | 브랜드:" + i.brand + " | 상품명:" + i.name + " | 카테고리:" + i.cat; }).join("\n");
  var r = await ERP.helperAsk("ai", { body: { response_format: { type: "json_object" }, messages: [{ role: "user", content: PROMPT + "\n\n상품:\n" + list }] } });
  var j = JSON.parse(r.content || "{}"), by = {}; (j.items || []).forEach(function (x) { by[String(x.ch)] = x; });
  return { id: U.uid(), date: U.today ? U.today() : new Date().toISOString().slice(0, 10), status: "초안", title: j.title || "", intro: j.intro || "", outro: j.outro || "", tags: j.tags || [],
    items: items.map(function (i) { var x = by[String(i.ch)] || {}; return { ch: i.ch, code: i.code, name: i.name, brand: i.brand, imgs: i.imgs.slice(0, 3), head: x.head || i.name, desc: x.desc || "", mkt: "" }; }) };
}
/* 블로그 본문 HTML(에디터에 붙여넣기용) */
function html(p) {
  var h = "<p>" + esc(p.intro) + "</p><p><br></p>";
  p.items.forEach(function (i, n) {
    h += "<h3>" + (p.items.length > 1 ? (n + 1) + ". " : "") + esc(i.head) + "</h3>";
    i.imgs.forEach(function (u) { h += '<p><img src="' + esc(u) + '"></p>'; });
    h += "<p>" + esc(i.desc) + "</p><p>👉 " + esc(i.name) + '<br><a href="' + esc(link(i)) + '">' + esc(link(i)) + "</a></p><p><br></p>";
  });
  return h + "<p>" + esc(p.outro) + "</p>";
}

function cands() {
  var u = used(), q = V.q.toLowerCase();
  return (ROWS || []).filter(function (r) { return (!V.brand || r.brand === V.brand) && (!q || (r.name + r.code).toLowerCase().indexOf(q) >= 0); }).map(function (r) { r.used = u[r.ch] || ""; return r; });
}
function render() {
  if (!ROWS) { load().then(function () { ERP.render(); }).catch(function (e) { ERP.toast(e.message); }); return '<p class="muted">불러오는 중…</p>'; }
  if (V.edit) return editor();
  var all = cands(), PG = 50, pages = Math.max(1, Math.ceil(all.length / PG)); if (V.page > pages) V.page = pages;
  var brands = {}; ROWS.forEach(function (r) { brands[r.brand] = (brands[r.brand] || 0) + 1; });
  var bopt = Object.keys(brands).sort(function (a, b) { return brands[b] - brands[a]; }).map(function (b) { return '<option value="' + esc(b) + '"' + (b === V.brand ? " selected" : "") + ">" + esc(b) + " (" + brands[b] + ")</option>"; }).join("");
  var P = posts();
  return '<div class="head"><div><h1>블로그 작업</h1><p>겨울 아이템 ' + ROWS.length + '개 · 상품 1~5개 골라 초안 → 마케팅 링크 → 발행 · <a href="' + BLOG + '" target="_blank" rel="noopener">blog.naver.com/shinmy6</a></p></div>' +
    '<div class="tools"><button class="btn pri" data-act="blogdraft"' + (SEL.length ? "" : " disabled") + ">선택 " + SEL.length + "개로 초안 만들기</button></div></div>" +
    (P.length ? '<h3>글 목록</h3><div class="table-wrap"><table><thead><tr><th>날짜</th><th>상태</th><th>제목</th><th>상품</th><th></th></tr></thead><tbody>' + P.slice().reverse().map(function (p) {
      return "<tr><td>" + esc(p.date) + "</td><td>" + esc(p.status) + "</td><td>" + (p.url ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + esc(p.title) + "</a>" : esc(p.title)) + "</td><td>" + p.items.length + '개</td><td><button class="btn sm" data-act="blogopen" data-id="' + esc(p.id) + '">열기</button></td></tr>'; }).join("") + "</tbody></table></div>" : "") +
    '<h3>후보</h3><div class="tools"><select class="ctl" id="bl-brand"><option value="">전체 브랜드</option>' + bopt + '</select><input class="ctl" id="bl-q" placeholder="상품명·코드 검색" value="' + esc(V.q) + '"></div>' +
    '<div class="table-wrap"><table><thead><tr><th></th><th>사진</th><th>브랜드</th><th>상품명</th><th>판매</th><th>블로그</th></tr></thead><tbody>' +
    all.slice((V.page - 1) * PG, V.page * PG).map(function (r) {
      return '<tr><td><input type="checkbox" class="bl-ck" data-ch="' + esc(r.ch) + '"' + (SEL.indexOf(r.ch) >= 0 ? " checked" : "") + ' aria-label="선택"></td><td>' + (r.imgs[0] ? '<img src="' + esc(r.imgs[0]) + '" alt="" loading="lazy" style="width:48px;height:48px;object-fit:cover;border-radius:6px">' : "") +
        "</td><td>" + esc(r.brand) + '</td><td><a href="' + STORE + esc(r.ch) + '" target="_blank" rel="noopener">' + esc(r.name) + "</a></td><td class=\"num\">" + (r.sold || "") + "</td><td>" + (r.used ? "발행 " + esc(r.used) : "") + "</td></tr>"; }).join("") +
    '</tbody></table></div><div class="tools"><button class="btn sm" data-act="blogpg" data-d="-1">‹</button><span class="muted">' + V.page + " / " + pages + '</span><button class="btn sm" data-act="blogpg" data-d="1">›</button></div>';
}
function editor() {
  var p = V.edit, w = function (l, k, v, big) { return '<div class="fd full"><label for="be-' + k + '">' + l + "</label>" + (big ? '<textarea class="ctl" rows="3" id="be-' + k + '">' + esc(v) + "</textarea>" : '<input class="ctl" id="be-' + k + '" value="' + esc(v) + '">') + "</div>"; };
  return '<div class="head"><div><h1>블로그 초안</h1><p>' + esc(p.status) + " · " + esc(p.date) + '</p></div><div class="tools"><button class="btn" data-act="blogback">목록</button><button class="btn" data-act="blogsave">저장</button><button class="btn" data-act="blogcopy">본문 복사</button>' + (p.status !== "발행" ? '<button class="btn pri" data-act="blogdone">발행 완료로 표시</button>' : "") + "</div></div>" +
    '<div class="grid2">' + w("제목", "title", p.title) + w("도입", "intro", p.intro, 1) +
    p.items.map(function (i, n) { return '<div class="fd full card"><b>' + esc(i.brand) + " · " + esc(i.name) + '</b><div>' + i.imgs.map(function (u) { return '<img src="' + esc(u) + '" alt="" style="width:90px;height:90px;object-fit:cover;margin:4px;border-radius:6px">'; }).join("") + "</div>" +
      w("소제목", "head" + n, i.head) + w("설명", "desc" + n, i.desc, 1) + w("마케팅 링크 (mkt.shopping.naver.com/link/…)", "mkt" + n, i.mkt) + "</div>"; }).join("") +
    w("마무리", "outro", p.outro, 1) + w("태그 (쉼표로 구분)", "tags", (p.tags || []).join(", ")) + w("발행 주소", "url", p.url || "") + "</div>";
}
function grab() {
  var p = V.edit, g = function (k) { var e = document.getElementById("be-" + k); return e ? e.value.trim() : ""; };
  p.title = g("title"); p.intro = g("intro"); p.outro = g("outro"); p.url = g("url"); p.tags = g("tags").split(/[,\s#]+/).filter(Boolean);
  p.items.forEach(function (i, n) { i.head = g("head" + n); i.desc = g("desc" + n); i.mkt = g("mkt" + n); });
}
async function store() { grab(); var P = posts(), k = P.findIndex(function (x) { return x.id === V.edit.id; }); if (k >= 0) P[k] = V.edit; else P.push(V.edit); await savePosts(P); }
ERP.acts.blogpg = function (b) { V.page = Math.max(1, V.page + Number(b.dataset.d)); ERP.render(); };
ERP.acts.blogdraft = async function (b) {
  var items = SEL.map(function (ch) { return ROWS.filter(function (r) { return r.ch === ch; })[0]; }).filter(Boolean);
  b.disabled = true; b.textContent = "초안 만드는 중…";
  try { V.edit = await draft(items); SEL = []; await savePosts(posts().concat([V.edit])); ERP.render(); } catch (e) { ERP.toast("초안 실패: " + e.message); b.disabled = false; }
};
ERP.acts.blogopen = function (b) { V.edit = posts().filter(function (p) { return p.id === b.dataset.id; })[0] || null; ERP.render(); };
ERP.acts.blogback = function () { V.edit = null; ERP.render(); };
ERP.acts.blogsave = async function () { await store(); ERP.render(); };
ERP.acts.blogdone = async function () { grab(); if (!V.edit.url && !confirm("발행 주소 없이 발행 완료로 표시할까요?")) return; V.edit.status = "발행"; V.edit.pubAt = new Date().toISOString(); await store(); ERP.render(); };
ERP.acts.blogcopy = async function () {
  grab(); var h = html(V.edit);
  try { await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([h], { type: "text/html" }), "text/plain": new Blob([h.replace(/<[^>]+>/g, "\n")], { type: "text/plain" }) })]); ERP.toast("본문을 복사했어요. 블로그 글쓰기에 붙여넣으세요."); } catch (e) { ERP.toast("복사 실패: " + e.message); }
};
ERP.blogHtml = html; ERP.blogPosts = posts;
function bind(root) {
  root.querySelectorAll(".bl-ck").forEach(function (c) { c.onchange = function () { var ch = c.dataset.ch, k = SEL.indexOf(ch); if (c.checked && k < 0) { if (SEL.length >= 5) { c.checked = false; ERP.toast("한 글에 5개까지예요."); return; } SEL.push(ch); } else if (!c.checked && k >= 0) SEL.splice(k, 1); ERP.render(); }; });
  var bs = root.querySelector("#bl-brand"); if (bs) bs.onchange = function () { V.brand = bs.value; V.page = 1; ERP.render(); };
  var q = root.querySelector("#bl-q"); if (q) q.onchange = function () { V.q = q.value.trim(); V.page = 1; ERP.render(); };
}
ERP.page({ id: "blog", title: "블로그 작업", wide: true, roles: ["owner", "staff", "ai"], render: render, bind: bind });
})();
