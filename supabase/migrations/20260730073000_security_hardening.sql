-- Public application data remains readable through PostgREST and the getter
-- RPCs. All writes are restricted to service_role.

ALTER TABLE public.academic_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_availability_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academic_terms_public_read ON public.academic_terms;
CREATE POLICY academic_terms_public_read
    ON public.academic_terms
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS buildings_public_read ON public.buildings;
CREATE POLICY buildings_public_read
    ON public.buildings
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS class_schedule_public_read ON public.class_schedule;
CREATE POLICY class_schedule_public_read
    ON public.class_schedule
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS daily_events_public_read ON public.daily_events;
CREATE POLICY daily_events_public_read
    ON public.daily_events
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS room_availability_cache_public_read
    ON public.room_availability_cache;
CREATE POLICY room_availability_cache_public_read
    ON public.room_availability_cache
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS rooms_public_read ON public.rooms;
CREATE POLICY rooms_public_read
    ON public.rooms
    FOR SELECT
    TO anon, authenticated
    USING (true);

REVOKE ALL PRIVILEGES ON TABLE
    public.academic_terms,
    public.buildings,
    public.class_schedule,
    public.daily_events,
    public.room_availability_cache,
    public.rooms
FROM anon, authenticated;

GRANT SELECT ON TABLE
    public.academic_terms,
    public.buildings,
    public.class_schedule,
    public.daily_events,
    public.room_availability_cache,
    public.rooms
TO anon, authenticated;

REVOKE ALL PRIVILEGES ON SEQUENCE
    public.academic_terms_id_seq,
    public.daily_events_id_seq
FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION
    public.get_cached_spots(time without time zone, date, integer),
    public.get_room_schedule(text, text, date),
    public.get_room_schedule(text, text, date, time without time zone),
    public.get_room_schedule_cached(text, text, date),
    public.get_spots(time without time zone, date, integer),
    public.refresh_room_availability_cache(date),
    public.update_daily_events(jsonb)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
    public.get_cached_spots(time without time zone, date, integer),
    public.get_room_schedule(text, text, date),
    public.get_room_schedule(text, text, date, time without time zone),
    public.get_room_schedule_cached(text, text, date),
    public.get_spots(time without time zone, date, integer)
TO anon, authenticated;

GRANT EXECUTE ON FUNCTION
    public.refresh_room_availability_cache(date),
    public.update_daily_events(jsonb)
TO service_role;

ALTER FUNCTION public.get_cached_spots(time without time zone, date, integer)
    SET search_path = pg_catalog, public;
ALTER FUNCTION public.get_room_schedule(text, text, date)
    SET search_path = pg_catalog, public;
ALTER FUNCTION public.get_room_schedule(
    text,
    text,
    date,
    time without time zone
) SET search_path = pg_catalog, public;
ALTER FUNCTION public.get_room_schedule_cached(text, text, date)
    SET search_path = pg_catalog, public;
ALTER FUNCTION public.get_spots(time without time zone, date, integer)
    SET search_path = pg_catalog, public;
ALTER FUNCTION public.refresh_room_availability_cache(date)
    SET search_path = pg_catalog, public;
ALTER FUNCTION public.update_daily_events(jsonb)
    SET search_path = pg_catalog, public;
