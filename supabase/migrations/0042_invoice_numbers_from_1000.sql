-- 0042: invoice numbers start at 1000 (INV-1000, INV-1001 ...), for every restaurant.
-- A branch that already printed lower numbers jumps to INV-1000 next; numbers
-- already printed are not changed. Quotations keep starting at QUO-0001.
-- Same signature, so CREATE OR REPLACE keeps the existing grants.

CREATE OR REPLACE FUNCTION public.save_document(p_branch_id text, p_kind text, p_data jsonb, p_created_by text, p_created_by_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_num INT; v_number TEXT; v_id TEXT;
BEGIN
  PERFORM public._assert_device_branch(p_branch_id);
  IF p_kind NOT IN ('invoice', 'quotation') THEN RAISE EXCEPTION 'Unknown document type'; END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN RAISE EXCEPTION 'Nothing to save'; END IF;
  IF length(p_data::text) > 200000 THEN RAISE EXCEPTION 'This document is too large to save'; END IF;

  INSERT INTO bill_counters (branch_id, order_type, last_number) VALUES (p_branch_id, 'doc-' || p_kind, CASE p_kind WHEN 'invoice' THEN 1000 ELSE 1 END)  -- invoices start at INV-1000
  ON CONFLICT (branch_id, order_type) DO UPDATE SET last_number = GREATEST(bill_counters.last_number + 1, CASE p_kind WHEN 'invoice' THEN 1000 ELSE 1 END)
  RETURNING last_number INTO v_num;
  v_number := CASE p_kind WHEN 'invoice' THEN 'INV-' ELSE 'QUO-' END || lpad(v_num::text, 4, '0');

  INSERT INTO documents (branch_id, kind, number, customer_name, customer_phone, total, data, created_by, created_by_name)
  VALUES (p_branch_id, p_kind, v_number,
          left(COALESCE(p_data->'invoiceTo', p_data->'quotationTo')->>'name', 200),
          left(COALESCE(p_data->'invoiceTo', p_data->'quotationTo')->>'phone', 40),
          COALESCE((p_data->>'total')::numeric, 0), p_data, p_created_by, p_created_by_name)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'number', v_number);
END; $function$;
