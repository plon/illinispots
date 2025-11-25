CREATE OR REPLACE FUNCTION refresh_room_availability_cache(target_date DATE DEFAULT (NOW() AT TIME ZONE 'America/Chicago')::DATE)
RETURNS void AS $$
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
                    -- Store raw activities; gaps are filled at read time by get_room_schedule_cached
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
$$ LANGUAGE plpgsql;
