/* 로우나 리셀 도우미 — 전용 작업 탭 하나에서 한 페이지씩, 사람 속도로 연다.
   - 대기줄: 요청은 한 번에 하나씩만 처리
   - 새 페이지 사이 최소 6~10초(불규칙). 상품 사이 20~30초 쉼은 ERP가 따로 함
   - 작업 탭은 이 확장 전용(기존 도우미 탭은 건드리지 않음) */
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
  /* 크림: 숨은 탭(체결 거래 / 판매 입찰 / 구매 입찰)의 목록까지 읽음. 빠른배송·사업자 줄은 가격 옆에 아이콘(svg)이 붙음 */
  var kream = null;
  if (/kream\.co\.kr$/.test(location.hostname)) {
    var groups = [];
    document.querySelectorAll(".transaction_history_summary__content").forEach(function (c) {
      if (groups.length >= 3) return;
      groups.push(Array.prototype.map.call(c.querySelectorAll(".transaction_history_summary__content__item"), function (it) {
        var opt = it.querySelector(".transaction_history_summary__content__item_option"), pr = it.querySelector(".transaction_history_summary__content__item_price");
        return { opt: opt ? opt.textContent.trim() : "", price: pr ? Number(pr.textContent.replace(/[^\d]/g, "")) : 0, fast: !!(pr && pr.querySelector("svg")) };
      }));
    });
    kream = { groups: groups };
  }
  return { url: location.href, title: document.title, text: document.body ? document.body.innerText : "", links: links, meta: meta, kream: kream };
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
    if (p && p.text.length >= minLen && (!re || re.test(p.text))) return p;
    await sleep(1000);
  }
  return p || { url: o.url, text: "", links: [], meta: {} };
}
chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
  if (msg.type !== "page") { reply({ ok: false, error: "리셀 도우미가 모르는 요청: " + msg.type }); return; }
  var host = ""; try { host = new URL(msg.opt.url).hostname; } catch (e) {}
  if (!/(^|\.)musinsa\.com$|(^|\.)kream\.co\.kr$/.test(host)) { reply({ ok: false, error: "리셀 도우미는 무신사·크림만 열어요: " + host }); return; }
  queue = queue.then(function () { return openPage(msg.opt); }).then(function (d) { reply({ ok: true, data: d }); }, function (e) { reply({ ok: false, error: String(e && e.message || e) }); });
  return true;
});
