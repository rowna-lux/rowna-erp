/* 메뉴: 오늘의 보고 */
(function () {
"use strict";
var ERP = window.ERP, U = ERP.U, S = ERP.S, C = ERP.C, Ch = ERP.Charts, esc = U.esc, won = U.won, pct = U.pct;

function render() {
  var R = S.report || {}, Y = R.yesterday || {}, M = R.month || {}, T = R.todo || {}, K = R.stock || {};
  var m = U.ym(U.today()), y = U.today().slice(0, 4), target = U.num(S.SET.goal_target), ya = ERP.aggregate(function (d) { return d.slice(0, 4) === y; });
  var hour = new Date().getHours(), hi = hour < 11 ? "좋은 아침이에요" : hour < 18 ? "안녕하세요" : "오늘도 수고 많으셨어요";
  var h = '<div class="head"><div><h1>오늘의 보고</h1><p>' + hi + " · " + U.today().replace(/-/g, ".") + ' 기준 · 마진은 원가가 입력된 주문만 계산해요</p></div><div class="tools"><button class="btn" data-act="refreshreport">보고 새로고침</button></div></div>';
  h += '<div class="todo">' +
    (T.no_cost ? '<button class="chip warn" data-go="sales:saleFilter=nocost">원가 미입력<b>' + T.no_cost + "</b></button>" : "") +
    (T.settle_pending_count ? '<button class="chip" data-go="sales:saleFilter=pending">정산 미확정<b>' + T.settle_pending_count + "</b> · " + U.shortWon(T.settle_pending_amount) + "원</button>" : "") +
    (T.open_returns ? '<button class="chip crit" data-go="returns">진행 중 반품·취소<b>' + T.open_returns + "</b></button>" : "") +
    (K.aged_90 ? '<button class="chip crit" data-go="purchases:pStatus=aging">90일 넘은 재고<b>' + K.aged_90 + "</b> · " + U.shortWon(K.aged_90_value) + "원</button>" : "") +
    (T.unverified_platforms && ERP.isOwner() ? '<button class="chip warn" data-go="settings">수수료 미확인 쇼핑몰<b>' + T.unverified_platforms + "</b></button>" : "") + "</div>";
  h += '<div class="tiles">' +
    ERP.tile("어제 주문", (Y.orders || 0) + "건", won(Y.revenue) + "원") +
    ERP.tile("이번 달 매출", won(M.revenue) + "원", (M.orders || 0) + "건", "hl") +
    ERP.tile("이번 달 마진", '<span class="' + (U.num(M.margin) < 0 ? "neg" : "") + '">' + won(M.margin) + "원</span>", "마진율 " + pct(U.num(M.margin_revenue) ? U.num(M.margin) / U.num(M.margin_revenue) : 0) + (M.no_cost ? " · 원가 미입력 " + M.no_cost + "건 제외" : "")) +
    ERP.tile("반품 손익", '<span class="' + (U.num(M.return_loss) > 0 ? "neg" : "pos") + '">' + won(-U.num(M.return_loss)) + "원</span>", "이번 달 배송비·환불 차액") +
    ERP.tile("보유 재고", won(K.value) + "원", (K.count || 0) + "개 · 61–90일 " + (K.aged_61_90 || 0) + "개") +
    ERP.tile(y + "년 목표", target ? pct(ya.rev / target) : "미설정", target ? U.shortWon(ya.rev) + " / " + U.shortWon(target) : "") + "</div>";

  // 이번 달 일별 매출
  var days = new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate(), dv = [];
  for (var i = 0; i < days; i++) dv.push({ rev: 0, n: 0, margin: 0, mrev: 0 });
  ERP.list("sales").forEach(function (s) { if (U.ym(s.date) !== m || ERP.excluded(s)) return; var d = ERP.derive(s), o = dv[+s.date.slice(8, 10) - 1]; o.rev += U.num(s.salePrice); o.n++; if (d.hasCost) { o.margin += d.margin; o.mrev += U.num(s.salePrice); } });
  var daily = dv.map(function (o, i) { return { label: String(i + 1), title: m.slice(5).replace(/^0/, "") + "월 " + (i + 1) + "일", value: o.rev, tip: [["매출", won(o.rev) + "원"], ["주문", o.n + "건"], ["마진(원가 입력분)", won(o.margin) + "원"]] }; });
  // 최근 12개월
  var months = []; for (var k = 11; k >= 0; k--) months.push(U.shiftMonth(m, -k));
  var mon = months.map(function (mk) { var a = ERP.aggregate(function (d) { return U.ym(d) === mk; }); return { mk: mk, a: a }; }).filter(function (x, i, arr) { return x.a.n || arr.slice(0, i).some(function (z) { return z.a.n; }); });
  var revData = mon.map(function (x) { return { label: x.mk.slice(5).replace(/^0/, "") + "월", title: x.mk.replace("-", "년 ") + "월", value: x.a.rev, tip: [["매출", won(x.a.rev) + "원"], ["주문", x.a.n + "건"], ["순이익", won(x.a.net) + "원"]] }; });
  var netData = mon.map(function (x) { return { label: x.mk.slice(5).replace(/^0/, "") + "월", title: x.mk.replace("-", "년 ") + "월", value: Math.round(x.a.net), tip: [["순이익", won(x.a.net) + "원"], ["마진율", pct(x.a.marginRev ? x.a.margin / x.a.marginRev : 0)], ["원가 미입력", x.a.noCost + "건"]] }; });
  var a = ERP.aggregate(function (d) { return U.ym(d) === m; });
  var plats = Object.keys(a.byPlat).map(function (k) { return { label: ERP.platName(k), value: a.byPlat[k].rev, sub: a.byPlat[k].n + "건" }; }).sort(function (x, z) { return z.value - x.value; });

  h += '<div class="grid2"><div class="panel"><h2>이번 달 일별 매출<span class="sub">막대에 마우스를 올리거나 눌러 보세요</span></h2>' + Ch.bar(daily, { aria: "이번 달 일별 매출", labelEvery: 5 }) + '</div><div class="panel"><h2>쇼핑몰별 매출<span class="sub">이번 달</span></h2>' + (plats.length ? Ch.hbars(plats.slice(0, 10)) : '<div class="empty">이번 달 매출이 아직 없어요.</div>') + "</div></div>";
  h += '<div class="grid2 even"><div class="panel"><h2>월별 매출</h2>' + Ch.bar(revData, { aria: "월별 매출", labelEvery: 1 }) + '</div><div class="panel"><h2>월별 순이익<span class="sub">원가 입력 주문 마진 − 반품손실</span></h2>' + Ch.bar(netData, { aria: "월별 순이익", labelEvery: 1, color: "c2", negColor: "crit" }) + "</div></div>";
  if (!S.report) h += '<p class="note">아침 보고를 만들지 못했어요. 인터넷 연결을 확인한 뒤 ‘보고 새로고침’을 눌러 주세요.</p>';
  return h;
}
ERP.acts.refreshreport = async function (btn) { btn.disabled = true; await ERP.loadReport(); ERP.render(); ERP.toast(S.report ? "보고를 새로 만들었어요." : "보고를 만들지 못했어요."); };
ERP.page({ id: "home", title: "오늘의 보고", render: render });
})();
