/*
  FIT3179 Week 7–10 style: readable Vega-Lite JSON specifications embedded
  into one HTML page using vegaEmbed. Chart specs are stored separately in /charts.
  Add/clean real data first. Empty or missing data files will produce a visible error.
*/
const chartFiles = [
  ["chart-map-overview", "charts/Overview.vg.json"],
  ["chart-map-habitat", "charts/Map 1.vg.json"],
  ["chart-map-records", "charts/Map 2.vg.json"],
  ["chart-map-flow", "charts/Map 3.vg.json"],
  ["chart-calendar", "charts/4.vg.json"],
  ["chart-threat-heatmap", "charts/5.vg.json"],
  ["chart-flow", "charts/6.vg.json"],
  ["chart-bump", "charts/7.vg.json"],
  ["chart-treemap", "charts/8.vg.json"],
  ["chart-beeswarm", "charts/9.vg.json"],
  ["chart-slope", "charts/10.vg.json"],
  ["chart-packed", "charts/11.vg.json"],
  ["chart-connected-dot", "charts/12.vg.json"]
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
