-- Scheduled data pipelines call cache refresh functions through PostgREST with
-- the service role. Without an explicit timeout, service_role inherits the
-- authenticator role's 8-second statement timeout. Dense in-term schedules can
-- exceed that limit while rebuilding normalized room-availability segments.
--
-- Keep public API requests on their existing shorter timeout and give only
-- trusted service-role maintenance calls bounded additional headroom.
ALTER ROLE service_role SET statement_timeout = '60s';

-- PostgREST caches role settings, so reload them after changing the timeout.
NOTIFY pgrst, 'reload config';
