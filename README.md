# Poll-A-Gen

A static project website for tracking the genomic sampling of UK pollinators.
Two views:

1. **Home** — project blurb and a live specimen tracker (total, per-species, district count).
2. **Map** — a Great Britain district map shaded by record count, with per-species
   summary stats in each district popup and a species filter.

Everything runs in the browser. There is **no build step** — to update the site you
commit a new CSV. It is designed to be hosted on GitHub Pages.

## Repo layout

```
poll-a-gen/
├── index.html              # Home + Map tabs
├── css/style.css
├── js/app.js               # loads CSV + boundaries, aggregates, renders
├── data/
│   ├── specimens.csv        # ← your data (you edit/replace this)
│   └── uk-districts.json    # GB local authority districts (TopoJSON, 380 areas)
└── README.md
```

## Updating the data

Replace `data/specimens.csv` and commit. The file must keep these column headers:

```
Scientific Name,Date,Lat,Long
```

- `Lat` / `Long` are decimal degrees (WGS84). `Date` is currently not used by the site.
- Counts (total, per-species, per-district) are recomputed in the browser on every load,
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

- **Geography unit.** Records are aggregated to GB **local authority districts** (380
  areas, the only boundary set that covers England, Scotland and Wales uniformly).
  These are finer than ceremonial counties — e.g. Buckinghamshire appears as Wycombe,
  Aylesbury Vale, etc. If you'd prefer ceremonial-county granularity, the districts can
  be rolled up with a lookup table; ask and this can be added. Northern Ireland is not
  included (no NI records in the current data).
- **Off-boundary points.** A handful of coastal/island coordinates fall just outside the
  simplified polygons; these are assigned to the nearest district by centroid so every
  specimen is counted.
- **Dependencies** (loaded from CDN, no install): Leaflet, topojson-client, PapaParse,
  CARTO basemap tiles, Google Fonts.

## Credits

Boundaries derived from ONS Open Geography / [martinjc/UK-GeoJSON](https://github.com/martinjc/UK-GeoJSON).
Basemap © OpenStreetMap contributors © CARTO.
