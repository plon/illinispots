-- Validate room references and replace the daily snapshot in one transaction.
-- This avoids downloading the room catalog into the pipeline on every run.
CREATE OR REPLACE FUNCTION public.replace_daily_events(events_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    input_count BIGINT;
    inserted_count BIGINT;
BEGIN
    IF jsonb_typeof(events_data) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Daily events data must be a JSON array';
    END IF;

    input_count := jsonb_array_length(events_data);
    DELETE FROM daily_events;

    INSERT INTO daily_events (
        building_name,
        room_number,
        event_name,
        start_time,
        end_time,
        occupant
    )
    SELECT
        event.building_name,
        event.room_number,
        event.event_name,
        event.start_time,
        event.end_time,
        event.occupant
    FROM jsonb_to_recordset(events_data) AS event(
        building_name TEXT,
        room_number TEXT,
        event_name TEXT,
        start_time TIMESTAMPTZ,
        end_time TIMESTAMPTZ,
        occupant TEXT
    )
    JOIN rooms room
      ON room.building_name = event.building_name
     AND room.room_number = event.room_number;
    GET DIAGNOSTICS inserted_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'inserted_events', inserted_count,
        'unloadable_events', input_count - inserted_count
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.replace_daily_events(JSONB)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_daily_events(JSONB)
TO service_role;
