CREATE OR REPLACE FUNCTION get_room_schedule(
    building_id_param TEXT,
    room_number_param TEXT,
    check_date DATE,
    start_time_param TIME
)
RETURNS JSONB -- Returns an array of schedule blocks
AS $$
DECLARE
    result JSONB;
    schedule_blocks JSONB[] := ARRAY[]::JSONB[];
    building_open_time TIME;
    building_close_time TIME;
    current_pointer_time TIME;
    check_day TEXT;
    event_record RECORD;
    first_block_index INTEGER := -1;
    block_json JSONB;
BEGIN
    -- Determine day character (M, T, W, R, F, S, U)
    check_day := CASE EXTRACT(DOW FROM check_date)
        WHEN 1 THEN 'M' WHEN 2 THEN 'T' WHEN 3 THEN 'W' WHEN 4 THEN 'R'
        WHEN 5 THEN 'F' WHEN 6 THEN 'S' WHEN 0 THEN 'U'
    END;

    -- Get building hours for the specified day
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
        END
    INTO building_open_time, building_close_time
    FROM buildings b
    WHERE b.name = building_id_param;

    -- If building is not open on this day or hours are missing, return empty array
    IF building_open_time IS NULL OR building_close_time IS NULL OR building_open_time >= building_close_time THEN
        RETURN '[]'::JSONB;
    END IF;

    -- Initialize pointer to the building's opening time
    current_pointer_time := building_open_time;

    -- Loop through sorted classes and events for the room on the given day
    FOR event_record IN
        SELECT
            start_time,
            end_time,
            'class' as event_type,
            course_code as identifier,
            course_title as title
        FROM class_schedule
        WHERE building_name = building_id_param
          AND room_number = room_number_param
          AND day_of_week = check_day
          AND check_date <@ date_range -- Use the generated range column
          AND end_time > building_open_time -- Ignore classes ending before building opens
          AND start_time < building_close_time -- Ignore classes starting after building closes

        UNION ALL

        SELECT
            start_time,
            end_time,
            'event' as event_type,
            occupant as identifier, -- could use event_name
            event_name as title
        FROM daily_events
        WHERE building_name = building_id_param
          AND room_number = room_number_param
          AND event_date = check_date
          AND end_time > building_open_time
          AND start_time < building_close_time

        ORDER BY start_time
    LOOP
        -- Ensure event times are within building hours
        event_record.start_time := GREATEST(event_record.start_time, building_open_time);
        event_record.end_time := LEAST(event_record.end_time, building_close_time);

        -- Skip if event is entirely outside adjusted pointer or invalid duration
        IF event_record.start_time >= event_record.end_time OR event_record.start_time < current_pointer_time THEN
            CONTINUE;
        END IF;

        -- Add available block if there's a gap before this event
        IF event_record.start_time > current_pointer_time THEN
            block_json := jsonb_build_object(
                'start', current_pointer_time::TEXT,
                'end', event_record.start_time::TEXT,
                'status', 'available',
                'details', null
            );
            schedule_blocks := array_append(schedule_blocks, block_json);
        END IF;

        -- Add the class/event block
        block_json := jsonb_build_object(
            'start', event_record.start_time::TEXT,
            'end', event_record.end_time::TEXT,
            'status', event_record.event_type,
            'details', jsonb_build_object(
                'type', event_record.event_type,
                CASE WHEN event_record.event_type = 'class' THEN 'course' ELSE 'identifier' END, event_record.identifier,
                'title', event_record.title
            )
        );
        schedule_blocks := array_append(schedule_blocks, block_json);

        current_pointer_time := event_record.end_time;

    END LOOP;

    -- Add final available block if pointer hasn't reached closing time
    IF current_pointer_time < building_close_time THEN
         block_json := jsonb_build_object(
            'start', current_pointer_time::TEXT,
            'end', building_close_time::TEXT,
            'status', 'available',
            'details', null
        );
        schedule_blocks := array_append(schedule_blocks, block_json);
    END IF;

    -- Find the index of the first block relevant to start_time_param
    FOR i IN 1..array_length(schedule_blocks, 1) LOOP
        IF (schedule_blocks[i]->>'start')::TIME <= start_time_param AND
           (schedule_blocks[i]->>'end')::TIME > start_time_param
        THEN
            first_block_index := i;
            EXIT;
        END IF;
    END LOOP;

    -- If no relevant block found (start_time_param is after last block end), return empty
    IF first_block_index = -1 THEN
        RETURN '[]'::JSONB;
    END IF;

    RETURN to_jsonb(schedule_blocks[first_block_index:array_length(schedule_blocks, 1)]);

END;
$$ LANGUAGE plpgsql;
