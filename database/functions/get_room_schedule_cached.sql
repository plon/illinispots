CREATE OR REPLACE FUNCTION get_room_schedule_cached(
    building_id_param TEXT,
    room_number_param TEXT,
    check_date_param DATE
)
RETURNS JSONB AS $$
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
    SET LOCAL statement_timeout = '3s';

    -- Determine day character
    check_day := CASE EXTRACT(DOW FROM check_date_param)
        WHEN 1 THEN 'M' WHEN 2 THEN 'T' WHEN 3 THEN 'W' WHEN 4 THEN 'R'
        WHEN 5 THEN 'F' WHEN 6 THEN 'S' WHEN 0 THEN 'U'
    END;

    -- Get building hours and cached activities
    SELECT
        CASE check_day
            WHEN 'M' THEN b.monday_open WHEN 'T' THEN b.tuesday_open WHEN 'W' THEN b.wednesday_open
            WHEN 'R' THEN b.thursday_open WHEN 'F' THEN b.friday_open WHEN 'S' THEN b.saturday_open
            WHEN 'U' THEN b.sunday_open
        END,
        CASE check_day
            WHEN 'M' THEN b.monday_close WHEN 'T' THEN b.tuesday_close WHEN 'W' THEN b.wednesday_close
            WHEN 'R' THEN b.thursday_close WHEN 'F' THEN b.friday_close WHEN 'S' THEN b.saturday_close
            WHEN 'U' THEN b.sunday_close
        END,
        c.schedule_data
    INTO building_open_time, building_close_time, cached_activities
    FROM buildings b
    LEFT JOIN room_availability_cache c 
        ON b.name = c.building_name 
        AND c.room_number = room_number_param
        AND c.check_date = check_date_param
    WHERE b.name = building_id_param;

    -- If building closed or no data, return empty
    IF building_open_time IS NULL OR building_close_time IS NULL OR building_open_time >= building_close_time THEN
        RETURN '[]'::JSONB;
    END IF;

    current_pointer_time := building_open_time;

    -- If we have activities, process them
    IF cached_activities IS NOT NULL THEN
        FOR activity IN SELECT * FROM jsonb_array_elements(cached_activities)
        LOOP
            activity_start := (activity->>'start')::TIME;
            activity_end := (activity->>'end')::TIME;

            -- Clamp to building hours
            activity_start := GREATEST(activity_start, building_open_time);
            activity_end := LEAST(activity_end, building_close_time);

            -- Skip invalid
            IF activity_start >= activity_end OR activity_start < current_pointer_time THEN
                CONTINUE;
            END IF;

            -- Add gap if exists
            IF activity_start > current_pointer_time THEN
                schedule_blocks := array_append(schedule_blocks, jsonb_build_object(
                    'start', current_pointer_time::TEXT,
                    'end', activity_start::TEXT,
                    'status', 'available',
                    'details', null
                ));
            END IF;

            -- Add activity
            schedule_blocks := array_append(schedule_blocks, jsonb_build_object(
                'start', activity_start::TEXT,
                'end', activity_end::TEXT,
                'status', activity->>'status',
                'details', activity->'details'
            ));

            current_pointer_time := activity_end;
        END LOOP;
    END IF;

    -- Add final gap
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
$$ LANGUAGE plpgsql;