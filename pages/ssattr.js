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

function parseAttrs(html) {
  var doc = new DOMParser().parseFromString(html, "text/html"), out = [];
  doc.querySelectorAll("#attribute-table tr").forEach(function (tr) {
    var th = tr.querySelector("th[scope=row]"), td = tr.querySelector("td"); if (!th || !td) return;
    var name = th.textContent.replace(/\s+/g, " ").trim();
    var boxes = td.querySelectorAll("label input[type=checkbox]");
    if (boxes.length) { out.push({ name: name, type: "multi", options: Array.prototype.map.call(boxes, function (b) { return b.parentElement.textContent.trim(); }), selected: Array.prototype.filter.call(boxes, function (b) { return /ng-not-empty/.test(b.className) || b.hasAttribute("checked"); }).map(function (b) { return b.parentElement.textContent.trim(); }) }); return; }
    var opts = td.querySelectorAll(".selectize-dropdown-content .option[data-value]");
    if (opts.length) { var cur = td.querySelector(".selectize-dropdown-content .option.selected") || td.querySelector(".selectize-input .item, .selectize-input .option"), ct = cur ? cur.textContent.trim() : ""; out.push({ name: name, type: "single", options: Array.prototype.filter.call(opts, function (o) { return o.getAttribute("data-value"); }).map(function (o) { return { id: o.getAttribute("data-value"), text: o.textContent.trim() }; }), selected: ct && ct !== "선택" ? [ct] : [] }); }
  });
  return out;
}
var PROMPT = [
  "네이버 스마트스토어 상품의 '상품속성'을 고릅니다. 각 속성의 선택지 목록에 있는 값만 고르세요(글자 그대로).",
  "근거 우선순위: ① 렉스몬드 상품정보(제품 소재·핏·성별·계절·MD's NOTE·카테고리) ② 상품명·카테고리·브랜드. 근거가 없으면 그 속성은 빼세요(빈 배열). 틀린 속성은 노출에 불리합니다.",
  "- 소재: 여러 소재가 섞여 있으면 대표 소재 1개만(겉감 기준 비율이 가장 큰 것). 안감·부자재는 무시.",
  "- 다중선택(multi)은 꼭 맞는 1~2개만(소재는 1개). 단일선택(single)은 1개.",
  "- 색상은 렉스몬드나 상품명에 색이 분명히 적혀 있을 때만. 핏·계절·성별은 렉스몬드에 적힌 그대로 맞는 값.",
  "- '해당없음'·'장식없음'·'무지' 같은 값은 확실할 때만.",
  "- 계절: 렉스몬드에 '사계절'이면 선택지에 '사계절'이 있을 때만 그것을, 없으면 계절 속성은 빼세요. 일부 계절만 골라 넣지 마세요.",
  "출력은 json으로: {\"pick\":{\"속성이름\":[\"값\"]},\"why\":\"한 줄(근거)\"}"
].join("\n");
/* 렉스몬드: 자체상품코드로 검색 → 1건이면 상품페이지로 바로 감. 상품정보고시·추가정보·MD노트만 잘라서 AI에 줌 */
function cut(t, a, b, n) { var i = t.indexOf(a); if (i < 0) return ""; var j = b ? t.indexOf(b, i + a.length) : -1; return t.slice(i, j > i ? Math.min(j, i + n) : i + n).trim(); }
async function rexInfo(code) {
  if (!code) return { found: false, why: "자체상품코드 없음" };
  var d = await ERP.helperAsk("page", { url: "https://www.rexmonde.com/products/list?search_keyword=" + encodeURIComponent(code), waitFor: "상품정보고시|검색결과|검색 결과|상품이 없", minLen: 300, tries: 15 });
  if (!/products\/view/.test(d.url || "")) return { found: false, why: "렉스몬드 검색결과 1건 아님" };
  var t = d.text || "", title = (d.title || "").replace(/\s*\|\s*렉스몬드\s*$/, "");
  if (code && t.indexOf(code) < 0 && title.indexOf(code) < 0) return { found: false, why: "렉스몬드 품번 불일치" };
  var info = ["상품: " + title, cut(t, "홈\n", "할인가", 300), cut(t, "추가정보", "상품 옵션", 300), cut(t, "MD’s NOTE", "상품 안내", 600) || cut(t, "MD's NOTE", "상품 안내", 600), cut(t, "제품 소재", "세탁 방법", 500)].filter(Boolean).join("\n");
  return { found: true, url: (d.url || "").split("&")[0], info: info.slice(0, 2500) };
}
async function choose(t, attrs, rex) {
  var todo = attrs.filter(function (a) { return !a.selected.length; }).map(function (a) { return { name: a.name, type: a.type, options: a.type === "single" ? a.options.map(function (o) { return o.text; }) : a.options }; });
  if (!todo.length) return { pick: {}, why: "이미 모두 입력됨" };
  var r = await ERP.helperAsk("ai", { body: { response_format: { type: "json_object" }, messages: [{ role: "user", content: PROMPT + "\n\n상품명: " + t.name + "\n카테고리: " + t.cat + "\n브랜드: " + t.brand + "\n\n[렉스몬드 상품정보]\n" + (rex && rex.found ? rex.info : "(없음 — 상품명만으로 확실한 것만)") + "\n\n속성 목록:\n" + JSON.stringify(todo) }] } });
  var j = JSON.parse(r.content || "{}"), pick = {};
  Object.keys(j.pick || {}).forEach(function (k) { var a = attrs.filter(function (x) { return x.name === k; })[0]; if (!a || a.selected.length) return; var vals = (j.pick[k] || []).filter(function (v) { return a.type === "single" ? a.options.some(function (o) { return o.text === v; }) : a.options.indexOf(v) >= 0; }); if (a.type === "single" || /소재/.test(k)) vals = vals.slice(0, 1); else vals = vals.slice(0, 2); if (vals.length) pick[k] = vals; });
  return { pick: pick, why: j.why || "" };
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
  var r = await ERP.helperAsk("act", { url: editUrl(origin), ops: [{ op: "waitText", text: "상품속성", ms: 30000, gap: 0 }, { op: "wait", ms: 1500 }, { op: "html", sel: "#attribute-table", max: 200000 }, { op: "text" }] });
  var ok = r.results[0] && r.results[0].ok, html = r.results[2] && r.results[2].html || "", text = (r.results[3] && r.results[3].text) || "";
  if (!ok) throw new Error(/존재하지|없는 상품/.test(text) ? "수정 화면 없음(번호 확인 필요)" : "상품속성 화면을 못 찾음");
  return { attrs: html ? parseAttrs(html) : [], text: text };
}
async function writePage(origin, attrs, pick) {
  var ops = [{ op: "waitText", text: "상품속성", ms: 30000, gap: 0 }, { op: "wait", ms: 1500 },
    /* 2~7: 상세설명 스마트에디터 ONE 변환 → 뜬 창에서 [등록] (이미 변환된 상품은 버튼이 없어 자동으로 건너뜀) */
    { op: "click", text: "으로 변환하기 (1회성)" }, { op: "switchNew", ms: 12000, need: 2 },
    { op: "waitText", text: "등록", ms: 25000, frames: true, need: 3 }, { op: "click", text: "등록", frames: true, need: 4, gap: 2500 },
    { op: "closed", ms: 15000, need: 5 }, { op: "switchBack" }, { op: "wait", ms: 2000 }];
  Object.keys(pick).forEach(function (k) { var a = attrs.filter(function (x) { return x.name === k; })[0];
    pick[k].forEach(function (v) {
      if (a.type === "multi") ops.push({ op: "check", near: k, value: v });
      else { var o = a.options.filter(function (x) { return x.text === v; })[0]; ops.push({ op: "click", within: k, sel: ".selectize-input" }); ops.push({ op: "click", within: k, sel: '.selectize-dropdown-content .option[data-value="' + o.id + '"]' }); }
    }); });
  ops.push({ op: "html", sel: "#attribute-table", max: 200000 });
  ops.push({ op: "click", text: "저장하기" }, { op: "wait", ms: 5000 }, { op: "text" });
  var r = await ERP.helperAsk("act", { url: editUrl(origin), ops: ops });
  var res = r.results, before = res.length - 4, after = parseAttrs((res[before] || {}).html || "");
  var applied = Object.keys(pick).every(function (k) { var a = after.filter(function (x) { return x.name === k; })[0]; return a && pick[k].every(function (v) { return a.selected.indexOf(v) >= 0; }); });
  var t1 = "", t2 = (res[res.length - 1] || {}).text || "";
  var conv = !res[2].ok ? "변환 버튼 없음(이미 변환)" : res[6] && res[6].ok ? "변환 완료" : "변환 실패(" + [3, 4, 5, 6].map(function (i) { return res[i] && !res[i].ok && !res[i].skipped ? i + ":" + (res[i].error || "실패") : ""; }).filter(Boolean).join(",") + ")";
  return { conv: conv, applied: applied, opsFailed: res.filter(function (x, i) { return x && !x.ok && !x.skipped && (i < 2 || i > 8); }).map(function (x) { return x.error; }), saveMsg: ((t1 + "\n" + t2).match(/[^\n]*(수정되었|저장되었|완료되었|오류|실패|입력해 주세요|확인해 주세요)[^\n]*/g) || []).slice(0, 4) };
}
function log(s, row) { s.log = (s.log || []).concat([row]).slice(-3000); save(s); }
function dl(s, tag) { var rows = (s.log || []).map(function (x) { return [x.at, x.ch, x.origin || "", x.status, x.name, JSON.stringify(x.pick || {}), x.why || "", x.rex || "", x.conv || "", (x.err || "") + (x.saveMsg ? " " + x.saveMsg.join(" / ") : "")].map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(","); });
  ERP.downloadBlob("스마트스토어_속성입력기록_" + tag + ".csv", new Blob(["﻿시각,채널상품번호,원상품번호,결과,상품명,넣은속성,AI메모,렉스몬드,에디터변환,오류/저장메시지\n" + rows.join("\n")], { type: "text/csv" })); }

async function one(t, s, opts) {
  var origin = (s.map || {})[t.ch] || t.origin; var row = { at: new Date().toISOString(), ch: t.ch, origin: origin, name: t.name };
  try {
    var p;
    if (origin) p = await readPage(origin);
    else { p = await readViaSearch(t.ch); origin = row.origin = p.origin; s.map = s.map || {}; s.map[t.ch] = origin; save(s); }
    var needConv = /으로 변환하기/.test(p.text || ""), c = { pick: {}, why: "속성칸 없음" };
    if (p.attrs.length && p.attrs.some(function (a) { return !a.selected.length; })) {
      var rex = await rexInfo(t.code); row.rex = rex.found ? rex.url : "못 찾음(" + rex.why + ")";
      c = await choose(t, p.attrs, rex);
    }
    row.pick = c.pick; row.why = c.why; row.v = 2;
    if (!Object.keys(c.pick).length && !needConv) { row.status = "할 일 없음(이미 입력·변환됨)"; return row; }
    if (opts.dry) { row.status = "미리보기(저장 안 함)"; return row; }
    var w = await writePage(origin, p.attrs, c.pick); row.saveMsg = w.saveMsg; row.conv = w.conv;
    var convBad = needConv && w.conv !== "변환 완료";
    row.status = w.applied && !w.opsFailed.length && !convBad ? "저장 완료" : "일부 실패"; if (w.opsFailed.length) row.err = w.opsFailed.join(" / ");
  } catch (e) { row.status = "실패"; row.err = e.message; if (/멈춤|멈췄/.test(e.message)) stopReq = true; }
  return row;
}
/* 첫 실행: 시험 상품 1개(발렌티노 크로스백 원상품번호 12652259462) + 상품목록 화면 구조 진단 */
ERP.acts.ssattrtest = async function () {
  if (!(ERP.helperOn && ERP.helperOn())) { ERP.toast("크롬 확장 ‘로우나 도우미’가 꺼져 있어요."); return; }
  var s = st(), all = await targets();
  ERP.toast("시험 2개(메종키츠네 니트·호카 트레킹화): 렉스몬드 확인 → 스마트에디터 ONE 변환 → 속성 저장. 약 3~5분, 끝나면 기록 파일이 자동으로 받아져요.");
  var out = [];
  for (var ch of ["12346633813", "12709468656"]) { var t = all.filter(function (x) { return x.ch === ch; })[0]; if (!t) { out.push(ch + ": 대상 목록에 없음"); continue; } var row = await one(t, s, {}); log(s, row); out.push(row.status + (row.conv ? "/" + row.conv : "") + (row.err ? " — " + row.err : "")); ERP.render(); }
  dl(s, "시험2"); ERP.toast("시험 결과: " + out.join(" | ")); ERP.render();
};

/* 전체 실행: 팔린 상품부터 차례로. 이미 처리한 상품은 건너뜀. 50개마다 기록 파일 자동 저장. */
ERP.acts.ssattrrun = async function (btn) {
  if (running) { ERP.toast("이미 진행 중이에요."); return; }
  if (!(ERP.helperOn && ERP.helperOn())) { ERP.toast("크롬 확장 ‘로우나 도우미’가 꺼져 있어요."); return; }
  var lim = Number((btn && btn.dataset && btn.dataset.limit) || 0) || Infinity;
  running = true; stopReq = false; var s = st(), done = {}; (s.log || []).forEach(function (x) { if (x.v === 2 && /저장 완료|할 일 없음/.test(x.status)) done[x.ch] = 1; });
  var list = (await targets()).filter(function (t) { return !done[t.ch]; }), n = 0, fails = 0;
  ERP.toast("상품속성 자동입력 시작: 남은 " + list.length + "개 중 " + (lim === Infinity ? "전부" : lim + "개"));
  for (var i = 0; i < list.length && n < lim && !stopReq; i++) {
    var row = await one(list[i], s, {}); log(s, row); n++; ERP.render();
    fails = row.status === "실패" ? fails + 1 : 0;
    if (fails >= 5) { ERP.toast("⚠ 5개 연속 실패라 멈췄어요. 기록을 확인해 주세요."); break; }
    if (n % 50 === 0) dl(s, new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-"));
  }
  running = false; dl(s, "끝_" + new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")); ERP.toast("상품속성 자동입력: " + n + "개 처리했어요."); ERP.render();
};
ERP.acts.ssattrstop = function () { stopReq = true; ERP.toast("지금 상품까지만 하고 멈춰요."); };
function render() {
  var s = st(), L = s.log || [], cnt = {}; L.forEach(function (x) { cnt[x.status] = (cnt[x.status] || 0) + 1; });
  return '<div class="head"><div><h1>스마트스토어 상품속성</h1><p>사방넷 대량등록 상품(하이엔드 제외) 6,826개의 상품속성을 자동으로 채워요 · 팔린 상품 먼저</p></div><div class="tools"><button class="btn" data-act="ssattrtest">시험 실행</button><button class="btn pri" data-act="ssattrrun" data-limit="181">팔린 상품 181개 실행</button><button class="btn" data-act="ssattrrun">전체 실행</button><button class="btn" data-act="ssattrstop">멈추기</button></div></div>' +
    '<div class="tiles">' + Object.keys(cnt).map(function (k) { return ERP.tile(esc(k), cnt[k] + "개", ""); }).join("") + "</div>" +
    '<div class="table-wrap"><table><thead><tr><th>시각</th><th>채널번호</th><th>결과</th><th>상품명</th><th>넣은 속성</th><th>메모</th></tr></thead><tbody>' + L.slice(-50).reverse().map(function (x) { return "<tr><td class=num>" + esc((x.at || "").slice(5, 16).replace("T", " ")) + "</td><td class=num>" + esc(x.ch) + "</td><td>" + esc(x.status) + "</td><td class=name>" + esc(x.name) + "</td><td>" + esc(Object.keys(x.pick || {}).map(function (k) { return k + ": " + x.pick[k].join(","); }).join(" · ")) + "</td><td><small>" + esc((x.conv ? "[" + x.conv + "] " : "") + (x.rex ? "[렉스몬드 " + (/^http/.test(x.rex) ? "확인" : x.rex) + "] " : "") + (x.err || "") + " " + (x.saveMsg || []).slice(0, 1).join(" / ")) + "</small></td></tr>"; }).join("") + "</tbody></table></div>";
}
ERP.page({ id: "ss-attr", title: "스마트스토어 속성", roles: ["owner", "staff", "ai"], render: render, bind: function () {} });
})();
