CREATE OR REPLACE FUNCTION update_daily_events(events_data JSONB)
RETURNS TEXT AS $$
DECLARE
    inserted_count INTEGER;
BEGIN
    DELETE FROM daily_events;

    inserted_count := COALESCE(jsonb_array_length(events_data), 0);

    IF inserted_count > 0 THEN
        INSERT INTO daily_events (
            building_name,
            room_number,
            event_name,
            start_time,
            end_time,
            occupant
        )
        SELECT
            event->>'building_name',
            event->>'room_number',
            event->>'event_name',
            (event->>'start_time')::TIMESTAMPTZ,
            (event->>'end_time')::TIMESTAMPTZ,
            event->>'occupant'
        FROM jsonb_array_elements(events_data) AS event;
    END IF;

    RETURN 'SUCCESS:' || inserted_count;
EXCEPTION
    WHEN OTHERS THEN
        RETURN 'ERROR:' || SQLERRM;
END;
$$ LANGUAGE plpgsql
SET search_path = pg_catalog, public;
