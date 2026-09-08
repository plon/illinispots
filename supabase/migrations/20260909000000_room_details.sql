-- Registrar General Assignment classroom details (capacity + room type).
-- Populated by data-pipeline/room_details_scraper.py. Independent of the
-- Course Explorer `rooms` table: Registrar coverage differs by term, so no
-- foreign key is enforced and consumers should LEFT JOIN on
-- (building_name, room_number).

CREATE TABLE IF NOT EXISTS public.room_details (
    building_name TEXT NOT NULL,
    room_number TEXT NOT NULL,
    registrar_building TEXT NOT NULL,
    building_code TEXT NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    room_type TEXT NOT NULL,
    PRIMARY KEY (building_name, room_number)
);

ALTER TABLE public.room_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_details_public_read ON public.room_details;
CREATE POLICY room_details_public_read
    ON public.room_details
    FOR SELECT
    TO anon, authenticated
    USING (true);

REVOKE ALL PRIVILEGES ON TABLE public.room_details FROM anon, authenticated;
GRANT SELECT ON TABLE public.room_details TO anon, authenticated;
