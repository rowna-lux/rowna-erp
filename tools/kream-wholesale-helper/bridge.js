/* ERP 화면 ↔ 열무 크림도매 도우미 연결. 통로 이름 'rownaW' (기존 도우미 rownaK, 리셀 도우미 rownaR) */
document.documentElement.dataset.rownaWholesale = "1";
window.addEventListener("message", function (e) {
  if (e.source !== window || !e.data || e.data.rownaW !== "req") return;
  var q = e.data;
  chrome.runtime.sendMessage({ type: q.type, opt: q }, function (r) {
    var err = chrome.runtime.lastError;
    window.postMessage({ rownaW: "res", id: q.id, ok: !err && r && r.ok, data: r && r.data, error: err ? err.message : r && r.error }, location.origin);
  });
});
