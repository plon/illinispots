CREATE OR REPLACE FUNCTION public.get_spots(
    check_time TIME,
    check_date DATE,
    minimum_useful_minutes INTEGER DEFAULT 30
)
RETURNS JSONB AS $$
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
$$ LANGUAGE plpgsql
SET search_path = pg_catalog, public;

REVOKE EXECUTE ON FUNCTION
    public.get_spots(time without time zone, date, integer)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
    public.get_spots(time without time zone, date, integer)
TO anon, authenticated;
