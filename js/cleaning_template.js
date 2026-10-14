/*
Data-cleaning checklist/template. This is not run by the public webpage.
Use a spreadsheet, Python, R or a separate local script to clean source CSVs.
Inspect the actual headers first. Example canonical mapping for the Queensland
Koala Hospital data (verify against the exact vintage before applying):
  "Record No"          -> record_id
  "Call Date Time"     -> call_date
  "LAT"                -> latitude
  "LNG"                -> longitude
  "Adult Situation"    -> situation
  "Adult Fate"         -> fate
  "Koala LGA"          -> lga
  "Vehicle Hit"        -> vehicle_hit
  "Caused By Dog"      -> caused_by_dog
  "Injured"            -> injured
  "Sick"               -> sick
  "Release LAT"        -> release_latitude
  "Release LNG"        -> release_longitude
  "Release Suburb"     -> release_suburb

Required actions:
1. Check for duplicates using record_id.
2. Parse call_date into a real date and derive year/month.
3. Coerce coordinates to numbers and check geographic plausibility.
4. Keep missing coordinates for non-map charts, but exclude them from map layers.
5. Standardise category labels without changing their meaning.
6. Report row counts before/after, missingness and duplicate count.
7. Do not convert missing values to zero.
8. Do not interpret record counts as wild population estimates.
*/
