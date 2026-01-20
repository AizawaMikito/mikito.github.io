const KPI_LIST = ["新規物件数", "有効物件数", "内覧数", "申込数", "契約数"];
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwCh2fMhV71lr1jmgN1WY2gPwaxXqw8Aw2KyGw8-CYBvRGv9PY8VahV0saxbr8J0NkHpg/exec";

/* ===== キャッシュ ===== */
let DAILY_CACHE = [];
let TARGET_CACHE = [];

/* ===== GAS から取得 ===== */
async function fetchFromGAS() {
  const res = await fetch(GAS_API_URL);
  const json = await res.json();
  DAILY_CACHE = json.actuals;
  TARGET_CACHE = json.targets;
}

/* ===== ユーティリティ ===== */
function calcRate(actual, target) {
  if (!target) return 0;
  return Math.round((actual / target) * 100);
}

function getProgressBarColor(rate) {
  if (rate >= 100) return "linear-gradient(90deg, #5ed3a2, #34d399)";
  if (rate >= 70)  return "linear-gradient(90deg, #a5b4fc, #7b9cff)";
  return "linear-gradient(90deg, #c7d2fe, #a5b4fc)";
}

function getWeekRangeFromMonday(monday) {
  const start = new Date(monday);
  const end = new Date(monday);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function formatDate(d) {
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`;
}

/* ===== 実績集計 ===== */
function calcWeeklyActualFromDaily(dailyActuals, weekStartDate) {
  const { start, end } = getWeekRangeFromMonday(weekStartDate);

  const weekly = {};
  KPI_LIST.forEach(kpi => weekly[kpi] = 0);

  const areaWeekly = {};
  const areaNames = Object.keys(dailyActuals[0]?.areas || {});
  areaNames.forEach(a => areaWeekly[a] = 0);

  dailyActuals.forEach(row => {
    const d = new Date(row.date);
    if (d >= start && d <= end) {
      KPI_LIST.forEach(kpi => weekly[kpi] += row[kpi] || 0);
      Object.entries(row.areas).forEach(([a, v]) => areaWeekly[a] += v || 0);
    }
  });

  return { weekly, areaWeekly };
}

function calcMonthlyActual(dailyActuals, year, month) {
  const monthly = {};
  KPI_LIST.forEach(kpi => monthly[kpi] = 0);

  dailyActuals.forEach(row => {
    const d = new Date(row.date);
    if (d.getFullYear() === year && d.getMonth()+1 === month) {
      KPI_LIST.forEach(kpi => monthly[kpi] += row[kpi] || 0);
    }
  });

  return monthly;
}

function calcYearlyActual(dailyActuals, year) {
  const yearly = {};
  KPI_LIST.forEach(kpi => yearly[kpi] = 0);

  dailyActuals.forEach(row => {
    const d = new Date(row.date);
    if (d.getFullYear() === year) {
      KPI_LIST.forEach(kpi => yearly[kpi] += row[kpi] || 0);
    }
  });

  return yearly;
}

/* ===== 目標取得 ===== */
function getMonthlyTarget(year, month) {
  return TARGET_CACHE.find(t => t.year === year && t.month === month) || null;
}

function getYearlyTarget(year) {
  const yearly = {};
  KPI_LIST.forEach(kpi => yearly[kpi] = 0);

  TARGET_CACHE
    .filter(t => t.year === year)
    .forEach(t => {
      KPI_LIST.forEach(kpi => yearly[kpi] += t[kpi] || 0);
    });

  return yearly;
}

function calcWeeklyTargetFromMonthly(monthlyTarget, weekStartDate) {
  const year = weekStartDate.getFullYear();
  const month = weekStartDate.getMonth() + 1;

  const mt = getMonthlyTarget(year, month);
  if (!mt) return null;

  const weeksInMonth = Math.ceil(
    new Date(year, month, 0).getDate() / 7
  );

  const weekly = {};
  KPI_LIST.forEach(kpi => {
    weekly[kpi] = Math.round((mt[kpi] || 0) / weeksInMonth);
  });

  return weekly;
}

/* ===== 描画 ===== */
function renderKpiCards(containerId, actualData, targetData) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  KPI_LIST.forEach(kpi => {
    const actual = actualData?.[kpi] || 0;
    const target = targetData?.[kpi] || 0;
    const rate = calcRate(actual, target);

    const card = document.createElement("div");
    card.className = "kpi-card";
    card.innerHTML = `
      <div class="kpi-title">${kpi}</div>
      <div class="kpi-value">${actual} / ${target}</div>
      <div class="kpi-rate">${rate}%</div>
      <div class="progress-wrap"><div class="progress-bar"></div></div>
    `;
    container.appendChild(card);

    const bar = card.querySelector(".progress-bar");
    bar.style.background = getProgressBarColor(rate);
    setTimeout(() => bar.style.width = `${Math.min(rate, 100)}%`, 120);
  });
}

function renderAreaBars(areaActual) {
  const container = document.getElementById("area-bars");
  container.innerHTML = "";

  const maxVal = Math.max(...Object.values(areaActual), 1);

  Object.entries(areaActual).forEach(([area, val]) => {
    const rate = (val / maxVal) * 100;

    const row = document.createElement("div");
    row.className = "area-row";
    row.innerHTML = `
      <div class="area-name">${area}</div>
      <div class="area-bar-wrap"><div class="area-bar"></div></div>
      <div>${val}</div>
    `;
    container.appendChild(row);

    const bar = row.querySelector(".area-bar");
    setTimeout(() => bar.style.width = `${rate}%`, 120);
  });
}

/* ===== 期間UI ===== */
const weekStartInput = document.getElementById("weekStartInput");
const dateRangeEl = document.getElementById("date-range");

async function updateAll() {
  const monday = new Date(weekStartInput.value);
  const { start, end } = getWeekRangeFromMonday(monday);
  dateRangeEl.innerText = `（${formatDate(start)} - ${formatDate(end)}）`;

  if (DAILY_CACHE.length === 0) {
    await fetchFromGAS();
  }

  const weeklyActual = calcWeeklyActualFromDaily(DAILY_CACHE, monday);
  const weeklyTarget = calcWeeklyTargetFromMonthly(null, monday);

  const year = monday.getFullYear();
  const month = monday.getMonth() + 1;

  const monthlyActual = calcMonthlyActual(DAILY_CACHE, year, month);
  const monthlyTarget = getMonthlyTarget(year, month);

  const yearlyActual = calcYearlyActual(DAILY_CACHE, year);
  const yearlyTarget = getYearlyTarget(year);

  renderKpiCards("weekly-kpi-cards", weeklyActual.weekly, weeklyTarget);
  renderAreaBars(weeklyActual.areaWeekly);

  renderKpiCards("monthly-kpi-cards", monthlyActual, monthlyTarget);
  renderKpiCards("yearly-kpi-cards", yearlyActual, yearlyTarget);
}

/* ===== 初期化 ===== */
(function initWeekInput() {
  const today = new Date();
  const day = today.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  today.setDate(today.getDate() + diffToMonday);
  weekStartInput.valueAsDate = today;
})();

weekStartInput.addEventListener("change", updateAll);
updateAll();
