-- ============================================================
-- Migration 003: Ensure leave_requests table exists
-- This migration is safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS leave_requests (
  id           TEXT PRIMARY KEY,
  employee_id  TEXT NOT NULL,
  leave_type   TEXT NOT NULL CHECK (leave_type IN ('annual','sick','emergency','unpaid','other')),
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  days_count   INTEGER NOT NULL,
  reason       TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by  TEXT,
  reviewed_at  TIMESTAMPTZ,
  branch_id    TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_employee ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_branch ON leave_requests(branch_id);
