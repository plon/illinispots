-- Reconcile production drift with the schema used by the current application.

-- This legacy overload is not used by the current API and is invalid against
-- the current timestamptz daily_events columns.
DROP FUNCTION IF EXISTS public.get_room_schedule(
    text,
    text,
    date,
    time without time zone
);

-- event_date was nullable, never populated, and only referenced by the broken
-- legacy overload above.
ALTER TABLE public.daily_events
    DROP COLUMN IF EXISTS event_date;

ALTER TABLE public.daily_events
    ALTER COLUMN start_time SET NOT NULL,
    ALTER COLUMN end_time SET NOT NULL;

ALTER TABLE public.daily_events
    DROP CONSTRAINT IF EXISTS valid_event_times;
ALTER TABLE public.daily_events
    ADD CONSTRAINT valid_event_times CHECK (end_time > start_time);

-- Supabase's performance advisor requires a stable row identity. The loader
-- inserts by named columns, so adding this generated key is backwards
-- compatible.
ALTER TABLE public.class_schedule
    ADD COLUMN IF NOT EXISTS id bigserial;

ALTER TABLE public.class_schedule
    DROP CONSTRAINT IF EXISTS class_schedule_pkey;
ALTER TABLE public.class_schedule
    ADD CONSTRAINT class_schedule_pkey PRIMARY KEY (id);

REVOKE ALL PRIVILEGES ON SEQUENCE public.class_schedule_id_seq
FROM anon, authenticated;
