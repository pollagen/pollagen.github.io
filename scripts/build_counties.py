#!/usr/bin/env python3
"""
Build data/uk-counties.json (the TopoJSON the site loads) from the ONS
"Counties and Unitary Authorities" GeoJSON.

Source (committed in data/):
  Counties_and_Unitary_Authorities_May_2023_UK_BGC_*.geojson
  - ONS Open Geography Portal, "BGC" = generalised, clipped to coastline.
  - Coordinate reference system: EPSG:27700 (British National Grid).

What this script does:
  1. Reprojects every geometry from EPSG:27700 to EPSG:4326 (WGS84 lat/lng),
     which is what Leaflet needs.
  2. Dissolves the metropolitan districts into their metropolitan counties
     (Greater Manchester, Merseyside, South Yorkshire, Tyne and Wear, West
     Midlands, West Yorkshire) and the London boroughs into "Greater London",
     using proper geometric unions (no slivers). Every other area is kept as-is.
  3. Writes a quantised, topology-simplified TopoJSON (object "counties",
     each geometry carries a single "name" property).

Re-run after replacing the source file:
  pip install shapely pyproj topojson
  python3 scripts/build_counties.py
"""
import glob, json, os, sys
from shapely.geometry import shape, mapping
from shapely.ops import unary_union, transform as shp_transform
from shapely import make_valid
from pyproj import Transformer
import topojson as tp

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(HERE, "data")
SRC = next(iter(glob.glob(os.path.join(
    DATA, "Counties_and_Unitary_Authorities_*UK_BGC*.geojson"))), None)
OUT = os.path.join(DATA, "uk-counties.json")

# metropolitan district -> metropolitan county
MET = {
    'Greater Manchester': ['Bolton','Bury','Manchester','Oldham','Rochdale','Salford','Stockport','Tameside','Trafford','Wigan'],
    'Merseyside':         ['Knowsley','Liverpool','St. Helens','Sefton','Wirral'],
    'South Yorkshire':    ['Barnsley','Doncaster','Rotherham','Sheffield'],
    'Tyne and Wear':      ['Gateshead','Newcastle upon Tyne','North Tyneside','South Tyneside','Sunderland'],
    'West Midlands':      ['Birmingham','Coventry','Dudley','Sandwell','Solihull','Walsall','Wolverhampton'],
    'West Yorkshire':     ['Bradford','Calderdale','Kirklees','Leeds','Wakefield'],
}
name2met = {n: c for c, ns in MET.items() for n in ns}


def county_for(props):
    cd, nm = props['CTYUA23CD'], props['CTYUA23NM']
    if cd.startswith('E08'):
        return name2met.get(nm, nm)   # metropolitan district -> metropolitan county
    if cd.startswith('E09'):
        return 'Greater London'       # London borough -> Greater London
    return nm                         # county / unitary authority kept as-is


def main():
    if not SRC:
        sys.exit("Source CTYUA GeoJSON not found in data/")
    d = json.load(open(SRC))
    tr = Transformer.from_crs("EPSG:27700", "EPSG:4326", always_xy=True)
    reproj = lambda g: shp_transform(lambda xs, ys, zs=None: tr.transform(xs, ys), g)

    groups = {}
    for f in d['features']:
        groups.setdefault(county_for(f['properties']), []).append(
            make_valid(shape(f['geometry'])))

    features = []
    for name, geoms in sorted(groups.items()):
        merged = unary_union(geoms) if len(geoms) > 1 else geoms[0]
        features.append({"type": "Feature", "properties": {"name": name},
                         "geometry": mapping(reproj(merged))})

    fc = {"type": "FeatureCollection", "features": features}
    topo = tp.Topology(fc, prequantize=1e5, toposimplify=0.0005,
                       object_name="counties")
    open(OUT, "w").write(topo.to_json())
    print(f"wrote {OUT}  ({len(features)} counties, "
          f"{os.path.getsize(OUT)/1e6:.2f} MB)")


if __name__ == "__main__":
    main()
