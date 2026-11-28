-- ============================================================
-- 0061_close_empty_bills.sql
--
-- A bill whose last live item is voided now closes itself: status
-- 'cancelled' (orders.status CHECK allows it since 0001; 0047 reports count
-- these as whole bills cancelled) and its table is freed. Before this, such a
-- bill stayed open at total 0, pay_order refused it and the table was stuck.
--
-- A bill with any order_payments row, or a payment_status other than unpaid/
-- rejected (paid online, or waiting for a check), is never auto-closed.
--
-- One-off cleanup at the end closes bills already stuck that way (older than
-- 5 minutes, so a bill being filled right now is not touched).
--
-- REQUIRES: 0029 (trg_close_party_on_bill_close), 0033. Idempotent.
-- ============================================================

-- Closes p_order_id if it is open, has items, none of them live, and no payment.
CREATE OR REPLACE FUNCTION public._close_bill_if_empty(p_order_id TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM orders WHERE id = p_order_id AND status = 'open'
    AND COALESCE(payment_status, 'unpaid') IN ('unpaid', 'rejected') FOR UPDATE;
  IF NOT FOUND
     OR NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = p_order_id)
     OR EXISTS (SELECT 1 FROM order_items WHERE order_id = p_order_id AND status IS DISTINCT FROM 'cancelled')
     OR EXISTS (SELECT 1 FROM order_payments WHERE order_id = p_order_id) THEN
    RETURN false;
  END IF;

  -- trg_close_party_on_bill_close (0029) closes the table's order_group and guest sessions.
  UPDATE orders SET status = 'cancelled' WHERE id = p_order_id;
  UPDATE pickup_tokens SET active = false, status = 'expired' WHERE order_id = p_order_id; -- as PickupController.cancelOrder
  UPDATE qr_sessions SET active = false, last_activity_at = NOW()
    WHERE table_id IN (SELECT id FROM tables WHERE current_order_id = p_order_id);
  UPDATE tables SET status = 'available', current_order_id = NULL, ordering_enabled = false, needs_waiter = false
    WHERE current_order_id = p_order_id;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public._close_bill_if_empty(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.void_order_item(
  p_item_id TEXT, p_order_id TEXT, p_branch_id TEXT,
  p_reason TEXT, p_actor_id TEXT, p_actor_name TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE v_status TEXT; v_sub NUMERIC;
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  SELECT status INTO v_status FROM orders WHERE id = p_order_id AND branch_id = p_branch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_status <> 'open' THEN RAISE EXCEPTION 'Cannot void an item on a bill that has already been paid'; END IF;

  UPDATE order_items
     SET status = 'cancelled', cancelled_by = p_actor_id, cancelled_by_name = p_actor_name,
         cancel_reason = NULLIF(left(btrim(p_reason), 300), ''), cancelled_at = NOW()
   WHERE id = p_item_id AND order_id = p_order_id AND branch_id = p_branch_id
     AND NOT paid AND status IS DISTINCT FROM 'cancelled';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This item was already paid for or voided — it cannot be voided now.';
  END IF;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_sub FROM order_items
    WHERE order_id = p_order_id AND branch_id = p_branch_id AND status IS DISTINCT FROM 'cancelled';
  UPDATE orders SET subtotal = v_sub, tax = 0, total = v_sub WHERE id = p_order_id;

  PERFORM public._close_bill_if_empty(p_order_id);
END; $$;

REVOKE ALL ON FUNCTION public.void_order_item(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_order_item(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- One-off cleanup of bills already stuck (re-running it only finds new ones).
SELECT public._close_bill_if_empty(id) FROM orders
  WHERE status = 'open' AND created_at < now() - interval '5 minutes'
    -- a ghost bill its table no longer points at: closing it would let 0029 close that table's live party
    AND (table_id IS NULL OR EXISTS (SELECT 1 FROM tables t WHERE t.current_order_id = orders.id));

NOTIFY pgrst, 'reload schema';

-- ROLLBACK (manual): re-run void_order_item from 0033_payments_and_reports.sql, then
--                    DROP FUNCTION IF EXISTS public._close_bill_if_empty(TEXT);
--                    (bills already closed stay 'cancelled'.)
