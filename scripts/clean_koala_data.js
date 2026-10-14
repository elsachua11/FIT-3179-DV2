
const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("csv-parse/sync");
const { stringify } = require("csv-stringify/sync");

const RAW_FILE = path.join(
  __dirname,
  "../data/raw/koala_hospital_raw.csv"
);

const OUTPUT_DIR = path.join(
  __dirname,
  "../data/cleaned"
);

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Convert different source column names into a consistent format.
function normaliseHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Find a column even when the source uses a slightly different name.
function getValue(row, possibleNames) {
  const headers = Object.keys(row);

  for (const name of possibleNames) {
    const match = headers.find(
      (header) =>
        normaliseHeader(header) === normaliseHeader(name)
    );

    if (match !== undefined) {
      return row[match];
    }
  }

  return "";
}

function cleanText(value) {
  const text = String(value ?? "").trim();

  if (
    text === "" ||
    ["na", "n/a", "null", "unknown"].includes(
      text.toLowerCase()
    )
  ) {
    return "";
  }

  return text.replace(/\s+/g, " ");
}

function cleanNumber(value) {
  const text = cleanText(value);

  if (text === "") return null;

  const number = Number(text);

  return Number.isFinite(number) ? number : null;
}

function cleanYesNo(value) {
  const text = cleanText(value).toLowerCase();

  if (["yes", "y", "true", "1"].includes(text)) {
    return "Yes";
  }

  if (["no", "n", "false", "0"].includes(text)) {
    return "No";
  }

  return text === "" ? "" : "Other/Unclear";
}

function cleanDate(value) {
  const text = cleanText(value);

  if (text === "") return "";

  // Supports common ISO-style dates and timestamps.
  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString();
}

function firstNonEmpty(...values) {
  return values.find((value) => value !== "") ?? "";
}

// Read the source CSV.
if (!fs.existsSync(RAW_FILE)) {
  throw new Error(
    `Cannot find ${RAW_FILE}. Check the CSV filename and folder.`
  );
}

const sourceText = fs.readFileSync(RAW_FILE, "utf8");

const sourceRows = parse(sourceText, {
  columns: true,
  skip_empty_lines: true,
  bom: true,
  trim: true,
  relax_column_count: true
});

console.log(`Rows read from source: ${sourceRows.length}`);

// Standardise the columns needed for analysis.
const preparedRows = sourceRows.map((row) => {
  const recordId = cleanText(
    getValue(row, ["Record No", "Record Number", "Record ID"])
  );

  const callDate = cleanDate(
    getValue(row, [
      "Call Date Time",
      "Date Time",
      "Call Date",
      "Date"
    ])
  );

  const releaseDate = cleanDate(
    getValue(row, ["Release Date"])
  );

  const latitude = cleanNumber(
    getValue(row, ["LAT", "Latitude"])
  );

  const longitude = cleanNumber(
    getValue(row, ["LNG", "Longitude", "LONG"])
  );

  const yearFromSource = cleanNumber(
    getValue(row, ["Year"])
  );

  const yearFromDate = callDate
    ? new Date(callDate).getUTCFullYear()
    : null;

  const year =
    yearFromDate ??
    (Number.isInteger(yearFromSource) ? yearFromSource : null);

  const cleaned = {
    record_id: recordId,
    call_datetime: callDate,
    year,
    latitude,
    longitude,
    suburb: cleanText(
      getValue(row, ["Koala Suburb", "Suburb"])
    ),
    postcode: cleanText(
      getValue(row, ["Koala Post Code", "Postcode", "Post Code"])
    ),
    local_government_area: cleanText(
      getValue(row, ["Koala LGA", "LGA"])
    ),
    situation: cleanText(
      getValue(row, ["Adult Situation", "Situation"])
    ),
    fate: cleanText(
      getValue(row, ["Adult Fate", "Fate"])
    ),
    sick: cleanYesNo(getValue(row, ["Sick"])),
    injured: cleanYesNo(getValue(row, ["Injured"])),
    dog_related: cleanYesNo(
      getValue(row, ["Caused By Dog", "Dog Related"])
    ),
    vehicle_hit: cleanYesNo(
      getValue(row, ["Vehicle Hit"])
    ),
    orphaned: cleanYesNo(getValue(row, ["Orphaned"])),
    under_threat: cleanYesNo(
      getValue(row, ["Under Threat"])
    ),
    dead: cleanYesNo(getValue(row, ["Dead"])),
    release_date: releaseDate,
    release_suburb: cleanText(
      getValue(row, ["Release Suburb"])
    ),
    release_latitude: cleanNumber(
      getValue(row, ["Release LAT", "Release Latitude"])
    ),
    release_longitude: cleanNumber(
      getValue(row, ["Release LNG", "Release Longitude"])
    )
  };

  // Flag plausible Australian coordinates; do not delete records
  // just because their coordinates are missing.
  const validCoordinates =
    cleaned.latitude !== null &&
    cleaned.longitude !== null &&
    cleaned.latitude >= -45 &&
    cleaned.latitude <= -9 &&
    cleaned.longitude >= 110 &&
    cleaned.longitude <= 155;

  cleaned.coordinate_status =
    cleaned.latitude === null || cleaned.longitude === null
      ? "Missing"
      : validCoordinates
        ? "Plausible Australia coordinates"
        : "Review coordinates";

  return cleaned;
});

// Remove duplicates with a non-empty record ID.
// Keep the first occurrence and report the number removed.
const seenIds = new Set();
const cleanedRows = [];
let duplicateCount = 0;

for (const row of preparedRows) {
  if (row.record_id !== "") {
    if (seenIds.has(row.record_id)) {
      duplicateCount += 1;
      continue;
    }

    seenIds.add(row.record_id);
  }

  cleanedRows.push(row);
}

// Export the cleaned records.
fs.writeFileSync(
  path.join(OUTPUT_DIR, "koala_hospital_cleaned.csv"),
  stringify(cleanedRows, {
    header: true,
    columns: Object.keys(cleanedRows[0] ?? {})
  })
);

// Create annual counts and threat summaries.
// These count recorded cases, not the total koala population.
const annualGroups = new Map();

for (const row of cleanedRows) {
  if (row.year === null) continue;

  if (!annualGroups.has(row.year)) {
    annualGroups.set(row.year, {
      year: row.year,
      recorded_cases: 0,
      dog_related_cases: 0,
      vehicle_hit_cases: 0,
      injured_cases: 0,
      dead_flag_cases: 0
    });
  }

  const summary = annualGroups.get(row.year);
  summary.recorded_cases += 1;

  if (row.dog_related === "Yes") {
    summary.dog_related_cases += 1;
  }

  if (row.vehicle_hit === "Yes") {
    summary.vehicle_hit_cases += 1;
  }

  if (row.injured === "Yes") {
    summary.injured_cases += 1;
  }

  if (row.dead === "Yes") {
    summary.dead_flag_cases += 1;
  }
}

const annualSummary = [...annualGroups.values()]
  .sort((a, b) => a.year - b.year);

fs.writeFileSync(
  path.join(OUTPUT_DIR, "annual_summary.json"),
  JSON.stringify(annualSummary, null, 2)
);

// Produce a data-quality report.
const missingCount = (field) =>
  cleanedRows.filter(
    (row) => row[field] === "" || row[field] === null
  ).length;

const report = {
  source_file: path.basename(RAW_FILE),
  source_rows: sourceRows.length,
  rows_after_cleaning: cleanedRows.length,
  duplicate_ids_removed: duplicateCount,
  missing_call_dates: missingCount("call_datetime"),
  missing_years: missingCount("year"),
  missing_local_government_areas: missingCount(
    "local_government_area"
  ),
  missing_latitudes: missingCount("latitude"),
  missing_longitudes: missingCount("longitude"),
  coordinates_to_review: cleanedRows.filter(
    (row) => row.coordinate_status === "Review coordinates"
  ).length,
  missing_fates: missingCount("fate"),
  note:
    "Records represent reported cases in this dataset, not a census of all koalas."
};

fs.writeFileSync(
  path.join(OUTPUT_DIR, "data_quality_report.json"),
  JSON.stringify(report, null, 2)
);

console.log("\nCleaning completed.");
console.log(report);
console.log("\nFiles saved in data/cleaned/");
