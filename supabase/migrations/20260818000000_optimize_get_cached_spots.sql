-- This migration was applied before the hot-path rewrite below. Keep it in
-- history so local migration state matches production.
CREATE OR REPLACE FUNCTION public.get_cached_spots(
    check_time_param TIME,
    check_date_param DATE,
    min_minutes_param INTEGER DEFAULT 30
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    check_timestamp TIMESTAMP;
    min_interval INTERVAL;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM room_availability_cache
        WHERE check_date = check_date_param LIMIT 1
    ) THEN
        result := COALESCE(
            get_spots(check_time_param, check_date_param, min_minutes_param),
            '{}'::jsonb
        );
        RETURN result || jsonb_build_object(
            '_cache', jsonb_build_object(
                'hit', false,
                'source', 'get_spots',
                'reason', 'date_not_cached'
            )
        );
    END IF;

    check_timestamp := (check_date_param || ' ' || check_time_param)::timestamp;
    min_interval := (min_minutes_param || ' minutes')::interval;

    WITH building_info AS MATERIALIZED (
        SELECT
            b.name,
            b.latitude,
            b.longitude,
            CASE EXTRACT(DOW FROM check_date_param)
                WHEN 1 THEN b.monday_open WHEN 2 THEN b.tuesday_open
                WHEN 3 THEN b.wednesday_open WHEN 4 THEN b.thursday_open
                WHEN 5 THEN b.friday_open WHEN 6 THEN b.saturday_open
                WHEN 0 THEN b.sunday_open
            END AS open_time,
            CASE EXTRACT(DOW FROM check_date_param)
                WHEN 1 THEN b.monday_close WHEN 2 THEN b.tuesday_close
                WHEN 3 THEN b.wednesday_close WHEN 4 THEN b.thursday_close
                WHEN 5 THEN b.friday_close WHEN 6 THEN b.saturday_close
                WHEN 0 THEN b.sunday_close
            END AS close_time
        FROM buildings b
    ),
    room_state AS MATERIALIZED (
        SELECT
            c.building_name,
            c.room_number,
            bi.open_time,
            bi.close_time,
            c.busy_times @> check_timestamp AS is_occupied,
            c.schedule_data -> ((matches.current_ordinal - 1)::integer)
                AS current_class_json,
            c.schedule_data -> ((matches.next_ordinal - 1)::integer)
                AS next_class_json
        FROM room_availability_cache c
        JOIN building_info bi ON c.building_name = bi.name
        CROSS JOIN LATERAL (
            SELECT
                min(activity.ordinality) FILTER (
                    WHERE (activity.item->>'start')::time <= check_time_param
                      AND (activity.item->>'end')::time > check_time_param
                ) AS current_ordinal,
                min(activity.ordinality) FILTER (
                    WHERE (activity.item->>'start')::time > check_time_param
                ) AS next_ordinal
            FROM jsonb_array_elements(c.schedule_data)
                WITH ORDINALITY AS activity(item, ordinality)
        ) matches
        WHERE c.check_date = check_date_param
          AND bi.open_time IS NOT NULL
          AND bi.close_time IS NOT NULL
    ),
    calculated_availability AS MATERIALIZED (
        SELECT
            rs.*,
            (rs.current_class_json->>'end')::time AS current_end_time,
            (rs.next_class_json->>'start')::time AS next_start_time,
            CASE WHEN NOT rs.is_occupied THEN
                COALESCE((rs.next_class_json->>'start')::time, rs.close_time)
            END AS available_until_time
        FROM room_state rs
    ),
    final_metrics AS MATERIALIZED (
        SELECT
            ca.*,
            CASE WHEN is_occupied THEN 'occupied' ELSE 'available' END
                AS status_text,
            NOT is_occupied
                AND available_until_time - check_time_param < min_interval
                AS is_passing_period,
            CASE WHEN NOT is_occupied THEN
                EXTRACT(EPOCH FROM (available_until_time - check_time_param)) / 60
            END AS available_for_minutes,
            CASE WHEN is_occupied THEN current_end_time END AS available_at_time
        FROM calculated_availability ca
    ),
    building_agg AS (
        SELECT
            bi.name,
            jsonb_build_object(
                'name', bi.name,
                'coordinates', jsonb_build_object(
                    'latitude', bi.latitude, 'longitude', bi.longitude
                ),
                'hours', jsonb_build_object(
                    'open', bi.open_time, 'close', bi.close_time
                ),
                'isOpen', COALESCE(
                    check_time_param >= bi.open_time
                    AND check_time_param < bi.close_time,
                    false
                ),
                'roomCounts', jsonb_build_object(
                    'total', count(fm.room_number),
                    'available', count(fm.room_number)
                        FILTER (WHERE fm.status_text = 'available')
                ),
                'rooms', COALESCE(jsonb_object_agg(
                    fm.room_number,
                    jsonb_build_object(
                        'status', fm.status_text,
                        'passingPeriod', fm.is_passing_period,
                        'currentClass', fm.current_class_json->'details',
                        'nextClass', fm.next_class_json->'details',
                        'availableAt', fm.available_at_time,
                        'availableUntil', fm.available_until_time,
                        'availableFor', fm.available_for_minutes
                    )
                ) FILTER (WHERE fm.room_number IS NOT NULL), '{}'::jsonb)
            ) AS building_data
        FROM building_info bi
        LEFT JOIN final_metrics fm ON bi.name = fm.building_name
        GROUP BY bi.name, bi.latitude, bi.longitude, bi.open_time, bi.close_time
    )
    SELECT jsonb_build_object(
        'timestamp', now(),
        'buildings', jsonb_object_agg(name, building_data)
    ) INTO result
    FROM building_agg;

    RETURN result || jsonb_build_object(
        '_cache', jsonb_build_object(
            'hit', true,
            'source', 'room_availability_cache'
        )
    );
END;
$$ LANGUAGE plpgsql
SET search_path = pg_catalog, public;

ALTER ROLE anon SET statement_timeout = '6s';
NOTIFY pgrst, 'reload config';
