-- Watchdog Data Quality Monitoring Tables

CREATE TABLE watchdog_checks (
  id              text PRIMARY KEY,
  tier            int NOT NULL,
  severity        text NOT NULL CHECK (severity IN ('critical', 'high', 'medium')),
  schedule        text NOT NULL CHECK (schedule IN ('hourly', 'daily', 'realtime')),
  enabled         boolean NOT NULL DEFAULT true,
  webhook_url     text NOT NULL,
  instructions    text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE TABLE watchdog_exceptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id        text NOT NULL REFERENCES watchdog_checks(id),
  type            text NOT NULL,
  value           text NOT NULL,
  reason          text,
  created_by      text NOT NULL,
  created_at      timestamptz DEFAULT now(),
  active          boolean NOT NULL DEFAULT true
);

CREATE TABLE watchdog_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id        text NOT NULL REFERENCES watchdog_checks(id),
  run_at          timestamptz DEFAULT now(),
  status          text NOT NULL CHECK (status IN ('pass', 'fail', 'error')),
  violation_count int NOT NULL DEFAULT 0,
  violations      jsonb,
  root_cause      text,
  duration_ms     int
);

CREATE TABLE watchdog_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id        text,
  slack_user      text NOT NULL,
  slack_thread_ts text,
  message         text NOT NULL,
  intent          text,
  action_taken    text,
  created_at      timestamptz DEFAULT now()
);

-- Index for frequent queries
CREATE INDEX idx_watchdog_checks_schedule ON watchdog_checks(schedule, enabled);
CREATE INDEX idx_watchdog_exceptions_check ON watchdog_exceptions(check_id, active);
CREATE INDEX idx_watchdog_results_check ON watchdog_results(check_id, run_at DESC);
