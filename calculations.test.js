import assert from "node:assert/strict";
import {
  calculateCountryRecommendations,
  calculateCountryTargets,
  calculatePlan,
  convertCurrency,
  futureValueWithMonthlyContribution
} from "../src/calculations.js";

const approx = (actual, expected, tolerance = 1) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
};

const fv = futureValueWithMonthlyContribution(0, 1000, 12, 1);
assert.ok(fv > 12600 && fv < 12820, "monthly contribution future value compounds monthly");

const result = calculatePlan(
  {
    currentAge: 30,
    retireAge: 65,
    currentAssets: 0,
    monthlyLivingCost: 30000,
    monthlyPension: 15000,
    inflationRate: 2.5,
    accumulationReturn: 7,
    payoutReturn: 5,
    swr: 4,
    monthlyInvestment: 10000
  },
  { currentYear: 2026 }
);

assert.equal(result.yearsToRetire, 35);
assert.equal(result.retirementYear, 2061);
approx(result.adjustedMonthlyCost, 71111, 100);
approx(result.annualWithdrawalNeed, 673332, 1200);
approx(result.fireTarget, 16833300, 30000);
assert.ok(result.projectedPortfolio > 17000000, "default investment plan reaches target");
assert.ok(result.fireReached, "portfolio should be on track for this scenario");
assert.ok(result.cashFlow.length > 10, "cash-flow schedule is generated");
assert.ok(result.marketStress.supportedYears <= result.supportedYears, "market stress cannot improve support");
assert.ok(result.inflationStress.supportedYears <= result.supportedYears, "inflation stress cannot improve support");

const countryTargets = calculateCountryTargets({ swr: 4, monthlyPension: 0 });
assert.equal(countryTargets.length, 8);
const korea = countryTargets.find((item) => item.code === "KR");
assert.equal(korea.currency, "KRW");
assert.equal(korea.monthlyTotal, 2856880);
approx(korea.fireTarget, 857064000, 1);
assert.ok(countryTargets.find((item) => item.code === "US"), "USA benchmark is present");
assert.ok(countryTargets.find((item) => item.code === "PH"), "Philippines benchmark is present");
assert.ok(countryTargets.find((item) => item.code === "TH"), "Thailand benchmark is present");

const twdTargets = calculateCountryTargets({ swr: 4, monthlyPension: 15810 }, "TWD");
const ukWithTwdPension = twdTargets.find((item) => item.code === "UK");
approx(ukWithTwdPension.monthlyPensionLocal, 368, 1);
assert.ok(ukWithTwdPension.fireTarget > 1000000, "benchmark target should not collapse across currencies");

approx(convertCurrency(100, "USD", "PHP"), 6130, 1);
const recommendations = calculateCountryRecommendations({ ...result.plan, currentAssets: 2000000 }, "USD", { currentYear: 2026 });
assert.equal(recommendations.length, 8);
assert.ok(recommendations[0].coverageRatio >= recommendations[1].coverageRatio, "recommendations are ranked by coverage");
assert.ok(["readyCountry", "closeCountry", "stretchCountry", "notReadyCountry"].includes(recommendations[0].status));

console.log("calculation tests passed");
