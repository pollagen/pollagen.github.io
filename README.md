# Poll-A-Gen

A static project website for tracking the genomic sampling of UK pollinators.
Two views:

1. **Home** — project summary and a live specimen tracker. Species are grouped under
   subheadings (Bumblebees, Solitary bees, Wasps, Hoverflies); every species in the
   project's target list is shown, including those with **0 specimens** so far.
2. **Map** — a UK **county / unitary authority** map shaded by record count, with a
   **dot for every specimen** (overlapping records are fanned out so each is visible),
   per-species summary stats in each county popup, and a species filter. Desktop zoom is
   **Ctrl + scroll**; pinch-zoom works on touch.

A **Contact us** button (header and home page) opens a short form for people who'd like
to collect specimens for the project; submitting composes an email to
`pollagen@nhm.ac.uk`. The Poll-A-Gen logo lives in [`docs/`](docs/).

Everything runs in the browser. Updating the data needs **no build step** — just commit a
new CSV. (Regenerating the county boundaries is a one-off offline step; see below.) It is
designed to be hosted on GitHub Pages.

## Repo layout

```
poll-a-gen/
├── index.html              # Home + Map tabs + contact form
├── css/style.css
├── js/app.js               # loads CSV + boundaries, aggregates, renders
├── data/
│   ├── specimens.csv        # ← your data (you edit/replace this)
│   ├── uk-counties.json     # county/unitary-authority boundaries the site loads (TopoJSON, WGS84)
│   └── Counties_and_Unitary_Authorities_*UK_BGC*.geojson   # ONS source for the above
├── scripts/
│   └── build_counties.py   # regenerates uk-counties.json from the ONS source
├── docs/                   # brand assets (logo.png + README)
└── README.md
```

### Editing the species list

The grouped species list (and which species show even at 0) is defined in
`js/app.js` as `SPECIES_GROUPS`. Add, remove or regroup species there. Any species
present in the CSV but not listed is shown automatically under the matching genus group
(or an "Other species" group).

## Updating the data

Replace `data/specimens.csv` and commit. The file must keep these column headers:

```
Scientific Name,Date,Lat,Long
```

- `Lat` / `Long` are decimal degrees (WGS84). `Date` is currently not used by the site.
- Counts (total, per-species, per-county) are recomputed in the browser on every load,
  so a new commit is all that's needed.
- **Species names:** the site uses the names exactly as written in the CSV, so clean
  them at source (e.g. expand `B. pascuorum` to `Bombus pascuorum`, fix casing/typos).
  Leading/trailing spaces are trimmed automatically.

## Deploy to GitHub Pages

1. Create a repo (e.g. `poll-a-gen`) and push these files to the `main` branch.
2. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Branch `main`, folder `/ (root)`. Save.
4. Site appears at `https://<user>.github.io/poll-a-gen/` within a minute or two.

Test locally first with any static server, e.g.:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

(Opening `index.html` directly via `file://` will fail — the `fetch()` calls need HTTP.)

## Notes & decisions

- **Geography unit.** Records are aggregated to **county / unitary authority** level using
  the ONS *Counties and Unitary Authorities (May 2023, UK, BGC)* boundaries. The source is
  reprojected from British National Grid (EPSG:27700) to WGS84 and the metropolitan
  districts / London boroughs are dissolved into their metropolitan counties / *Greater
  London* — see `scripts/build_counties.py`, which produces `data/uk-counties.json` (156
  areas). The site then just loads that file directly. To change the boundaries, replace
  the ONS GeoJSON and re-run the script; no runtime rollup is performed.
- **Per-specimen dots.** Every specimen is also plotted as an individual dot, honouring the
  species filter. Records sharing identical coordinates are fanned around a small circle so
  none are hidden underneath another.
- **Map zoom.** Scroll-wheel zoom is gated behind **Ctrl** on desktop (a hint appears on a
  plain scroll) so the page still scrolls normally; touch pinch-zoom is unaffected.
- **Off-boundary points.** A handful of coastal/island coordinates fall just outside the
  generalised polygons; these are assigned to the nearest county by centroid so every
  specimen is counted.
- **Dependencies** (loaded from CDN, no install): Leaflet, topojson-client, PapaParse,
  CARTO basemap tiles, Google Fonts.

## Credits

Boundaries: ONS Open Geography Portal — Counties and Unitary Authorities (May 2023) UK BGC.
Contains OS data © Crown copyright and database right; ONS licensed under the Open
Government Licence v3.0. Basemap © OpenStreetMap contributors © CARTO.
