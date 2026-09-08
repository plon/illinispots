-- Tech Services equipment enrichment for room_details.
-- Populated by the Answers crawl stage in data-pipeline/room_details_scraper.py
-- (https://answers.uillinois.edu/illinois/57128 and linked room pages).

ALTER TABLE public.room_details
    ADD COLUMN IF NOT EXISTS equipment TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS photo_urls TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS answers_url TEXT;
