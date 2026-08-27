

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."get_cached_spots"("check_time_param" time without time zone, "check_date_param" "date", "min_minutes_param" integer DEFAULT 30) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_cached_spots"("check_time_param" time without time zone, "check_date_param" "date", "min_minutes_param" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_room_schedule"("building_id_param" "text", "room_number_param" "text", "check_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
    schedule_blocks JSONB[] := ARRAY[]::JSONB[];
    building_open_time TIME;
    building_close_time TIME;
    current_pointer_time TIME;
    check_day TEXT;
    event_record RECORD;
    block_json JSONB;
BEGIN
    check_day := CASE EXTRACT(DOW FROM check_date)
        WHEN 1 THEN 'M' WHEN 2 THEN 'T' WHEN 3 THEN 'W' WHEN 4 THEN 'R'
        WHEN 5 THEN 'F' WHEN 6 THEN 'S' WHEN 0 THEN 'U'
    END;

    SELECT
        CASE check_day
            WHEN 'M' THEN b.monday_open WHEN 'T' THEN b.tuesday_open
            WHEN 'W' THEN b.wednesday_open WHEN 'R' THEN b.thursday_open
            WHEN 'F' THEN b.friday_open WHEN 'S' THEN b.saturday_open
            WHEN 'U' THEN b.sunday_open
        END,
        CASE check_day
            WHEN 'M' THEN b.monday_close WHEN 'T' THEN b.tuesday_close
            WHEN 'W' THEN b.wednesday_close WHEN 'R' THEN b.thursday_close
            WHEN 'F' THEN b.friday_close WHEN 'S' THEN b.saturday_close
            WHEN 'U' THEN b.sunday_close
        END
    INTO building_open_time, building_close_time
    FROM buildings b
    WHERE b.name = building_id_param;

    IF building_open_time IS NULL
       OR building_close_time IS NULL
       OR building_open_time >= building_close_time THEN
        RETURN '[]'::JSONB;
    END IF;

    current_pointer_time := building_open_time;

    FOR event_record IN
        SELECT
            start_time,
            end_time,
            'class' AS event_type,
            course_code AS identifier,
            course_title AS title
        FROM class_schedule
        WHERE building_name = building_id_param
          AND room_number = room_number_param
          AND day_of_week = check_day
          AND check_date <@ date_range
          AND end_time > building_open_time
          AND start_time < building_close_time

        UNION ALL

        SELECT
            (start_time AT TIME ZONE 'America/Chicago')::TIME,
            (end_time AT TIME ZONE 'America/Chicago')::TIME,
            'event',
            occupant,
            event_name
        FROM daily_events
        WHERE building_name = building_id_param
          AND room_number = room_number_param
          AND start_time >= check_date::timestamp AT TIME ZONE 'America/Chicago'
          AND start_time < (check_date + 1)::timestamp AT TIME ZONE 'America/Chicago'
          AND (end_time AT TIME ZONE 'America/Chicago')::TIME > building_open_time
          AND (start_time AT TIME ZONE 'America/Chicago')::TIME < building_close_time

        ORDER BY start_time, end_time DESC, event_type, identifier
    LOOP
        event_record.start_time := GREATEST(event_record.start_time, building_open_time);
        event_record.end_time := LEAST(event_record.end_time, building_close_time);

        IF event_record.start_time >= event_record.end_time
           OR event_record.end_time <= current_pointer_time THEN
            CONTINUE;
        END IF;

        event_record.start_time := GREATEST(
            event_record.start_time,
            current_pointer_time
        );

        IF event_record.start_time > current_pointer_time THEN
            schedule_blocks := array_append(schedule_blocks, jsonb_build_object(
                'start', current_pointer_time::TEXT,
                'end', event_record.start_time::TEXT,
                'status', 'available',
                'details', null
            ));
        END IF;

        block_json := jsonb_build_object(
            'start', event_record.start_time::TEXT,
            'end', event_record.end_time::TEXT,
            'status', event_record.event_type,
            'details', jsonb_build_object(
                'type', event_record.event_type,
                CASE WHEN event_record.event_type = 'class'
                    THEN 'course' ELSE 'identifier' END,
                event_record.identifier,
                'title', event_record.title
            )
        );
        schedule_blocks := array_append(schedule_blocks, block_json);
        current_pointer_time := event_record.end_time;
    END LOOP;

    IF current_pointer_time < building_close_time THEN
        schedule_blocks := array_append(schedule_blocks, jsonb_build_object(
            'start', current_pointer_time::TEXT,
            'end', building_close_time::TEXT,
            'status', 'available',
            'details', null
        ));
    END IF;

    RETURN to_jsonb(schedule_blocks);
END;
$$;


ALTER FUNCTION "public"."get_room_schedule"("building_id_param" "text", "room_number_param" "text", "check_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_room_schedule_cached"("building_id_param" "text", "room_number_param" "text", "check_date_param" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
    schedule_blocks JSONB[] := ARRAY[]::JSONB[];
    cached_activities JSONB;
    building_open_time TIME;
    building_close_time TIME;
    current_pointer_time TIME;
    activity JSONB;
    activity_start TIME;
    activity_end TIME;
    check_day TEXT;
BEGIN
    check_day := CASE EXTRACT(DOW FROM check_date_param)
        WHEN 1 THEN 'M' WHEN 2 THEN 'T' WHEN 3 THEN 'W' WHEN 4 THEN 'R'
        WHEN 5 THEN 'F' WHEN 6 THEN 'S' WHEN 0 THEN 'U'
    END;

    SELECT
        CASE check_day
            WHEN 'M' THEN b.monday_open WHEN 'T' THEN b.tuesday_open
            WHEN 'W' THEN b.wednesday_open WHEN 'R' THEN b.thursday_open
            WHEN 'F' THEN b.friday_open WHEN 'S' THEN b.saturday_open
            WHEN 'U' THEN b.sunday_open
        END,
        CASE check_day
            WHEN 'M' THEN b.monday_close WHEN 'T' THEN b.tuesday_close
            WHEN 'W' THEN b.wednesday_close WHEN 'R' THEN b.thursday_close
            WHEN 'F' THEN b.friday_close WHEN 'S' THEN b.saturday_close
            WHEN 'U' THEN b.sunday_close
        END,
        c.schedule_data
    INTO building_open_time, building_close_time, cached_activities
    FROM buildings b
    LEFT JOIN room_availability_cache c
        ON c.building_name = b.name
       AND c.room_number = room_number_param
       AND c.check_date = check_date_param
    WHERE b.name = building_id_param;

    IF cached_activities IS NULL AND building_open_time IS NOT NULL THEN
        RETURN get_room_schedule(
            building_id_param,
            room_number_param,
            check_date_param
        );
    END IF;

    IF building_open_time IS NULL
       OR building_close_time IS NULL
       OR building_open_time >= building_close_time THEN
        RETURN '[]'::JSONB;
    END IF;

    current_pointer_time := building_open_time;

    IF cached_activities IS NOT NULL THEN
        FOR activity IN SELECT * FROM jsonb_array_elements(cached_activities)
        LOOP
            activity_start := GREATEST(
                (activity->>'start')::TIME,
                building_open_time
            );
            activity_end := LEAST(
                (activity->>'end')::TIME,
                building_close_time
            );

            IF activity_start >= activity_end
               OR activity_end <= current_pointer_time THEN
                CONTINUE;
            END IF;

            activity_start := GREATEST(activity_start, current_pointer_time);

            IF activity_start > current_pointer_time THEN
                schedule_blocks := array_append(schedule_blocks, jsonb_build_object(
                    'start', current_pointer_time::TEXT,
                    'end', activity_start::TEXT,
                    'status', 'available',
                    'details', null
                ));
            END IF;

            schedule_blocks := array_append(schedule_blocks, jsonb_build_object(
                'start', activity_start::TEXT,
                'end', activity_end::TEXT,
                'status', activity->>'status',
                'details', activity->'details'
            ));
            current_pointer_time := activity_end;
        END LOOP;
    END IF;

    IF current_pointer_time < building_close_time THEN
        schedule_blocks := array_append(schedule_blocks, jsonb_build_object(
            'start', current_pointer_time::TEXT,
            'end', building_close_time::TEXT,
            'status', 'available',
            'details', null
        ));
    END IF;

    RETURN to_jsonb(schedule_blocks);
END;
$$;


ALTER FUNCTION "public"."get_room_schedule_cached"("building_id_param" "text", "room_number_param" "text", "check_date_param" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_spots"("check_time" time without time zone, "check_date" "date", "minimum_useful_minutes" integer DEFAULT 30) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
    result JSONB;
    minimum_useful_interval INTERVAL := make_interval(mins => minimum_useful_minutes);
    check_day TEXT := CASE EXTRACT(DOW FROM check_date)
        WHEN 1 THEN 'M' WHEN 2 THEN 'T' WHEN 3 THEN 'W' WHEN 4 THEN 'R'
        WHEN 5 THEN 'F' WHEN 6 THEN 'S' WHEN 0 THEN 'U'
    END;
BEGIN
    WITH day_hours AS MATERIALIZED (
        SELECT
            b.name,
            b.latitude,
            b.longitude,
            CASE check_day
                WHEN 'M' THEN b.monday_open WHEN 'T' THEN b.tuesday_open
                WHEN 'W' THEN b.wednesday_open WHEN 'R' THEN b.thursday_open
                WHEN 'F' THEN b.friday_open WHEN 'S' THEN b.saturday_open
                WHEN 'U' THEN b.sunday_open
            END AS open_time,
            CASE check_day
                WHEN 'M' THEN b.monday_close WHEN 'T' THEN b.tuesday_close
                WHEN 'W' THEN b.wednesday_close WHEN 'R' THEN b.thursday_close
                WHEN 'F' THEN b.friday_close WHEN 'S' THEN b.saturday_close
                WHEN 'U' THEN b.sunday_close
            END AS close_time
        FROM buildings b
    ),
    building_info AS MATERIALIZED (
        SELECT
            dh.*,
            COALESCE(
                CASE
                    WHEN open_time <= close_time THEN
                        check_time >= open_time AND check_time < close_time
                    ELSE
                        check_time >= open_time OR check_time < close_time
                END,
                false
            ) AS is_open
        FROM day_hours dh
    ),
    open_buildings AS MATERIALIZED (
        SELECT *
        FROM building_info
        WHERE is_open
    ),
    activities AS MATERIALIZED (
        SELECT
            cs.building_name,
            cs.room_number,
            cs.course_code AS identifier,
            cs.course_title AS title,
            cs.start_time,
            cs.end_time,
            'class'::text AS source_type
        FROM class_schedule cs
        JOIN open_buildings ob ON ob.name = cs.building_name
        WHERE cs.day_of_week = check_day
          AND check_date <@ cs.date_range
          AND cs.end_time > ob.open_time
          AND cs.start_time < ob.close_time

        UNION ALL

        SELECT
            de.building_name,
            de.room_number,
            de.occupant AS identifier,
            de.event_name AS title,
            (de.start_time AT TIME ZONE 'America/Chicago')::time AS start_time,
            (de.end_time AT TIME ZONE 'America/Chicago')::time AS end_time,
            'event'::text AS source_type
        FROM daily_events de
        JOIN open_buildings ob ON ob.name = de.building_name
        WHERE de.start_time >= check_date::timestamp AT TIME ZONE 'America/Chicago'
          AND de.start_time < (check_date + 1)::timestamp AT TIME ZONE 'America/Chicago'
          AND (de.end_time AT TIME ZONE 'America/Chicago')::time > ob.open_time
          AND (de.start_time AT TIME ZONE 'America/Chicago')::time < ob.close_time
    ),
    current_occupancy AS (
        SELECT DISTINCT ON (building_name, room_number)
            building_name, room_number, identifier, title,
            start_time, end_time, source_type
        FROM activities
        WHERE start_time <= check_time AND end_time > check_time
        ORDER BY building_name, room_number, start_time DESC, end_time DESC,
                 source_type, identifier
    ),
    next_occupancy AS (
        SELECT DISTINCT ON (building_name, room_number)
            building_name, room_number, identifier, title,
            start_time, end_time, source_type
        FROM activities
        WHERE start_time > check_time
        ORDER BY building_name, room_number, start_time, end_time DESC,
                 source_type, identifier
    ),
    activity_edges AS (
        SELECT
            a.*,
            max(end_time) OVER (
                PARTITION BY building_name, room_number
                ORDER BY start_time, end_time
                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ) AS previous_max_end
        FROM activities a
    ),
    activity_groups AS (
        SELECT
            ae.*,
            sum(
                CASE
                    WHEN previous_max_end IS NULL OR start_time > previous_max_end
                    THEN 1 ELSE 0
                END
            ) OVER (
                PARTITION BY building_name, room_number
                ORDER BY start_time, end_time
            ) AS island_id
        FROM activity_edges ae
    ),
    busy_islands AS (
        SELECT
            building_name,
            room_number,
            island_id,
            min(start_time) AS island_start,
            max(end_time) AS island_end
        FROM activity_groups
        GROUP BY building_name, room_number, island_id
    ),
    islands_with_next AS (
        SELECT
            bi.*,
            lead(island_start) OVER (
                PARTITION BY building_name, room_number
                ORDER BY island_start
            ) AS next_island_start
        FROM busy_islands bi
    ),
    meaningful_gaps AS (
        SELECT DISTINCT ON (building_name, room_number)
            building_name,
            room_number,
            island_end AS available_at,
            next_island_start
        FROM islands_with_next
        WHERE island_end > check_time
          AND (
              next_island_start IS NULL
              OR next_island_start - island_end >= minimum_useful_interval
          )
        ORDER BY building_name, room_number, island_end
    ),
    room_status AS MATERIALIZED (
        SELECT
            r.building_name,
            r.room_number,
            ob.close_time,
            co.room_number IS NOT NULL AS is_occupied,
            no.start_time AS next_start_time,
            CASE WHEN co.room_number IS NOT NULL THEN
                jsonb_build_object(
                    'type', co.source_type,
                    'course', co.identifier,
                    'title', co.title,
                    'time', jsonb_build_object(
                        'start', co.start_time::text,
                        'end', co.end_time::text
                    )
                )
            END AS current_class,
            CASE WHEN no.room_number IS NOT NULL THEN
                jsonb_build_object(
                    'type', no.source_type,
                    'course', no.identifier,
                    'title', no.title,
                    'time', jsonb_build_object(
                        'start', no.start_time::text,
                        'end', no.end_time::text
                    )
                )
            END AS next_class,
            mg.available_at AS meaningful_available_at,
            mg.next_island_start
        FROM rooms r
        JOIN open_buildings ob ON ob.name = r.building_name
        LEFT JOIN current_occupancy co
            ON co.building_name = r.building_name
           AND co.room_number = r.room_number
        LEFT JOIN next_occupancy no
            ON no.building_name = r.building_name
           AND no.room_number = r.room_number
        LEFT JOIN meaningful_gaps mg
            ON mg.building_name = r.building_name
           AND mg.room_number = r.room_number
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
                    'currentClass', rs.current_class,
                    'nextClass', rs.next_class,
                    'passingPeriod',
                        NOT rs.is_occupied
                        AND rs.next_start_time IS NOT NULL
                        AND rs.next_start_time - check_time < minimum_useful_interval,
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
                                COALESCE(rs.next_start_time, rs.close_time) - check_time
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

    RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_spots"("check_time" time without time zone, "check_date" "date", "minimum_useful_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."populate_room_availability_cache_segments"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."populate_room_availability_cache_segments"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prune_room_availability_cache"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
    DELETE FROM public.room_availability_cache
    WHERE check_date <
        ((now() AT TIME ZONE 'America/Chicago')::date - 30);

    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."prune_room_availability_cache"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_room_availability_cache"("target_date" "date" DEFAULT (("now"() AT TIME ZONE 'America/Chicago'::"text"))::"date") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
    check_day TEXT;
BEGIN
    -- Determine day character (M, T, W, R, F, S, U)
    check_day := CASE EXTRACT(DOW FROM target_date)
        WHEN 1 THEN 'M' WHEN 2 THEN 'T' WHEN 3 THEN 'W' WHEN 4 THEN 'R'
        WHEN 5 THEN 'F' WHEN 6 THEN 'S' WHEN 0 THEN 'U'
    END;

    -- Clear existing cache for this date
    DELETE FROM room_availability_cache WHERE check_date = target_date;

    WITH day_hours AS (
        SELECT
            name as building_name,
            CASE check_day
                WHEN 'M' THEN monday_open WHEN 'T' THEN tuesday_open WHEN 'W' THEN wednesday_open
                WHEN 'R' THEN thursday_open WHEN 'F' THEN friday_open WHEN 'S' THEN saturday_open
                WHEN 'U' THEN sunday_open
            END as open_time,
            CASE check_day
                WHEN 'M' THEN monday_close WHEN 'T' THEN tuesday_close WHEN 'W' THEN wednesday_close
                WHEN 'R' THEN thursday_close WHEN 'F' THEN friday_close WHEN 'S' THEN saturday_close
                WHEN 'U' THEN sunday_close
            END as close_time
        FROM buildings
    ),
    valid_buildings AS (
        SELECT * FROM day_hours
        WHERE open_time IS NOT NULL
          AND close_time IS NOT NULL
          AND open_time < close_time
    ),
    raw_activities AS (
        -- Classes
        SELECT
            cs.building_name,
            cs.room_number,
            cs.start_time,
            cs.end_time,
            'class' as event_type,
            cs.course_code as identifier,
            cs.course_title as title,
            tsrange(
                (target_date || ' ' || cs.start_time)::timestamp,
                (target_date || ' ' || cs.end_time)::timestamp
            ) as time_range
        FROM class_schedule cs
        JOIN valid_buildings vb ON cs.building_name = vb.building_name
        WHERE cs.day_of_week = check_day
          AND cs.date_range @> target_date
          AND cs.end_time > vb.open_time
          AND cs.start_time < vb.close_time

        UNION ALL

        -- Events
        SELECT
            de.building_name,
            de.room_number,
            (de.start_time AT TIME ZONE 'America/Chicago')::TIME as start_time,
            (de.end_time AT TIME ZONE 'America/Chicago')::TIME as end_time,
            'event' as event_type,
            de.occupant as identifier,
            de.event_name as title,
            tsrange(
                (de.start_time AT TIME ZONE 'America/Chicago'),
                (de.end_time AT TIME ZONE 'America/Chicago')
            ) as time_range
        FROM daily_events de
        JOIN valid_buildings vb ON de.building_name = vb.building_name
        WHERE DATE(de.start_time AT TIME ZONE 'America/Chicago') = target_date
          AND (de.end_time AT TIME ZONE 'America/Chicago')::TIME > vb.open_time
          AND (de.start_time AT TIME ZONE 'America/Chicago')::TIME < vb.close_time
    ),
    -- Aggregate activities per room for JSON generation
    room_activities AS (
        SELECT
            building_name,
            room_number,
            -- Create a multirange of all busy times
            range_agg(time_range) as busy_multirange,
            -- Aggregate all activities into a JSON array, sorted by time
            jsonb_agg(
                jsonb_build_object(
                    'start', start_time::text,
                    'end', end_time::text,
                    'status', event_type,
                    'details', jsonb_build_object(
                        'type', event_type,
                        CASE WHEN event_type = 'class' THEN 'course' ELSE 'identifier' END, identifier,
                        'title', title
                    )
                ) ORDER BY start_time
            ) as activities_json
        FROM raw_activities
        GROUP BY building_name, room_number
    ),
    -- Calculate the final schedule JSON with available blocks
    calculated_data AS (
        SELECT
            r.building_name,
            r.room_number,
            ra.busy_multirange,
            CASE
                WHEN ra.activities_json IS NULL THEN
                    -- Empty schedule, just one big available block
                    jsonb_build_array(
                        jsonb_build_object(
                            'start', vb.open_time::text,
                            'end', vb.close_time::text,
                            'status', 'available',
                            'details', null
                        )
                    )
                ELSE
                    -- We have activities, need to weave in available blocks
                    -- This part is tricky in pure SQL set operations without a complex function.
                    -- However, we can assume the frontend or the reader can handle gaps?
                    -- No, existing frontend expects explicit 'available' blocks.
                    -- Let's use a helper function logic or just store the activities and let the reader fill gaps?
                    -- Re-reading requirement: "Calculates the schedule once".
                    -- To perfectly mimic `get_room_schedule`, we need to fill gaps.
                    -- Let's keep it simple for now: Store the activities list.
                    -- The `get_room_schedule` REPLACEMENT function can fill the gaps cheaply on read
                    -- OR we do it here. Doing it here is better for "Thick Client" idea, but "Range-Optimized"
                    -- really just cares about the `busy_multirange`.
                    -- Let's store the RAW activities in `schedule_data` for now,
                    -- and I will update `get_room_schedule` to fill gaps (it's fast).
                    ra.activities_json
            END as schedule_data
        FROM rooms r
        JOIN valid_buildings vb ON r.building_name = vb.building_name
        LEFT JOIN room_activities ra ON r.building_name = ra.building_name AND r.room_number = ra.room_number
    )
    INSERT INTO room_availability_cache (
        building_name,
        room_number,
        check_date,
        busy_times,
        schedule_data
    )
    SELECT
        cd.building_name,
        cd.room_number,
        target_date,
        COALESCE(cd.busy_multirange, tsmultirange()), -- Empty multirange if no activities
        cd.schedule_data
    FROM calculated_data cd;

END;
$$;


ALTER FUNCTION "public"."refresh_room_availability_cache"("target_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_room_availability_cache_segments"("target_date" "date") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."refresh_room_availability_cache_segments"("target_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_daily_events"("events_data" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
    inserted_count INTEGER;
BEGIN
    DELETE FROM daily_events WHERE TRUE;

    -- Calculate how many events we're about to insert
    inserted_count := COALESCE(jsonb_array_length(events_data), 0);

    IF inserted_count > 0 THEN
        INSERT INTO daily_events (building_name, room_number, event_name, start_time, end_time, occupant)
        SELECT
            (event->>'building_name')::TEXT,
            (event->>'room_number')::TEXT,
            (event->>'event_name')::TEXT,
            (event->>'start_time')::TIMESTAMPTZ,
            (event->>'end_time')::TIMESTAMPTZ,
            (event->>'occupant')::TEXT
        FROM jsonb_array_elements(events_data) AS event;
    END IF;

    -- Return success message with count
    RETURN 'SUCCESS:' || inserted_count;

EXCEPTION
    WHEN OTHERS THEN
        -- If any error occurs, the transaction will be rolled back automatically
        RETURN 'ERROR:' || SQLERRM;
END;
$$;


ALTER FUNCTION "public"."update_daily_events"("events_data" "jsonb") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."academic_terms" (
    "id" integer NOT NULL,
    "academic_year" "text",
    "term" "text",
    "part_of_term" character(1),
    "start_date" "date",
    "end_date" "date",
    CONSTRAINT "valid_part_of_term" CHECK (("part_of_term" = ANY (ARRAY['A'::"bpchar", 'B'::"bpchar"]))),
    CONSTRAINT "valid_term_dates" CHECK (("end_date" > "start_date"))
);


ALTER TABLE "public"."academic_terms" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."academic_terms_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."academic_terms_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."academic_terms_id_seq" OWNED BY "public"."academic_terms"."id";



CREATE TABLE IF NOT EXISTS "public"."buildings" (
    "name" "text" NOT NULL,
    "latitude" numeric(10,8),
    "longitude" numeric(10,8),
    "monday_open" time without time zone,
    "monday_close" time without time zone,
    "tuesday_open" time without time zone,
    "tuesday_close" time without time zone,
    "wednesday_open" time without time zone,
    "wednesday_close" time without time zone,
    "thursday_open" time without time zone,
    "thursday_close" time without time zone,
    "friday_open" time without time zone,
    "friday_close" time without time zone,
    "saturday_open" time without time zone,
    "saturday_close" time without time zone,
    "sunday_open" time without time zone,
    "sunday_close" time without time zone
);


ALTER TABLE "public"."buildings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."class_schedule" (
    "building_name" "text",
    "room_number" "text",
    "course_code" "text" NOT NULL,
    "course_title" "text" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "day_of_week" character(1) NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "date_range" "daterange" GENERATED ALWAYS AS ("daterange"("start_date", "end_date", '[]'::"text")) STORED,
    "id" bigint NOT NULL,
    CONSTRAINT "valid_class_day" CHECK (("day_of_week" = ANY (ARRAY['M'::"bpchar", 'T'::"bpchar", 'W'::"bpchar", 'R'::"bpchar", 'F'::"bpchar", 'S'::"bpchar", 'U'::"bpchar"]))),
    CONSTRAINT "valid_class_times" CHECK (("end_time" > "start_time")),
    CONSTRAINT "valid_term_dates" CHECK (("end_date" >= "start_date"))
);


ALTER TABLE "public"."class_schedule" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."class_schedule_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."class_schedule_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."class_schedule_id_seq" OWNED BY "public"."class_schedule"."id";



CREATE TABLE IF NOT EXISTS "public"."daily_events" (
    "id" integer NOT NULL,
    "building_name" "text" NOT NULL,
    "room_number" "text" NOT NULL,
    "event_name" "text" NOT NULL,
    "occupant" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    CONSTRAINT "valid_event_times" CHECK (("end_time" > "start_time"))
);


ALTER TABLE "public"."daily_events" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."daily_events_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."daily_events_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."daily_events_id_seq" OWNED BY "public"."daily_events"."id";



CREATE TABLE IF NOT EXISTS "public"."room_availability_cache" (
    "building_name" "text" NOT NULL,
    "room_number" "text" NOT NULL,
    "check_date" "date" NOT NULL,
    "busy_times" "tsmultirange",
    "schedule_data" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."room_availability_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."room_availability_cache_segments" (
    "check_date" "date" NOT NULL,
    "building_name" "text" NOT NULL,
    "room_number" "text" NOT NULL,
    "segment_start" time without time zone NOT NULL,
    "segment_end" time without time zone NOT NULL,
    "is_occupied" boolean NOT NULL,
    "current_activity" "jsonb",
    "next_activity" "jsonb",
    "next_start_time" time without time zone,
    "meaningful_available_at" time without time zone,
    "next_island_start" time without time zone,
    CONSTRAINT "room_availability_cache_segments_valid_time" CHECK (("segment_start" < "segment_end"))
);


ALTER TABLE "public"."room_availability_cache_segments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rooms" (
    "building_name" "text" NOT NULL,
    "room_number" "text" NOT NULL
);


ALTER TABLE "public"."rooms" OWNER TO "postgres";


ALTER TABLE ONLY "public"."academic_terms" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."academic_terms_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."class_schedule" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."class_schedule_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."daily_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."daily_events_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."academic_terms"
    ADD CONSTRAINT "academic_terms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."buildings"
    ADD CONSTRAINT "buildings_pkey" PRIMARY KEY ("name");



ALTER TABLE ONLY "public"."class_schedule"
    ADD CONSTRAINT "class_schedule_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_events"
    ADD CONSTRAINT "daily_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."room_availability_cache"
    ADD CONSTRAINT "room_availability_cache_pkey" PRIMARY KEY ("building_name", "room_number", "check_date");



ALTER TABLE ONLY "public"."room_availability_cache_segments"
    ADD CONSTRAINT "room_availability_cache_segments_pkey" PRIMARY KEY ("check_date", "building_name", "room_number", "segment_start");



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_pkey" PRIMARY KEY ("building_name", "room_number");



CREATE INDEX "idx_cache_check_date" ON "public"."room_availability_cache" USING "btree" ("check_date");



CREATE INDEX "idx_class_schedule_date_range" ON "public"."class_schedule" USING "gist" ("date_range");



CREATE INDEX "idx_class_schedule_day_time" ON "public"."class_schedule" USING "btree" ("day_of_week", "start_time", "end_time");



CREATE INDEX "idx_class_schedule_next" ON "public"."class_schedule" USING "btree" ("day_of_week", "start_time");



CREATE INDEX "idx_class_schedule_room_day" ON "public"."class_schedule" USING "btree" ("building_name", "room_number", "day_of_week");



CREATE INDEX "idx_daily_events_room" ON "public"."daily_events" USING "btree" ("building_name", "room_number");



CREATE OR REPLACE TRIGGER "populate_room_availability_cache_segments_after_insert" AFTER INSERT ON "public"."room_availability_cache" REFERENCING NEW TABLE AS "inserted_cache_rows" FOR EACH STATEMENT EXECUTE FUNCTION "public"."populate_room_availability_cache_segments"();



CREATE OR REPLACE TRIGGER "prune_room_availability_cache_after_insert" AFTER INSERT ON "public"."room_availability_cache" FOR EACH STATEMENT EXECUTE FUNCTION "public"."prune_room_availability_cache"();



ALTER TABLE ONLY "public"."class_schedule"
    ADD CONSTRAINT "class_schedule_building_name_room_number_fkey" FOREIGN KEY ("building_name", "room_number") REFERENCES "public"."rooms"("building_name", "room_number");



ALTER TABLE ONLY "public"."daily_events"
    ADD CONSTRAINT "daily_events_building_name_room_number_fkey" FOREIGN KEY ("building_name", "room_number") REFERENCES "public"."rooms"("building_name", "room_number");



ALTER TABLE ONLY "public"."room_availability_cache_segments"
    ADD CONSTRAINT "room_availability_cache_segments_room_fkey" FOREIGN KEY ("building_name", "room_number", "check_date") REFERENCES "public"."room_availability_cache"("building_name", "room_number", "check_date") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_building_name_fkey" FOREIGN KEY ("building_name") REFERENCES "public"."buildings"("name");



ALTER TABLE "public"."academic_terms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "academic_terms_public_read" ON "public"."academic_terms" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."buildings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "buildings_public_read" ON "public"."buildings" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."class_schedule" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "class_schedule_public_read" ON "public"."class_schedule" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."daily_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_events_public_read" ON "public"."daily_events" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."room_availability_cache" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "room_availability_cache_public_read" ON "public"."room_availability_cache" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."room_availability_cache_segments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "room_availability_cache_segments_public_read" ON "public"."room_availability_cache_segments" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."rooms" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rooms_public_read" ON "public"."rooms" FOR SELECT TO "authenticated", "anon" USING (true);



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_cached_spots"("check_time_param" time without time zone, "check_date_param" "date", "min_minutes_param" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_cached_spots"("check_time_param" time without time zone, "check_date_param" "date", "min_minutes_param" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."get_cached_spots"("check_time_param" time without time zone, "check_date_param" "date", "min_minutes_param" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_cached_spots"("check_time_param" time without time zone, "check_date_param" "date", "min_minutes_param" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_room_schedule"("building_id_param" "text", "room_number_param" "text", "check_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_room_schedule"("building_id_param" "text", "room_number_param" "text", "check_date" "date") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_room_schedule"("building_id_param" "text", "room_number_param" "text", "check_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_room_schedule"("building_id_param" "text", "room_number_param" "text", "check_date" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_room_schedule_cached"("building_id_param" "text", "room_number_param" "text", "check_date_param" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_room_schedule_cached"("building_id_param" "text", "room_number_param" "text", "check_date_param" "date") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_room_schedule_cached"("building_id_param" "text", "room_number_param" "text", "check_date_param" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_room_schedule_cached"("building_id_param" "text", "room_number_param" "text", "check_date_param" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_spots"("check_time" time without time zone, "check_date" "date", "minimum_useful_minutes" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_spots"("check_time" time without time zone, "check_date" "date", "minimum_useful_minutes" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."get_spots"("check_time" time without time zone, "check_date" "date", "minimum_useful_minutes" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_spots"("check_time" time without time zone, "check_date" "date", "minimum_useful_minutes" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."populate_room_availability_cache_segments"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."populate_room_availability_cache_segments"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prune_room_availability_cache"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_room_availability_cache"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_room_availability_cache"("target_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_room_availability_cache"("target_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_room_availability_cache_segments"("target_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_room_availability_cache_segments"("target_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_daily_events"("events_data" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_daily_events"("events_data" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."academic_terms" TO "service_role";
GRANT SELECT ON TABLE "public"."academic_terms" TO "anon";
GRANT SELECT ON TABLE "public"."academic_terms" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."academic_terms_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."buildings" TO "service_role";
GRANT SELECT ON TABLE "public"."buildings" TO "anon";
GRANT SELECT ON TABLE "public"."buildings" TO "authenticated";



GRANT ALL ON TABLE "public"."class_schedule" TO "service_role";
GRANT SELECT ON TABLE "public"."class_schedule" TO "anon";
GRANT SELECT ON TABLE "public"."class_schedule" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."class_schedule_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."daily_events" TO "service_role";
GRANT SELECT ON TABLE "public"."daily_events" TO "anon";
GRANT SELECT ON TABLE "public"."daily_events" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."daily_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."room_availability_cache" TO "service_role";
GRANT SELECT ON TABLE "public"."room_availability_cache" TO "anon";
GRANT SELECT ON TABLE "public"."room_availability_cache" TO "authenticated";



GRANT ALL ON TABLE "public"."room_availability_cache_segments" TO "anon";
GRANT ALL ON TABLE "public"."room_availability_cache_segments" TO "authenticated";
GRANT ALL ON TABLE "public"."room_availability_cache_segments" TO "service_role";



GRANT ALL ON TABLE "public"."rooms" TO "service_role";
GRANT SELECT ON TABLE "public"."rooms" TO "anon";
GRANT SELECT ON TABLE "public"."rooms" TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";
