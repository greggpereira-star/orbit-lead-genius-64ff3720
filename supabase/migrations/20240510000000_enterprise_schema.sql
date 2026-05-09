-- Módulo 1: Webhooks CV.CRM
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    provider TEXT NOT NULL DEFAULT 'cvcrm',
    event_type TEXT NOT NULL,
    raw_payload JSONB NOT NULL,
    normalized_payload JSONB,
    headers JSONB,
    request_id TEXT,
    idempotency_key TEXT,
    event_hash TEXT,
    status TEXT DEFAULT 'pending', 
    latency_ms INTEGER,
    retries INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_event_hash ON webhook_events (event_hash) WHERE status != 'failed';

-- Módulo 2: Event Bus & Automations
CREATE TABLE IF NOT EXISTS automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    trigger_event TEXT NOT NULL, 
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    cooldown_seconds INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID REFERENCES automation_rules(id) ON DELETE CASCADE,
    field TEXT NOT NULL, 
    operator TEXT NOT NULL, 
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID REFERENCES automation_rules(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL, 
    config JSONB NOT NULL, 
    delay_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID REFERENCES automation_rules(id),
    company_id UUID NOT NULL,
    trigger_payload JSONB NOT NULL,
    status TEXT DEFAULT 'pending', 
    retries INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    error_log JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Módulo 3: Real-time Analytics
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    entity_type TEXT, 
    entity_id UUID,
    value NUMERIC,
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    metric_name TEXT NOT NULL, 
    metric_value NUMERIC NOT NULL,
    dimension_name TEXT, 
    dimension_value TEXT,
    snapshot_date DATE DEFAULT current_date,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Módulo 4: Observability Center
CREATE TABLE IF NOT EXISTS system_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    component TEXT NOT NULL, 
    status TEXT NOT NULL, 
    latency_ms INTEGER,
    last_check_at TIMESTAMPTZ DEFAULT now(),
    metadata JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS dead_letter_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    origin_table TEXT NOT NULL, 
    origin_id UUID NOT NULL,
    company_id UUID NOT NULL,
    payload JSONB NOT NULL,
    last_error TEXT,
    retry_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolution TEXT
);

-- Enable RLS
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE dead_letter_queue ENABLE ROW LEVEL SECURITY;
