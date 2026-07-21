-- ============================================================
-- 0023_branch_loyalty_settings.sql   (Batch 5 — audit M6, partial)
--
-- Moves the loyalty program settings (enabled, points-per-currency, redemption
-- rate, minimum redemption, label) off per-device localStorage and into the
-- per-branch `branch_settings` row, alongside tax + discounts. Same reason as
-- tax: a waiter tablet and the cashier must not disagree on how many points a
-- purchase earns. Loyalty MATH is unchanged — only where the 5 settings live.
--
-- Additive & safe. Run AFTER 0020 (which created branch_settings).
-- ============================================================

ALTER TABLE branch_settings
  ADD COLUMN IF NOT EXISTS loyalty JSONB NOT NULL DEFAULT jsonb_build_object(
    'enabled', true,
    'pointsPerDollar', 1,
    'redemptionRate', 100,
    'minimumRedemption', 100,
    'pointsLabel', 'Points'
  );

NOTIFY pgrst, 'reload schema';
