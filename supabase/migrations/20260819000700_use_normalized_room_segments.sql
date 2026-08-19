-- The application always requests a 30-minute useful interval. For that hot
-- path, consume response-ready room segments built during cache refresh. Keep
-- the multirange implementation below as the generic path for other thresholds
-- and for cache dates that predate segment generation.
CREATE OR REPLACE FUNCTION public.get_cached_spots(
    check_time_param TIME,
    check_date_param DATE,
    min_minutes_param INTEGER DEFAULT 30
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    check_timestamp TIMESTAMP := check_date_param + check_time_param;
    min_interval INTERVAL := make_interval(mins => min_minutes_param);
BEGIN
    -- The cache stores a complete daily schedule, not a response for a
    -- particular minute. Uncached dates use the set-based source query.
    IF NOT EXISTS (
        SELECT 1
        FROM room_availability_cache
        WHERE check_date = check_date_param
        LIMIT 1
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

    IF min_minutes_param = 30 AND EXISTS (
        SELECT 1
        FROM room_availability_cache_segments
        WHERE check_date = check_date_param
        LIMIT 1
    ) THEN
        WITH day_hours AS MATERIALIZED (
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
        building_info AS MATERIALIZED (
            SELECT
                dh.*,
                COALESCE(
                    CASE
                        WHEN open_time <= close_time THEN
                            check_time_param >= open_time
                            AND check_time_param < close_time
                        ELSE
                            check_time_param >= open_time
                            OR check_time_param < close_time
                    END,
                    false
                ) AS is_open
            FROM day_hours dh
        ),
        room_status AS MATERIALIZED (
            SELECT
                s.building_name,
                s.room_number,
                bi.close_time,
                s.is_occupied,
                s.current_activity,
                s.next_activity,
                s.next_start_time,
                s.meaningful_available_at,
                s.next_island_start
            FROM room_availability_cache_segments s
            JOIN building_info bi ON bi.name = s.building_name
            WHERE s.check_date = check_date_param
              AND bi.is_open
              AND s.segment_start <= check_time_param
              AND s.segment_end > check_time_param
        ),
        rooms_by_building AS (
            SELECT
                rs.building_name,
                count(*) AS total_rooms,
                count(*) FILTER (WHERE NOT rs.is_occupied) AS available_rooms,
                jsonb_object_agg(
                    rs.room_number,
                    jsonb_build_object(
                        'status', CASE
                            WHEN rs.is_occupied THEN 'occupied'
                            ELSE 'available'
                        END,
                        'available', NOT rs.is_occupied,
                        'currentClass', CASE
                            WHEN rs.current_activity IS NOT NULL THEN
                                jsonb_build_object(
                                    'type', rs.current_activity->>'status',
                                    'course', COALESCE(
                                        rs.current_activity->'details'->>'course',
                                        rs.current_activity->'details'->>'identifier'
                                    ),
                                    'title', rs.current_activity->'details'->>'title',
                                    'time', jsonb_build_object(
                                        'start', rs.current_activity->>'start',
                                        'end', rs.current_activity->>'end'
                                    )
                                )
                        END,
                        'nextClass', CASE
                            WHEN rs.next_activity IS NOT NULL THEN
                                jsonb_build_object(
                                    'type', rs.next_activity->>'status',
                                    'course', COALESCE(
                                        rs.next_activity->'details'->>'course',
                                        rs.next_activity->'details'->>'identifier'
                                    ),
                                    'title', rs.next_activity->'details'->>'title',
                                    'time', jsonb_build_object(
                                        'start', rs.next_activity->>'start',
                                        'end', rs.next_activity->>'end'
                                    )
                                )
                        END,
                        'passingPeriod',
                            NOT rs.is_occupied
                            AND rs.next_start_time IS NOT NULL
                            AND rs.next_start_time - check_time_param < min_interval,
                        'availableAt', CASE WHEN rs.is_occupied THEN
                            LEAST(
                                COALESCE(
                                    rs.meaningful_available_at,
                                    rs.close_time
                                ),
                                rs.close_time
                            )::text
                        END,
                        'availableFor', CASE
                            WHEN rs.is_occupied
                             AND rs.meaningful_available_at IS NOT NULL THEN
                                EXTRACT(EPOCH FROM (
                                    LEAST(
                                        COALESCE(
                                            rs.next_island_start,
                                            rs.close_time
                                        ),
                                        rs.close_time
                                    )
                                    - LEAST(
                                        rs.meaningful_available_at,
                                        rs.close_time
                                    )
                                )) / 60
                            WHEN NOT rs.is_occupied THEN
                                EXTRACT(EPOCH FROM (
                                    COALESCE(
                                        rs.next_start_time,
                                        rs.close_time
                                    ) - check_time_param
                                )) / 60
                        END,
                        'availableUntil', CASE WHEN NOT rs.is_occupied THEN
                            COALESCE(
                                rs.next_start_time,
                                rs.close_time
                            )::text
                        END
                    )
                    ORDER BY rs.room_number
                ) AS rooms
            FROM room_status rs
            GROUP BY rs.building_name
        )
        SELECT jsonb_build_object(
            'timestamp', now(),
            'buildings', jsonb_object_agg(
                bi.name,
                jsonb_build_object(
                    'name', bi.name,
                    'coordinates', jsonb_build_object(
                        'latitude', bi.latitude,
                        'longitude', bi.longitude
                    ),
                    'hours', jsonb_build_object(
                        'open', bi.open_time,
                        'close', bi.close_time
                    ),
                    'rooms', COALESCE(rb.rooms, '{}'::jsonb),
                    'isOpen', bi.is_open,
                    'roomCounts', jsonb_build_object(
                        'available', COALESCE(rb.available_rooms, 0),
                        'total', COALESCE(rb.total_rooms, 0)
                    )
                )
                ORDER BY bi.name
            )
        ) INTO result
        FROM building_info bi
        LEFT JOIN rooms_by_building rb ON rb.building_name = bi.name;

        RETURN result || jsonb_build_object(
            '_cache', jsonb_build_object(
                'hit', true,
                'source', 'room_availability_cache'
            )
        );
    END IF;

    WITH day_hours AS MATERIALIZED (
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
    building_info AS MATERIALIZED (
        SELECT
            dh.*,
            COALESCE(
                CASE
                    WHEN open_time <= close_time THEN
                        check_time_param >= open_time AND check_time_param < close_time
                    ELSE
                        check_time_param >= open_time OR check_time_param < close_time
                END,
                false
            ) AS is_open
        FROM day_hours dh
    ),
    cached_rooms AS MATERIALIZED (
        SELECT
            c.building_name,
            c.room_number,
            c.busy_times,
            c.schedule_data,
            bi.close_time
        FROM room_availability_cache c
        JOIN building_info bi ON bi.name = c.building_name
        WHERE c.check_date = check_date_param
          AND bi.is_open
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
    -- PostgreSQL arrays compare lexicographically. Ranking the activity keys
    -- preserves the existing current/next tie-breakers without sorting JSON
    -- aggregates for every room.
    activity_choice_ordinals AS MATERIALIZED (
        SELECT
            building_name,
            room_number,
            -(
                max(ARRAY[
                    EXTRACT(EPOCH FROM start_time)::bigint,
                    EXTRACT(EPOCH FROM end_time)::bigint,
                    -ordinality
                ]) FILTER (
                    WHERE start_time <= check_time_param
                      AND end_time > check_time_param
                )
            )[3] AS current_ordinality,
            (
                min(ARRAY[
                    EXTRACT(EPOCH FROM start_time)::bigint,
                    -EXTRACT(EPOCH FROM end_time)::bigint,
                    ordinality
                ]) FILTER (WHERE start_time > check_time_param)
            )[3] AS next_ordinality
        FROM activities
        GROUP BY building_name, room_number
    ),
    activity_choices AS MATERIALIZED (
        SELECT
            aco.building_name,
            aco.room_number,
            current_activity.item AS current_activity,
            next_activity.item AS next_activity
        FROM activity_choice_ordinals aco
        LEFT JOIN activities current_activity
            ON current_activity.building_name = aco.building_name
           AND current_activity.room_number = aco.room_number
           AND current_activity.ordinality = aco.current_ordinality
        LEFT JOIN activities next_activity
            ON next_activity.building_name = aco.building_name
           AND next_activity.room_number = aco.room_number
           AND next_activity.ordinality = aco.next_ordinality
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
    meaningful_gaps AS MATERIALIZED (
        SELECT DISTINCT ON (building_name, room_number)
            building_name,
            room_number,
            range_end AS available_at,
            next_range_start AS next_island_start
        FROM busy_ranges
        WHERE range_end > check_time_param
          AND (
              next_range_start IS NULL
              OR next_range_start - range_end >= min_interval
          )
        ORDER BY building_name, room_number, range_end
    ),
    room_status AS MATERIALIZED (
        SELECT
            cr.building_name,
            cr.room_number,
            cr.close_time,
            cr.busy_times @> check_timestamp AS is_occupied,
            ac.current_activity,
            ac.next_activity,
            (ac.next_activity->>'start')::time AS next_start_time,
            mg.available_at AS meaningful_available_at,
            mg.next_island_start
        FROM cached_rooms cr
        LEFT JOIN activity_choices ac
            ON ac.building_name = cr.building_name
           AND ac.room_number = cr.room_number
        LEFT JOIN meaningful_gaps mg
            ON mg.building_name = cr.building_name
           AND mg.room_number = cr.room_number
    ),
    rooms_by_building AS (
        SELECT
            rs.building_name,
            count(*) AS total_rooms,
            count(*) FILTER (WHERE NOT rs.is_occupied) AS available_rooms,
            jsonb_object_agg(
                rs.room_number,
                jsonb_build_object(
                    'status', CASE WHEN rs.is_occupied THEN 'occupied' ELSE 'available' END,
                    'available', NOT rs.is_occupied,
                    'currentClass', CASE WHEN rs.current_activity IS NOT NULL THEN
                        jsonb_build_object(
                            'type', rs.current_activity->>'status',
                            'course', COALESCE(
                                rs.current_activity->'details'->>'course',
                                rs.current_activity->'details'->>'identifier'
                            ),
                            'title', rs.current_activity->'details'->>'title',
                            'time', jsonb_build_object(
                                'start', rs.current_activity->>'start',
                                'end', rs.current_activity->>'end'
                            )
                        )
                    END,
                    'nextClass', CASE WHEN rs.next_activity IS NOT NULL THEN
                        jsonb_build_object(
                            'type', rs.next_activity->>'status',
                            'course', COALESCE(
                                rs.next_activity->'details'->>'course',
                                rs.next_activity->'details'->>'identifier'
                            ),
                            'title', rs.next_activity->'details'->>'title',
                            'time', jsonb_build_object(
                                'start', rs.next_activity->>'start',
                                'end', rs.next_activity->>'end'
                            )
                        )
                    END,
                    'passingPeriod',
                        NOT rs.is_occupied
                        AND rs.next_start_time IS NOT NULL
                        AND rs.next_start_time - check_time_param < min_interval,
                    'availableAt', CASE WHEN rs.is_occupied THEN
                        LEAST(
                            COALESCE(rs.meaningful_available_at, rs.close_time),
                            rs.close_time
                        )::text
                    END,
                    'availableFor', CASE
                        WHEN rs.is_occupied AND rs.meaningful_available_at IS NOT NULL THEN
                            EXTRACT(EPOCH FROM (
                                LEAST(COALESCE(rs.next_island_start, rs.close_time), rs.close_time)
                                - LEAST(rs.meaningful_available_at, rs.close_time)
                            )) / 60
                        WHEN NOT rs.is_occupied THEN
                            EXTRACT(EPOCH FROM (
                                COALESCE(rs.next_start_time, rs.close_time) - check_time_param
                            )) / 60
                    END,
                    'availableUntil', CASE WHEN NOT rs.is_occupied THEN
                        COALESCE(rs.next_start_time, rs.close_time)::text
                    END
                )
                ORDER BY rs.room_number
            ) AS rooms
        FROM room_status rs
        GROUP BY rs.building_name
    )
    SELECT jsonb_build_object(
        'timestamp', now(),
        'buildings', jsonb_object_agg(
            bi.name,
            jsonb_build_object(
                'name', bi.name,
                'coordinates', jsonb_build_object(
                    'latitude', bi.latitude,
                    'longitude', bi.longitude
                ),
                'hours', jsonb_build_object(
                    'open', bi.open_time,
                    'close', bi.close_time
                ),
                'rooms', COALESCE(rb.rooms, '{}'::jsonb),
                'isOpen', bi.is_open,
                'roomCounts', jsonb_build_object(
                    'available', COALESCE(rb.available_rooms, 0),
                    'total', COALESCE(rb.total_rooms, 0)
                )
            )
            ORDER BY bi.name
        )
    ) INTO result
    FROM building_info bi
    LEFT JOIN rooms_by_building rb ON rb.building_name = bi.name;

    RETURN result || jsonb_build_object(
        '_cache', jsonb_build_object(
            'hit', true,
            'source', 'room_availability_cache'
        )
    );
END;
$$ LANGUAGE plpgsql
SET search_path = pg_catalog, public;

REVOKE EXECUTE ON FUNCTION
    public.get_cached_spots(time without time zone, date, integer)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
    public.get_cached_spots(time without time zone, date, integer)
TO anon, authenticated;
