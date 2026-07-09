insert into compliance_product_families (
  id,
  code,
  name,
  category,
  description,
  "intendedUse",
  "foreseeableMisuse",
  "riskLevel",
  "gpsrRequired",
  status
)
values
  ('compliance-family-wind', 'WIND', 'Windschermen', 'Carrosserie', 'Windschermen voor scooters en bromfietsen.', 'Montage op compatibele scooters als windafscherming.', 'Gebruik op niet-compatibele voertuigen of bij zichtbare schade.', 'low', true, 'concept'),
  ('compliance-family-stuur', 'STUUR', 'Sturen', 'Stuur & Remmen', 'Vervangende en upgrade sturen voor scooters.', 'Vervanging van compatibele sturen.', 'Modificaties of gebruik op niet-compatibele voertuigen.', 'high', true, 'concept'),
  ('compliance-family-cyl', 'CYL', 'Cilinders', 'Motor', 'Vervangende en performance cilinders.', 'Vervanging of prestatieverbetering binnen wettelijke grenzen.', 'Gebruik zonder juiste afstelling.', 'medium', true, 'concept'),
  ('compliance-family-zuis', 'ZUIS', 'Zuigers', 'Motor', 'Vervangende zuigers met zuigerringen.', 'Vervanging in compatibele motoren.', 'Montage zonder correcte speling.', 'medium', true, 'concept'),
  ('compliance-family-var', 'VAR', 'Variorollen', 'Aandrijving', 'Variorollen voor CVT-transmissies.', 'Vervanging met passend gewicht.', 'Mengen van gewichten of verkeerde maat.', 'low', true, 'concept'),
  ('compliance-family-vsna', 'VSNA', 'V-snaren', 'Aandrijving', 'CVT-riemen voor scooters.', 'Vervanging van versleten riemen.', 'Gebruik van verkeerde maat of slijtage.', 'medium', true, 'concept'),
  ('compliance-family-remblk', 'REMBLK', 'Remblokken', 'Remmen', 'Remblokken voor schijf- en trommelremmen.', 'Vervanging van versleten remblokken.', 'Gebruik voorbij slijtagegrens.', 'high', true, 'concept'),
  ('compliance-family-remsch', 'REMSCH', 'Remschijven', 'Remmen', 'Remschijven voor scooterremsystemen.', 'Vervanging van versleten of beschadigde remschijven.', 'Gebruik onder minimale dikte.', 'high', true, 'concept'),
  ('compliance-family-bob', 'BOB', 'Bobines / Ontstekingsspoelen', 'Elektrisch', 'Ontstekingsspoelen voor scooters.', 'Vervanging van defecte ontstekingscomponenten.', 'Aanraken van hoogspanning of foute aansluiting.', 'medium', true, 'concept'),
  ('compliance-family-ecu', 'ECU', 'ECU / CDI', 'Elektrisch', 'Elektronische regeleenheden voor scooters.', 'Vervanging van ECU/CDI units.', 'Race-uitvoering gebruiken op openbare weg.', 'medium', true, 'concept'),
  ('compliance-family-kap', 'KAP', 'Kappen / Carrosserie', 'Carrosserie', 'Kunststof buitenpanelen voor scooters.', 'Vervanging van carrosseriedelen.', 'Montage zonder juiste bevestiging.', 'low', true, 'concept'),
  ('compliance-family-spieg', 'SPIEG', 'Spiegels', 'Veiligheid & Verlichting', 'Buitenspiegels voor scooters en bromfietsen.', 'Vervanging of toevoeging van spiegels.', 'Gebruik zonder voldoende zichtveld.', 'medium', true, 'concept'),
  ('compliance-family-kab', 'KAB', 'Kabels (Bowdenkabels)', 'Stuur & Remmen', 'Bedieningskabels voor scooters.', 'Vervanging van versleten bedieningskabels.', 'Gebruik van verkeerde lengte of knikbelasting.', 'high', true, 'concept'),
  ('compliance-family-verl', 'VERL', 'Verlichting', 'Veiligheid & Verlichting', 'Koplampen, achterlichten en LED-verlichting.', 'Vervanging of upgrade van scooterverlichting.', 'Gebruik van niet-goedgekeurde verlichting.', 'medium', true, 'concept'),
  ('compliance-family-accu', 'ACCU', 'Accu''s', 'Elektrisch', 'Scooteraccu''s op basis van loodzuur, AGM, GEL of lithium.', 'Vervanging van defecte accu''s.', 'Overladen, kortsluiting of verkeerde afvalverwerking.', 'high', true, 'concept'),
  ('compliance-family-start', 'START', 'Startmotoren', 'Elektrisch', 'Elektrische startmotoren voor scooters.', 'Vervanging van defecte startmotoren.', 'Te lange startpogingen of verkeerde spanning.', 'medium', true, 'concept'),
  ('compliance-family-spruit', 'SPRUIT', 'Spruitstukken', 'Motor', 'Inlaat- en uitlaatspruitstukken voor scooters.', 'Vervanging van defecte spruitstukken.', 'Montage zonder pakking of met verkeerde diameter.', 'medium', true, 'concept')
on conflict (id) do update
set
  code = excluded.code,
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  "intendedUse" = excluded."intendedUse",
  "foreseeableMisuse" = excluded."foreseeableMisuse",
  "riskLevel" = excluded."riskLevel",
  "gpsrRequired" = excluded."gpsrRequired",
  status = excluded.status;
