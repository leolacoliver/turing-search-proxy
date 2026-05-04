<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<script>
if (sessionStorage.getItem("turing_auth") !== "true") {
  window.location.href = "/login.html?redirect=" + encodeURIComponent(window.location.pathname);
}
</script>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Turing · Search Dashboard</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
:root{--bg:#08090f;--bg2:#0f1220;--bg3:#161b2e;--border:#1e2a42;--blue:#2563eb;--blue2:#3b82f6;--green:#10b981;--yellow:#f59e0b;--red:#ef4444;--text:#f1f5f9;--text2:#94a3b8;--text3:#475569;}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;}
nav{background:#fff;border-bottom:3px solid var(--blue);height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 2rem;position:sticky;top:0;z-index:100;}
.nav-left{display:flex;align-items:center;gap:16px;}
.nav-badge{font-size:11px;background:#eff6ff;color:var(--blue);padding:3px 10px;border-radius:99px;font-weight:600;}
nav a{font-size:13px;color:#374151;text-decoration:none;}
nav a:hover{color:var(--blue);}
.page{max-width:1280px;margin:0 auto;padding:2rem 1.5rem;}
.page-title{font-size:22px;font-weight:700;margin-bottom:3px;}
.page-sub{font-size:13px;color:var(--text2);margin-bottom:1.5rem;}
.card{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:1.25rem 1.5rem;margin-bottom:1rem;}
.card-title{font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:1rem;}
.grid5{display:grid;grid-template-columns:repeat(5,1fr);gap:1rem;margin-bottom:1rem;}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;}
.kpi-value{font-size:28px;font-weight:700;line-height:1;margin-bottom:4px;}
.kpi-label{font-size:11px;color:var(--text2);}
.kpi-sub{font-size:11px;color:var(--text3);margin-top:3px;}
table{width:100%;border-collapse:collapse;font-size:13px;}
th{text-align:left;font-size:10px;color:var(--text3);font-weight:600;padding:0 10px 8px 0;border-bottom:1px solid var(--border);text-transform:uppercase;letter-spacing:.5px;}
td{padding:9px 10px 9px 0;border-bottom:1px solid var(--border);color:var(--text);vertical-align:middle;}
tr:last-child td{border-bottom:none;}
.clickable{cursor:pointer;}
.clickable:hover td{background:var(--bg3);}
.sub-row td{background:var(--bg3);font-size:12px;color:var(--text2);}
.sub-sub-row td{background:#0c1120;font-size:11px;color:var(--text3);}
.bar-wrap{background:var(--border);border-radius:99px;height:5px;min-width:60px;display:inline-block;width:100%;}
.bar{border-radius:99px;height:5px;}
.bar.green{background:var(--green);}
.bar.yellow{background:var(--yellow);}
.bar.red{background:var(--red);}
.bar.blue{background:var(--blue);}
/* Stacked bar */
.stack-wrap{height:6px;border-radius:99px;background:var(--border);overflow:hidden;display:flex;min-width:80px;}
.stack-green{background:var(--green);height:100%;}
.stack-yellow{background:var(--yellow);height:100%;}
.badge{display:inline-flex;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;}
.badge.green{background:rgba(16,185,129,.15);color:#34d399;}
.badge.yellow{background:rgba(245,158,11,.15);color:#fbbf24;}
.badge.red{background:rgba(239,68,68,.15);color:#f87171;}
.badge.blue{background:rgba(37,99,235,.15);color:var(--blue2);}
.expand-btn{font-size:11px;padding:2px 8px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;cursor:pointer;color:var(--text2);}
.problem-tag{display:inline-block;padding:3px 9px;border-radius:99px;font-size:11px;background:rgba(239,68,68,.1);color:#f87171;border:1px solid rgba(239,68,68,.2);margin:2px;}
.chart-wrap{position:relative;height:160px;}
.loading{text-align:center;padding:4rem;color:var(--text2);font-size:14px;}
.error-box{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#f87171;padding:12px 16px;border-radius:10px;font-size:13px;margin:1rem 0;}
.section-label{font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin:1.25rem 0 .75rem;}
/* Toggle */
.toggle-row{display:flex;gap:8px;margin-bottom:1rem;}
.toggle-btn{padding:5px 14px;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;border:1px solid var(--border);background:var(--bg3);color:var(--text2);}
.toggle-btn.active{background:var(--blue);color:#fff;border-color:var(--blue);}
/* Review section */
.review-card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:1rem 1.25rem;margin-bottom:10px;}
.review-query{font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px;}
.review-meta{font-size:11px;color:var(--text3);margin-bottom:8px;}
.review-text{font-size:13px;color:var(--text2);line-height:1.6;white-space:pre-wrap;background:var(--bg3);padding:10px 12px;border-radius:7px;border:1px solid var(--border);}
.reviewer-badge{display:inline-block;padding:2px 8px;background:rgba(37,99,235,.15);color:var(--blue2);border-radius:99px;font-size:11px;font-weight:600;margin-left:6px;}
</style>
</head>
<body>
<nav>
  <div class="nav-left">
    <a href="/" style="display:flex;align-items:center;gap:8px;text-decoration:none;">
      <svg width="90" height="14" viewBox="0 0 796 125" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M372.049 19.9146V49.5709C372.049 56.713 373.984 62.216 377.991 65.9214C381.987 69.6165 387.915 71.4029 395.644 71.4029C403.373 71.4029 409.301 69.6165 413.297 65.9214C417.305 62.216 419.239 56.713 419.239 49.5709V19.9146H434.469V48.3365C434.469 60.5348 431.011 69.1748 424.528 74.7837C418.023 80.4114 408.339 83.107 395.644 83.107C382.95 83.107 373.266 80.4112 366.761 74.7837C360.278 69.1748 356.819 60.5349 356.819 48.3365V19.9146H372.049ZM758.731 18.1519C772.91 18.1519 784.664 20.7989 795.881 26.4986V39.4117C783.662 32.795 772.322 29.8561 759.348 29.856C749.002 29.856 740.687 31.74 734.933 35.3033C729.143 38.8895 725.966 44.171 725.966 50.8052C725.966 57.3525 729.1 62.547 734.837 66.0669C740.536 69.5631 748.783 71.4029 759.084 71.4029C766.384 71.4029 773.243 70.4231 780.013 68.4634L780.563 68.3043V55.4224H742.564V46.0113H795.793V74.7593C784.251 80.6317 773.528 83.107 759.524 83.107C744.002 83.107 731.784 80.0566 723.469 74.4849C715.191 68.9373 710.736 60.863 710.736 50.6294C710.736 40.4369 715.15 32.3611 723.309 26.8033C731.502 21.2224 743.522 18.1519 758.731 18.1519ZM337.656 19.9146V31.3541H300.186V82.0484H284.956V31.3541H247.575V19.9146H337.656ZM505.287 19.9146C512.436 19.9146 521.076 20.2072 527.917 22.8072C531.324 24.1023 534.239 25.9547 536.303 28.5875C538.359 31.2105 539.616 34.6661 539.616 39.2564C539.616 44.8018 537.767 49.3169 534.267 52.7535C530.752 56.2055 525.511 58.6252 518.643 59.8423L517.136 60.1099L540.843 82.0484H522.083L500.746 61.3296H474.11V82.0484H458.879V19.9146H505.287ZM577.806 19.9146V82.0484H562.576V19.9146H577.806ZM618.807 19.9146L674.598 67.3492V19.9146H689.828V82.0484H671.473L617.446 35.9312V82.0484H602.214V19.9146H618.807ZM474.11 31.6187V49.6255H503.788C512.945 49.6255 517.256 49.0184 520.165 47.6109L520.173 47.606C521.599 46.8933 522.669 45.9652 523.375 44.7808C524.079 43.5991 524.385 42.2213 524.385 40.6666C524.385 39.0222 524.055 37.5775 523.317 36.3511C522.623 35.1985 521.599 34.2905 520.26 33.5943L519.98 33.4537C517.066 32.1372 512.759 31.6187 503.258 31.6187H474.11Z" fill="#0f172a"/>
        <path d="M99.9584 0C104.509 0 108.894 0.0476822 113.282 0.158151C113.265 0.167912 110.433 0.962699 109.448 1.15663C66.8824 0.277622 29.7499 6.80093 29.7499 14.299C29.7499 22.1136 69.3435 28.45 118.183 28.45C154.57 28.45 185.822 24.9305 199.395 19.9064C195.882 29.5989 152.706 37.261 99.9564 37.261C90.3886 37.261 81.1355 37.0092 72.3769 36.5386C93.9542 46.1626 111.997 58.7936 111.997 73.1567C111.997 73.2628 112.103 96.1408 112.103 124.836C111.803 124.836 111.359 118.932 111.359 118.932C106.568 27.3503 -7.02057 43.7004 0.342999 17.7744C3.18347 7.77036 47.132 0 99.9584 0Z" fill="#2563eb"/>
      </svg>
    </a>
    <span class="nav-badge">Dashboard</span>
  </div>
  <div style="display:flex;gap:16px;align-items:center;">
    <a href="/">Search Tester</a>
    <button onclick="sessionStorage.removeItem('turing_auth');window.location.href='/login.html'" style="font-size:12px;padding:5px 12px;background:transparent;border:1px solid #ddd;border-radius:6px;cursor:pointer;color:#666;">Logout</button>
  </div>
</nav>

<div class="page">
  <div class="page-title">Search Analytics</div>
  <div class="page-sub">LLM evaluation results — good fits, borderline, and team reviews</div>
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.5rem;flex-wrap:wrap;">
    <div style="display:flex;align-items:center;gap:8px;">
      <label style="font-size:12px;color:var(--text2);">From date</label>
      <input type="date" id="date-from" style="padding:7px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--bg3);color:var(--text);outline:none;" />
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <label style="font-size:12px;color:var(--text2);">To date</label>
      <input type="date" id="date-to" style="padding:7px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--bg3);color:var(--text);outline:none;" />
    </div>
    <button onclick="applyFilter()" style="padding:7px 16px;background:var(--blue);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">Apply</button>
    <button onclick="clearFilter()" style="padding:7px 16px;background:var(--bg3);color:var(--text2);border:1px solid var(--border);border-radius:8px;font-size:13px;cursor:pointer;">Clear</button>
    <span id="filter-label" style="font-size:12px;color:var(--text3)"></span>
  </div>

  <div id="loading" class="loading">Loading dashboard data...</div>
  <div id="error" class="error-box" style="display:none"></div>
  <div id="content" style="display:none">

    <!-- KPIs -->
    <div class="grid5">
      <div class="card"><div class="kpi-label">Total Runs</div><div class="kpi-value kpi-accent" id="kpi-runs">-</div><div class="kpi-sub">queries executed</div></div>
      <div class="card"><div class="kpi-label">Profiles Evaluated</div><div class="kpi-value" id="kpi-profiles">-</div><div class="kpi-sub">total candidates</div></div>
      <div class="card"><div class="kpi-label">Good Match Rate</div><div class="kpi-value" style="color:#34d399" id="kpi-good">-</div><div class="kpi-sub">score ≥ 80</div></div>
      <div class="card"><div class="kpi-label">Good + Borderline</div><div class="kpi-value" style="color:#fbbf24" id="kpi-combined">-</div><div class="kpi-sub">score ≥ 60</div></div>
      <div class="card"><div class="kpi-label">Team Reviews</div><div class="kpi-value" style="color:var(--blue2)" id="kpi-reviews">-</div><div class="kpi-sub">human feedback entries</div></div>
    </div>

    <div class="grid2">
      <!-- Domain table -->
      <div class="card">
        <div class="card-title">Match rate by domain</div>
        <!-- Toggle good vs good+borderline -->
        <div class="toggle-row">
          <button class="toggle-btn active" id="toggle-good" onclick="setDomainMode('good')">Good only (≥80%)</button>
          <button class="toggle-btn" id="toggle-combined" onclick="setDomainMode('combined')">Good + Borderline (≥60%)</button>
        </div>
        <div id="domain-table"></div>
      </div>
      <!-- Problems -->
      <div class="card">
        <div class="card-title">Most common rejection reasons</div>
        <div id="problems"></div>
      </div>
    </div>

    <!-- Trend chart -->
    <div class="card">
      <div class="card-title">Match rate over time</div>
      <!-- Toggle for chart too -->
      <div class="toggle-row">
        <button class="toggle-btn active" id="chart-toggle-good" onclick="setChartMode('good')">Good only</button>
        <button class="toggle-btn" id="chart-toggle-combined" onclick="setChartMode('combined')">Good + Borderline</button>
      </div>
      <div class="chart-wrap"><canvas id="chart"></canvas></div>
      <div class="section-label" style="margin-top:1.25rem">Daily breakdown — click to expand</div>
      <table>
        <thead><tr><th>Date</th><th>Runs</th><th>Evaluated</th><th>Good</th><th>+ Borderline</th><th>Good rate</th><th>Combined rate</th><th>Progress</th><th></th></tr></thead>
        <tbody id="daily-tbody"></tbody>
      </table>
    </div>

    <!-- Team reviews -->
    <div class="card">
      <div class="card-title">Team reviews</div>
      <div id="reviews-section">
        <div class="loading" style="padding:2rem">Loading reviews...</div>
      </div>
    </div>

  </div>
</div>

<script>
var chartInstance = null;
var allRuns = [];
var allResults = [];
var allReviews = [];
var domainMode = 'good';
var chartMode = 'good';

function barHtml(pct) {
  var cls = pct >= 60 ? 'green' : pct >= 30 ? 'yellow' : 'red';
  return '<div class="bar-wrap"><div class="bar ' + cls + '" style="width:' + Math.min(pct,100) + '%"></div></div>';
}

function stackHtml(goodPct, borderlinePct) {
  return '<div class="stack-wrap">' +
    '<div class="stack-green" style="width:' + Math.min(goodPct,100) + '%"></div>' +
    '<div class="stack-yellow" style="width:' + Math.min(borderlinePct,100) + '%"></div>' +
  '</div>';
}

function badge(pct) {
  var cls = pct >= 60 ? 'green' : pct >= 30 ? 'yellow' : 'red';
  return '<span class="badge ' + cls + '">' + pct + '%</span>';
}

function safeId(s) { return s.replace(/[^a-z0-9]/gi, '_'); }

function toggleRows(prefix) {
  var rows = document.querySelectorAll('[data-parent="' + prefix + '"]');
  rows.forEach(function(r) {
    var vis = r.style.display !== 'none';
    r.style.display = vis ? 'none' : '';
    if (vis) {
      var childId = r.getAttribute('data-id');
      if (childId) document.querySelectorAll('[data-parent="' + childId + '"]').forEach(function(c){ c.style.display='none'; });
    }
  });
}

function setDomainMode(mode) {
  domainMode = mode;
  document.getElementById('toggle-good').className = 'toggle-btn' + (mode === 'good' ? ' active' : '');
  document.getElementById('toggle-combined').className = 'toggle-btn' + (mode === 'combined' ? ' active' : '');
  renderDomainTable(allRuns);
}

function setChartMode(mode) {
  chartMode = mode;
  document.getElementById('chart-toggle-good').className = 'toggle-btn' + (mode === 'good' ? ' active' : '');
  document.getElementById('chart-toggle-combined').className = 'toggle-btn' + (mode === 'combined' ? ' active' : '');
  renderChart(allRuns);
}

function renderKPIs(runs, results, reviews) {
  var total = runs.reduce(function(a,r){return a+(r.total_results||0);},0);
  var goodFits = runs.reduce(function(a,r){return a+(r.good_fits||0);},0);
  var borderlineFits = runs.reduce(function(a,r){return a+(r.good_fits_borderline||0);},0);
  var goodRate = total > 0 ? Math.round(goodFits/total*100) : 0;
  var combinedRate = total > 0 ? Math.round((goodFits+borderlineFits)/total*100) : 0;
  document.getElementById('kpi-runs').textContent = runs.length;
  document.getElementById('kpi-profiles').textContent = total.toLocaleString();
  document.getElementById('kpi-good').textContent = goodRate + '%';
  document.getElementById('kpi-combined').textContent = combinedRate + '%';
  document.getElementById('kpi-reviews').textContent = reviews.length;
}

function renderDomainTable(runs) {
  var domains = {};
  runs.forEach(function(r) {
    var d = r.query_domain || 'Unknown';
    var sd = r.query_subdomain || 'Unknown';
    var q = r.query || '';
    if (!domains[d]) domains[d] = { good:0, borderline:0, total:0, subs:{} };
    domains[d].total += r.total_results||0;
    domains[d].good  += r.good_fits||0;
    domains[d].borderline += r.good_fits_borderline||0;
    if (!domains[d].subs[sd]) domains[d].subs[sd] = { good:0, borderline:0, total:0, queries:{} };
    domains[d].subs[sd].total += r.total_results||0;
    domains[d].subs[sd].good  += r.good_fits||0;
    domains[d].subs[sd].borderline += r.good_fits_borderline||0;
    if (q) domains[d].subs[sd].queries[q] = true;
  });

  var useGood = domainMode === 'good';
  var html = '<table><thead><tr><th>Domain</th><th>Evaluated</th><th>' + (useGood ? 'Good' : 'Good+Border') + '</th><th>Rate</th><th>Progress</th><th></th></tr></thead><tbody>';

  Object.keys(domains).sort().forEach(function(d) {
    var dd = domains[d];
    var fits = useGood ? dd.good : dd.good + dd.borderline;
    var pct = dd.total > 0 ? Math.round(fits/dd.total*100) : 0;
    var did = 'dom_' + safeId(d);
    html += '<tr class="clickable" onclick="toggleRows(\'' + did + '\')">' +
      '<td><strong>' + d + '</strong></td>' +
      '<td>' + dd.total.toLocaleString() + '</td>' +
      '<td>' + fits.toLocaleString() + '</td>' +
      '<td>' + badge(pct) + '</td>' +
      '<td>' + (useGood ? barHtml(pct) : stackHtml(dd.total>0?Math.round(dd.good/dd.total*100):0, dd.total>0?Math.round(dd.borderline/dd.total*100):0)) + '</td>' +
      '<td><button class="expand-btn">+</button></td></tr>';

    Object.keys(dd.subs).sort().forEach(function(sd) {
      var s = dd.subs[sd];
      var sFits = useGood ? s.good : s.good + s.borderline;
      var sp = s.total > 0 ? Math.round(sFits/s.total*100) : 0;
      var sid2 = did + '_' + safeId(sd);
      var queryTags = Object.keys(s.queries).map(function(q){ return '<span style="display:inline-block;padding:2px 8px;border-radius:5px;font-size:10px;background:var(--bg3);color:var(--text2);border:1px solid var(--border);margin:2px">' + q + '</span>'; }).join('');
      html += '<tr class="sub-row" data-parent="' + did + '" data-id="' + sid2 + '" style="display:none">' +
        '<td style="padding-left:18px">' + sd + '</td>' +
        '<td>' + s.total + '</td><td>' + sFits + '</td>' +
        '<td>' + badge(sp) + '</td><td>' + barHtml(sp) + '</td>' +
        '<td><button class="expand-btn" onclick="event.stopPropagation();toggleRows(\'' + sid2 + '\')">queries</button></td></tr>';
      if (queryTags) {
        html += '<tr class="sub-sub-row" data-parent="' + sid2 + '" style="display:none">' +
          '<td colspan="6" style="padding-left:32px;padding-top:6px;padding-bottom:6px">' + queryTags + '</td></tr>';
      }
    });
  });

  html += '</tbody></table>';
  document.getElementById('domain-table').innerHTML = html;
}

function renderDailyTable(runs) {
  var days = {};
  runs.forEach(function(r) {
    var day = (r.created_at||'').slice(0,10);
    if (!day) return;
    if (!days[day]) days[day] = { count:0, total:0, good:0, borderline:0, domains:{} };
    days[day].count++;
    days[day].total += r.total_results||0;
    days[day].good  += r.good_fits||0;
    days[day].borderline += r.good_fits_borderline||0;
    var d = r.query_domain||'Unknown';
    var sd = r.query_subdomain||'Unknown';
    if (!days[day].domains[d]) days[day].domains[d] = { total:0, good:0, borderline:0, subs:{} };
    days[day].domains[d].total += r.total_results||0;
    days[day].domains[d].good  += r.good_fits||0;
    days[day].domains[d].borderline += r.good_fits_borderline||0;
    if (!days[day].domains[d].subs[sd]) days[day].domains[d].subs[sd] = { total:0, good:0, borderline:0 };
    days[day].domains[d].subs[sd].total += r.total_results||0;
    days[day].domains[d].subs[sd].good  += r.good_fits||0;
    days[day].domains[d].subs[sd].borderline += r.good_fits_borderline||0;
  });

  var rows = '';
  Object.keys(days).sort().reverse().forEach(function(day) {
    var dd = days[day];
    var goodPct = dd.total > 0 ? Math.round(dd.good/dd.total*100) : 0;
    var combinedPct = dd.total > 0 ? Math.round((dd.good+dd.borderline)/dd.total*100) : 0;
    var dayId = 'day_' + safeId(day);
    rows += '<tr class="clickable" onclick="toggleRows(\'' + dayId + '\')">' +
      '<td><strong>' + day + '</strong></td><td>' + dd.count + '</td>' +
      '<td>' + dd.total.toLocaleString() + '</td>' +
      '<td style="color:#34d399">' + dd.good + '</td>' +
      '<td style="color:#fbbf24">+' + dd.borderline + '</td>' +
      '<td>' + badge(goodPct) + '</td>' +
      '<td><span class="badge yellow">' + combinedPct + '%</span></td>' +
      '<td style="min-width:100px">' + stackHtml(goodPct, dd.total>0?Math.round(dd.borderline/dd.total*100):0) + '</td>' +
      '<td><button class="expand-btn">+</button></td></tr>';

    Object.keys(dd.domains).sort().forEach(function(d) {
      var dom = dd.domains[d];
      var dp = dom.total > 0 ? Math.round(dom.good/dom.total*100) : 0;
      var dc = dom.total > 0 ? Math.round((dom.good+dom.borderline)/dom.total*100) : 0;
      var domId = dayId + '_' + safeId(d);
      rows += '<tr class="sub-row" data-parent="' + dayId + '" data-id="' + domId + '" style="display:none">' +
        '<td style="padding-left:16px;font-weight:500">' + d + '</td><td>-</td>' +
        '<td>' + dom.total + '</td>' +
        '<td style="color:#34d399">' + dom.good + '</td>' +
        '<td style="color:#fbbf24">+' + dom.borderline + '</td>' +
        '<td>' + badge(dp) + '</td>' +
        '<td><span class="badge yellow">' + dc + '%</span></td>' +
        '<td>' + stackHtml(dp, dom.total>0?Math.round(dom.borderline/dom.total*100):0) + '</td>' +
        '<td><button class="expand-btn" onclick="event.stopPropagation();toggleRows(\'' + domId + '\')">+</button></td></tr>';

      Object.keys(dom.subs).sort().forEach(function(sd) {
        var sub = dom.subs[sd];
        var sp = sub.total > 0 ? Math.round(sub.good/sub.total*100) : 0;
        var sc = sub.total > 0 ? Math.round((sub.good+sub.borderline)/sub.total*100) : 0;
        rows += '<tr class="sub-sub-row" data-parent="' + domId + '" style="display:none">' +
          '<td style="padding-left:30px">' + sd + '</td><td>-</td>' +
          '<td>' + sub.total + '</td>' +
          '<td style="color:#34d399">' + sub.good + '</td>' +
          '<td style="color:#fbbf24">+' + sub.borderline + '</td>' +
          '<td>' + badge(sp) + '</td>' +
          '<td><span class="badge yellow">' + sc + '%</span></td>' +
          '<td>' + stackHtml(sp, sub.total>0?Math.round(sub.borderline/sub.total*100):0) + '</td>' +
          '<td></td></tr>';
      });
    });
  });
  document.getElementById('daily-tbody').innerHTML = rows;
}

function renderChart(runs) {
  var days = {};
  runs.forEach(function(r) {
    var day = (r.created_at||'').slice(0,10);
    if (!day) return;
    if (!days[day]) days[day] = { total:0, good:0, borderline:0 };
    days[day].total += r.total_results||0;
    days[day].good  += r.good_fits||0;
    days[day].borderline += r.good_fits_borderline||0;
  });
  var labels = Object.keys(days).sort();
  var goodData = labels.map(function(d){ return days[d].total>0?Math.round(days[d].good/days[d].total*100):0; });
  var combinedData = labels.map(function(d){ return days[d].total>0?Math.round((days[d].good+days[d].borderline)/days[d].total*100):0; });

  if (chartInstance) chartInstance.destroy();
  var datasets = chartMode === 'good' ? [
    { label:'Good match %', data:goodData, borderColor:'#10b981', backgroundColor:'rgba(16,185,129,0.1)', tension:0.4, fill:true, pointRadius:4, pointBackgroundColor:'#10b981', pointBorderColor:'#fff', pointBorderWidth:2 }
  ] : [
    { label:'Good %', data:goodData, borderColor:'#10b981', backgroundColor:'rgba(16,185,129,0.08)', tension:0.4, fill:true, pointRadius:4, pointBackgroundColor:'#10b981', pointBorderColor:'#fff', pointBorderWidth:2 },
    { label:'Good+Borderline %', data:combinedData, borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,0.06)', tension:0.4, fill:true, pointRadius:4, pointBackgroundColor:'#f59e0b', pointBorderColor:'#fff', pointBorderWidth:2 }
  ];

  chartInstance = new Chart(document.getElementById('chart').getContext('2d'), {
    type:'line',
    data:{ labels:labels, datasets:datasets },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:chartMode==='combined', labels:{ color:'#94a3b8', font:{size:11} } } },
      scales:{
        y:{ min:0, max:100, ticks:{callback:function(v){return v+'%';}, color:'#475569', font:{size:11}}, grid:{color:'#1e2a42'} },
        x:{ ticks:{color:'#475569', font:{size:11}}, grid:{display:false} }
      }
    }
  });
}

function renderProblems(results) {
  var noFit = results.filter(function(r){ return r.match===false && r.reason; });
  if (!noFit.length) { document.getElementById('problems').innerHTML='<p style="font-size:13px;color:var(--text2)">No rejection data yet.</p>'; return; }
  var reasons = noFit.map(function(r){ return r.reason.toLowerCase(); });
  var patterns = [
    { label:'Insufficient years of experience', kw:['insufficient','only 1yr','only 2yr','only 3yr','lacks experience','less than','below required'] },
    { label:'Missing required skill',            kw:['no evidence of','no python','no django','no react','no javascript','skill not','not found','absent','missing','does not have'] },
    { label:'Wrong domain / role',               kw:['not a','unrelated','different role','adjacent','not directly','outside the scope'] },
    { label:'Junior / entry level',              kw:['junior','entry','intern','beginner','early career'] },
    { label:'Education mismatch',                kw:['no phd','no degree','no doctorate','does not hold','not completed','pursuing'] },
    { label:'Location mismatch',                 kw:['not from us','outside us','non-us','not based','location'] },
    { label:'Vague / limited evidence',          kw:['limited evidence','no project','unclear','vague','insufficient detail'] },
  ];
  var counts = patterns.map(function(p) {
    var n = reasons.filter(function(r){ return p.kw.some(function(k){ return r.indexOf(k)!==-1; }); }).length;
    return { label:p.label, count:n, pct:Math.round(n/noFit.length*100) };
  }).filter(function(p){ return p.count>0; }).sort(function(a,b){ return b.count-a.count; });

  var html='<table><thead><tr><th>Problem</th><th>Count</th><th>% of rejections</th><th></th></tr></thead><tbody>';
  counts.forEach(function(p){
    html+='<tr><td>'+p.label+'</td><td>'+p.count+'</td><td>'+p.pct+'%</td><td>'+barHtml(p.pct)+'</td></tr>';
  });
  html+='</tbody></table>';
  var wordMap={};
  reasons.slice(0,300).forEach(function(r){
    r.split(/[\s,;.!?()\[\]]+/).forEach(function(w){
      w=w.replace(/[^a-z]/g,'');
      var stop=['with','that','this','from','have','only','than','more','less','does','years','experience','skills','their','which','there','based','found','match','good','candidate','profile','query','required'];
      if(w.length>4&&stop.indexOf(w)===-1) wordMap[w]=(wordMap[w]||0)+1;
    });
  });
  var topWords=Object.keys(wordMap).sort(function(a,b){return wordMap[b]-wordMap[a];}).slice(0,16);
  html+='<div style="margin-top:1rem"><div style="font-size:11px;color:var(--text3);margin-bottom:6px;text-transform:uppercase;letter-spacing:.4px">Common keywords</div>';
  topWords.forEach(function(w){ html+='<span class="problem-tag">'+w+' ('+wordMap[w]+')</span>'; });
  html+='</div>';
  document.getElementById('problems').innerHTML=html;
}

function renderReviews(reviews) {
  var el = document.getElementById('reviews-section');
  if (!reviews.length) {
    el.innerHTML = '<p style="font-size:13px;color:var(--text2);padding:1rem 0">No team reviews yet. Reviews submitted from the Search Tester will appear here.</p>';
    return;
  }
  var html = '';
  reviews.forEach(function(r) {
    var date = '—';
    if (r.human_reviewed_at) {
      var d = new Date(r.human_reviewed_at);
      var dd = String(d.getDate()).padStart(2,'0');
      var mm = String(d.getMonth()+1).padStart(2,'0');
      var yy = String(d.getFullYear()).slice(2);
      var hh = String(d.getHours()).padStart(2,'0');
      var min = String(d.getMinutes()).padStart(2,'0');
      date = dd+'/'+mm+'/'+yy+' '+hh+':'+min;
    }
    var goodRate = r.total_results > 0 ? Math.round((r.good_fits||0)/r.total_results*100) : 0;
    var combinedRate = r.total_results > 0 ? Math.round(((r.good_fits||0)+(r.good_fits_borderline||0))/r.total_results*100) : 0;
    html += '<div class="review-card">' +
      '<div class="review-query">' + r.query +
        '<span class="reviewer-badge">' + (r.human_reviewed_by||'anonymous') + '</span>' +
      '</div>' +
      '<div class="review-meta">' +
        date + ' &nbsp;·&nbsp; ' +
        '<span style="color:#34d399">' + (r.good_fits||0) + ' good</span>' +
        ' <span style="color:#fbbf24">+' + (r.good_fits_borderline||0) + ' borderline</span>' +
        ' / ' + (r.total_results||0) + ' total' +
        ' &nbsp;·&nbsp; ' + goodRate + '% good &nbsp; ' + combinedRate + '% combined' +
      '</div>' +
      '<div class="review-text">' + (r.human_review||'') + '</div>' +
    '</div>';
  });
  el.innerHTML = html;
}

function applyFilter() {
  var from = document.getElementById('date-from').value;
  var to = document.getElementById('date-to').value;

  var filteredRuns = allRuns.filter(function(r) {
    var d = (r.created_at||'').slice(0,10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });

  // Filter results by run_id if possible, otherwise use all
  var filteredRunIds = {};
  filteredRuns.forEach(function(r){ if (r.run_id) filteredRunIds[r.run_id] = true; });
  var hasRunIds = allResults.some(function(r){ return !!r.run_id; });
  var filteredResults = (hasRunIds && Object.keys(filteredRunIds).length > 0)
    ? allResults.filter(function(r){ return filteredRunIds[r.run_id]; })
    : allResults;

  var filteredReviews = allReviews.filter(function(r) {
    var d = (r.human_reviewed_at||'').slice(0,10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });

  var label = '';
  if (from && to) label = 'Showing ' + formatDate(from) + ' to ' + formatDate(to);
  else if (from) label = 'Showing from ' + formatDate(from);
  else if (to) label = 'Showing up to ' + formatDate(to);
  document.getElementById('filter-label').textContent = label;

  renderKPIs(filteredRuns, filteredResults, filteredReviews);
  renderDomainTable(filteredRuns);
  renderDailyTable(filteredRuns);
  renderChart(filteredRuns);
  renderProblems(filteredResults);
  renderReviews(filteredReviews);
}

function clearFilter() {
  document.getElementById('date-from').value = '';
  document.getElementById('date-to').value = '';
  document.getElementById('filter-label').textContent = '';
  renderKPIs(allRuns, allResults, allReviews);
  renderDomainTable(allRuns);
  renderDailyTable(allRuns);
  renderChart(allRuns);
  renderProblems(allResults);
  renderReviews(allReviews);
}

function formatDate(iso) {
  if (!iso) return '';
  var parts = iso.split('-');
  return parts[2]+'/'+parts[1]+'/'+parts[0].slice(2);
}

window.addEventListener('load', async function() {
  try {
    var res = await fetch('/api/dashboard');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    if (data.error) throw new Error(data.error);

    allRuns = data.runs || [];
    allResults = data.results || [];
    allReviews = data.reviews || [];

    // Default from-date to today
    var today = new Date().toISOString().slice(0,10);
    document.getElementById('date-from').value = today;

    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = '';

    applyFilter();
    renderReviews(allReviews);
  } catch(e) {
    document.getElementById('loading').style.display = 'none';
    var el = document.getElementById('error');
    el.textContent = 'Error loading dashboard: ' + e.message;
    el.style.display = 'block';
  }
});
</script>
</body>
</html>
