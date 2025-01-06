CREATE OR REPLACE FUNCTION get_spots(
    check_time TIME,
    check_day TEXT,
    minimum_useful_minutes INTEGER DEFAULT 30
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    minimum_useful_interval INTERVAL;
BEGIN
    SET TIME ZONE 'America/Chicago';

    minimum_useful_interval := (minimum_useful_minutes || ' minutes')::interval;

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
    current_occupancy AS (
        -- Classes currently in session
        SELECT
            building_name,
            room_number,
            course_code as identifier,
            course_title as title,
            start_time,
            end_time,
            'class' as source_type
        FROM class_schedule
        WHERE day_of_week = check_day
        AND check_time BETWEEN start_time AND end_time
        AND CURRENT_DATE <@ date_range

        UNION ALL

        -- Current daily events
        SELECT
            building_name,
            room_number,
            occupant as identifier,
            event_name as title,
            start_time,
            end_time,
            'event' as source_type
        FROM daily_events
        WHERE event_date = CURRENT_DATE
        AND check_time BETWEEN start_time AND end_time
    ),
    next_occupancy AS (
        SELECT DISTINCT ON (building_name, room_number)
            building_name,
            room_number,
            identifier,
            title,
            start_time,
            end_time,
            source_type
        FROM (
            -- Next scheduled classes
            SELECT
                building_name,
                room_number,
                course_code as identifier,
                course_title as title,
                start_time,
                end_time,
                'class' as source_type
            FROM class_schedule
            WHERE day_of_week = check_day
            AND start_time > check_time
            AND CURRENT_DATE <@ date_range

            UNION ALL

            -- Next daily events
            SELECT
                building_name,
                room_number,
                occupant as identifier,
                event_name as title,
                start_time,
                end_time,
                'event' as source_type
            FROM daily_events
            WHERE event_date = CURRENT_DATE
            AND start_time > check_time
        ) combined
        ORDER BY building_name, room_number, start_time
    ),
    remaining_occupancy AS (
        SELECT
            building_name,
            room_number,
            jsonb_agg(
                jsonb_build_object(
                    'start_time', start_time,
                    'end_time', end_time
                )
                ORDER BY start_time
            ) as class_sequence
        FROM (
            -- Remaining classes
            SELECT building_name, room_number, start_time, end_time
            FROM class_schedule
            WHERE day_of_week = check_day
            AND start_time > check_time
            AND CURRENT_DATE <@ date_range

            UNION ALL

            -- Remaining events
            SELECT building_name, room_number, start_time, end_time
            FROM daily_events
            WHERE event_date = CURRENT_DATE
            AND start_time > check_time
        ) combined
        GROUP BY building_name, room_number
    ),
    room_status AS (
        SELECT
            r.building_name,
            r.room_number,
            CASE
                WHEN co.room_number IS NOT NULL THEN 'occupied'
                ELSE 'available'
            END as status,
            co.end_time as available_at,
            no.start_time as available_until,
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
            ELSE NULL END as current_class,
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
            ELSE NULL END as next_class
        FROM rooms r
        LEFT JOIN current_occupancy co ON r.building_name = co.building_name
            AND r.room_number = co.room_number
        LEFT JOIN next_occupancy no ON r.building_name = no.building_name
            AND r.room_number = no.room_number
    ),
    meaningful_gap AS (
        SELECT
            rs.building_name,
            rs.room_number,
            CASE
                WHEN rs.status = 'occupied' THEN (
                    WITH class_sequence AS (
                        SELECT
                            rs2.available_at as initial_time,
                            rc.class_sequence,
                            dh.close_time
                        FROM room_status rs2
                        LEFT JOIN remaining_occupancy rc
                            ON rs2.building_name = rc.building_name
                            AND rs2.room_number = rc.room_number
                        CROSS JOIN day_hours dh
                        WHERE dh.name = rs2.building_name
                        AND rs2.building_name = rs.building_name
                        AND rs2.room_number = rs.room_number
                        LIMIT 1
                    )
                    SELECT
                        CASE
                            WHEN class_sequence IS NULL OR class_sequence.class_sequence IS NULL THEN
                                jsonb_build_object(
                                    'available_at', initial_time,
                                    'next_class_start', NULL::time
                                )
                            ELSE (
                                WITH RECURSIVE class_check(current_end, next_idx, found_gap, next_start) AS (
                                    SELECT
                                        initial_time,
                                        0,
                                        CASE
                                            WHEN (class_sequence->0->>'start_time')::time - initial_time >= minimum_useful_interval
                                            THEN true
                                            ELSE false
                                        END,
                                        CASE
                                            WHEN (class_sequence->0->>'start_time')::time - initial_time >= minimum_useful_interval
                                            THEN (class_sequence->0->>'start_time')::time
                                            ELSE NULL
                                        END
                                    FROM class_sequence

                                    UNION ALL
                                    SELECT
                                        (class_sequence->next_idx->>'end_time')::time,
                                        next_idx + 1,
                                        CASE
                                            WHEN next_idx + 1 >= jsonb_array_length(class_sequence) THEN true
                                            WHEN (class_sequence->(next_idx + 1)->>'start_time')::time -
                                                 (class_sequence->next_idx->>'end_time')::time >= minimum_useful_interval
                                            THEN true
                                            ELSE false
                                        END,
                                        CASE
                                            WHEN next_idx + 1 >= jsonb_array_length(class_sequence) THEN NULL
                                            WHEN (class_sequence->(next_idx + 1)->>'start_time')::time -
                                                 (class_sequence->next_idx->>'end_time')::time >= minimum_useful_interval
                                            THEN (class_sequence->(next_idx + 1)->>'start_time')::time
                                            ELSE NULL
                                        END
                                    FROM class_check, class_sequence
                                    WHERE NOT found_gap
                                    AND next_idx < jsonb_array_length(class_sequence)
                                )
                                SELECT jsonb_build_object(
                                    'available_at',
                                    CASE
                                        WHEN current_end > close_time THEN close_time
                                        ELSE current_end
                                    END,
                                    'next_class_start',
                                    CASE
                                        WHEN current_end > close_time THEN NULL
                                        ELSE next_start
                                    END
                                )
                                FROM class_check
                                WHERE found_gap
                                ORDER BY current_end
                                LIMIT 1
                            )
                        END
                    FROM class_sequence
                )
                ELSE NULL
            END as gap_info
        FROM room_status rs
    ),
    meaningful_gap_parsed AS (
        SELECT
            building_name,
            room_number,
            (gap_info->>'available_at')::time as meaningful_available_at,
            (gap_info->>'next_class_start')::time as next_class_start
        FROM meaningful_gap
    ),
    room_counts AS (
        SELECT
            building_name,
            COUNT(*) as total_rooms,
            COUNT(*) FILTER (WHERE status = 'available') as available_rooms
        FROM room_status
        GROUP BY building_name
    )
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
                                'passingPeriod',
                                CASE
                                    WHEN co.room_number IS NULL
                                    AND no.room_number IS NOT NULL
                                    AND (no.start_time - check_time) < minimum_useful_interval
                                    THEN true
                                    ELSE false
                                END,
                                'availableAt',
                                CASE
                                    WHEN rs.status = 'occupied'
                                    THEN COALESCE(mgp.meaningful_available_at::text, dh.close_time::text)
                                    ELSE NULL
                                END,
                                'availableFor',
                                CASE
                                    WHEN rs.status = 'occupied' THEN
                                        CASE
                                            WHEN mgp.meaningful_available_at IS NOT NULL THEN
                                                CASE
                                                    WHEN mgp.next_class_start IS NOT NULL THEN
                                                        EXTRACT(EPOCH FROM (mgp.next_class_start - mgp.meaningful_available_at))/60
                                                    ELSE
                                                        EXTRACT(EPOCH FROM (dh.close_time - mgp.meaningful_available_at))/60
                                                END
                                            ELSE NULL
                                        END
                                    WHEN rs.status = 'available' THEN
                                        CASE
                                            WHEN rs.available_until IS NOT NULL THEN
                                                EXTRACT(EPOCH FROM (rs.available_until - check_time))/60
                                            ELSE
                                                EXTRACT(EPOCH FROM (dh.close_time - check_time))/60
                                        END
                                END,
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
                        LEFT JOIN current_occupancy co ON rs.building_name = co.building_name
                            AND rs.room_number = co.room_number
                        LEFT JOIN next_occupancy no ON rs.building_name = no.building_name
                            AND rs.room_number = no.room_number
                        LEFT JOIN meaningful_gap_parsed mgp ON rs.building_name = mgp.building_name
                            AND rs.room_number = mgp.room_number
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
$$ LANGUAGE plpgsql;


-- Indexes
CREATE INDEX IF NOT EXISTS idx_class_schedule_day_time
    ON class_schedule(day_of_week, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_class_schedule_next
    ON class_schedule(day_of_week, start_time);

CREATE INDEX IF NOT EXISTS idx_class_schedule_room_day
    ON class_schedule(building_name, room_number, day_of_week);

CREATE INDEX IF NOT EXISTS idx_daily_events_date_time
    ON daily_events(event_date, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_daily_events_room
    ON daily_events(building_name, room_number);
