/* ERP 화면 ↔ 로우나재고 크림 도우미 연결. 통로 이름 'rownaS' (기존 rownaK, 리셀 rownaR, 열무 rownaW) */
document.documentElement.dataset.rownaStock = "1";
window.addEventListener("message", function (e) {
  if (e.source !== window || !e.data || e.data.rownaS !== "req") return;
  var q = e.data;
  chrome.runtime.sendMessage({ type: q.type, opt: q }, function (r) {
    var err = chrome.runtime.lastError;
    window.postMessage({ rownaS: "res", id: q.id, ok: !err && r && r.ok, data: r && r.data, error: err ? err.message : r && r.error }, location.origin);
  });
});
