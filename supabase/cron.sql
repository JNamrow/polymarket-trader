-- Schedules for the shared demo sandbox. Run once in the Supabase SQL editor AFTER the
-- migration and AFTER deploying the Edge Functions (with JWT verification off).
--
-- Replace <PROJECT_REF> with your project ref (the part before .supabase.co). No keys
-- to paste: a random token is generated here, stored in Vault for pg_cron and in
-- public.demo_secrets for the functions, which accept it as a bearer token.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare token text := encode(gen_random_bytes(24), 'hex');
begin
  insert into public.demo_secrets (name, value) values ('cron_token', token)
    on conflict (name) do update set value = excluded.value;
  delete from vault.secrets where name in ('demo_cron_token', 'demo_functions_url');
  perform vault.create_secret(token, 'demo_cron_token');
  perform vault.create_secret('https://<PROJECT_REF>.supabase.co/functions/v1', 'demo_functions_url');
end $$;

create or replace function public.invoke_demo_function(fn text) returns bigint language plpgsql security definer set search_path = public as $$
declare base_url text; token text;
begin
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'demo_functions_url';
  select decrypted_secret into token from vault.decrypted_secrets where name = 'demo_cron_token';
  return net.http_post(
    url := base_url || '/' || fn,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || token),
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

-- Grow the wallet registry every 5 minutes (offset by 4 minutes from the tick).
select cron.unschedule('demo-wallets') where exists (select 1 from cron.job where jobname = 'demo-wallets');
select cron.schedule('demo-wallets', '4-59/5 * * * *', $$select public.invoke_demo_function('demo-wallets')$$);

-- Check: select jobname, schedule, active from cron.job;
