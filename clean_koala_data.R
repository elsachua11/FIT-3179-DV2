install.packages(c("tidyverse", "janitor", "lubridate"))
library(tidyverse)
library(janitor)
library(lubridate)


# ============================================================
# FIT3179 Assignment 2
# Project: Koalas in Australia
# Task: Clean Queensland Koala Hospital Data
# ============================================================

library(tidyverse)
library(janitor)
library(lubridate)

# ------------------------------------------------------------
# 1. Set file paths
# ------------------------------------------------------------

raw_file <- "data/raw/koala_hospital_raw.csv"
clean_dir <- "data/cleaned"

if (!dir.exists(clean_dir)) {
  dir.create(clean_dir, recursive = TRUE)
}

# ------------------------------------------------------------
# 2. Import the raw dataset
# ------------------------------------------------------------

koala_raw <- read_csv(
  raw_file,
  show_col_types = FALSE,
  na = c("", "NA", "N/A", "NULL")
) |>
  clean_names()

# Check dataset structure
glimpse(koala_raw)

# Inspect column names
names(koala_raw)

# Check number of rows and columns
dim(koala_raw)

# ------------------------------------------------------------
# 3. Helper functions for cleaning
# ------------------------------------------------------------

# Find the first available column from a list of alternatives.
get_column <- function(data, candidates) {
  matched <- intersect(candidates, names(data))
  
  if (length(matched) == 0) {
    return(rep(NA_character_, nrow(data)))
  }
  
  as.character(data[[matched[1]]])
}

# Standardise text and missing-value markers.
clean_text <- function(x) {
  x <- str_squish(as.character(x))
  
  x[
    is.na(x) |
      str_to_lower(x) %in%
      c("", "na", "n/a", "null", "unknown")
  ] <- NA_character_
  
  x
}

# Convert numeric fields safely.
clean_numeric <- function(x) {
  readr::parse_number(
    as.character(x),
    na = c("", "NA", "N/A", "NULL", "Unknown")
  )
}

# Standardise yes/no fields while preserving unclear values.
clean_yes_no <- function(x) {
  x <- str_to_lower(clean_text(x))
  
  case_when(
    x %in% c("yes", "y", "true", "1") ~ "Yes",
    x %in% c("no", "n", "false", "0") ~ "No",
    is.na(x) ~ NA_character_,
    TRUE ~ "Other/Unclear"
  )
}

# ------------------------------------------------------------
# 4. Standardise important variables
# ------------------------------------------------------------

koala_clean <- tibble(
  record_id = clean_text(
    get_column(
      koala_raw,
      c("record_no", "record_number", "record_id")
    )
  ),
  
  call_datetime_raw = clean_text(
    get_column(
      koala_raw,
      c("call_date_time", "call_datetime",
        "date_time", "call_date", "date")
    )
  ),
  
  latitude = clean_numeric(
    get_column(koala_raw, c("lat", "latitude"))
  ),
  
  longitude = clean_numeric(
    get_column(koala_raw, c("lng", "longitude", "long"))
  ),
  
  suburb = clean_text(
    get_column(koala_raw, c("koala_suburb", "suburb"))
  ),
  
  postcode = clean_text(
    get_column(
      koala_raw,
      c("koala_post_code", "postcode", "post_code")
    )
  ),
  
  local_government_area = clean_text(
    get_column(koala_raw, c("koala_lga", "lga"))
  ),
  
  situation = clean_text(
    get_column(
      koala_raw,
      c("adult_situation", "situation")
    )
  ),
  
  fate = clean_text(
    get_column(koala_raw, c("adult_fate", "fate"))
  ),
  
  sick = clean_yes_no(
    get_column(koala_raw, c("sick"))
  ),
  
  injured = clean_yes_no(
    get_column(koala_raw, c("injured"))
  ),
  
  dog_related = clean_yes_no(
    get_column(
      koala_raw,
      c("caused_by_dog", "dog_related")
    )
  ),
  
  vehicle_hit = clean_yes_no(
    get_column(koala_raw, c("vehicle_hit"))
  ),
  
  release_date_raw = clean_text(
    get_column(koala_raw, c("release_date"))
  ),
  
  release_suburb = clean_text(
    get_column(koala_raw, c("release_suburb"))
  ),
  
  release_latitude = clean_numeric(
    get_column(
      koala_raw,
      c("release_lat", "release_latitude")
    )
  ),
  
  release_longitude = clean_numeric(
    get_column(
      koala_raw,
      c("release_lng", "release_longitude")
    )
  )
)

# ------------------------------------------------------------
# 5. Parse dates
# ------------------------------------------------------------

# The source may contain different date formats.
# Inspect the original values if dates fail to parse.

koala_clean <- koala_clean |>
  mutate(
    call_datetime = parse_date_time(
      call_datetime_raw,
      orders = c(
        "dmy HMS", "dmy HM", "dmy",
        "ymd HMS", "ymd HM", "ymd",
        "mdy HMS", "mdy HM", "mdy"
      ),
      quiet = TRUE
    ),
    
    release_datetime = parse_date_time(
      release_date_raw,
      orders = c(
        "dmy HMS", "dmy HM", "dmy",
        "ymd HMS", "ymd HM", "ymd",
        "mdy HMS", "mdy HM", "mdy"
      ),
      quiet = TRUE
    ),
    
    year = year(call_datetime)
  )

# ------------------------------------------------------------
# 6. Check and flag coordinates
# ------------------------------------------------------------

# Broad Australia bounds are used only as a screening check.
# Investigate flagged records before using them on maps.

koala_clean <- koala_clean |>
  mutate(
    coordinate_status = case_when(
      is.na(latitude) | is.na(longitude) ~ "Missing",
      between(latitude, -45, -9) &
        between(longitude, 110, 155) ~ "Plausible",
      TRUE ~ "Review"
    )
  )

# ------------------------------------------------------------
# 7. Check duplicate records
# ------------------------------------------------------------

rows_before_deduplication <- nrow(koala_clean)

# Only remove repeated, non-missing record IDs.
# Retain rows with missing record IDs for manual review.

koala_clean <- koala_clean |>
  mutate(
    duplicate_record_id = !is.na(record_id) &
      duplicated(record_id)
  )

duplicate_count <- sum(koala_clean$duplicate_record_id)

koala_clean <- koala_clean |>
  filter(!duplicate_record_id) |>
  select(-duplicate_record_id)

rows_after_deduplication <- nrow(koala_clean)

# ------------------------------------------------------------
# 8. Export cleaned data
# ------------------------------------------------------------

write_csv(
  koala_clean,
  file.path(clean_dir, "koala_hospital_cleaned.csv")
)

# ------------------------------------------------------------
# 9. Create annual summary
# ------------------------------------------------------------

annual_summary <- koala_clean |>
  filter(!is.na(year)) |>
  group_by(year) |>
  summarise(
    recorded_cases = n(),
    
    dog_related_cases = sum(
      dog_related == "Yes",
      na.rm = TRUE
    ),
    
    vehicle_hit_cases = sum(
      vehicle_hit == "Yes",
      na.rm = TRUE
    ),
    
    injured_cases = sum(
      injured == "Yes",
      na.rm = TRUE
    ),
    
    .groups = "drop"
  ) |>
  arrange(year)

write_csv(
  annual_summary,
  file.path(clean_dir, "annual_summary.csv")
)

# ------------------------------------------------------------
# 10. Create a data-quality report
# ------------------------------------------------------------

quality_report <- tibble(
  variable = names(koala_clean),
  
  missing_count = map_int(
    koala_clean,
    ~ sum(is.na(.x))
  ),
  
  missing_percentage = map_dbl(
    koala_clean,
    ~ round(mean(is.na(.x)) * 100, 2)
  )
)

write_csv(
  quality_report,
  file.path(clean_dir, "data_quality_report.csv")
)

# ------------------------------------------------------------
# 11. Print cleaning results
# ------------------------------------------------------------

cat("Original rows:", rows_before_deduplication, "\n")
cat("Duplicate IDs removed:", duplicate_count, "\n")
cat("Cleaned rows:", rows_after_deduplication, "\n")

print(quality_report)
print(annual_summary)

# ------------------------------------------------------------
# End of cleaning script
# ------------------------------------------------------------
