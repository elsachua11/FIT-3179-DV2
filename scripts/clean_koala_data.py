"""
FIT3179 DV2 - Koalas in Australia
Cleaning script: raw sources -> small, chart-ready files in data/cleaned/

Run from the repository root:
    pip install pandas pyshp shapely pyproj
    python scripts/clean_koala_data.py

Inputs  (data/raw/)
  koala_hospital_raw.csv                      Queensland Government - Koala Hospital Data
  biodiversitykoalalikelyhoodmapv2.0august2019.zip   NSW Koala Likelihood Map v2.0 (2019)
  australian_states_raw.geojson               State boundaries (ABS-derived)

Outputs (data/cleaned/)  - every chart reads these files, not the raw data.
"""
import io
import json
import math
import zipfile
from pathlib import Path

import pandas as pd
import shapefile  # pyshp
from pyproj import Transformer
from shapely.geometry import shape, mapping

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "cleaned"
OUT.mkdir(parents=True, exist_ok=True)

FIRST_YEAR, LAST_YEAR = 1997, 2024   # only complete calendar years (data run Jul 1996 - Jun 2025)

# ---------------------------------------------------------------- 1. hospital records
raw = pd.read_csv(RAW / "koala_hospital_raw.csv", low_memory=False)
n_raw = len(raw)

# Exact duplicates: the same record number on the same date appears more than once
# (one row per animal examined). Keep one row per koala encounter.
df = raw.drop_duplicates(["Record No", "Date Time"]).copy()
n_dedup = len(df)

df["date"] = pd.to_datetime(df["Date Time"])
df["year"] = df["date"].dt.year
df["month"] = df["date"].dt.month
df = df[(df["year"] >= FIRST_YEAR) & (df["year"] <= LAST_YEAR)].copy()

flags = {
    "Sick": "Sick", "Injured": "Injured", "Caused By Dog": "Dog attack",
    "Vehicle Hit": "Vehicle hit", "Orphaned": "Orphaned", "Dead": "Dead on arrival/found dead",
    "Under Threat": "Under threat", "Fall": "Fall",
}
for col in flags:
    df[col] = df[col].astype(str).str.upper().eq("TRUE")

# coordinates: keep only plausible South-East Queensland / Gold Coast / Darling Downs points
df["LAT"] = pd.to_numeric(df["LAT"], errors="coerce")
df["LNG"] = pd.to_numeric(df["LNG"], errors="coerce")
geo_ok = df["LAT"].between(-29.5, -24.0) & df["LNG"].between(150.0, 154.5)

# friendly names
df["lga"] = (df["Koala LGA"].fillna("")
             .str.replace(" Regional Council", "", regex=False)
             .str.replace(" City Council", "", regex=False)
             .str.replace(" Shire Council", "", regex=False)
             .str.replace(" Council", "", regex=False).str.strip())
df.loc[df["lga"] == "", "lga"] = "Not recorded"

df["situation"] = df["Adult Situation"].fillna("").replace("", "Not recorded")
fate_map = {"Hospital": "Taken to hospital", "Left alone": "Left alone", "Relocated": "Relocated",
            "Unable to capture": "Could not be caught", "Unable to locate": "Could not be caught",
            "Dead": "Other / not recorded", "Other": "Other / not recorded", "": "Other / not recorded"}
df["fate"] = df["Adult Fate"].fillna("").map(fate_map).fillna("Other / not recorded")

# ---------------------------------------------------------------- 2. aggregated tables
# IMPORTANT data-quality finding: until about 2016 roughly 30-50% of rows are "sighting" reports that were
# left alone; from 2017 almost every row is a koala taken into hospital. Comparing all rows across years would
# show a fake decline. So all trend charts and maps use ADMISSIONS ONLY (fate == "Taken to hospital"), which
# is a consistent definition for the whole period. The Marimekko and "reports vs admissions" charts use all rows
# on purpose, to show the change in recording.
all_rows = df
df = df[df["fate"] == "Taken to hospital"].copy()
geo_ok = geo_ok.loc[df.index]

# 2a annual totals: admissions vs other reports
rep = all_rows.assign(kind=lambda x: x["fate"].where(x["fate"] == "Taken to hospital", "Other report (sighting, left alone, etc.)"))
rep = rep.groupby(["year", "kind"]).size().rename("records").reset_index()
rep["kind"] = rep["kind"].replace({"Taken to hospital": "Koala taken to hospital"})
rep.to_csv(OUT / "reports_vs_admissions_by_year.csv", index=False)
annual = df.groupby("year").size().rename("admissions").reset_index()
annual.to_csv(OUT / "annual_admissions.csv", index=False)

# 2b month x year (heat map / radial chart)
my = df.groupby(["year", "month"]).size().rename("records").reset_index()
my.to_csv(OUT / "month_year.csv", index=False)

# 2c causes by year. Flags overlap (one koala can be sick AND injured), so we report the
# SHARE of that year's records carrying each flag, not a stacked total.
# 'Under threat', 'Fall' only start being recorded late, so they are left out of trend charts.
trend_flags = ["Sick", "Injured", "Vehicle Hit", "Caused By Dog", "Orphaned", "Dead"]
rows = []
for y, g in df.groupby("year"):
    for f in trend_flags:
        rows.append({"year": y, "cause": flags[f], "records": int(g[f].sum()),
                     "share_pct": round(100 * g[f].mean(), 2)})
cause = pd.DataFrame(rows)
cause["rank"] = cause.groupby("year")["records"].rank(ascending=False, method="first").astype(int)
cause.to_csv(OUT / "cause_by_year.csv", index=False)

# 2d situation x fate (Marimekko rectangles are pre-computed here so the chart stays simple)
sf = all_rows.groupby(["situation", "fate"]).size().rename("records").reset_index()
tot = sf.groupby("situation")["records"].sum().sort_values(ascending=False)
grand = tot.sum()
fate_order = ["Taken to hospital", "Relocated", "Left alone", "Could not be caught", "Other / not recorded"]
rects, x0 = [], 0.0
for sit, t in tot.items():
    x1 = x0 + t / grand * 100
    y0 = 0.0
    sub = sf[sf.situation == sit].set_index("fate")["records"]
    for fate in fate_order:
        c = int(sub.get(fate, 0))
        h = c / t * 100
        rects.append({"situation": sit, "fate": fate, "records": c, "situation_total": int(t),
                      "x0": round(x0, 3), "x1": round(x1, 3), "y0": round(y0, 3), "y1": round(y0 + h, 3),
                      "share_pct": round(h, 1), "x_mid": round((x0 + x1) / 2, 3)})
        y0 += h
    x0 = x1
pd.DataFrame(rects).to_csv(OUT / "situation_fate_marimekko.csv", index=False)


# 2f vehicle strikes by posted speed limit (limit only recorded for some records)
v = df[df["Vehicle Hit"]].copy()
v["Road Speed Limit"] = pd.to_numeric(v["Road Speed Limit"], errors="coerce")
vs = (v.dropna(subset=["Road Speed Limit"]).groupby("Road Speed Limit").size()
      .rename("records").reset_index().rename(columns={"Road Speed Limit": "speed_limit_kmh"}))
vs = vs[vs.speed_limit_kmh.isin([40, 50, 60, 70, 80, 90, 100, 110])]
vs.to_csv(OUT / "vehicle_hits_by_speed_limit.csv", index=False)

# 2g local government areas
g = df[geo_ok & (df["lga"] != "Not recorded")]
lga = (g.groupby("lga").agg(records=("lga", "size"), lon=("LNG", "median"), lat=("LAT", "median"))
       .reset_index().sort_values("records", ascending=False))
lga[["lon", "lat"]] = lga[["lon", "lat"]].round(4)
lga.to_csv(OUT / "lga_summary.csv", index=False)

# treemap input for Vega: root + children
tm = [{"id": 1, "name": "All records", "parent": None, "records": None}]
top = lga.head(10)
for i, r in enumerate(top.itertuples(), start=2):
    tm.append({"id": i, "name": r.lga, "parent": 1, "records": int(r.records)})
other = int(lga["records"].iloc[10:].sum())
tm.append({"id": 99, "name": "Other areas", "parent": 1, "records": other})
json.dump(tm, open(OUT / "lga_treemap.json", "w"), indent=1)

# 2h bin map (0.22 degree cells ~ 24 km) by period, to show hot spots moving
CELL = 0.22
periods = [(1997, 2005, "1997-2005"), (2006, 2015, "2006-2015"), (2016, 2024, "2016-2024")]
b = df[geo_ok].copy()
b["lon0"] = (b["LNG"] // CELL * CELL).round(3)
b["lat0"] = (b["LAT"] // CELL * CELL).round(3)
frames = []
for a, z, label in periods:
    s = b[(b.year >= a) & (b.year <= z)].groupby(["lon0", "lat0"]).size().rename("records").reset_index()
    s["period"] = label
    s["records_per_year"] = (s["records"] / (z - a + 1)).round(1)
    frames.append(s)
bins = pd.concat(frames)
bins = bins[bins["records"] >= 3].copy()
bins["lon1"] = (bins["lon0"] + CELL).round(3)
bins["lat1"] = (bins["lat0"] + CELL).round(3)
bins.to_csv(OUT / "bin_map_by_period.csv", index=False)

# 2i flow map: record where release point is 5-85 km from the rescue point
R = df[df["Release LAT"].notna() & df["Release LNG"].notna() & geo_ok].copy()
R["Release LAT"] = pd.to_numeric(R["Release LAT"], errors="coerce")
R["Release LNG"] = pd.to_numeric(R["Release LNG"], errors="coerce")


def km(a1, o1, a2, o2):
    p1, p2 = math.radians(a1), math.radians(a2)
    dphi, dl = p2 - p1, math.radians(o2 - o1)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


R["distance_km"] = [km(a, o, c, d) for a, o, c, d in zip(R.LAT, R.LNG, R["Release LAT"], R["Release LNG"])]
R = R[R["Release LAT"].between(-29.5, -24.0) & R["Release LNG"].between(150.0, 154.5)]
n_released = len(R)
far = R[(R.distance_km >= 5) & (R.distance_km <= 85)].drop_duplicates(
    ["LAT", "LNG", "Release LAT", "Release LNG"])
sample = far.sample(n=min(140, len(far)), random_state=3179)   # fixed seed = reproducible sample
flows = sample[["LAT", "LNG", "Release LAT", "Release LNG", "distance_km", "year"]].round(4)
flows.columns = ["lat", "lon", "lat2", "lon2", "distance_km", "year"]
flows["distance_km"] = flows["distance_km"].round(1)
flows.to_csv(OUT / "flow_map_sample.csv", index=False)

# ---------------------------------------------------------------- 3. NSW Koala Likelihood Map
base = "Biodiversity_KLM_v2.0_August_2019/KLM_v2.0_August_2019"
z = zipfile.ZipFile(RAW / "biodiversitykoalalikelyhoodmapv2.0august2019.zip")
sh = shapefile.Reader(shp=io.BytesIO(z.read(base + ".shp")), dbf=io.BytesIO(z.read(base + ".dbf")),
                      shx=io.BytesIO(z.read(base + ".shx")))
to_ll = Transformer.from_crs("EPSG:3308", "EPSG:4326", always_xy=True)   # GDA94 / NSW Lambert
feats = []
for rec, shp in zip(sh.records(), sh.shapes()):
    k, n, p = rec["K"], rec["N"], rec["p"]
    if p == 999 or n <= 0:        # 999 = no survey data in this cell
        continue
    ring = [[round(x, 3), round(y, 3)] for x, y in (to_ll.transform(px, py) for px, py in shp.points)]
    feats.append({"type": "Feature",
                  "properties": {"likelihood_pct": round(100 * p, 1), "sites_surveyed": int(n),
                                 "sites_with_koalas": int(k), "confidence": rec["Confidence"]},
                  "geometry": {"type": "Polygon", "coordinates": [ring]}})
json.dump({"type": "FeatureCollection", "features": feats}, open(OUT / "nsw_koala_likelihood_cells.geojson", "w"),
          separators=(",", ":"))

# ---------------------------------------------------------------- 4. state boundaries
states = json.load(open(RAW / "australian_states_raw.geojson"))

# Drop remote islands (Lord Howe, Macquarie, Christmas...) so the maps fit the mainland and Tasmania.
for f in states["features"]:
    g = shape(f["geometry"])
    parts = [p for p in (g.geoms if hasattr(g, "geoms") else [g]) if 112 <= p.centroid.x <= 154.2 and -44.5 <= p.centroid.y <= -9]
    f["geometry"] = mapping(type(g)(parts) if hasattr(g, "geoms") else parts[0])

# 4a zoomed land outline for the South-East Queensland maps: states clipped to a bounding box.
# Because the file only covers the study area, Vega-Lite can fit the projection to it automatically.
from shapely.geometry import box
clip = box(150.0, -29.6, 154.4, -24.6)
seq_feats = []
for f in states["features"]:
    g = shape(f["geometry"]).simplify(0.004, preserve_topology=True).intersection(clip)
    if not g.is_empty:
        seq_feats.append({"type": "Feature", "properties": {"state": f["properties"]["STATE_NAME"]},
                          "geometry": mapping(g)})
json.dump({"type": "FeatureCollection", "features": seq_feats}, open(OUT / "seq_basemap.geojson", "w"),
          separators=(",", ":"))
status = {"Queensland": "Listed endangered (2022)", "New South Wales": "Listed endangered (2022)",
          "Australian Capital Territory": "Listed endangered (2022)",
          "Victoria": "Not nationally listed", "South Australia": "Not nationally listed"}
for f in states["features"]:
    name = f["properties"]["STATE_NAME"]
    geom = shape(f["geometry"]).simplify(0.03, preserve_topology=True)   # smaller file, same look at this scale
    f["geometry"] = mapping(geom)
    f["properties"] = {"state": name, "koala_status": status.get(name, "No wild koalas (natural range)")}
json.dump(states, open(OUT / "australia_states.geojson", "w"), separators=(",", ":"))

# ---------------------------------------------------------------- 5. data-quality report
report = [
    ("raw rows", n_raw), ("rows after removing exact duplicates", n_dedup),
    ("rows that are hospital admissions (used for trends)", len(df)),
    (f"all report rows {FIRST_YEAR}-{LAST_YEAR} (complete years)", len(all_rows)),
    ("admissions with plausible SEQ coordinates (maps)", int(geo_ok.sum())),
    ("rows with a release coordinate (flow map)", n_released),
    ("flow-map candidates 5-85 km apart", len(far)), ("flow-map sample drawn", len(sample)),
    ("NSW KLM cells with survey data", len(feats)),
]
pd.DataFrame(report, columns=["check", "value"]).to_csv(OUT / "data_quality_report.csv", index=False)
print(pd.DataFrame(report, columns=["check", "value"]).to_string(index=False))