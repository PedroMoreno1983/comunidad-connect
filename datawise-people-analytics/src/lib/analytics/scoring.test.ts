import assert from "node:assert/strict";
import test from "node:test";

import {
  clampScore,
  computeAttritionRisk,
  computeBurnoutRisk,
  computePromotionGapRisk,
  computeTenureRisk,
  riskBand,
} from "@/lib/analytics/scoring";

test("clampScore respeta los limites definidos", () => {
  assert.equal(clampScore(140), 100);
  assert.equal(clampScore(-10), 0);
  assert.equal(clampScore(42), 42);
});

test("computeTenureRisk usa los tramos esperados", () => {
  const scoringMonth = new Date("2025-03-01T00:00:00.000Z");

  assert.equal(computeTenureRisk(new Date("2024-12-15T00:00:00.000Z"), scoringMonth), 100);
  assert.equal(computeTenureRisk(new Date("2024-08-01T00:00:00.000Z"), scoringMonth), 80);
  assert.equal(computeTenureRisk(new Date("2023-09-01T00:00:00.000Z"), scoringMonth), 55);
  assert.equal(computeTenureRisk(new Date("2022-08-01T00:00:00.000Z"), scoringMonth), 30);
  assert.equal(computeTenureRisk(new Date("2020-01-01T00:00:00.000Z"), scoringMonth), 15);
});

test("computePromotionGapRisk reduce el riesgo cuando la promocion es reciente", () => {
  const scoringMonth = new Date("2025-03-01T00:00:00.000Z");
  const hireDate = new Date("2022-01-01T00:00:00.000Z");

  assert.equal(
    computePromotionGapRisk(hireDate, scoringMonth, new Date("2024-10-01T00:00:00.000Z")),
    20,
  );
  assert.equal(
    computePromotionGapRisk(hireDate, scoringMonth, new Date("2023-09-01T00:00:00.000Z")),
    45,
  );
  assert.equal(
    computePromotionGapRisk(hireDate, scoringMonth, new Date("2022-08-01T00:00:00.000Z")),
    70,
  );
  assert.equal(computePromotionGapRisk(hireDate, scoringMonth), 90);
});

test("computeAttritionRisk devuelve score y drivers ordenados por peso", () => {
  const result = computeAttritionRisk({
    absenteeism: 80,
    lowEngagement: 40,
    tenureRisk: 20,
    performanceDrop: 0,
    promotionGap: 100,
  });

  assert.equal(result.score, 49);
  assert.deepEqual(result.drivers, [
    "Absenteeism",
    "Promotion gap",
    "Low engagement",
  ]);
});

test("computeBurnoutRisk prioriza workload cuando domina el modelo", () => {
  const result = computeBurnoutRisk({
    workload: 100,
    absenteeism: 40,
    lowEngagement: 60,
    stressFeedback: 20,
  });

  assert.equal(result.score, 63);
  assert.deepEqual(result.drivers, [
    "Workload",
    "Low engagement",
    "Absenteeism",
  ]);
});

test("riskBand segmenta el score en bajo, medio y alto", () => {
  assert.equal(riskBand(30), "low");
  assert.equal(riskBand(45), "medium");
  assert.equal(riskBand(61), "high");
});
