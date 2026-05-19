import {
  COUNTRY_BENCHMARKS,
  DEFAULT_PLAN,
  calculateCountryRecommendations,
  calculateCountryTargets,
  calculatePlan,
  convertCurrency
} from "./calculations.js";
import { currencies, dictionary, locales } from "./i18n.js";

const STORAGE_KEY = "fire-retirement-planner:v1";
const currentYear = new Date().getFullYear();
const state = loadState();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      currency: saved.currency || "USD",
      language: saved.language || "en",
      showBenchmarkCurrency: saved.showBenchmarkCurrency ?? false,
      showFormula: false,
      cashflowOpen: false,
      plan: { ...DEFAULT_PLAN, ...(saved.plan || {}) }
    };
  } catch {
    return {
      currency: "USD",
      language: "en",
      showBenchmarkCurrency: false,
      showFormula: false,
      cashflowOpen: false,
      plan: { ...DEFAULT_PLAN }
    };
  }
}

function persist() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      currency: state.currency,
      language: state.language,
      showBenchmarkCurrency: state.showBenchmarkCurrency,
      plan: state.plan
    })
  );
}

function t(key) {
  return dictionary[state.language][key] || dictionary.en[key] || key;
}

function formatMoney(value, options = {}) {
  const locale = locales[state.language]?.locale || "en-GB";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: state.currency,
    maximumFractionDigits: options.decimals ?? (["JPY", "KRW"].includes(state.currency) ? 0 : 0),
    notation: options.compact ? "compact" : "standard"
  }).format(Number.isFinite(value) ? value : 0);
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat(locales[state.language]?.locale || "en-GB", {
    maximumFractionDigits: digits
  }).format(Number.isFinite(value) ? value : 0);
}

function setPlanValue(key, value) {
  state.plan[key] = sanitizeNumber(value);
  if (key === "monthlyAccommodation" || key === "localLivingWage") {
    state.plan.monthlyLivingCost = Number(state.plan.monthlyAccommodation || 0) + Number(state.plan.localLivingWage || 0);
  }
  persist();
  render();
}

function commitPlanInput(input, shouldRender = false) {
  const key = input.dataset.plan;
  input.value = String(input.value).replace(/[^\d.-]/g, "");
  state.plan[key] = sanitizeNumber(input.value);
  if (key === "monthlyAccommodation" || key === "localLivingWage") {
    state.plan.monthlyLivingCost = Number(state.plan.monthlyAccommodation || 0) + Number(state.plan.localLivingWage || 0);
  }
  persist();
  if (shouldRender) render();
}

function setSetting(key, value) {
  if (key === "currency") {
    setCurrency(value);
    return;
  }
  state[key] = value;
  persist();
  render();
}

function setCurrency(nextCurrency) {
  if (nextCurrency === state.currency) return;
  const previousCurrency = state.currency;
  const moneyKeys = [
    "currentAssets",
    "monthlyAccommodation",
    "localLivingWage",
    "monthlyLivingCost",
    "monthlyPension",
    "monthlyInvestment"
  ];
  moneyKeys.forEach((key) => {
    state.plan[key] = Math.round(convertCurrency(state.plan[key], previousCurrency, nextCurrency));
  });
  state.currency = nextCurrency;
  persist();
  render();
}

function sanitizeNumber(value) {
  const cleaned = String(value).replace(/[^\d.-]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function stepPlanValue(key, direction) {
  const input = document.querySelector(`[data-plan="${key}"]`);
  const step = Number(input?.getAttribute("step") || 1);
  const min = Number(input?.getAttribute("min") ?? -Infinity);
  const max = Number(input?.getAttribute("max") ?? Infinity);
  const next = Math.min(max, Math.max(min, Number(state.plan[key] || 0) + step * direction));
  state.plan[key] = Math.round(next * 100) / 100;
  if (key === "monthlyAccommodation" || key === "localLivingWage") {
    state.plan.monthlyLivingCost = Number(state.plan.monthlyAccommodation || 0) + Number(state.plan.localLivingWage || 0);
  }
  persist();
  render();
}

function applyCountryBenchmark(code) {
  const profile = COUNTRY_BENCHMARKS[code];
  if (!profile) return;
  state.plan.retirementCountry = code;
  state.plan.monthlyAccommodation = Math.round(convertCurrency(profile.monthlyAccommodation, profile.currency, state.currency));
  state.plan.localLivingWage = Math.round(convertCurrency(profile.localLivingWage, profile.currency, state.currency));
  state.plan.monthlyLivingCost = state.plan.monthlyAccommodation + state.plan.localLivingWage;
  state.showBenchmarkCurrency = true;
  persist();
  render();
}

function supportedLabel(years) {
  return years >= 60 ? t("yearsPlus") : `${formatNumber(years)} ${t("years")}`;
}

function render() {
  const result = calculatePlan(state.plan, { currentYear });
  const countryTargets = calculateCountryTargets(state.plan, state.currency);
  const countryRecommendations = calculateCountryRecommendations(state.plan, state.currency, { currentYear });
  const benchmarkCurrency = COUNTRY_BENCHMARKS[state.plan.retirementCountry]?.currency || state.currency;
  document.documentElement.lang = locales[state.language]?.locale || "en-GB";
  document.querySelector("#app").innerHTML = `
    <main class="app-shell">
      <header class="hero-card">
        <div class="topbar">
          <div class="brand">
            <span class="brand-mark" aria-hidden="true"></span>
            <div>
              <p class="eyebrow">${t("installReady")}</p>
              <h1>${t("appName")}</h1>
            </div>
          </div>
          <button class="ghost-button" id="formulaButton" type="button">${t("explain")}</button>
        </div>
        <p class="hero-subtitle">${t("subtitle")}</p>
        <section class="target-panel" aria-label="${t("target")}">
          <div>
            <span>${t("target")}</span>
            <strong>${formatMoney(result.fireTarget, { compact: true })}</strong>
          </div>
          <div class="${result.fireReached ? "status good" : "status warn"}">
            ${result.fireReached ? t("ready") : t("short")}
          </div>
        </section>
        <div class="metric-grid">
          ${metric(t("fireDate"), result.estimatedFireYear ? `${result.estimatedFireYear} (${formatNumber(result.estimatedFireAge, 1)})` : "80+")}
          ${metric(t("projected"), formatMoney(result.projectedPortfolio, { compact: true }))}
          ${metric(result.fireGap > 0 ? t("gap") : t("surplus"), formatMoney(Math.abs(result.fireGap), { compact: true }))}
        </div>
      </header>

      <section class="card controls-card">
        <div class="section-title">
          <div>
            <h2>${t("settings")}</h2>
            <p>${t("retirement")}</p>
          </div>
        </div>
        <div class="select-grid">
          ${selectControl("currency", t("currency"), currencies.map((item) => [item, item]), state.currency)}
          ${selectControl(
            "language",
            t("language"),
            Object.entries(locales).map(([key, value]) => [key, value.label]),
            state.language
          )}
        </div>
        ${toggleControl("showBenchmarkCurrency", t("showBenchmarkCurrency"), t("showBenchmarkCurrencyHint"), state.showBenchmarkCurrency)}
        ${numberRow("currentAge", t("currentAge"), state.plan.currentAge, "", 18, 85, 1)}
        ${numberRow("retireAge", t("retireAge"), state.plan.retireAge, "", 30, 90, 1)}
        ${numberRow("currentAssets", t("currentAssets"), state.plan.currentAssets, state.currency, 0, 100000000, 1000, benchmarkCurrency)}
        ${numberRow("monthlyAccommodation", t("monthlyAccommodation"), state.plan.monthlyAccommodation, state.currency, 0, 1000000, 100, benchmarkCurrency)}
        ${numberRow("localLivingWage", t("localLivingWage"), state.plan.localLivingWage, state.currency, 0, 1000000, 100, benchmarkCurrency)}
        ${numberRow("monthlyLivingCost", t("monthlyLivingCost"), state.plan.monthlyLivingCost, state.currency, 0, 1000000, 100, benchmarkCurrency)}
        ${numberRow("monthlyPension", t("monthlyPension"), state.plan.monthlyPension, state.currency, 0, 1000000, 100, benchmarkCurrency)}
        <div class="subhead">${t("assumptions")}</div>
        ${numberRow("inflationRate", t("inflationRate"), state.plan.inflationRate, "%", 0, 20, 0.1)}
        ${numberRow("accumulationReturn", t("accumulationReturn"), state.plan.accumulationReturn, "%", -10, 30, 0.1)}
        ${numberRow("payoutReturn", t("payoutReturn"), state.plan.payoutReturn, "%", -10, 30, 0.1)}
        ${numberRow("swr", t("swr"), state.plan.swr, "%", 0.1, 12, 0.1)}
        <div class="subhead">${t("investing")}</div>
        ${numberRow("monthlyInvestment", t("monthlyInvestment"), state.plan.monthlyInvestment, state.currency, 0, 1000000, 100, benchmarkCurrency)}
      </section>

      <section class="card tutorial-card">
        <div class="section-title">
          <div>
            <h2>${t("tutorialTitle")}</h2>
            <p>${t("tutorialHint")}</p>
          </div>
        </div>
        <ol class="tutorial-list">
          ${t("tutorialSteps").map((step) => `<li>${step}</li>`).join("")}
        </ol>
      </section>

      <section class="card">
        <div class="section-title">
          <div>
            <h2>${t("countryBenchmarks")}</h2>
            <p>${t("countryBenchmarksHint")}</p>
          </div>
        </div>
        ${recommendationPanel(countryRecommendations)}
        <p class="benchmark-note">${t("benchmarkNote")}</p>
        <div class="country-list">
          ${countryTargets.map((item) => countryCard(item)).join("")}
        </div>
      </section>

      <section class="card">
        <div class="section-title">
          <div>
            <h2>${t("sensitivity")}</h2>
            <p>${t("sensitivityHint")}</p>
          </div>
        </div>
        ${slider("accumulationReturn", t("accumulationReturn"), state.plan.accumulationReturn, 1, 15, 0.1, "%")}
        ${slider("retireAge", t("retireAge"), state.plan.retireAge, 40, 75, 1, "")}
        <div class="scenario-result">
          <div>
            <span>${t("fireDate")}</span>
            <strong>${result.estimatedFireYear || "80+"}</strong>
          </div>
          <div>
            <span>${t("target")}</span>
            <strong>${formatMoney(result.fireTarget, { compact: true })}</strong>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="section-title">
          <div>
            <h2>${t("crisis")}</h2>
            <p>${t("crisisHint")}</p>
          </div>
        </div>
        ${crisisCard("marketDrop", "alert", t("marketBreakdown"), `${state.plan.marketDrop}%`, t("marketBreakdownText"), supportedLabel(result.marketStress.supportedYears), 0, 60, 1)}
        ${crisisCard("inflationShockMultiplier", "wave", t("inflationShock"), `x${state.plan.inflationShockMultiplier}`, t("inflationShockText"), supportedLabel(result.inflationStress.supportedYears), 1, 3, 0.1)}
      </section>

      <section class="card">
        <button class="accordion" id="cashflowToggle" type="button" aria-expanded="${state.cashflowOpen}">
          <span>
            <strong>${t("cashflow")}</strong>
            <small>${t("cashflowHint")}</small>
          </span>
          <span class="chevron">${state.cashflowOpen ? "⌃" : "⌄"}</span>
        </button>
        ${state.cashflowOpen ? cashflowTable(result.cashFlow) : ""}
      </section>
    </main>
    ${state.showFormula ? formulaModal(result) : ""}
  `;

  bindEvents();
}

function metric(label, value) {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;
}

function selectControl(id, label, options, value) {
  return `
    <label class="select-control">
      <span>${label}</span>
      <select data-setting="${id}">
        ${options.map(([key, text]) => `<option value="${key}" ${key === value ? "selected" : ""}>${text}</option>`).join("")}
      </select>
    </label>
  `;
}

function toggleControl(id, label, hint, checked) {
  return `
    <label class="toggle-control">
      <span>
        <b>${label}</b>
        <small>${hint}</small>
      </span>
      <input data-setting="${id}" type="checkbox" ${checked ? "checked" : ""} />
    </label>
  `;
}

function numberRow(id, label, value, suffix, min, max, step, compareCurrency = null) {
  const showComparison =
    state.showBenchmarkCurrency && suffix && suffix !== "%" && compareCurrency && compareCurrency !== suffix;
  const comparison = showComparison
    ? `<small class="converted-money">${countryMoney(convertCurrency(value, suffix, compareCurrency), compareCurrency, false)}</small>`
    : "";
  return `
    <label class="number-row">
      <span>${label}</span>
      <span class="number-stack">
        <span class="number-input">
          ${suffix && suffix !== "%" ? `<em>${suffix}</em>` : ""}
          <button class="step-button" type="button" data-step-down="${id}" aria-label="Decrease ${label}">−</button>
          <input data-plan="${id}" type="text" value="${value}" min="${min}" max="${max}" step="${step}" inputmode="decimal" pattern="[0-9.\\-]*" />
          <button class="step-button" type="button" data-step-up="${id}" aria-label="Increase ${label}">+</button>
          ${suffix === "%" ? `<em>%</em>` : ""}
        </span>
        ${comparison}
      </span>
    </label>
  `;
}

function countryMoney(value, currency, compact = true) {
  return new Intl.NumberFormat(locales[state.language]?.locale || "en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    notation: compact ? "compact" : "standard"
  }).format(Number.isFinite(value) ? value : 0);
}

function countryCard(item) {
  const selected = item.code === state.plan.retirementCountry;
  return `
    <article class="country-card ${selected ? "selected" : ""}">
      <div class="country-head">
        <div>
          <h3>${item.label}</h3>
          <span>${item.currency}</span>
        </div>
        <strong>${countryMoney(item.fireTarget, item.currency)}</strong>
      </div>
      <div class="country-stats">
        ${countryStat(t("accommodation"), countryMoney(item.monthlyAccommodation, item.currency, false))}
        ${countryStat(t("localWage"), countryMoney(item.localLivingWage, item.currency, false))}
        ${countryStat(t("monthlyTotal"), countryMoney(item.monthlyTotal, item.currency, false))}
      </div>
      <p>${t("sourceNote")}: ${item.note}</p>
      <button class="benchmark-button" type="button" data-apply-country="${item.code}">${t("applyBenchmark")}</button>
    </article>
  `;
}

function recommendationPanel(items) {
  const top = items.slice(0, 3);
  return `
    <div class="recommendation-panel">
      <div class="recommendation-head">
        <div>
          <h3>${t("recommendation")}</h3>
          <p>${t("recommendationHint")}</p>
        </div>
        <span>${t("bestFit")}</span>
      </div>
      <div class="recommendation-list">
        ${top.map((item, index) => recommendationRow(item, index)).join("")}
      </div>
    </div>
  `;
}

function recommendationRow(item, index) {
  return `
    <article class="recommendation-row">
      <div class="rank">${index + 1}</div>
      <div class="recommendation-body">
        <div class="recommendation-title">
          <strong>${item.label}</strong>
          <span class="fit ${item.status}">${t(item.status)}</span>
        </div>
        <div class="progress-track" aria-label="${t("coverage")} ${Math.round(item.coverageRatio * 100)}%">
          <span style="width:${Math.min(100, Math.round(item.coverageRatio * 100))}%"></span>
        </div>
        <div class="recommendation-meta">
          <span>${t("coverage")}: ${Math.round(item.coverageRatio * 100)}%</span>
          <span>${t("targetGap")}: ${countryMoney(item.gapLocal, item.currency)}</span>
        </div>
      </div>
    </article>
  `;
}

function countryStat(label, value) {
  return `<div><span>${label}</span><strong>${value}</strong></div>`;
}

function slider(id, label, value, min, max, step, suffix) {
  return `
    <label class="slider-control">
      <span><b>${label}</b><strong>${formatNumber(value, step < 1 ? 1 : 0)}${suffix}</strong></span>
      <input data-plan="${id}" type="range" value="${value}" min="${min}" max="${max}" step="${step}" />
      <small><span>${min}${suffix}</span><span>${max}${suffix}</span></small>
    </label>
  `;
}

function crisisCard(id, icon, title, value, copy, result, min, max, step) {
  return `
    <article class="crisis-card ${icon}">
      <div class="crisis-main">
        <div class="crisis-icon" aria-hidden="true">${icon === "alert" ? "!" : "~"}</div>
        <div>
          <h3>${title} <span>${value}</span></h3>
          <p>${copy}</p>
        </div>
        <strong>${result}</strong>
      </div>
      <input aria-label="${title}" data-plan="${id}" type="range" value="${state.plan[id]}" min="${min}" max="${max}" step="${step}" />
    </article>
  `;
}

function cashflowTable(rows) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("age")}</th>
            <th>${t("start")}</th>
            <th>${t("withdrawal")}</th>
            <th>${t("end")}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .slice(0, 36)
            .map(
              (row) => `
                <tr>
                  <td>${row.age}</td>
                  <td>${formatMoney(row.startBalance, { compact: true })}</td>
                  <td>${formatMoney(row.withdrawal, { compact: true })}</td>
                  <td>${formatMoney(row.endBalance, { compact: true })}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function formulaModal(result) {
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="formula-modal" role="dialog" aria-modal="true" aria-labelledby="formulaTitle">
        <button class="close-button" id="closeFormula" type="button" aria-label="${t("close")}">×</button>
        <p>${t("formula")}</p>
        <h2 id="formulaTitle">${t("target")}</h2>
        <strong class="modal-target">${formatMoney(result.fireTarget, { compact: true })}</strong>
        <span class="modal-copy">${t("swrLine")}</span>
        <div class="formula-rows">
          ${formulaRow(t("adjustedSpend"), `${formatMoney(result.adjustedMonthlyCost)} / mo`)}
          ${formulaRow(t("pensionDeduct"), `${formatMoney(result.annualPension)} / yr`)}
          ${formulaRow(t("annualNeed"), `${formatMoney(result.annualWithdrawalNeed)} / yr`)}
          ${formulaRow(`÷ ${t("swr")} (${state.plan.swr}%)`, formatMoney(result.fireTarget))}
        </div>
      </section>
    </div>
  `;
}

function formulaRow(label, value) {
  return `<div><span>${label}</span><strong>${value}</strong></div>`;
}

function bindEvents() {
  document.querySelectorAll("[data-plan]").forEach((input) => {
    if (input.type === "range") {
      input.addEventListener("input", (event) => setPlanValue(event.currentTarget.dataset.plan, event.currentTarget.value));
      return;
    }
    input.addEventListener("input", (event) => commitPlanInput(event.currentTarget, false));
    input.addEventListener("blur", (event) => commitPlanInput(event.currentTarget, true));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.currentTarget.blur();
      }
    });
  });
  document.querySelectorAll("[data-setting]").forEach((select) => {
    select.addEventListener("change", (event) => {
      const control = event.currentTarget;
      setSetting(control.dataset.setting, control.type === "checkbox" ? control.checked : control.value);
    });
  });
  document.querySelectorAll("[data-step-down]").forEach((button) => {
    button.addEventListener("click", (event) => stepPlanValue(event.currentTarget.dataset.stepDown, -1));
  });
  document.querySelectorAll("[data-step-up]").forEach((button) => {
    button.addEventListener("click", (event) => stepPlanValue(event.currentTarget.dataset.stepUp, 1));
  });
  document.querySelectorAll("[data-apply-country]").forEach((button) => {
    button.addEventListener("click", (event) => applyCountryBenchmark(event.currentTarget.dataset.applyCountry));
  });
  document.querySelector("#formulaButton")?.addEventListener("click", () => {
    state.showFormula = true;
    render();
  });
  document.querySelector("#closeFormula")?.addEventListener("click", () => {
    state.showFormula = false;
    render();
  });
  document.querySelector(".modal-backdrop")?.addEventListener("click", (event) => {
    if (event.target.classList.contains("modal-backdrop")) {
      state.showFormula = false;
      render();
    }
  });
  document.querySelector("#cashflowToggle")?.addEventListener("click", () => {
    state.cashflowOpen = !state.cashflowOpen;
    render();
  });
}

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./service-worker.js");
}

render();
