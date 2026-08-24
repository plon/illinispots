-- Replace the weekly course snapshot in one transaction and one PostgREST
-- request. Readers continue seeing the old schedule until the replacement is
-- complete, and any malformed row rolls the entire update back.
CREATE OR REPLACE FUNCTION public.replace_course_data(
    buildings_data JSONB,
    rooms_data JSONB,
    schedules_data JSONB,
    academic_terms_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    schedule_count BIGINT;
    term_count BIGINT;
BEGIN
    IF jsonb_typeof(buildings_data) IS DISTINCT FROM 'array'
       OR jsonb_typeof(rooms_data) IS DISTINCT FROM 'array'
       OR jsonb_typeof(schedules_data) IS DISTINCT FROM 'array'
       OR jsonb_typeof(academic_terms_data) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Course data arguments must be JSON arrays';
    END IF;

    -- Match the loader's guard: a failed transform must never erase a valid
    -- schedule. An empty academic calendar remains a valid explicit clear.
    IF jsonb_array_length(buildings_data) = 0
       OR jsonb_array_length(rooms_data) = 0
       OR jsonb_array_length(schedules_data) = 0 THEN
        RAISE EXCEPTION 'Refusing to replace course data with an empty dataset';
    END IF;

    INSERT INTO buildings (
        name,
        latitude,
        longitude,
        monday_open,
        monday_close,
        tuesday_open,
        tuesday_close,
        wednesday_open,
        wednesday_close,
        thursday_open,
        thursday_close,
        friday_open,
        friday_close,
        saturday_open,
        saturday_close,
        sunday_open,
        sunday_close
    )
    SELECT
        building.name,
        building.latitude,
        building.longitude,
        building.monday_open,
        building.monday_close,
        building.tuesday_open,
        building.tuesday_close,
        building.wednesday_open,
        building.wednesday_close,
        building.thursday_open,
        building.thursday_close,
        building.friday_open,
        building.friday_close,
        building.saturday_open,
        building.saturday_close,
        building.sunday_open,
        building.sunday_close
    FROM jsonb_to_recordset(buildings_data) AS building(
        name TEXT,
        latitude DECIMAL(10, 8),
        longitude DECIMAL(10, 8),
        monday_open TIME,
        monday_close TIME,
        tuesday_open TIME,
        tuesday_close TIME,
        wednesday_open TIME,
        wednesday_close TIME,
        thursday_open TIME,
        thursday_close TIME,
        friday_open TIME,
        friday_close TIME,
        saturday_open TIME,
        saturday_close TIME,
        sunday_open TIME,
        sunday_close TIME
    )
    ON CONFLICT (name) DO UPDATE SET
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        monday_open = EXCLUDED.monday_open,
        monday_close = EXCLUDED.monday_close,
        tuesday_open = EXCLUDED.tuesday_open,
        tuesday_close = EXCLUDED.tuesday_close,
        wednesday_open = EXCLUDED.wednesday_open,
        wednesday_close = EXCLUDED.wednesday_close,
        thursday_open = EXCLUDED.thursday_open,
        thursday_close = EXCLUDED.thursday_close,
        friday_open = EXCLUDED.friday_open,
        friday_close = EXCLUDED.friday_close,
        saturday_open = EXCLUDED.saturday_open,
        saturday_close = EXCLUDED.saturday_close,
        sunday_open = EXCLUDED.sunday_open,
        sunday_close = EXCLUDED.sunday_close;

    INSERT INTO rooms (building_name, room_number)
    SELECT room.building_name, room.room_number
    FROM jsonb_to_recordset(rooms_data) AS room(
        building_name TEXT,
        room_number TEXT
    )
    ON CONFLICT (building_name, room_number) DO NOTHING;

    DELETE FROM class_schedule;
    DELETE FROM academic_terms;

    INSERT INTO academic_terms (
        academic_year,
        term,
        part_of_term,
        start_date,
        end_date
    )
    SELECT
        academic_term.academic_year,
        academic_term.term,
        academic_term.part_of_term,
        academic_term.start_date,
        academic_term.end_date
    FROM jsonb_to_recordset(academic_terms_data) AS academic_term(
        academic_year TEXT,
        term TEXT,
        part_of_term CHAR(1),
        start_date DATE,
        end_date DATE
    );
    GET DIAGNOSTICS term_count = ROW_COUNT;

    INSERT INTO class_schedule (
        building_name,
        room_number,
        course_code,
        course_title,
        start_time,
        end_time,
        day_of_week,
        start_date,
        end_date
    )
    SELECT
        schedule.building_name,
        schedule.room_number,
        schedule.course_code,
        schedule.course_title,
        schedule.start_time,
        schedule.end_time,
        schedule.day_of_week,
        schedule.start_date,
        schedule.end_date
    FROM jsonb_to_recordset(schedules_data) AS schedule(
        building_name TEXT,
        room_number TEXT,
        course_code TEXT,
        course_title TEXT,
        start_time TIME,
        end_time TIME,
        day_of_week CHAR(1),
        start_date DATE,
        end_date DATE
    );
    GET DIAGNOSTICS schedule_count = ROW_COUNT;

    -- Every cached date depends on class_schedule. Drop stale snapshots and
    -- warm today before committing the new source data.
    DELETE FROM room_availability_cache;
    PERFORM refresh_room_availability_cache();

    RETURN jsonb_build_object(
        'buildings', (SELECT count(*) FROM buildings),
        'rooms', (SELECT count(*) FROM rooms),
        'class_schedule_rows', schedule_count,
        'academic_terms', term_count
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.replace_course_data(JSONB, JSONB, JSONB, JSONB)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_course_data(JSONB, JSONB, JSONB, JSONB)
TO service_role;
