/*
  FIT3179 DV2 - Koalas in Australia
  Each chart lives in its own readable JSON file in /charts and is embedded with vegaEmbed.
  Vega-Lite charts size themselves to their card ("width": "container").
  The treemap is written in Vega (not Vega-Lite), which cannot size itself, so its width is set here.
*/
const charts = [
  ["chart-seq-locator", "charts/map-seq-locator.vg.json"],
  ["chart-map1", "charts/map-1-australia-status.vg.json"],
  ["chart-2", "charts/chart-2-population-estimates.vg.json"],
  ["chart-3", "charts/chart-3-population-decline.vg.json"],
  ["chart-map4", "charts/map-4-nsw-koala-likelihood.vg.json"],
  ["chart-13", "charts/chart-13-lga-treemap.vg.json"],
  ["chart-map5", "charts/map-5-seq-proportional-symbols.vg.json"],
  ["chart-map6", "charts/map-6-seq-bin-map.vg.json"],
  ["chart-map7", "charts/map-7-seq-flow-map.vg.json"],
  ["chart-8", "charts/chart-8-seasonal-radial.vg.json"],
  ["chart-9", "charts/chart-9-month-year-heatmap.vg.json"],
  ["chart-10", "charts/chart-10-cause-heatmap.vg.json"],
  ["chart-12", "charts/chart-12-speed-limit.vg.json"],
  ["chart-11", "charts/chart-11-marimekko.vg.json"],
  ["chart-14", "charts/chart-14-reports-vs-admissions.vg.json"],
  ["chart-15", "charts/chart-15-timeline.vg.json"]
];

const embedOptions = { actions: false, renderer: "canvas", tooltip: { theme: "light" } };

async function drawChart(elementId, specPath) {
  const target = document.getElementById(elementId);
  try {
    const response = await fetch(specPath);
    if (!response.ok) throw new Error(`Could not load ${specPath} (${response.status})`);
    const spec = await response.json();
    // Plain Vega specs need an explicit pixel width; Vega-Lite specs use "container".
    if (spec.$schema && spec.$schema.includes("/vega/")) {
      spec.width = Math.max(260, Math.floor(target.clientWidth) - 8);
    }
    await vegaEmbed(target, spec, embedOptions);
    if (typeof scheduleAlignment === "function") scheduleAlignment();
  } catch (error) {
    console.warn(error);
    target.innerHTML = `<p class="caption"><strong>This chart could not load.</strong> Please refresh the page. (${specPath})</p>`;
  }
}

if (window.location.protocol === "file:") {
  document.querySelectorAll(".chart").forEach(el => {
    el.innerHTML = `<p class="caption">Charts load data files, so open this page through a web server (GitHub Pages, VS Code Live Server, or <code>python -m http.server</code>) rather than as a file.</p>`;
  });
} else {
  // Wait for the web fonts so chart text is drawn in DM Sans, not a fallback font.
  const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
  fontsReady.then(() => Promise.all(charts.map(([id, path]) => drawChart(id, path))));

  // Redraw the Vega treemap if the window width changes (e.g. rotating a tablet).
  let timer;
  let lastWidth = window.innerWidth;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (Math.abs(window.innerWidth - lastWidth) > 40) {
        lastWidth = window.innerWidth;
        drawChart("chart-13", "charts/chart-13-lga-treemap.vg.json");
      }
    }, 300);
  });
}


// The second title line sets the desktop heading scale. Both lines stay the same size.
function sizeHeroTitle() {
  const title = document.querySelector('.hero-title');
  const container = document.querySelector('.hero-inner');
  if (!title || !container) return;
  if (window.innerWidth < 851) { title.style.fontSize = ''; return; }
  const lines = [...title.querySelectorAll('.hero-title-line')];
  const available = container.getBoundingClientRect().width;
  let px = Math.min(108, Math.max(56, available / 10));
  title.style.fontSize = `${px}px`;
  for (let i=0; i<15; i++) {
    const widest = Math.max(...lines.map(line => line.scrollWidth));
    if (widest <= available - 5) break;
    px *= (available - 5) / widest;
    title.style.fontSize = `${px}px`;
  }
}
window.addEventListener('resize', sizeHeroTitle, {passive:true});
if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizeHeroTitle);
sizeHeroTitle();


// Align the *top edges* of green takeaways in each chart row.
// Keep natural box heights: only add empty space BEFORE the earlier takeaway.
function alignTakeawayPositions() {
  const isMobile = window.innerWidth <= 760;
  document.querySelectorAll('.grid.two, .grid.three').forEach(grid => {
    const cards = Array.from(grid.children).filter(el => el.classList.contains('card'));
    // Account for rows if the browser wraps the grid.
    const groups = new Map();
    cards.forEach(card => {
      const key = Math.round(card.getBoundingClientRect().top / 8) * 8;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(card);
    });
    cards.forEach(card => {
      const box = card.querySelector(':scope > .so-what');
      if (!box) return;
      let spacer = box.previousElementSibling;
      if (!spacer || !spacer.classList.contains('takeaway-spacer')) {
        spacer = document.createElement('div');
        spacer.className = 'takeaway-spacer';
        box.before(spacer);
      }
      spacer.style.height = '0px';
      box.style.minHeight = '0px';
    });
    if (isMobile) return;
    groups.forEach(row => {
      const pairs = row.map(card => {
        const box = card.querySelector(':scope > .so-what');
        return box ? {box, spacer:box.previousElementSibling} : null;
      }).filter(Boolean);
      if (pairs.length < 2) return;
      const top = Math.max(...pairs.map(({box}) => box.getBoundingClientRect().top));
      pairs.forEach(({box,spacer}) => {
        const delta = Math.max(0, Math.round(top - box.getBoundingClientRect().top));
        spacer.style.height = delta + 'px';
      });
    });
  });
}
function scheduleAlignment() {
  if (window.__alignmentRAF) cancelAnimationFrame(window.__alignmentRAF);
  window.__alignmentRAF = requestAnimationFrame(() => requestAnimationFrame(alignTakeawayPositions));
}
window.addEventListener('resize', scheduleAlignment, {passive:true});
window.addEventListener('load', scheduleAlignment);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleAlignment);
