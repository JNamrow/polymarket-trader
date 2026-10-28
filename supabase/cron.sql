-- Schedules for the shared demo sandbox. Run this once in the Supabase SQL editor
-- AFTER the migration and AFTER deploying the Edge Functions.
--
-- Replace the two placeholders:
--   <PROJECT_REF>        your project ref (the part before .supabase.co)
--   <SERVICE_ROLE_KEY>   Project Settings → API → service_role (keep it secret)
-- They are stored in Supabase Vault, not in the cron job text.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://<PROJECT_REF>.supabase.co/functions/v1', 'demo_functions_url');
select vault.create_secret('<SERVICE_ROLE_KEY>', 'demo_service_key');

create or replace function public.invoke_demo_function(fn text) returns bigint language plpgsql security definer set search_path = public as $$
declare base_url text; key text;
begin
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'demo_functions_url';
  select decrypted_secret into key from vault.decrypted_secrets where name = 'demo_service_key';
  return net.http_post(
    url := base_url || '/' || fn,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || key),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end $$;
revoke all on function public.invoke_demo_function(text) from public, anon, authenticated;

-- Tick every running portfolio every 5 minutes (seeds the sample portfolios when the sandbox is empty).
select cron.unschedule('demo-tick') where exists (select 1 from cron.job where jobname = 'demo-tick');
select cron.schedule('demo-tick', '*/5 * * * *', $$select public.invoke_demo_function('demo-tick')$$);

-- Store notable whale fills every 5 minutes (offset by 2 minutes from the tick).
select cron.unschedule('demo-whales') where exists (select 1 from cron.job where jobname = 'demo-whales');
select cron.schedule('demo-whales', '2-59/5 * * * *', $$select public.invoke_demo_function('demo-whales')$$);

-- Reset the sandbox every 2 hours, then tick right away so visitors never see it empty.
select cron.unschedule('demo-reset') where exists (select 1 from cron.job where jobname = 'demo-reset');
select cron.schedule('demo-reset', '0 */2 * * *', $$select public.demo_reset(); select public.invoke_demo_function('demo-tick')$$);

-- Check: select jobname, schedule, active from cron.job;
