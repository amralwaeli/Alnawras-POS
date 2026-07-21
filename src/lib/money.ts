/**
 * Pure money helpers — tax, preset discounts, and split-payment dues.
 *
 * Extracted from PaymentModal so the arithmetic that decides what a customer
 * pays is (a) in one place, (b) unit-testable in isolation, and (c) reusable by
 * the receipt/report paths. No React, no Supabase — just numbers in, numbers
 * out. All amounts are in the branch currency's major unit (e.g. RM), rounded
 * to 2 decimals at the boundary.
 */

import type { DiscountPreset } from '../app/models/types';

/** Round to 2 decimals (half-up on the positive side, which is what toFixed does). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Tax on a post-discount amount for the given branch tax settings.
 *  - exclusive (taxInclusive=false): tax is added on top → rate% of the amount.
 *  - inclusive (taxInclusive=true): the amount already contains tax → back it out.
 * Returns 0 when tax is off, the rate is non-positive, or the amount is ≤ 0.
 */
export function computeTax(
  netAmount: number,
  taxEnabled: boolean,
  taxRate: number,
  taxInclusive: boolean,
): number {
  if (!taxEnabled || taxRate <= 0 || netAmount <= 0) return 0;
  const raw = taxInclusive
    ? netAmount - netAmount / (1 + taxRate / 100)
    : netAmount * (taxRate / 100);
  return round2(raw);
}

/**
 * The discount amount a one-tap preset applies to a subtotal. A percentage
 * preset takes rate% of the subtotal; a fixed preset takes its value but never
 * more than the subtotal (can't discount below zero).
 */
export function presetDiscountAmount(subtotal: number, preset: DiscountPreset): number {
  if (subtotal <= 0 || preset.value <= 0) return 0;
  return preset.type === 'percentage'
    ? round2(subtotal * (preset.value / 100))
    : Math.min(preset.value, subtotal);
}

/**
 * What a guest actually owes for a selected pre-tax amount, matching what the
 * split-payment RPC charges: exclusive tax is added on top; inclusive tax is
 * already in the amount, so the due equals the amount.
 */
export function taxInclusiveDue(
  netAmount: number,
  taxEnabled: boolean,
  taxRate: number,
  taxInclusive: boolean,
): number {
  const tax = computeTax(netAmount, taxEnabled, taxRate, taxInclusive);
  return taxInclusive ? netAmount : round2(netAmount + tax);
}
