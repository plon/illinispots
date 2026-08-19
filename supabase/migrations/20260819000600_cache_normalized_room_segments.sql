-- Materialize intervals where a room's occupancy and activity metadata are
-- stable. The API's 30-minute hot path can then perform a point lookup instead
-- of expanding and ranking every cached activity on each request.
CREATE TABLE public.room_availability_cache_segments (
    check_date DATE NOT NULL,
    building_name TEXT NOT NULL,
    room_number TEXT NOT NULL,
    segment_start TIME NOT NULL,
    segment_end TIME NOT NULL,
    is_occupied BOOLEAN NOT NULL,
    current_activity JSONB,
    next_activity JSONB,
    next_start_time TIME,
    meaningful_available_at TIME,
    next_island_start TIME,
    PRIMARY KEY (
        check_date,
        building_name,
        room_number,
        segment_start
    ),
    CONSTRAINT room_availability_cache_segments_valid_time
        CHECK (segment_start < segment_end),
    CONSTRAINT room_availability_cache_segments_room_fkey
        FOREIGN KEY (building_name, room_number, check_date)
        REFERENCES public.room_availability_cache (
            building_name,
            room_number,
            check_date
        )
        ON DELETE CASCADE
);

ALTER TABLE public.room_availability_cache_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY room_availability_cache_segments_public_read
    ON public.room_availability_cache_segments
    FOR SELECT
    TO anon, authenticated
    USING (true);

REVOKE ALL ON TABLE public.room_availability_cache_segments FROM PUBLIC;
GRANT SELECT ON TABLE public.room_availability_cache_segments
TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.room_availability_cache_segments
TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_room_availability_cache_segments(
    target_date DATE
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    DELETE FROM room_availability_cache_segments
    WHERE check_date = target_date;

    WITH day_hours AS MATERIALIZED (
        SELECT
            b.name AS building_name,
            CASE EXTRACT(DOW FROM target_date)
                WHEN 1 THEN b.monday_open WHEN 2 THEN b.tuesday_open
                WHEN 3 THEN b.wednesday_open WHEN 4 THEN b.thursday_open
                WHEN 5 THEN b.friday_open WHEN 6 THEN b.saturday_open
                WHEN 0 THEN b.sunday_open
            END AS open_time,
            CASE EXTRACT(DOW FROM target_date)
                WHEN 1 THEN b.monday_close WHEN 2 THEN b.tuesday_close
                WHEN 3 THEN b.wednesday_close WHEN 4 THEN b.thursday_close
                WHEN 5 THEN b.friday_close WHEN 6 THEN b.saturday_close
                WHEN 0 THEN b.sunday_close
            END AS close_time
        FROM buildings b
    ),
    cached_rooms AS MATERIALIZED (
        SELECT
            c.building_name,
            c.room_number,
            c.busy_times,
            c.schedule_data,
            dh.open_time,
            dh.close_time
        FROM room_availability_cache c
        JOIN day_hours dh ON dh.building_name = c.building_name
        WHERE c.check_date = target_date
          AND dh.open_time IS NOT NULL
          AND dh.close_time IS NOT NULL
          AND dh.open_time < dh.close_time
    ),
    activities AS MATERIALIZED (
        SELECT
            cr.building_name,
            cr.room_number,
            activity.item,
            activity.ordinality,
            (activity.item->>'start')::time AS start_time,
            (activity.item->>'end')::time AS end_time
        FROM cached_rooms cr
        CROSS JOIN LATERAL jsonb_array_elements(
            COALESCE(cr.schedule_data, '[]'::jsonb)
        ) WITH ORDINALITY AS activity(item, ordinality)
        WHERE activity.item->>'status' IN ('class', 'event')
    ),
    boundaries AS MATERIALIZED (
        SELECT
            building_name,
            room_number,
            open_time AS boundary
        FROM cached_rooms

        UNION

        SELECT
            building_name,
            room_number,
            close_time AS boundary
        FROM cached_rooms

        UNION

        SELECT
            a.building_name,
            a.room_number,
            a.start_time AS boundary
        FROM activities a
        JOIN cached_rooms cr
          ON cr.building_name = a.building_name
         AND cr.room_number = a.room_number
        WHERE a.start_time > cr.open_time
          AND a.start_time < cr.close_time

        UNION

        SELECT
            a.building_name,
            a.room_number,
            a.end_time AS boundary
        FROM activities a
        JOIN cached_rooms cr
          ON cr.building_name = a.building_name
         AND cr.room_number = a.room_number
        WHERE a.end_time > cr.open_time
          AND a.end_time < cr.close_time
    ),
    segments AS MATERIALIZED (
        SELECT
            building_name,
            room_number,
            boundary AS segment_start,
            lead(boundary) OVER (
                PARTITION BY building_name, room_number
                ORDER BY boundary
            ) AS segment_end
        FROM boundaries
    ),
    -- Arrays compare lexicographically, preserving get_cached_spots' existing
    -- start/end/ordinality tie-breakers while this work runs once at refresh.
    segment_activity_ordinals AS MATERIALIZED (
        SELECT
            s.building_name,
            s.room_number,
            s.segment_start,
            s.segment_end,
            -(
                max(ARRAY[
                    EXTRACT(EPOCH FROM a.start_time)::bigint,
                    EXTRACT(EPOCH FROM a.end_time)::bigint,
                    -a.ordinality
                ]) FILTER (
                    WHERE a.start_time <= s.segment_start
                      AND a.end_time > s.segment_start
                )
            )[3] AS current_ordinality,
            (
                min(ARRAY[
                    EXTRACT(EPOCH FROM a.start_time)::bigint,
                    -EXTRACT(EPOCH FROM a.end_time)::bigint,
                    a.ordinality
                ]) FILTER (WHERE a.start_time > s.segment_start)
            )[3] AS next_ordinality
        FROM segments s
        LEFT JOIN activities a
          ON a.building_name = s.building_name
         AND a.room_number = s.room_number
        WHERE s.segment_end IS NOT NULL
          AND s.segment_start < s.segment_end
        GROUP BY
            s.building_name,
            s.room_number,
            s.segment_start,
            s.segment_end
    ),
    segment_activities AS MATERIALIZED (
        SELECT
            sao.building_name,
            sao.room_number,
            sao.segment_start,
            sao.segment_end,
            current_activity.item AS current_activity,
            next_activity.item AS next_activity,
            next_activity.start_time AS next_start_time
        FROM segment_activity_ordinals sao
        LEFT JOIN activities current_activity
          ON current_activity.building_name = sao.building_name
         AND current_activity.room_number = sao.room_number
         AND current_activity.ordinality = sao.current_ordinality
        LEFT JOIN activities next_activity
          ON next_activity.building_name = sao.building_name
         AND next_activity.room_number = sao.room_number
         AND next_activity.ordinality = sao.next_ordinality
    ),
    busy_ranges AS MATERIALIZED (
        SELECT
            cr.building_name,
            cr.room_number,
            upper(br.time_range)::time AS range_end,
            lead(lower(br.time_range)::time) OVER (
                PARTITION BY cr.building_name, cr.room_number
                ORDER BY br.ordinality
            ) AS next_range_start
        FROM cached_rooms cr
        CROSS JOIN LATERAL unnest(
            COALESCE(cr.busy_times, '{}'::tsmultirange)
        ) WITH ORDINALITY AS br(time_range, ordinality)
    ),
    -- Occupancy must use the timestamp multirange directly. Some source events
    -- span multiple dates, so comparing only their time-of-day endpoints would
    -- produce a different result from get_cached_spots.
    segment_states AS MATERIALIZED (
        SELECT
            sa.*,
            cr.busy_times @> (target_date + sa.segment_start) AS is_occupied,
            meaningful.available_at,
            meaningful.next_island_start
        FROM segment_activities sa
        JOIN cached_rooms cr
          ON cr.building_name = sa.building_name
         AND cr.room_number = sa.room_number
        LEFT JOIN LATERAL (
            SELECT
                future.range_end AS available_at,
                future.next_range_start AS next_island_start
            FROM busy_ranges future
            WHERE future.building_name = sa.building_name
              AND future.room_number = sa.room_number
              AND future.range_end > sa.segment_start
              AND (
                  future.next_range_start IS NULL
                  OR future.next_range_start - future.range_end >= interval '30 minutes'
              )
            ORDER BY future.range_end
            LIMIT 1
        ) meaningful ON true
    )
    INSERT INTO room_availability_cache_segments (
        check_date,
        building_name,
        room_number,
        segment_start,
        segment_end,
        is_occupied,
        current_activity,
        next_activity,
        next_start_time,
        meaningful_available_at,
        next_island_start
    )
    SELECT
        target_date,
        ss.building_name,
        ss.room_number,
        ss.segment_start,
        ss.segment_end,
        ss.is_occupied,
        ss.current_activity,
        ss.next_activity,
        ss.next_start_time,
        ss.available_at,
        ss.next_island_start
    FROM segment_states ss;
END;
$$;

REVOKE EXECUTE ON FUNCTION
    public.refresh_room_availability_cache_segments(date)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
    public.refresh_room_availability_cache_segments(date)
TO service_role;

CREATE OR REPLACE FUNCTION public.populate_room_availability_cache_segments()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    target_date DATE;
BEGIN
    FOR target_date IN
        SELECT DISTINCT check_date
        FROM inserted_cache_rows
    LOOP
        PERFORM refresh_room_availability_cache_segments(target_date);
    END LOOP;

    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION
    public.populate_room_availability_cache_segments()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
    public.populate_room_availability_cache_segments()
TO service_role;

CREATE TRIGGER populate_room_availability_cache_segments_after_insert
AFTER INSERT ON public.room_availability_cache
REFERENCING NEW TABLE AS inserted_cache_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.populate_room_availability_cache_segments();

DO $$
DECLARE
    target_date DATE;
BEGIN
    FOR target_date IN
        SELECT DISTINCT check_date
        FROM room_availability_cache
        ORDER BY check_date
    LOOP
        PERFORM refresh_room_availability_cache_segments(target_date);
    END LOOP;
END;
$$;
