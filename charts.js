/* 로우나 ERP · 그래프 (정확한 눈금 + 마우스/손가락 올리면 정확한 금액)
   - 한 그래프에 한 가지 단위(원)만, 0 기준선에서 막대 시작
   - 막대 끝 4px 둥글게, 막대 사이 간격, 옅은 격자
   - 막대보다 넓은 투명 영역에 툴팁 연결(키보드 포커스도 동일) */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U;
function niceStep(range) { var raw = range / 4, e = Math.pow(10, Math.floor(Math.log10(raw || 1))), f = raw / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; }
function scale(vals) {
  var max = Math.max.apply(null, vals.concat([0])), min = Math.min.apply(null, vals.concat([0]));
  if (max === min) max = min + 1;
  var step = niceStep(max - min), hi = Math.ceil(max / step) * step, lo = Math.floor(min / step) * step, ticks = [];
  for (var t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t));
  return { lo: lo, hi: hi, ticks: ticks };
}
function roundedBar(x, y0, y1, w, r) {
  var top = Math.min(y0, y1), h = Math.abs(y1 - y0); if (h < 0.5) return "";
  r = Math.min(r, w / 2, h);
  if (y1 <= y0) return "M" + x + "," + y0 + "V" + (top + r) + "Q" + x + "," + top + " " + (x + r) + "," + top + "H" + (x + w - r) + "Q" + (x + w) + "," + top + " " + (x + w) + "," + (top + r) + "V" + y0 + "Z";
  var bot = top + h; return "M" + x + "," + top + "V" + (bot - r) + "Q" + x + "," + bot + " " + (x + r) + "," + bot + "H" + (x + w - r) + "Q" + (x + w) + "," + bot + " " + (x + w) + "," + (bot - r) + "V" + top + "Z";
}
var seq = 0;
/* data: [{label, value, tip:[[이름, 값문자열], ...], title}] · opts: {height, color:'c1'|'c2', labelEvery, negColor:'crit', aria} */
function bar(data, opts) {
  opts = opts || {};
  var W = 680, H = opts.height || 220, pl = 52, pr = 8, pt = 12, pb = 26, id = "ch" + (++seq);
  var sc = scale(data.map(function (d) { return d.value; })), iw = W - pl - pr, ih = H - pt - pb;
  var y = function (v) { return pt + ih - (v - sc.lo) / (sc.hi - sc.lo) * ih; };
  var n = Math.max(data.length, 1), band = iw / n, bw = Math.max(2, Math.min(36, band - 2 - band * 0.18));
  var svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + U.esc(opts.aria || "막대 그래프") + '">';
  sc.ticks.forEach(function (t) { var yy = y(t).toFixed(1); svg += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + yy + '" y2="' + yy + '" stroke="var(--grid)" stroke-width="' + (t === 0 ? 1.2 : 1) + '"' + (t === 0 ? ' class="base"' : "") + '/><text x="' + (pl - 8) + '" y="' + (+yy + 3.5) + '" text-anchor="end" class="tick">' + U.shortWon(t) + "</text>"; });
  var every = opts.labelEvery || Math.ceil(n / 12), marks = "", hits = "", labels = "";
  data.forEach(function (d, i) {
    var cx = pl + band * i + band / 2, x = cx - bw / 2, neg = d.value < 0;
    var cls = neg && opts.negColor ? opts.negColor : (opts.color || "c1");
    marks += '<path d="' + roundedBar(x.toFixed(1) * 1, y(0), y(d.value), bw, 4) + '" class="mark ' + cls + '"/>';
    hits += '<rect class="hit" x="' + (pl + band * i).toFixed(1) + '" y="' + pt + '" width="' + band.toFixed(1) + '" height="' + ih + '" tabindex="0" data-tip="' + U.esc(JSON.stringify({ t: d.title || d.label, r: d.tip || [["", U.won(d.value) + "원"]] })) + '" aria-label="' + U.esc((d.title || d.label) + " " + U.won(d.value) + "원") + '"/>';
    if (i % every === 0 || i === n - 1) labels += '<text x="' + cx.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" class="tick">' + U.esc(d.label) + "</text>";
  });
  svg += hits + marks + labels + "</svg>";
  return '<div class="chart-scroll"><div class="chart" id="' + id + '">' + svg + '<div class="ctip" hidden></div></div></div>';
}
/* 가로 막대: [{label, value, sub, cls}] — 값은 항상 글자로 표시 */
function hbars(rows, opts) {
  opts = opts || {};
  var max = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.value); }).concat([1]));
  return '<div class="bars">' + rows.map(function (r) { return '<div class="bar-row"><span class="t" title="' + U.esc(r.label) + '">' + U.esc(r.label) + '</span><div class="bar-track"><div class="bar-fill ' + (r.cls || "") + '" style="width:' + (Math.abs(r.value) / max * 100).toFixed(1) + '%"></div></div><span class="n num">' + (opts.fmt ? opts.fmt(r.value) : U.shortWon(r.value)) + (r.sub ? "<small>" + U.esc(r.sub) + "</small>" : "") + "</span></div>"; }).join("") + "</div>";
}
function bind(root) {
  root.querySelectorAll(".chart").forEach(function (ch) {
    var tip = ch.querySelector(".ctip"); if (!tip) return;
    var show = function (el, ev) {
      var d = JSON.parse(el.getAttribute("data-tip")); tip.textContent = "";
      var h = document.createElement("div"); h.className = "ct-h"; h.textContent = d.t; tip.appendChild(h);
      d.r.forEach(function (row) { var r = document.createElement("div"); r.className = "ct-r"; var v = document.createElement("b"); v.textContent = row[1]; var k = document.createElement("span"); k.textContent = row[0]; r.appendChild(v); r.appendChild(k); tip.appendChild(r); });
      tip.hidden = false;
      ch.querySelectorAll(".hit.on").forEach(function (x) { x.classList.remove("on"); }); el.classList.add("on");
      var cr = ch.getBoundingClientRect(), er = el.getBoundingClientRect(), tw = tip.offsetWidth;
      var left = er.left - cr.left + er.width / 2 - tw / 2; left = Math.max(0, Math.min(cr.width - tw, left));
      tip.style.left = left + "px"; tip.style.top = Math.max(0, (ev && ev.clientY ? ev.clientY - cr.top - tip.offsetHeight - 14 : 4)) + "px";
    };
    var hide = function () { tip.hidden = true; ch.querySelectorAll(".hit.on").forEach(function (x) { x.classList.remove("on"); }); };
    ch.querySelectorAll(".hit").forEach(function (el) {
      el.addEventListener("pointermove", function (e) { show(el, e); });
      el.addEventListener("pointerdown", function (e) { show(el, e); });
      el.addEventListener("focus", function () { show(el); });
      el.addEventListener("blur", hide);
    });
    ch.addEventListener("pointerleave", hide);
  });
}
ERP.Charts = { bar: bar, hbars: hbars, bind: bind };
})();
