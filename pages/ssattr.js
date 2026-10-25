/* 스마트스토어 상품속성 자동입력 (사방넷 대량등록 상품 전용, 하이엔드 제외)
   - 대상: data/ss_targets.json (스마트스토어 상품엑셀의 판매자상품코드 = 사방넷 자체상품코드, 판매중) — 팔린 상품 먼저
   - 흐름: 수정 화면 열기 → 속성표 읽기 → ChatGPT가 '화면 선택지 중에서만' 고르기(확실하지 않으면 비움) → 체크/선택 → 저장 → 결과 기록
   - 이미 값이 있는 속성은 건드리지 않아요. 도우미(크롬 확장)가 2초에 1번 이하로만 조작해요.
   - 진행 기록은 이 브라우저에 저장되고, 50개마다·끝날 때 기록 파일이 자동으로 내려받아져요. */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, esc = U.esc, KEY = "rowna-ssattr-v1";
function st() { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } }
function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
var T = null, running = false, stopReq = false;
async function targets() { if (T) return T; var r = await fetch("data/ss_targets.json?v=" + Date.now()); var j = await r.json(); T = j.rows.map(function (a) { return { ch: a[0], code: a[1], name: a[2], cat: a[3], brand: a[4], sold: a[5] }; }); return T; }

function clean(x) { return String(x || "").replace(/\s+/g, " ").replace(/\s*추천$/, "").trim(); }   /* 네이버가 붙이는 '추천' 표시는 떼고 봄 */
function parseAttrs(html) {
  var doc = new DOMParser().parseFromString(html, "text/html"), out = [];
  doc.querySelectorAll("#attribute-table tr").forEach(function (tr) {
    var th = tr.querySelector("th[scope=row]"), td = tr.querySelector("td"); if (!th || !td) return;
    var name = clean(th.textContent);
    var boxes = td.querySelectorAll("label input[type=checkbox]");
    if (boxes.length) { out.push({ name: name, type: "multi", options: Array.prototype.map.call(boxes, function (b) { return clean(b.parentElement.textContent); }), selected: Array.prototype.filter.call(boxes, function (b) { return /ng-not-empty/.test(b.className) || b.hasAttribute("checked"); }).map(function (b) { return clean(b.parentElement.textContent); }) }); return; }
    var opts = td.querySelectorAll(".selectize-dropdown-content .option[data-value]");
    if (opts.length) { var cur = td.querySelector(".selectize-dropdown-content .option.selected") || td.querySelector(".selectize-input .item, .selectize-input .option"), ct = cur ? clean(cur.textContent) : ""; out.push({ name: name, type: "single", options: Array.prototype.filter.call(opts, function (o) { return o.getAttribute("data-value"); }).map(function (o) { return { id: o.getAttribute("data-value"), text: clean(o.textContent) }; }), selected: ct && ct !== "선택" ? [ct] : [] }); }
  });
  return out;
}
var PROMPT = [
  "네이버 스마트스토어 상품의 '상품속성'을 고릅니다. 각 속성의 선택지 목록에 있는 값만 고르세요(글자 그대로).",
  "목표: 속성을 최대한 많이 채우기(네이버 노출용). 단, 틀린 값은 넣지 마세요.",
  "근거: ① 렉스몬드 상품정보(제품 소재·핏·성별·계절·MD's NOTE·카테고리·실측) ② 상품명·카테고리·브랜드 ③ 이 브랜드/모델에 대한 일반적으로 알려진 사실(예: 패딩→충전재 다운, 스니커즈→끈, 후드티→후드넥, 맨투맨→라운드넥·긴팔).",
  "- 위 근거로 합리적으로 판단되는 속성은 모두 채우세요. 정말 알 수 없는 것만 빼세요(빈 배열).",
  "- 금지: 이미지를 본 것처럼 쓰기(이미지는 없음), 특정 모델 사양을 추측하기, ③은 아이템 종류의 일반 특성 수준까지만.",
  "- 출시·연식: 렉스몬드 제조연월/시즌(예: 24FW→2024년)이 있을 때만. 없으면 빼세요.",
  "- 색상: 상품명·렉스몬드 글자에 색이 있을 때만(BLACK/블랙/NAVY 등). 소재명(브라스·실버925)으로 색을 추측하지 마세요.",
  "- 소재: 여러 소재면 대표 소재 1개(겉감 비율 가장 큰 것). 안감·부자재 무시.",
  "- 네이버 기준: 무관한 속성이나 과도하게 많은 값은 노출에 불리함(스마트스토어 수정화면 안내). 그래서 속성 칸은 해당되는 것 모두 채우되, 한 칸 안에서는 대표값 1개(꼭 필요할 때만 2개). 단일선택은 1개.",
  "- 색상: 렉스몬드·상품명·품번의 색 정보(예: BLACK, 999=블랙 등 브랜드 색코드가 확실할 때)로.",
  "- 치수 속성(굽높이·기장 등): 렉스몬드 실측 숫자로 구간 선택. 숫자 없으면 일반적인 모델 사양이 확실할 때만.",
  "- 계절: 렉스몬드에 '사계절'이면 '사계절' 선택지가 있을 때만 그것을, 없으면 빼세요. 일부 계절만 골라 넣지 마세요. 렉스몬드에 계절이 없으면 아이템 특성(패딩=겨울, 반팔=여름 등)으로.",
  "- 패턴: 로고·프린트 등이 상품명/설명에 있으면 그것, 언급이 없고 단색 기본 아이템이면 '무지'.",
  "출력은 json으로: {\"pick\":{\"속성이름\":[\"값\"]},\"why\":\"한 줄(근거)\"}"
].join("\n");
/* 렉스몬드: 자체상품코드로 검색 → 1건이면 상품페이지로 바로 감. 상품정보고시·추가정보·MD노트만 잘라서 AI에 줌 */
function cut(t, a, b, n) { var i = t.indexOf(a); if (i < 0) return ""; var j = b ? t.indexOf(b, i + a.length) : -1; return t.slice(i, j > i ? Math.min(j, i + n) : i + n).trim(); }
async function rexInfo(code) {
  if (!code) return { found: false, why: "자체상품코드 없음" };
  var d = await ERP.helperAsk("page", { rexGap: 15, url: "https://www.rexmonde.com/products/list?search_keyword=" + encodeURIComponent(code), waitFor: "상품정보고시|검색결과|검색 결과|상품이 없", minLen: 300, tries: 15 });
  if (!/products\/view/.test(d.url || "")) return { found: false, why: "렉스몬드 검색결과 1건 아님" };
  var t = d.text || "", title = (d.title || "").replace(/\s*\|\s*렉스몬드\s*$/, "");
  if (code && t.indexOf(code) < 0 && title.indexOf(code) < 0) return { found: false, why: "렉스몬드 품번 불일치" };
  var info = ["상품: " + title, cut(t, "홈\n", "할인가", 300), cut(t, "추가정보", "상품 옵션", 300), cut(t, "MD’s NOTE", "상품 안내", 600) || cut(t, "MD's NOTE", "상품 안내", 600), cut(t, "상품정보고시", "품질보증기준", 700), cut(t, "렉스몬드 실측", "사이즈 선택 TIP", 400)].filter(Boolean).join("\n");
  return { found: true, url: (d.url || "").split("&")[0], info: info.slice(0, 3500) };
}
async function choose(t, attrs, rex) {
  var todo = attrs.filter(function (a) { return !a.selected.length; }).map(function (a) { return { name: a.name, type: a.type, options: a.type === "single" ? a.options.map(function (o) { return o.text; }) : a.options }; });
  if (!todo.length) return { pick: {}, why: "이미 모두 입력됨" };
  var r = await ERP.helperAsk("ai", { body: { response_format: { type: "json_object" }, messages: [{ role: "user", content: PROMPT + "\n\n상품명: " + t.name + "\n카테고리: " + t.cat + "\n브랜드: " + t.brand + "\n\n[렉스몬드 상품정보]\n" + (rex && rex.found ? rex.info : "(없음 — 상품명만으로 확실한 것만)") + "\n\n속성 목록:\n" + JSON.stringify(todo) }] } });
  var j = JSON.parse(r.content || "{}"), pick = {};
  Object.keys(j.pick || {}).forEach(function (k) { var a = attrs.filter(function (x) { return x.name === k; })[0]; if (!a || a.selected.length) return; var vals = (j.pick[k] || []).filter(function (v) { return a.type === "single" ? a.options.some(function (o) { return o.text === v; }) : a.options.indexOf(v) >= 0; }); if (a.type === "single" || /소재/.test(k)) vals = vals.slice(0, 1); else vals = vals.slice(0, 2); if (vals.length) pick[k] = vals; });
  return { pick: pick, why: j.why || "" };
}
/* ---- 태그: 네이버 태그사전에 '등록됨'인 것만, 빈 자리만 채움(최대 10개) ---- */
var TAGP = [
  "네이버 스마트스토어 '태그'(검색어) 후보를 만듭니다. 고객이 네이버쇼핑에서 실제로 검색할 만한 짧은 검색어 형태로.",
  "예(패딩): 남자패딩, 명품패딩, 남자점퍼, 명품자켓, 명품패딩자켓, 겨울패딩, 남자겨울아우터 / (니트): 남자니트, 명품니트, 남자스웨터.",
  "상품 특징과 다른 태그 금지(예: 하프집업인데 브이넥, 레귤러핏인데 오버핏). 렉스몬드 정보·상품명에 맞는 것만.",
  "규칙: 띄어쓰기 없이, 2~10글자. 브랜드명(한글·영문)·스토어명(로우나)·품번 금지. 상품과 직접 관련된 것만(성별+아이템, 명품+아이템, 스타일·소재·계절·용도+아이템, 선물용 등).",
  "서로 다른 20개를 중요한 순서로. 출력은 json으로: {\"tags\":[\"...\"]}"
].join("\n");
async function makeTags(t, rex, have) {
  var r = await ERP.helperAsk("ai", { body: { response_format: { type: "json_object" }, messages: [{ role: "user", content: TAGP + "\n\n상품명: " + t.name + "\n카테고리: " + t.cat + "\n브랜드(쓰지 말 것): " + t.brand + (rex && rex.found ? "\n렉스몬드 정보:\n" + rex.info.slice(0, 1200) : "") + (have && have.length ? "\n이미 있는 태그(제외): " + have.join(", ") : "") }] } });
  var j = JSON.parse(r.content || "{}"), b = String(t.brand || "").replace(/\s+/g, ""), seen = {};
  return (j.tags || []).map(function (x) { return String(x).replace(/[#\s]/g, ""); }).filter(function (x) { if (!x || x.length > 15 || seen[x] || (b && x.indexOf(b) >= 0) || /로우나/.test(x)) return false; seen[x] = 1; return true; });
}
var TAGSEL = "#anchor-tag .input-tag select", CHIPS = "#anchor-tag .choice-tag";
function parseChips(html) { var out = []; String(html || "").replace(/<strong[^>]*>\s*#\s*([^<]+?)\s*<\/strong>/g, function (_, t) { out.push(t.trim()); }); return out; }
function parseTagCheck(text) {
  var m = String(text || "").match(/검색 적용 태그 확인[\s\S]{0,600}?등록됨\s*([\s\S]*?)(태그사전에 등록되어 있지 않습니다|자세한 검색최적화|$)/), out = [];
  if (m) (m[1].match(/#[^#\s]+/g) || []).forEach(function (x) { out.push(x.slice(1)); });
  return out;
}
async function tagProbe(origin, cands, known) {   /* 저장하지 않는 시험: 빈 자리 수만큼 후보를 넣고 [검색에 적용되는 태그 확인] */
  var have = known;
  if (!have) {
    var r = await ERP.helperAsk("act", { url: editUrl(origin), ops: [{ op: "waitText", text: "상품속성", ms: 30000, gap: 0 }, { op: "wait", ms: 800 },
      { op: "click", sel: "#anchor-tag .title-line" }, { op: "wait", ms: 1200 }, { op: "html", sel: CHIPS, max: 20000 }] });
    have = parseChips((r.results[4] || {}).html);
  }
  var slots = 10 - have.length;
  if (slots <= 0 || !cands.length) return { have: have, reg: [] };
  var reg = [], pool = cands.filter(function (x) { return have.indexOf(x) < 0; });
  for (var round = 0; round < 2 && pool.length && reg.length < (round === 0 ? slots : Math.min(5, slots)); round++) {   /* 2번째 확인은 5개도 못 건졌을 때만 */
    var batch = pool.splice(0, slots);
    var q = await ERP.helperAsk("act", { url: editUrl(origin), ops: [{ op: "waitText", text: "상품속성", ms: 30000, gap: 0 }, { op: "wait", ms: 800 },
      { op: "click", sel: "#anchor-tag .title-line" }, { op: "wait", ms: 1200 },
      { op: "selzAdd", sel: TAGSEL, values: batch, max: 10, mode: "create", chips: CHIPS + " .choice-label" }, { op: "click", sel: '[data-nclicks-code="sch.tagcheck"]' }, { op: "wait", ms: 2500 }, { op: "text" }] });
    parseTagCheck((q.results[7] || {}).text).forEach(function (x) { if (batch.indexOf(x) >= 0 && reg.indexOf(x) < 0) reg.push(x); });
  }
  return { have: have, reg: reg.slice(0, slots) };
}
/* 원상품번호를 몰라도: 상품 조회/수정 목록에서 채널상품번호로 검색 → [수정] 클릭 → 수정 화면으로 이동 (주소에서 원상품번호를 알아냄) */
function viaSearchOps(ch) { return [{ op: "waitText", text: "상품목록", ms: 30000, gap: 0 }, { op: "wait", ms: 1500 },
  { op: "fill", sel: 'textarea[ng-model="vm.searchFormData.searchKeyword"]', value: String(ch) }, { op: "click", text: "검색", sel: null }, { op: "wait", ms: 3500 },
  { op: "click", sel: 'button[data-nclicks-code="itg.edit"]', retry: 8 },
  { op: "waitText", text: "상품속성", ms: 30000 }, { op: "wait", ms: 1500 }, { op: "html", sel: "#attribute-table", max: 200000 }, { op: "text" }]; }
async function readViaSearch(ch) {
  var r = await ERP.helperAsk("act", { url: "https://sell.smartstore.naver.com/#/products/origin-list", visible: true, ops: viaSearchOps(ch) });
  var res = r.results, last = res[res.length - 1] || {}, url = last.url || "", origin = (url.match(/products\/edit\/(\d+)/) || [])[1];
  if (!origin) throw new Error("목록에서 수정 화면으로 못 들어감 (" + res.map(function (x, i) { return x && !x.ok ? i + ":" + (x.error || "실패") : ""; }).filter(Boolean).join(", ") + ")");
  return { origin: origin, attrs: parseAttrs((res[res.length - 2] || {}).html || ""), text: last.text || "" };
}
function editUrl(origin) { return "https://sell.smartstore.naver.com/#/products/edit/" + origin; }
async function readPage(origin) {
  var r = await ERP.helperAsk("act", { url: editUrl(origin), ops: [{ op: "waitText", text: "상품속성", ms: 30000, gap: 0 }, { op: "wait", ms: 800 }, { op: "html", sel: "#attribute-table", max: 200000 }, { op: "text" },
    { op: "click", sel: "#anchor-tag .title-line" }, { op: "wait", ms: 1200 }, { op: "html", sel: "#anchor-tag", max: 60000 }] });
  var ok = r.results[0] && r.results[0].ok, html = r.results[2] && r.results[2].html || "", text = (r.results[3] && r.results[3].text) || "";
  if (!ok) throw new Error(/존재하지|없는 상품/.test(text) ? "수정 화면 없음(번호 확인 필요)" : "상품속성 화면을 못 찾음");
  var tagHtml = (r.results[6] && r.results[6].ok && r.results[6].html) || null;   /* 태그 칸을 열어 기존 태그도 같이 읽음(페이지 한 번 덜 엶) */
  return { attrs: html ? parseAttrs(html) : [], text: text, have: tagHtml !== null ? parseChips(tagHtml) : null };
}
async function writePage(origin, attrs, pick, tags) {
  var opt = [];   /* '추천' 표시 유무에 따라 하나만 맞으면 되는 체크들 */
  var ops = [{ op: "waitText", text: "상품속성", ms: 30000, gap: 0 }, { op: "wait", ms: 800 },
    /* 2~7: 상세설명 스마트에디터 ONE 변환 → 뜬 창에서 [등록] (이미 변환된 상품은 버튼이 없어 자동으로 건너뜀) */
    { op: "click", text: "으로 변환하기 (1회성)" }, { op: "switchNew", ms: 12000, urlHas: "editor", need: 2 },
    { op: "waitText", text: "등록", ms: 25000, frames: true, need: 3, gap: 6000 }, { op: "click", sel: "button.progress-button", frames: true, need: 4, gap: 2500 },
    { op: "closed", ms: 20000, need: 5 }, { op: "switchBack" }, { op: "wait", ms: 3000 }];
  Object.keys(pick).forEach(function (k) { var a = attrs.filter(function (x) { return x.name === k; })[0];
    pick[k].forEach(function (v) {
      if (a.type === "multi") { [v, v + " 추천", v + "추천"].forEach(function (vv) { opt.push(ops.length); ops.push({ op: "check", near: k, value: vv }); }); }
      else { var o = a.options.filter(function (x) { return x.text === v; })[0]; ops.push({ op: "click", within: k, sel: ".selectize-input" }); ops.push({ op: "click", within: k, sel: '.selectize-dropdown-content .option[data-value="' + o.id + '"]' }); }
    }); });
  if (tags && tags.length) { opt.push(ops.length); ops.push({ op: "click", sel: "#anchor-tag .title-line" }); opt.push(ops.length); ops.push({ op: "wait", ms: 1200 }); opt.push(ops.length); ops.push({ op: "selzAdd", sel: TAGSEL, values: tags, max: 10, mode: "create", chips: CHIPS + " .choice-label" }); opt.push(ops.length); ops.push({ op: "html", sel: CHIPS, max: 20000, tagChips: 1 }); }
  ops.push({ op: "html", sel: "#attribute-table", max: 200000 });
  ops.push({ op: "click", text: "저장하기" }, { op: "wait", ms: 5000 }, { op: "text" });
  var r = await ERP.helperAsk("act", { url: editUrl(origin), ops: ops });
  var res = r.results, before = res.length - 4, after = parseAttrs((res[before] || {}).html || "");
  var applied = Object.keys(pick).every(function (k) { var a = after.filter(function (x) { return x.name === k; })[0]; return a && pick[k].every(function (v) { return a.selected.indexOf(v) >= 0; }); });
  var t1 = "", t2 = (res[res.length - 1] || {}).text || "";
  var conv = !res[2].ok ? "변환 버튼 없음(이미 변환)" : res[6] && res[6].ok ? "변환 완료" : "변환 실패(" + [3, 4, 5, 6].map(function (i) { return res[i] && !res[i].ok && !res[i].skipped ? i + ":" + (res[i].error || "실패") : ""; }).filter(Boolean).join(",") + ")";
  var ti = -1; ops.forEach(function (o, i) { if (o.tagChips) ti = i; });
  return { tagsNow: ti >= 0 && res[ti] ? parseChips(res[ti].html) : null, dialogs: r.dialogs || [], conv: conv, applied: applied, opsFailed: res.filter(function (x, i) { return x && !x.ok && !x.skipped && (i < 2 || i > 8) && opt.indexOf(i) < 0; }).map(function (x) { return x.error; }), saveMsg: ((t1 + "\n" + t2).match(/[^\n]*(수정되었|저장되었|완료되었|오류|실패|입력해 주세요|확인해 주세요)[^\n]*/g) || []).slice(0, 4) };
}
function log(s, row) { s.log = (s.log || []).concat([row]).slice(-3000); save(s); }
function dl(s, tag) { var rows = (s.log || []).map(function (x) { return [x.at, x.ch, x.origin || "", x.status, x.name, JSON.stringify(x.pick || {}), x.why || "", x.rex || "", x.conv || "", (x.tags || []).join(" "), (x.tagsNow || []).join(" "), (x.err || "") + (x.saveMsg ? " " + x.saveMsg.join(" / ") : "")].map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(","); });
  ERP.downloadBlob("스마트스토어_속성입력기록_" + tag + ".csv", new Blob(["﻿시각,채널상품번호,원상품번호,결과,상품명,넣은속성,AI메모,렉스몬드,에디터변환,추가태그,저장후태그,오류/저장메시지\n" + rows.join("\n")], { type: "text/csv" })); }

async function one(t, s, opts) {
  var origin = (s.map || {})[t.ch] || t.origin; var row = { at: new Date().toISOString(), ch: t.ch, origin: origin, name: t.name };
  try {
    var p;
    if (origin) p = await readPage(origin);
    else { p = await readViaSearch(t.ch); origin = row.origin = p.origin; s.map = s.map || {}; s.map[t.ch] = origin; save(s); }
    var needConv = /으로 변환하기/.test(p.text || ""), c = { pick: {}, why: "속성칸 없음" }, rex = null;
    if (p.attrs.length && p.attrs.some(function (a) { return !a.selected.length; })) {
      rex = await rexInfo(t.code); row.rex = rex.found ? rex.url : "못 찾음(" + rex.why + ")";
      c = await choose(t, p.attrs, rex);
    }
    row.pick = c.pick; row.why = c.why; row.v = 5;
    var tp = { have: [], reg: [] };
    try { var cands = await makeTags(t, typeof rex !== "undefined" ? rex : null, []); tp = await tagProbe(origin, cands, p.have); } catch (e) { row.tagErr = e.message; }
    row.tags = tp.reg; row.tagsHad = tp.have.length;
    if (!Object.keys(c.pick).length && !needConv && !tp.reg.length) { row.status = "할 일 없음(이미 입력·변환됨)"; return row; }
    if (opts.dry) { row.status = "미리보기(저장 안 함)"; return row; }
    var w = await writePage(origin, p.attrs, c.pick, tp.reg); row.tagsNow = w.tagsNow; row.saveMsg = w.saveMsg; row.conv = w.conv; if (w.dialogs.length) row.saveMsg = w.dialogs.concat(row.saveMsg || []);
    var convBad = needConv && w.conv !== "변환 완료";
    row.status = w.applied && !w.opsFailed.length && !convBad ? "저장 완료" : "일부 실패"; if (w.opsFailed.length) row.err = w.opsFailed.join(" / ");
  } catch (e) { row.status = "실패"; row.err = e.message; if (/멈춤|멈췄/.test(e.message)) stopReq = true; }
  return row;
}
/* 첫 실행: 시험 상품 1개(발렌티노 크로스백 원상품번호 12652259462) + 상품목록 화면 구조 진단 */
ERP.acts.ssattrtest = async function () {
  if (!(ERP.helperOn && ERP.helperOn())) { ERP.toast("크롬 확장 ‘로우나 도우미’가 꺼져 있어요."); return; }
  var s = st(), all = await targets();
  ERP.toast("시험 2개(메종키츠네 니트·클락스 슬리퍼): 렉스몬드 확인 → 스마트에디터 ONE 변환 → 속성 저장. 약 3~5분, 끝나면 기록 파일이 자동으로 받아져요.");
  var out = [];
  for (var ch of ["12346633813", "11752408632"]) { var t = all.filter(function (x) { return x.ch === ch; })[0]; if (!t) { out.push(ch + ": 대상 목록에 없음"); continue; } var row = await one(t, s, {}); log(s, row); out.push(row.status + (row.conv ? "/" + row.conv : "") + (row.err ? " — " + row.err : "")); ERP.render(); }
  dl(s, "시험2"); ERP.toast("시험 결과: " + out.join(" | ")); ERP.render();
};

/* 전체 실행: 팔린 상품부터 차례로. 이미 처리한 상품은 건너뜀. 50개마다 기록 파일 자동 저장. */
ERP.acts.ssattrrun = async function (btn) {
  if (running) { ERP.toast("이미 진행 중이에요."); return; }
  if (!(ERP.helperOn && ERP.helperOn())) { ERP.toast("크롬 확장 ‘로우나 도우미’가 꺼져 있어요."); return; }
  var lim = Number((btn && btn.dataset && btn.dataset.limit) || 0) || Infinity;
  running = true; stopReq = false; var s = st(), done = {}; (s.log || []).forEach(function (x) { if (x.v >= 2 && /저장 완료|할 일 없음/.test(x.status)) done[x.ch] = Math.max(done[x.ch] || 0, x.v); });
  var SHOE = /신발|화$|화>|샌들|슬리퍼|부츠|힐|로퍼|스니커즈|뮬|플랫/;   /* 신발은 굽높이 규칙(v3) 전에 한 것을 한 번 더 봄 */
  var list = (await targets()).filter(function (t) { var d = done[t.ch] || 0; return !(d >= 5); }), n = 0, fails = 0;
  if (btn && btn.dataset && btn.dataset.redo) { list = (await targets()).filter(function (t) { return (done[t.ch] || 0) > 0 && done[t.ch] < 5; }); }   /* 예전 기준으로 한 상품의 빈 칸 다시 채우기 */
  if (btn && btn.dataset && btn.dataset.sold) { list = list.filter(function (t) { return t.sold > 0; }); lim = Infinity; }
  ERP.toast("상품속성 자동입력 시작: 남은 " + list.length + "개 중 " + (lim === Infinity ? "전부" : lim + "개"));
  for (var i = 0; i < list.length && n < lim && !stopReq; i++) {
    var row = await one(list[i], s, {}); log(s, row); n++; ERP.render();
    fails = row.status === "실패" ? fails + 1 : 0;
    if (fails >= 5) { ERP.toast("⚠ 5개 연속 실패라 멈췄어요. 기록을 확인해 주세요."); break; }
    if (n === 3 || n % 25 === 0) dl(s, new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-"));
  }
  running = false; dl(s, "끝_" + new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")); ERP.toast("상품속성 자동입력: " + n + "개 처리했어요."); ERP.render();
  return { n: n, left: list.length - i, failStop: fails >= 5, stopped: stopReq };
};
/* 끝까지 자동: 이전 상품 빈 칸·태그 → 나머지 전체. 연속 실패(로그인 풀림 등)면 1분 쉬고 다시, 최대 30번 */
var autoOn = false, MYID = Math.random().toString(36).slice(2);
function lockOk() {   /* ERP 탭이 여러 개 열려도 한 탭만 돌게 */
  try { var l = JSON.parse(localStorage.getItem("rowna-ssattr-lock") || "null"); return !l || l.id === MYID || Date.now() - l.ts > 120000; } catch (e) { return true; }
}
function lockBeat() { try { localStorage.setItem("rowna-ssattr-lock", JSON.stringify({ id: MYID, ts: Date.now() })); } catch (e) {} }
ERP.acts.ssattrauto = async function () {
  if (autoOn) { ERP.toast("이미 자동 진행 중이에요."); return; }
  if (!lockOk()) { ERP.toast("다른 ERP 탭에서 이미 자동 진행 중이라 이 탭은 쉬어요."); return; }
  lockBeat(); var beat = setInterval(lockBeat, 30000);
  autoOn = true; var tries = 0;
  try {
    for (;;) {
      if (!(ERP.helperOn && ERP.helperOn())) { ERP.toast("로우나 도우미 연결을 기다리는 중…"); await new Promise(function (r) { setTimeout(r, 60000); }); continue; }
      var redo = await ERP.acts.ssattrrun({ dataset: { redo: "1" } });
      if (redo && redo.stopped) break;
      if (redo && redo.failStop) { if (++tries > 30) break; ERP.toast("연속 실패라 1분 쉬고 다시 해요(스마트스토어 로그인이 풀렸으면 로그인해 주세요)."); await new Promise(function (r) { setTimeout(r, 60000); }); continue; }
      var full = await ERP.acts.ssattrrun({ dataset: {} });
      if (full && full.stopped) break;
      if (full && full.failStop) { if (++tries > 30) break; ERP.toast("연속 실패라 1분 쉬고 다시 해요(스마트스토어 로그인이 풀렸으면 로그인해 주세요)."); await new Promise(function (r) { setTimeout(r, 60000); }); continue; }
      if (full && full.left <= 0) break;
    }
  } finally { autoOn = false; clearInterval(beat); }
};
setTimeout(function () { if (/[?&]auto=1/.test(location.search) && /ss-attr/.test(location.hash)) { var k = 0, iv = setInterval(function () { if ((ERP.helperOn && ERP.helperOn()) || ++k > 60) { clearInterval(iv); ERP.acts.ssattrauto(); } }, 2000); } }, 3000);
ERP.acts.ssattrstop = function () { stopReq = true; ERP.toast("지금 상품까지만 하고 멈춰요."); };
function render() {
  var s = st(), L = s.log || [], cnt = {}; L.forEach(function (x) { cnt[x.status] = (cnt[x.status] || 0) + 1; });
  return '<div class="head"><div><h1>스마트스토어 상품속성</h1><p>사방넷 대량등록 상품(하이엔드 제외) 6,826개의 상품속성을 자동으로 채워요 · 팔린 상품 먼저</p></div><div class="tools"><button class="btn" data-act="ssattrtest">시험 실행</button><button class="btn pri" data-act="ssattrrun" data-sold="1">팔린 상품 181개 실행</button><button class="btn" data-act="ssattrrun">전체 실행</button><button class="btn" data-act="ssattrrun" data-redo="1">이전 상품 빈 칸·태그 채우기</button><button class="btn pri" data-act="ssattrauto">끝까지 자동</button><button class="btn" data-act="ssattrstop">멈추기</button></div></div>' +
    '<div class="tiles">' + Object.keys(cnt).map(function (k) { return ERP.tile(esc(k), cnt[k] + "개", ""); }).join("") + "</div>" +
    '<div class="table-wrap"><table><thead><tr><th>시각</th><th>채널번호</th><th>결과</th><th>상품명</th><th>넣은 속성</th><th>메모</th></tr></thead><tbody>' + L.slice(-50).reverse().map(function (x) { return "<tr><td class=num>" + esc((x.at || "").slice(5, 16).replace("T", " ")) + "</td><td class=num>" + esc(x.ch) + "</td><td>" + esc(x.status) + "</td><td class=name>" + esc(x.name) + "</td><td>" + esc(Object.keys(x.pick || {}).map(function (k) { return k + ": " + x.pick[k].join(","); }).join(" · ")) + "</td><td><small>" + esc((x.tags && x.tags.length ? "[태그+" + x.tags.length + ": " + x.tags.join(",") + "] " : "") + (x.conv ? "[" + x.conv + "] " : "") + (x.rex ? "[렉스몬드 " + (/^http/.test(x.rex) ? "확인" : x.rex) + "] " : "") + (x.err || "") + " " + (x.saveMsg || []).slice(0, 1).join(" / ")) + "</small></td></tr>"; }).join("") + "</tbody></table></div>";
}
ERP.page({ id: "ss-attr", title: "스마트스토어 속성", roles: ["owner", "staff", "ai"], render: render, bind: function () {} });
})();
