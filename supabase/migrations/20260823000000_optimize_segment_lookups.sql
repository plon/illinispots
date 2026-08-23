-- Requests select the one segment containing a given time for every room on a
-- date. The primary key orders by room before segment_start, so it cannot use
-- the time predicates to narrow that date's index scan.
CREATE INDEX IF NOT EXISTS idx_room_cache_segments_date_time
    ON public.room_availability_cache_segments (
        check_date,
        segment_start,
        segment_end
    );
