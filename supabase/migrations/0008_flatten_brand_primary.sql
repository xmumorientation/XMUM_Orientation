-- Update the seeded brand_primary to the new system-layer default
-- (deep cobalt #1e3a8a) established by the visual language token pass.
-- brand_secondary is untouched — it's still used by hero-moment
-- surfaces (auth hero, gacha reveal, bigscreen, NFC activation).
update public.game_config
set value = '"#1e3a8a"'
where key = 'brand_primary';
