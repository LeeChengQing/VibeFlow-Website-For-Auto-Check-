-- Down migration for Stage F notifications

drop function if exists public.rotate_notification_topic(uuid);
drop function if exists public.complete_notification(uuid, text, text);
drop function if exists public.claim_queued_notifications(integer);
drop function if exists public.enqueue_notification(uuid, text, text, text, text, integer);
