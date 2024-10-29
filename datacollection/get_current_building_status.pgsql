CREATE INDEX IF NOT EXISTS idx_class_schedule_day_time
    ON class_schedule(day_of_week, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_rooms_building_room
    ON rooms(building_name, room_number);

CREATE INDEX IF NOT EXISTS idx_class_schedule_next
    ON class_schedule(day_of_week, start_time);

CREATE OR REPLACE FUNCTION get_current_building_status(
    check_time TIME,
    check_day TEXT,
    minimum_useful_minutes INTEGER DEFAULT 30
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    minimum_useful_interval INTERVAL;
BEGIN
    minimum_useful_interval := (minimum_useful_minutes || ' minutes')::interval;

    -- Get building hours once for the specific day
    WITH day_hours AS (
        SELECT
            b.name,
            b.latitude,
            b.longitude,
            CASE check_day
                WHEN 'M' THEN b.monday_open
                WHEN 'T' THEN b.tuesday_open
                WHEN 'W' THEN b.wednesday_open
                WHEN 'R' THEN b.thursday_open
                WHEN 'F' THEN b.friday_open
                WHEN 'S' THEN b.saturday_open
                WHEN 'U' THEN b.sunday_open
            END as open_time,
            CASE check_day
                WHEN 'M' THEN b.monday_close
                WHEN 'T' THEN b.tuesday_close
                WHEN 'W' THEN b.wednesday_close
                WHEN 'R' THEN b.thursday_close
                WHEN 'F' THEN b.friday_close
                WHEN 'S' THEN b.saturday_close
                WHEN 'U' THEN b.sunday_close
            END as close_time
        FROM buildings b
    ),
    -- Get current classes efficiently
    current_classes AS (
        SELECT
            building_name,
            room_number,
            course_code,
            course_title,
            start_time,
            end_time
        FROM class_schedule
        WHERE day_of_week = check_day
        AND check_time BETWEEN start_time AND end_time
    ),
    -- Get next class for each room
    next_classes AS (
        SELECT DISTINCT ON (building_name, room_number)
            building_name,
            room_number,
            course_code,
            course_title,
            start_time,
            end_time
        FROM class_schedule
        WHERE day_of_week = check_day
        AND start_time > check_time
        ORDER BY building_name, room_number, start_time
    ),
    -- Compute room status once
    room_status AS (
        SELECT
            r.building_name,
            r.room_number,
            CASE
                WHEN cc.room_number IS NOT NULL THEN 'occupied'
                WHEN nc.room_number IS NOT NULL AND
                     (nc.start_time - check_time) < minimum_useful_interval THEN 'occupied'
                ELSE 'available'
            END as status,
            cc.end_time as available_at,
            nc.start_time as available_until,
            -- Build JSON objects once
            CASE WHEN cc.room_number IS NOT NULL THEN
                jsonb_build_object(
                    'course', cc.course_code,
                    'title', cc.course_title,
                    'time', jsonb_build_object(
                        'start', cc.start_time::text,
                        'end', cc.end_time::text
                    )
                )
            ELSE NULL END as current_class,
            CASE WHEN nc.room_number IS NOT NULL THEN
                jsonb_build_object(
                    'course', nc.course_code,
                    'title', nc.course_title,
                    'time', jsonb_build_object(
                        'start', nc.start_time::text,
                        'end', nc.end_time::text
                    )
                )
            ELSE NULL END as next_class
        FROM rooms r
        LEFT JOIN current_classes cc ON r.building_name = cc.building_name
            AND r.room_number = cc.room_number
        LEFT JOIN next_classes nc ON r.building_name = nc.building_name
            AND r.room_number = nc.room_number
    ),
    -- Pre-calculate room counts
    room_counts AS (
        SELECT
            building_name,
            COUNT(*) as total_rooms,
            COUNT(*) FILTER (WHERE status = 'available') as available_rooms
        FROM room_status
        GROUP BY building_name
    )
    -- Final result assembly
    SELECT jsonb_build_object(
        'timestamp', NOW(),
        'buildings', (
            SELECT jsonb_object_agg(
                dh.name,
                jsonb_build_object(
                    'name', dh.name,
                    'coordinates', jsonb_build_object(
                        'latitude', dh.latitude,
                        'longitude', dh.longitude
                    ),
                    'hours', jsonb_build_object(
                        'open', dh.open_time,
                        'close', dh.close_time
                    ),
                    'rooms', (
                        SELECT jsonb_object_agg(
                            rs.room_number,
                            jsonb_build_object(
                                'status', rs.status,
                                'available', rs.status = 'available',
                                'currentClass', rs.current_class,
                                'nextClass', rs.next_class,
                                'availableAt',
                                CASE WHEN rs.status = 'occupied'
                                     THEN rs.available_at::text ELSE NULL END,
                                'availableUntil',
                                CASE
                                    WHEN rs.status = 'available' AND rs.available_until IS NOT NULL
                                    THEN rs.available_until::text
                                    WHEN rs.status = 'available'
                                    THEN dh.close_time::text
                                    ELSE NULL
                                END
                            )
                        )
                        FROM room_status rs
                        WHERE rs.building_name = dh.name
                    ),
                    'isOpen', check_time BETWEEN dh.open_time AND dh.close_time,
                    'roomCounts', (
                        SELECT jsonb_build_object(
                            'available', rc.available_rooms,
                            'total', rc.total_rooms
                        )
                        FROM room_counts rc
                        WHERE rc.building_name = dh.name
                    )
                )
            )
            FROM day_hours dh
        )
    ) INTO result;

    RETURN result;
END;
$$
 LANGUAGE plpgsql;
