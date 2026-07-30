-- Remove indexes confirmed unused by production statistics and Supabase's
-- performance advisor.
DROP INDEX IF EXISTS public.idx_cache_busy_times;
DROP INDEX IF EXISTS public.idx_academic_terms_dates;

-- Retain one month of cached schedules. Older entries contain daily-event
-- snapshots that are not refreshed when the source schedule changes.
DELETE FROM public.room_availability_cache
WHERE check_date <
    ((now() AT TIME ZONE 'America/Chicago')::date - 30);

CREATE OR REPLACE FUNCTION public.prune_room_availability_cache()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
    DELETE FROM public.room_availability_cache
    WHERE check_date <
        ((now() AT TIME ZONE 'America/Chicago')::date - 30);

    RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.prune_room_availability_cache()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_room_availability_cache()
TO service_role;

DROP TRIGGER IF EXISTS prune_room_availability_cache_after_insert
ON public.room_availability_cache;

CREATE TRIGGER prune_room_availability_cache_after_insert
AFTER INSERT ON public.room_availability_cache
FOR EACH STATEMENT
EXECUTE FUNCTION public.prune_room_availability_cache();
