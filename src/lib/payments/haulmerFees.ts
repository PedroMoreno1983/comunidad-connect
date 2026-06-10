import type { HaulmerFeeCalculation, HaulmerFeeMode, HaulmerTariffRange } from "@/lib/types";

export const CHILE_VAT_RATE = 0.19;
export const DEFAULT_HAULMER_FEE_MODE: HaulmerFeeMode = "mixed";

export const HAULMER_TARIFF_RANGES: HaulmerTariffRange[] = [
  {
    id: "range_1",
    label: "Rango 1",
    minInclusive: 0,
    maxInclusive: 500_000_000,
    basePercent: 1.41,
    mixedPercent: 0.75,
    mixedFixedFee: 60,
  },
  {
    id: "range_2",
    label: "Rango 2",
    minInclusive: 500_000_001,
    maxInclusive: 1_000_000_000,
    basePercent: 1.39,
    mixedPercent: 0.73,
    mixedFixedFee: 60,
  },
  {
    id: "range_3",
    label: "Rango 3",
    minInclusive: 1_000_000_001,
    maxInclusive: 5_000_000_000,
    basePercent: 1.37,
    mixedPercent: 0.71,
    mixedFixedFee: 60,
  },
  {
    id: "range_4",
    label: "Rango 4",
    minInclusive: 5_000_000_001,
    maxInclusive: null,
    basePercent: 1.35,
    mixedPercent: 0.69,
    mixedFixedFee: 55,
  },
];

export function getHaulmerTariffRange(transactedVolume = 0): HaulmerTariffRange {
  const normalizedVolume = Math.max(0, Math.round(transactedVolume));

  return HAULMER_TARIFF_RANGES.find((range) => (
    normalizedVolume >= range.minInclusive
    && (range.maxInclusive === null || normalizedVolume <= range.maxInclusive)
  )) || HAULMER_TARIFF_RANGES[0];
}

export function calculateHaulmerServiceFee(
  amount: number,
  options: {
    feeMode?: HaulmerFeeMode;
    includeVat?: boolean;
    transactedVolume?: number;
  } = {},
): HaulmerFeeCalculation {
  const baseAmount = Math.max(0, Math.round(amount));
  const feeMode = options.feeMode || DEFAULT_HAULMER_FEE_MODE;
  const range = getHaulmerTariffRange(options.transactedVolume);
  const includeVat = options.includeVat !== false;

  if (baseAmount === 0) {
    return {
      baseAmount,
      feeMode,
      range,
      netFee: 0,
      vat: 0,
      vatRate: includeVat ? CHILE_VAT_RATE : 0,
      totalFee: 0,
      totalWithFee: 0,
    };
  }

  const rawNetFee = feeMode === "base_percent"
    ? baseAmount * (range.basePercent / 100)
    : baseAmount * (range.mixedPercent / 100) + range.mixedFixedFee;

  const netFee = Math.round(rawNetFee);
  const vatRate = includeVat ? CHILE_VAT_RATE : 0;
  const vat = Math.round(netFee * vatRate);
  const totalFee = netFee + vat;

  return {
    baseAmount,
    feeMode,
    range,
    netFee,
    vat,
    vatRate,
    totalFee,
    totalWithFee: baseAmount + totalFee,
  };
}
