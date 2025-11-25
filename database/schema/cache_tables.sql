CREATE TABLE IF NOT EXISTS room_availability_cache (
    building_name TEXT,
    room_number TEXT,
    check_date DATE,
    busy_times tsmultirange,
    schedule_data JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (building_name, room_number, check_date)
);

CREATE INDEX IF NOT EXISTS idx_cache_check_date ON room_availability_cache(check_date);
-- GIST index for fast overlap queries
CREATE INDEX IF NOT EXISTS idx_cache_busy_times ON room_availability_cache USING GIST (busy_times);
