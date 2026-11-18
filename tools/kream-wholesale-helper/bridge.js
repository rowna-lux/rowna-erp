/* ERP 화면 ↔ 열무 크림도매 도우미 연결. 통로 이름 'rownaW' (기존 도우미 rownaK, 리셀 도우미 rownaR) */
document.documentElement.dataset.rownaWholesale = "1";
try { document.documentElement.dataset.rownaWholesaleV = chrome.runtime.getManifest().version; } catch (e) {}   /* ERP 화면에 버전 표시 (2026-11-18) */
window.addEventListener("message", function (e) {
  if (e.source !== window || !e.data || e.data.rownaW !== "req") return;
  var q = e.data;
  // 2026-11-18: 확장을 새로고침하면 이미 열린 ERP 탭의 옛 연결이 끊김 → 오류 대신 안내
  var dead = "확장이 새로고침됐어요. ERP 페이지를 새로고침(F5)해 주세요.";
  if (!chrome.runtime || !chrome.runtime.id) { window.postMessage({ rownaW: "res", id: q.id, ok: false, error: dead }, location.origin); return; }
  try {
  chrome.runtime.sendMessage({ type: q.type, opt: q }, function (r) {
    var err = chrome.runtime.lastError;
    window.postMessage({ rownaW: "res", id: q.id, ok: !err && r && r.ok, data: r && r.data, error: err ? err.message : r && r.error }, location.origin);
  });
  } catch (x) { window.postMessage({ rownaW: "res", id: q.id, ok: false, error: dead }, location.origin); }
});
