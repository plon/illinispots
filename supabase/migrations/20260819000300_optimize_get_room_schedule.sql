CREATE OR REPLACE FUNCTION public.get_room_schedule(
    building_id_param TEXT,
    room_number_param TEXT,
    check_date DATE
)
RETURNS JSONB AS $$
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
$$ LANGUAGE plpgsql
SET search_path = pg_catalog, public;

REVOKE EXECUTE ON FUNCTION public.get_room_schedule(text, text, date)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_room_schedule(text, text, date)
TO anon, authenticated;
