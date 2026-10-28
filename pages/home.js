/* 메뉴: 오늘의 보고 — LUX 레이아웃 (알림 카드 4 · 지표 카드 6 · 일별 매출 + 쇼핑몰 도넛) */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, Ch = ERP.Charts, esc = U.esc, won = U.won, pct = U.pct;

/* ---------- 아이콘 (선) ---------- */
var I = {
  memo: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 11h6M10 15h4"/><circle cx="16.5" cy="17.5" r="2.5"/>',
  db: '<ellipse cx="12" cy="5.5" rx="7" ry="2.5"/><path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>',
  back: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  warn: '<path d="M12 3 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  cart: '<path d="M3 4h2.5l2.2 11h10.6l2-8H6.6"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
  pie: '<path d="M11 3.05V13h9.95A9 9 0 1 1 11 3.05z"/><path d="M14 3.3A9 9 0 0 1 20.7 10H14z"/>',
  box: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  goal: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12 20 4M16.5 4H20v3.5"/>',
  bars: '<rect x="4" y="12" width="3.5" height="8" rx=".6"/><rect x="10.25" y="7" width="3.5" height="13" rx=".6"/><rect x="16.5" y="3" width="3.5" height="17" rx=".6"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2"/>'
};
function ico(k, fill) { return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="' + (fill ? "currentColor" : "none") + '" stroke="' + (fill ? "none" : "currentColor") + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + I[k] + "</svg>"; }
var CHEV = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';

/* ---------- 작은 그래프 ---------- */
var sq = 0;
function spark(vals, kind, color) {
  var W = 200, H = 48, n = vals.length || 1, max = Math.max.apply(null, vals.concat([1])), min = Math.min.apply(null, vals.concat([0])), id = "sp" + (++sq);
  var y = function (v) { return H - 4 - (v - min) / ((max - min) || 1) * (H - 10); };
  if (kind === "bars") {
    var bw = W / n * 0.62, s = "";
    vals.forEach(function (v, i) { var h = Math.max(2, (H - 4) - y(v) + 2); s += '<rect x="' + (W / n * i + (W / n - bw) / 2).toFixed(1) + '" y="' + (H - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="1.5" fill="url(#' + id + ')"/>'; });
    return '<svg class="spark" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '"/><stop offset="1" stop-color="' + color + '" stop-opacity=".25"/></linearGradient></defs>' + s + "</svg>";
  }
  var pts = vals.map(function (v, i) { return [(i / Math.max(n - 1, 1)) * (W - 8) + 4, y(v)]; });
  var line = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("");
  var area = line + "L" + pts[pts.length - 1][0].toFixed(1) + "," + H + "L" + pts[0][0].toFixed(1) + "," + H + "Z";
  var dots = pts.map(function (p) { return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.2" fill="' + color + '"/>'; }).join("");
  return '<svg class="spark" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".35"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs><path d="' + area + '" fill="url(#' + id + ')"/><path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linejoin="round"/>' + dots + "</svg>";
}
function delta(cur, prev, upIsGood) {
  if (!prev) return '<div class="dl"><span class="mute">전월 데이터 없음</span></div>';
  var r = (cur - prev) / Math.abs(prev), up = r >= 0, good = upIsGood === false ? !up : up;
  return '<div class="dl"><b class="' + (good ? "up" : "down") + '">' + (up ? "▲" : "▼") + " " + Math.abs(Math.round(r * 100)) + '%</b><span>전월 대비</span></div>';
}
function mil(v) { return (Math.round(v / 1e5) / 10).toLocaleString("ko-KR", { minimumFractionDigits: 1 }); }

/* ---------- 큰 그래프: 일별 매출 (막대 + 꺾은선) ---------- */
function dailyChart(dv, mLabel) {
  var W = 760, H = 250, pl = 40, pr = 10, pt = 14, pb = 28, iw = W - pl - pr, ih = H - pt - pb, n = dv.length;
  var vals = dv.map(function (o) { return o.rev / 1e6; }), mx = Math.max.apply(null, vals.concat([1]));
  var stepRaw = mx / 6, e = Math.pow(10, Math.floor(Math.log10(stepRaw))), f = stepRaw / e, step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e, top = Math.ceil(mx / step) * step;
  var y = function (v) { return pt + ih - v / top * ih; }, band = iw / n, bw = band * 0.56;
  var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="이번 달 일별 매출"><defs>' +
    '<linearGradient id="dbar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#36b6ff"/><stop offset="1" stop-color="#0a3f9c" stop-opacity=".55"/></linearGradient>' +
    '<filter id="dglow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
  for (var t = 0; t <= top + 1e-9; t += step) { var yy = y(t).toFixed(1); s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + yy + '" y2="' + yy + '" class="gl"/><text x="' + (pl - 8) + '" y="' + (+yy + 3.5) + '" text-anchor="end" class="tick">' + (Math.round(t * 10) / 10) + "</text>"; }
  for (var i = 0; i < n; i++) s += '<line x1="' + (pl + band * i + band / 2).toFixed(1) + '" x2="' + (pl + band * i + band / 2).toFixed(1) + '" y1="' + pt + '" y2="' + (pt + ih) + '" class="gl v"/>';
  var hits = "", marks = "", labels = "";
  dv.forEach(function (o, i) {
    var cx = pl + band * i + band / 2, h = Math.max(0, pt + ih - y(vals[i]));
    if (h > 0) marks += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + y(vals[i]).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2" fill="url(#dbar)"/>';
    hits += '<rect class="hit" x="' + (pl + band * i).toFixed(1) + '" y="' + pt + '" width="' + band.toFixed(1) + '" height="' + ih + '" tabindex="0" data-tip="' + esc(JSON.stringify({ t: mLabel + " " + (i + 1) + "일", r: [["매출", won(o.rev) + "원"], ["주문", o.n + "건"], ["마진(원가 입력분)", won(o.margin) + "원"]] })) + '"/>';
    labels += '<text x="' + cx.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" class="tick">' + (i + 1) + "</text>";
  });
  // 꺾은선: 3일 이동평균
  var pts = vals.map(function (v, i) { var a = vals.slice(Math.max(0, i - 1), i + 2); return [pl + band * i + band / 2, y(a.reduce(function (p, q) { return p + q; }, 0) / a.length)]; });
  var path = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("");
  var line = '<path d="' + path + '" fill="none" stroke="#7fd2ff" stroke-width="1.6" filter="url(#dglow)"/>' + pts.map(function (p) { return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.6" fill="#bfe8ff"/>'; }).join("");
  s += hits + marks + line + labels + "</svg>";
  return '<div class="chart-scroll"><div class="chart lux-daily">' + s + '<div class="ctip" hidden></div></div></div>';
}

/* ---------- 도넛: 쇼핑몰별 매출 ---------- */
var DC = ["#20d0ff", "#1e9bff", "#2c6dff", "#6a5cff", "#8f7dff", "#3fd6c8", "#5aa9ff", "#9aa8ff"];
function donut(rows, total) {
  var R = 70, C = 2 * Math.PI * R, off = 0, segs = "";
  rows.forEach(function (r, i) {
    var len = total ? r.value / total * C : 0, gap = rows.length > 1 ? 2 : 0;
    segs += '<circle cx="100" cy="100" r="' + R + '" fill="none" stroke="' + DC[i % DC.length] + '" stroke-width="26" stroke-dasharray="' + Math.max(0, len - gap).toFixed(2) + " " + (C - Math.max(0, len - gap)).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 100 100)"/>';
    off += len;
  });
  var svg = '<svg class="donut" viewBox="0 0 200 200" role="img" aria-label="쇼핑몰별 매출 비중"><defs><filter id="dnglow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><circle cx="100" cy="100" r="' + R + '" fill="none" stroke="rgba(40,90,170,.25)" stroke-width="26"/><g filter="url(#dnglow)">' + segs + '</g><circle cx="100" cy="100" r="54" fill="rgba(4,12,28,.92)" stroke="rgba(60,150,255,.25)"/><text x="100" y="94" text-anchor="middle" class="dn-l">이번 달 매출</text><text x="100" y="114" text-anchor="middle" class="dn-v">₩ ' + won(total) + "</text></svg>";
  var leg = '<div class="dn-leg">' + rows.map(function (r, i) { return '<div class="dn-row"><i style="background:' + DC[i % DC.length] + ';box-shadow:0 0 8px ' + DC[i % DC.length] + '"></i><span class="nm">' + esc(r.label) + '</span><span class="pc num">' + (total ? Math.round(r.value / total * 100) : 0) + '%</span><span class="vv num">' + mil(r.value) + "</span></div>"; }).join("") + "</div>";
  return '<div class="dn-wrap">' + svg + leg + "</div>";
}

/* ---------- 화면 ---------- */
function render() {
  var R = S.report || {}, Y = R.yesterday || {}, M = R.month || {}, T = R.todo || {}, K = R.stock || {};
  var today = U.today(), m = U.ym(today), y = today.slice(0, 4), dd = +today.slice(8, 10), pm = U.shiftMonth(m, -1);
  var target = U.num(S.SET.goal_target), ya = ERP.aggregate(function (d) { return d.slice(0, 4) === y; });
  var mtd = ERP.aggregate(function (d) { return U.ym(d) === m && +d.slice(8, 10) <= dd; });
  var pmtd = ERP.aggregate(function (d) { return U.ym(d) === pm && +d.slice(8, 10) <= dd; });
  var dt = new Date(), WK = "일월화수목금토";

  // 최근 14일
  var last = []; for (var i = 13; i >= 0; i--) { var dte = new Date(Date.now() - i * 864e5); last.push(dte.getFullYear() + "-" + ("0" + (dte.getMonth() + 1)).slice(-2) + "-" + ("0" + dte.getDate()).slice(-2)); }
  var dayAgg = last.map(function (ds) { return ERP.aggregate(function (d) { return d.slice(0, 10) === ds; }); });
  var yd = last[12], ydPrevMonth = U.shiftMonth(U.ym(yd), -1) + yd.slice(7);
  var ydPrev = ERP.aggregate(function (d) { return d.slice(0, 10) === ydPrevMonth; });
  // 매입 월별 개수(12개월)
  var pmon = []; for (var k = 11; k >= 0; k--) pmon.push(U.shiftMonth(m, -k));
  var pcount = pmon.map(function (mk) { return ERP.list("purchases").filter(function (p) { return U.ym(p.date || "") === mk; }).reduce(function (a, p) { return a + (U.num(p.qty) || 1); }, 0); });

  var h = '<div class="lux-hero"><div class="lux-globe" aria-hidden="true"></div>' +
    '<div class="head"><div><h1>오늘의 보고</h1><p>데이터로 만드는, 더 큰 가치<br>LOWNA의 오늘을 한눈에 확인하세요.</p></div>' +
    '<div class="tools"><div class="lux-date">' + ico("cal") + dt.getFullYear() + ". " + ("0" + (dt.getMonth() + 1)).slice(-2) + ". " + ("0" + dt.getDate()).slice(-2) + " (" + WK[dt.getDay()] + ')</div><button class="lux-ring" data-act="refreshreport" title="보고 새로고침" aria-label="보고 새로고침"></button></div></div></div>';

  // 알림 카드 4
  var todayAgg = ERP.aggregate(function (d) { return d.slice(0, 10) === today; });
  var alerts = [["cart", "어제 / 오늘 주문", [Y.orders || 0, todayAgg.n], "sales"], ["db", "정산 미확정", T.settle_pending_count || 0, "sales:saleFilter=pending"], ["back", "진행 중 반품·취소", T.open_returns || 0, "returns"], ["warn", "90일 넘은 재고", K.aged_90 || 0, "purchases:pStatus=aging"]];
  h += '<div class="lux-alerts">' + alerts.map(function (a) { return '<button class="lux-alert" data-go="' + a[3] + '"><span class="ic">' + ico(a[0]) + '</span><span class="tx"><span class="l">' + a[1] + '</span><span class="v num">' + (Array.isArray(a[2]) ? a[2][0].toLocaleString("ko-KR") + '<small>건</small><em>/</em>' + a[2][1].toLocaleString("ko-KR") : a[2].toLocaleString("ko-KR")) + "<small>건</small></span></span>" + CHEV + "</button>"; }).join("") + "</div>";

  // 지표 카드 6
  var gp = target ? ya.rev / target : 0;
  var kpis = [
    ["memo", "원가 미입력", (T.no_cost || 0).toLocaleString("ko-KR") + "<small>건</small>", '<div class="dl"><span>이번 달 마진 계산에서 ' + (M.no_cost || 0) + "건 제외</span></div>", spark(dayAgg.map(function (a) { return a.noCost; }), "bars", "#ffc163"), "edge", "sales:saleFilter=nocost"],
    ["db", "이번 달 매출", "₩ " + won(M.revenue), delta(mtd.rev, pmtd.rev), spark(dayAgg.map(function (a) { return a.rev; }), "line", "#2aa7ff"), ""],
    ["pie", "이번 달 마진", "₩ " + won(M.margin), delta(mtd.margin, pmtd.margin), spark(dayAgg.map(function (a) { return a.margin; }), "line", "#2ee6a6"), ""],
    ["back", "반품 손익", "₩ " + won(-U.num(M.return_loss)), delta(mtd.retLoss, pmtd.retLoss, false), spark(dayAgg.map(function (a) { return -a.retLoss; }), "line", "#9b7bff"), ""],
    ["box", "보유 재고", (K.count || 0).toLocaleString("ko-KR") + "<small>개</small>", '<div class="dl"><span>₩ ' + won(K.value) + " · 61–90일 " + (K.aged_61_90 || 0) + "개</span></div>", spark(pcount, "bars", "#1e9bff"), ""],
    ["goal", "연간 목표", target ? "₩ " + U.shortWon(target) : "미설정", '<div class="dl"><span class="w">진행률</span><b class="w">' + (target ? Math.round(gp * 100) : 0) + "%</b></div>", '<div class="lux-prog"><i style="width:' + Math.min(100, gp * 100).toFixed(1) + '%"></i></div>', "edge"]
  ];
  h += '<div class="lux-kpis">' + kpis.map(function (k) { return '<div class="lux-kpi ' + k[5] + '"' + (k[6] ? ' data-go="' + k[6] + '" role="button" tabindex="0"' : "") + '><div class="hd"><span class="ic">' + ico(k[0]) + '</span><span class="l">' + k[1] + '</span></div><div class="v num">' + k[2] + "</div>" + k[3] + '<div class="sp">' + k[4] + "</div></div>"; }).join("") + "</div>";

  // 일별 매출 + 도넛
  var days = new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate(), dv = [];
  for (var j = 0; j < days; j++) dv.push({ rev: 0, n: 0, margin: 0 });
  ERP.list("sales").forEach(function (s) { if (U.ym(s.date) !== m || ERP.excluded(s)) return; var d = ERP.derive(s), o = dv[+s.date.slice(8, 10) - 1]; o.rev += U.num(s.salePrice); o.n++; if (d.hasCost) o.margin += d.margin; });
  var a = ERP.aggregate(function (d) { return U.ym(d) === m; });
  var plats = Object.keys(a.byPlat).map(function (key) { return { label: ERP.platName(key), value: a.byPlat[key].rev }; }).sort(function (x, z) { return z.value - x.value; });
  if (plats.length > 6) { var rest = plats.slice(5).reduce(function (p, q) { return p + q.value; }, 0); plats = plats.slice(0, 5).concat([{ label: "기타 채널", value: rest }]); }
  h += '<div class="lux-row"><div class="panel lux-p"><div class="ph"><h2>' + ico("bars", true) + '이번 달 일별 매출<button class="go" data-go="sales" aria-label="매출로 이동">' + CHEV + '</button></h2><span class="unit">단위: 백만원</span></div>' + dailyChart(dv, +m.slice(5) + "월") + "</div>" +
    '<div class="panel lux-p"><div class="ph"><h2>' + ico("pie", true) + '쇼핑몰별 매출<button class="go" data-go="channels" aria-label="채널별 순마진으로 이동">' + CHEV + '</button></h2><span class="unit">단위: 백만원</span></div>' + (plats.length ? donut(plats, a.rev) : '<div class="empty">이번 달 매출이 아직 없어요.</div>') + "</div></div>";

  // 월별 (아래)
  var months = []; for (var q = 11; q >= 0; q--) months.push(U.shiftMonth(m, -q));
  var mon = months.map(function (mk) { return { mk: mk, a: ERP.aggregate(function (d) { return U.ym(d) === mk; }) }; }).filter(function (x, i2, arr) { return x.a.n || arr.slice(0, i2).some(function (z) { return z.a.n; }); });
  var revData = mon.map(function (x) { return { label: x.mk.slice(5).replace(/^0/, "") + "월", title: x.mk.replace("-", "년 ") + "월", value: x.a.rev, tip: [["매출", won(x.a.rev) + "원"], ["주문", x.a.n + "건"], ["순이익", won(x.a.net) + "원"]] }; });
  var netData = mon.map(function (x) { return { label: x.mk.slice(5).replace(/^0/, "") + "월", title: x.mk.replace("-", "년 ") + "월", value: Math.round(x.a.net), tip: [["순이익", won(x.a.net) + "원"], ["마진율", pct(x.a.marginRev ? x.a.margin / x.a.marginRev : 0)], ["원가 미입력", x.a.noCost + "건"]] }; });
  h += '<div class="grid2 even"><div class="panel"><h2>월별 매출</h2>' + Ch.bar(revData, { aria: "월별 매출", labelEvery: 1 }) + '</div><div class="panel"><h2>월별 순이익<span class="sub">원가 입력 주문 마진 − 반품손실</span></h2>' + Ch.bar(netData, { aria: "월별 순이익", labelEvery: 1, color: "c2", negColor: "crit" }) + "</div></div>";
  if (!S.report) h += '<p class="note">아침 보고를 만들지 못했어요. 인터넷 연결을 확인한 뒤 새로고침(오른쪽 위 동그라미)을 눌러 주세요.</p>';
  return h;
}
ERP.acts.refreshreport = async function (btn) { btn.disabled = true; await ERP.loadReport(); ERP.render(); ERP.toast(S.report ? "보고를 새로 만들었어요." : "보고를 만들지 못했어요."); };
ERP.page({ id: "home", title: "오늘의 보고", render: render });
})();
