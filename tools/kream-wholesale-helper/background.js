/* 로우나 열무 크림도매 도우미 — 전용 작업 탭 하나에서 크림만, 한 페이지씩 사람 속도로.
   - 대기줄: 요청은 한 번에 하나씩
   - 새 페이지 사이 6~10초(불규칙), 화면 안 클릭은 2초 이상 간격
   - 상품 페이지는 '거래 내역 더보기' → '판매 입찰' 탭을 열어 목록을 끝까지 읽고, 95점 목록도 같이 읽음
   - 구매·입찰·장바구니 버튼은 절대 누르지 않음 (읽기만) */
var queue = Promise.resolve(), lastOpen = 0;
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function workTab() {
  var st = await chrome.storage.session.get("tabId"), id = st.tabId;
  if (id) { try { await chrome.tabs.get(id); return id; } catch (e) {} }
  var t = await chrome.tabs.create({ url: "about:blank", active: false, pinned: true });
  await chrome.storage.session.set({ tabId: t.id }); return t.id;
}
function waitComplete(tabId, ms) {
  return new Promise(function (res) {
    var done = false, to = setTimeout(fin, ms);
    function fin() { if (done) return; done = true; clearTimeout(to); chrome.tabs.onUpdated.removeListener(on); res(); }
    function on(id, info) { if (id === tabId && info.status === "complete") fin(); }
    chrome.tabs.onUpdated.addListener(on);
  });
}
function grab() {
  var meta = {}; document.querySelectorAll("meta[property],meta[name]").forEach(function (m) { meta[m.getAttribute("property") || m.getAttribute("name")] = m.content; });
  var links = []; document.querySelectorAll("a[href]").forEach(function (a) { if (links.length < 1500) links.push({ href: a.href, text: (a.innerText || "").trim().slice(0, 200) }); });
  return { url: location.href, title: document.title, text: document.body ? document.body.innerText : "", links: links, meta: meta };
}
/* 상품 페이지 깊게 읽기 (페이지 안에서 실행) */
async function deepRead() {
  function sl(ms) { return new Promise(function (r) { setTimeout(r, ms + Math.random() * 600); }); }
  function leaf(el) { return Array.prototype.filter.call(el.querySelectorAll("*"), function (e) { return !e.children.length && e.textContent.trim(); }).map(function (e) { return e.textContent.trim(); }); }
  var out = { full: null, p95: [], step: "" };
  /* 95점 동일 상품: 항목마다 사이즈·가격 */
  var h95 = Array.prototype.find.call(document.querySelectorAll("*"), function (e) { return !e.children.length && /^95점 동일 상품$/.test(e.textContent.trim()); });
  if (h95) {
    var box = h95; for (var i = 0; i < 6 && box; i++) { box = box.parentElement; if (box && box.querySelectorAll("a").length) break; }
    if (box) Array.prototype.forEach.call(box.querySelectorAll("a"), function (a) {
      var L = leaf(a), pr = L.filter(function (t) { return /^[\d,]+원$/.test(t); })[0];
      var sz = L.filter(function (t) { return t !== "95" && !/%$/.test(t) && !/원$/.test(t) && /^(ONE SIZE|[A-Z]{1,3}\s?[\d.]+|[\d.]+|[A-Z]{1,4})$/.test(t); })[0];
      if (pr) out.p95.push({ opt: sz || "", price: Number(pr.replace(/[^\d]/g, "")) });
    });
  }
  window.scrollTo(0, 900); await sl(2500);
  var more = Array.prototype.find.call(document.querySelectorAll("p,a,button,span"), function (e) { return !e.children.length && /거래 내역 더보기/.test(e.textContent); });
  if (!more) { out.step = "더보기 없음"; return out; }
  (more.closest("a,button") || more).click(); await sl(3000);
  var tabs = Array.prototype.filter.call(document.querySelectorAll("*"), function (e) { return !e.children.length && /^\s*판매\s*입찰\s*$/.test(e.textContent); });
  if (tabs.length) { var t = tabs[tabs.length - 1]; (t.closest("a,button,li") || t).click(); await sl(3000); }
  var lists = Array.prototype.slice.call(document.querySelectorAll(".price_body"));
  if (lists.length < 3) { out.step = "목록 못 찾음(" + lists.length + ")"; return out; }
  /* 판매 입찰 목록 끝까지(최대 8번) 내리기 */
  var ask = lists[1], sc = ask; while (sc && sc.scrollHeight <= sc.clientHeight + 5) sc = sc.parentElement;
  for (var k = 0, prev = -1; k < 8 && sc && ask.children.length !== prev; k++) { prev = ask.children.length; sc.scrollTop = sc.scrollHeight; await sl(2200); }
  function rows(l) { return Array.prototype.map.call(l.children, function (r) { var c = Array.prototype.map.call(r.children, function (x) { return x.textContent.trim(); }); var all = c.join("|"); var pr = (all.match(/([\d,]+)원/) || [])[1]; return { opt: c[0] || "", price: pr ? Number(pr.replace(/,/g, "")) : 0, fast: /빠른배송/.test(all), tail: all.replace(/^.*?원\|?/, "").replace(/빠른배송/, "").trim() }; }).filter(function (x) { return x.price; }); }
  out.full = { trades: rows(lists[0]), asks: rows(lists[1]), bids: rows(lists[2]) }; out.step = "ok";
  return out;
}
async function openPage(o) {
  var gap = 6000 + Math.random() * 4000, wait = lastOpen + gap - Date.now(); if (wait > 0) await sleep(wait);
  var tabId = await workTab(); lastOpen = Date.now();
  await chrome.tabs.update(tabId, { url: o.url });
  await sleep(800); await waitComplete(tabId, 30000);
  var re = o.waitFor ? new RegExp(o.waitFor) : null, minLen = o.minLen || 0, tries = o.tries || 15, p = null;
  for (var i = 0; i < tries; i++) {
    var r = await chrome.scripting.executeScript({ target: { tabId: tabId }, func: grab });
    p = r && r[0] && r[0].result;
    if (p && p.text.length >= minLen && (!re || re.test(p.text))) break;
    await sleep(1000);
  }
  p = p || { url: o.url, text: "", links: [], meta: {} };
  if (/kream\.co\.kr\/products\/\d+/.test(o.url) && p.text) {
    try { var d = await chrome.scripting.executeScript({ target: { tabId: tabId }, func: deepRead }); p.kream = d && d[0] && d[0].result; } catch (e) { p.kream = { step: "깊게 읽기 실패: " + e.message }; }
  }
  return p;
}
chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
  if (msg.type !== "page") { reply({ ok: false, error: "열무 크림도매 도우미가 모르는 요청: " + msg.type }); return; }
  var host = ""; try { host = new URL(msg.opt.url).hostname; } catch (e) {}
  if (!/(^|\.)kream\.co\.kr$/.test(host)) { reply({ ok: false, error: "열무 크림도매 도우미는 크림만 열어요: " + host }); return; }
  queue = queue.then(function () { return openPage(msg.opt); }).then(function (d) { reply({ ok: true, data: d }); }, function (e) { reply({ ok: false, error: String(e && e.message || e) }); });
  return true;
});
