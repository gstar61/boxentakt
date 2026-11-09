-- Schlüssel für die Cron-Funktionen (Erinnerungen, Wartelisten, Push, Monatsbericht).
-- Wird einmal zufällig erzeugt; der Wert gehört als REMINDER_KEY in die Vercel-Umgebung:
--   select value from public.app_secrets where name = 'cron_key';
insert into public.app_secrets (name, value)
values ('cron_key', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;
