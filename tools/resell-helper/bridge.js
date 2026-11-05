/* ERP 화면 ↔ 리셀 도우미 연결. 통로 이름 'rownaR' (기존 도우미는 'rownaK') */
document.documentElement.dataset.rownaResell = "1";
window.addEventListener("message", function (e) {
  if (e.source !== window || !e.data || e.data.rownaR !== "req") return;
  var q = e.data;
  chrome.runtime.sendMessage({ type: q.type, opt: q }, function (r) {
    var err = chrome.runtime.lastError;
    window.postMessage({ rownaR: "res", id: q.id, ok: !err && r && r.ok, data: r && r.data, error: err ? err.message : r && r.error }, location.origin);
  });
});
