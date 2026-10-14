/*
  FIT3179 Week 7–10 style: readable Vega-Lite JSON specifications embedded
  into one HTML page using vegaEmbed. Chart specs are stored separately in /charts.
  Add/clean real data first. Empty or missing data files will produce a visible error.
*/
const chartFiles = [
  ["chart-map-overview", "charts/map_australia_locator.vg.json"],
  ["chart-map-habitat", "charts/map_habitat.vg.json"],
  ["chart-map-records", "charts/map_records.vg.json"],
  ["chart-map-flow", "charts/map_flow.vg.json"],
  ["chart-calendar", "charts/calendar_heatmap.vg.json"],
  ["chart-threat-heatmap", "charts/threat_heatmap.vg.json"],
  ["chart-flow", "charts/situation_outcome.vg.json"],
  ["chart-bump", "charts/threat_bump.vg.json"],
  ["chart-treemap", "charts/outcome_treemap.vg.json"],
  ["chart-beeswarm", "charts/region_beeswarm.vg.json"],
  ["chart-slope", "charts/habitat_slopegraph.vg.json"],
  ["chart-packed", "charts/conservation_packed_circles.vg.json"],
  ["chart-connected-dot", "charts/evidence_connected_dot.vg.json"]
];

const embedOptions = {
  actions: false,
  renderer: "canvas",
  tooltip: { theme: "light" }
};

async function loadCharts() {
  for (const [elementId, specPath] of chartFiles) {
    const target = document.getElementById(elementId);
    try {
      const response = await fetch(specPath);
      if (!response.ok) throw new Error(`Could not load ${specPath} (${response.status})`);
      const spec = await response.json();
      await vegaEmbed(`#${elementId}`, spec, embedOptions);
    } catch (error) {
      console.warn(error);
      target.innerHTML = `<p class="chart-caption"><strong>Chart not ready.</strong> Add the cleaned data and required TopoJSON file, then check <code>${specPath}</code>. Details are in the browser console.</p>`;
    }
  }
}

if (window.location.protocol === "file:") {
  document.querySelectorAll(".chart").forEach(el => el.innerHTML = `<p class="chart-caption">Open with VS Code Live Server or run <code>python -m http.server 8000</code> and visit <code>http://localhost:8000/</code>.</p>`);
} else { loadCharts(); }
