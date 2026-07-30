-- Promote the staged implementation only after it has been compared with the
-- deployed function across representative dates and times.
DO $migration$
DECLARE
    staged_definition text;
BEGIN
    SELECT pg_catalog.pg_get_functiondef(p.oid)
    INTO staged_definition
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_spots_v2'
      AND pg_catalog.pg_get_function_identity_arguments(p.oid) =
          'check_time time without time zone, check_date date, minimum_useful_minutes integer';

    IF staged_definition IS NULL THEN
        RAISE EXCEPTION 'Staged get_spots_v2 function was not found';
    END IF;

    staged_definition := replace(
        staged_definition,
        'public.get_spots_v2(',
        'public.get_spots('
    );

    EXECUTE staged_definition;
END;
$migration$;

DROP FUNCTION public.get_spots_v2(
    time without time zone,
    date,
    integer
);

REVOKE EXECUTE ON FUNCTION
    public.get_spots(time without time zone, date, integer)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
    public.get_spots(time without time zone, date, integer)
TO anon, authenticated;

ALTER FUNCTION public.get_spots(time without time zone, date, integer)
    SET search_path = pg_catalog, public;
