-- Stage the large schedule payload in bounded requests, then replace the weekly
-- course snapshot and its cache in one transaction. Staging never changes the
-- reader-visible source tables.
CREATE TABLE public.course_schedule_load_staging (
    load_id UUID NOT NULL,
    row_data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX course_schedule_load_staging_load_id_idx
ON public.course_schedule_load_staging (load_id);

ALTER TABLE public.course_schedule_load_staging ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.course_schedule_load_staging
FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.course_schedule_load_staging
TO service_role;

CREATE OR REPLACE FUNCTION public.stage_course_schedules(
    schedule_load_id UUID,
    schedules_data JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql
SET search_path = pg_catalog, public
SET statement_timeout = '120s'
AS $$
DECLARE
    staged_count BIGINT;
BEGIN
    IF schedule_load_id IS NULL THEN
        RAISE EXCEPTION 'Course schedule load ID is required';
    END IF;
    IF jsonb_typeof(schedules_data) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Course schedule staging data must be a JSON array';
    END IF;

    DELETE FROM course_schedule_load_staging
    WHERE created_at < NOW() - INTERVAL '1 day';

    INSERT INTO course_schedule_load_staging (load_id, row_data)
    SELECT schedule_load_id, schedule
    FROM jsonb_array_elements(schedules_data) AS schedule;

    SELECT count(*)
    INTO staged_count
    FROM course_schedule_load_staging
    WHERE course_schedule_load_staging.load_id = schedule_load_id;

    RETURN staged_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_course_data(
    buildings_data JSONB,
    rooms_data JSONB,
    academic_terms_data JSONB,
    schedule_load_id UUID,
    expected_schedule_count BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
SET statement_timeout = '120s'
AS $$
DECLARE
    schedule_count BIGINT;
    staged_schedule_count BIGINT;
    term_count BIGINT;
BEGIN
    IF jsonb_typeof(buildings_data) IS DISTINCT FROM 'array'
       OR jsonb_typeof(rooms_data) IS DISTINCT FROM 'array'
       OR jsonb_typeof(academic_terms_data) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Course data arguments must be JSON arrays';
    END IF;

    SELECT count(*)
    INTO staged_schedule_count
    FROM course_schedule_load_staging
    WHERE load_id = schedule_load_id;

    -- A partial staging upload must never erase a valid schedule.
    IF jsonb_array_length(buildings_data) = 0
       OR jsonb_array_length(rooms_data) = 0
       OR expected_schedule_count <= 0
       OR staged_schedule_count <> expected_schedule_count THEN
        RAISE EXCEPTION
            'Refusing incomplete course load: expected % schedules, staged %',
            expected_schedule_count,
            staged_schedule_count;
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
    FROM course_schedule_load_staging AS staged
    CROSS JOIN LATERAL jsonb_to_record(staged.row_data) AS schedule(
        building_name TEXT,
        room_number TEXT,
        course_code TEXT,
        course_title TEXT,
        start_time TIME,
        end_time TIME,
        day_of_week CHAR(1),
        start_date DATE,
        end_date DATE
    )
    WHERE staged.load_id = schedule_load_id;
    GET DIAGNOSTICS schedule_count = ROW_COUNT;

    DELETE FROM course_schedule_load_staging
    WHERE load_id = schedule_load_id;

    -- Every cached date depends on class_schedule. Drop stale snapshots and
    -- warm today before committing the new source data.
    DELETE FROM room_availability_cache;
    PERFORM refresh_room_availability_cache(
        (NOW() AT TIME ZONE 'America/Chicago')::DATE
    );

    RETURN jsonb_build_object(
        'buildings', (SELECT count(*) FROM buildings),
        'rooms', (SELECT count(*) FROM rooms),
        'class_schedule_rows', schedule_count,
        'academic_terms', term_count
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.stage_course_schedules(UUID, JSONB)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_course_schedules(UUID, JSONB)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.replace_course_data(
    JSONB,
    JSONB,
    JSONB,
    UUID,
    BIGINT
)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_course_data(
    JSONB,
    JSONB,
    JSONB,
    UUID,
    BIGINT
)
TO service_role;
