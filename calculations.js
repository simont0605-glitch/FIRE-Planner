export const DEFAULT_PLAN = {
  currentAge: 30,
  retireAge: 65,
  retirementCountry: "UK",
  currentAssets: 50000,
  monthlyAccommodation: 1200,
  localLivingWage: 2000,
  monthlyLivingCost: 3000,
  monthlyPension: 500,
  inflationRate: 2.5,
  accumulationReturn: 7,
  payoutReturn: 5,
  swr: 4,
  monthlyInvestment: 1000,
  marketDrop: 20,
  inflationShockMultiplier: 1.5
};

export const COUNTRY_BENCHMARKS = {
  US: {
    label: "United States",
    currency: "USD",
    monthlyAccommodation: 1855,
    localLivingWage: 5217,
    note: "US median full-time earnings and typical one-bedroom rent benchmark."
  },
  UK: {
    label: "United Kingdom",
    currency: "GBP",
    monthlyAccommodation: 1620,
    localLivingWage: 3320,
    note: "UK median full-time earnings converted from 2025 weekly earnings."
  },
  EU: {
    label: "Europe / Euro area",
    currency: "EUR",
    monthlyAccommodation: 1100,
    localLivingWage: 2654,
    note: "Euro-area wage benchmark with a mid-market city housing estimate."
  },
  KR: {
    label: "South Korea",
    currency: "KRW",
    monthlyAccommodation: 700000,
    localLivingWage: 2156880,
    note: "Korean 2026 monthly minimum wage plus Seoul one-room rent estimate."
  },
  JP: {
    label: "Japan",
    currency: "JPY",
    monthlyAccommodation: 110000,
    localLivingWage: 338915,
    note: "Japan wage benchmark with Tokyo studio housing estimate."
  },
  TW: {
    label: "Taiwan",
    currency: "TWD",
    monthlyAccommodation: 25000,
    localLivingWage: 29500,
    note: "Taiwan 2026 monthly minimum wage plus Taipei studio/one-bedroom rent estimate."
  },
  PH: {
    label: "Philippines",
    currency: "PHP",
    monthlyAccommodation: 30000,
    localLivingWage: 21544,
    note: "Philippines average monthly full-time wage plus Manila studio rent estimate."
  },
  TH: {
    label: "Thailand",
    currency: "THB",
    monthlyAccommodation: 19000,
    localLivingWage: 15972,
    note: "Thailand average monthly wage plus Bangkok studio rent estimate."
  }
};

export const FX_LOCAL_PER_USD = {
  USD: 1,
  GBP: 0.736,
  EUR: 0.855,
  SGD: 1.346,
  TWD: 31.62,
  JPY: 155.5,
  KRW: 1472,
  PHP: 61.3,
  THB: 32.24
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const pct = (value) => Number(value || 0) / 100;

export function futureValueWithMonthlyContribution(principal, monthlyContribution, annualReturn, years) {
  const months = Math.max(0, Math.round(years * 12));
  const monthlyRate = Math.pow(1 + pct(annualReturn), 1 / 12) - 1;
  let balance = Number(principal || 0);

  for (let month = 0; month < months; month += 1) {
    balance = balance * (1 + monthlyRate) + Number(monthlyContribution || 0);
  }

  return balance;
}

export function calculatePlan(input, options = {}) {
  const plan = { ...DEFAULT_PLAN, ...input };
  const currentYear = options.currentYear || new Date().getFullYear();
  const yearsToRetire = Math.max(0, plan.retireAge - plan.currentAge);
  const retirementYear = currentYear + yearsToRetire;
  const inflationFactor = Math.pow(1 + pct(plan.inflationRate), yearsToRetire);
  const adjustedMonthlyCost = plan.monthlyLivingCost * inflationFactor;
  const adjustedAnnualCost = adjustedMonthlyCost * 12;
  const annualPension = plan.monthlyPension * 12;
  const annualWithdrawalNeed = Math.max(0, adjustedAnnualCost - annualPension);
  const fireTarget = plan.swr > 0 ? annualWithdrawalNeed / pct(plan.swr) : Infinity;
  const projectedPortfolio = futureValueWithMonthlyContribution(
    plan.currentAssets,
    plan.monthlyInvestment,
    plan.accumulationReturn,
    yearsToRetire
  );
  const fireGap = fireTarget - projectedPortfolio;
  const fireReached = projectedPortfolio >= fireTarget;
  const estimated = estimateFireDate(plan, currentYear, fireTarget);
  const baseCashFlow = buildCashFlow(plan, projectedPortfolio, adjustedMonthlyCost, annualPension);
  const marketCashFlow = buildCashFlow(
    plan,
    projectedPortfolio * (1 - pct(plan.marketDrop)),
    adjustedMonthlyCost,
    annualPension
  );
  const inflationCashFlow = buildCashFlow(
    plan,
    projectedPortfolio,
    adjustedMonthlyCost * plan.inflationShockMultiplier,
    annualPension
  );

  return {
    plan,
    yearsToRetire,
    retirementYear,
    inflationFactor,
    adjustedMonthlyCost,
    adjustedAnnualCost,
    annualPension,
    annualWithdrawalNeed,
    fireTarget,
    projectedPortfolio,
    fireGap,
    fireReached,
    estimatedFireAge: estimated.age,
    estimatedFireYear: estimated.year,
    cashFlow: baseCashFlow.rows,
    supportedYears: baseCashFlow.supportedYears,
    marketStress: {
      balanceAfterDrop: projectedPortfolio * (1 - pct(plan.marketDrop)),
      supportedYears: marketCashFlow.supportedYears
    },
    inflationStress: {
      stressedMonthlyCost: adjustedMonthlyCost * plan.inflationShockMultiplier,
      supportedYears: inflationCashFlow.supportedYears
    }
  };
}

export function calculateCountryTargets(planInput, userCurrency = "USD") {
  const plan = { ...DEFAULT_PLAN, ...planInput };
  return Object.entries(COUNTRY_BENCHMARKS).map(([code, profile]) => {
    const monthlyTotal = profile.monthlyAccommodation + profile.localLivingWage;
    const monthlyPensionLocal = convertCurrency(plan.monthlyPension, userCurrency, profile.currency);
    const annualNeed = Math.max(0, monthlyTotal * 12 - monthlyPensionLocal * 12);
    const fireTarget = plan.swr > 0 ? annualNeed / pct(plan.swr) : Infinity;

    return {
      code,
      ...profile,
      monthlyTotal,
      annualNeed,
      fireTarget,
      monthlyPensionLocal,
      wageCoverageRatio: profile.monthlyAccommodation / profile.localLivingWage
    };
  });
}

export function convertCurrency(amount, fromCurrency, toCurrency) {
  const fromRate = FX_LOCAL_PER_USD[fromCurrency] || 1;
  const toRate = FX_LOCAL_PER_USD[toCurrency] || 1;
  return (Number(amount || 0) / fromRate) * toRate;
}

export function calculateCountryRecommendations(planInput, userCurrency, options = {}) {
  const planResult = calculatePlan(planInput, options);
  const targets = calculateCountryTargets(planInput, userCurrency);

  return targets
    .map((target) => {
      const projectedLocal = convertCurrency(planResult.projectedPortfolio, userCurrency, target.currency);
      const gapLocal = Math.max(0, target.fireTarget - projectedLocal);
      const coverageRatio = target.fireTarget > 0 ? projectedLocal / target.fireTarget : 1;
      const monthlyUsd = convertCurrency(target.monthlyTotal, target.currency, "USD");

      return {
        ...target,
        projectedLocal,
        gapLocal,
        coverageRatio,
        monthlyUsd,
        status: recommendationStatus(coverageRatio)
      };
    })
    .sort((a, b) => {
      if (Math.abs(b.coverageRatio - a.coverageRatio) > 0.02) {
        return b.coverageRatio - a.coverageRatio;
      }
      return a.monthlyUsd - b.monthlyUsd;
    });
}

function recommendationStatus(coverageRatio) {
  if (coverageRatio >= 1) return "readyCountry";
  if (coverageRatio >= 0.75) return "closeCountry";
  if (coverageRatio >= 0.5) return "stretchCountry";
  return "notReadyCountry";
}

function estimateFireDate(plan, currentYear, fireTarget) {
  if (!Number.isFinite(fireTarget) || fireTarget <= 0) {
    return { age: plan.currentAge, year: currentYear };
  }

  let balance = Number(plan.currentAssets || 0);
  const monthlyRate = Math.pow(1 + pct(plan.accumulationReturn), 1 / 12) - 1;
  const maxMonths = 80 * 12;

  for (let month = 0; month <= maxMonths; month += 1) {
    if (balance >= fireTarget) {
      return {
        age: Math.round((plan.currentAge + month / 12) * 10) / 10,
        year: currentYear + Math.floor(month / 12)
      };
    }
    balance = balance * (1 + monthlyRate) + Number(plan.monthlyInvestment || 0);
  }

  return { age: null, year: null };
}

function buildCashFlow(plan, startingPortfolio, startingMonthlyCost, annualPension) {
  const rows = [];
  let balance = Math.max(0, Number(startingPortfolio || 0));
  let monthlyCost = Number(startingMonthlyCost || 0);
  let supportedYears = 0;

  for (let yearIndex = 0; yearIndex < 61; yearIndex += 1) {
    const age = plan.retireAge + yearIndex;
    const annualCost = monthlyCost * 12;
    const withdrawal = Math.max(0, annualCost - annualPension);
    const startBalance = balance;
    balance = Math.max(0, balance * (1 + pct(plan.payoutReturn)) - withdrawal);

    rows.push({
      age,
      yearIndex,
      startBalance,
      annualCost,
      withdrawal,
      endBalance: balance
    });

    if (startBalance > 0 && (startBalance >= withdrawal || withdrawal === 0)) {
      supportedYears = yearIndex + 1;
    }

    if (balance <= 0 && withdrawal > 0) break;
    monthlyCost *= 1 + pct(plan.inflationRate);
  }

  return {
    rows,
    supportedYears: clamp(supportedYears, 0, 60)
  };
}
