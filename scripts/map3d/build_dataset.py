"""Build campus.json (local metres) from an Overpass extract.

Usage: python3 -I build_dataset.py [osm_full.json] [campus.json] [--raw]

  --raw   skip the per-feature corrections table (CORRECTIONS) and emit OSM as-is.

Coordinates: E/N metres from the "Track & Field" GPS anchor
  E = (lng - LNG0) * 111320 * cos(LAT0),  N = (lat - LAT0) * 110574
Then the global transform (GLOBAL_*) and per-feature CORRECTIONS are applied.
Polygons/lines are simplified (Douglas-Peucker, SIMPLIFY_M) and rounded to 0.1 m.
Rings are implicitly closed (the first point is not repeated).
Data (c) OpenStreetMap contributors, ODbL. Imagery was used only to check, never copied.
"""
import json, math, sys

LAT0 = 2.8303729712091497
LNG0 = 101.7068105515868
KX = 111320 * math.cos(math.radians(LAT0))
KY = 110574
SIMPLIFY_M = 0.5
CAMPUS_ID = "way/544590735"

# Global alignment of OSM to the GPS anchors. All 9 polygon anchors fall inside their OSM
# polygon at identity and the 3 point/line anchors disagree in direction (leave-one-out
# best shifts range from (-19,-3) to (-3,+1) m), so no consistent offset: identity.
GLOBAL_SHIFT_E = 0.0
GLOBAL_SHIFT_N = 0.0
GLOBAL_ROT_DEG = 0.0  # about the origin, counter-clockwise

# Local fixes for features OSM has visibly mis-traced (checked against Esri z19 imagery
# and the GPS anchors). Applied unless --raw.
CORRECTIONS = {
    "way/1145060153": {
        "dE": -8.8, "dN": -16.5,
        "reason": "Musical Island (dome) is traced ~19 m NE of the dome visible in imagery; "
                  "LakeFront Cafe GPS anchor sits on the imagery dome. Shift moves the OSM centroid "
                  "(-407.5,313.9) onto the measured dome centre (-416.3,297.4), +/-3 m.",
    },
}

PHASE1 = {
    "way/544542215": "A1", "way/544542217": "A2", "way/544542218": "A3",
    "way/544542219": "A4", "way/544542221": "A5", "way/544590728": "B1",
    "way/544542214": "Football pitch", "relation/20504406": "Running track",
    "way/616495459": "Tennis court", "way/616495460": "Volleyball court",
    "way/616495461": "Futsal / soccer court", "way/616495462": "Basketball courts (E block)",
    "way/616495463": "Basketball court (small, W block)", "way/616496734": "Stand",
    "way/544590729": "Lake", "way/616517094": "Footbridge",
    "way/1145060153": "Musical Island (LakeFront Cafe)",
    "node/5264169557": "Tan Kah Kee memorial", CAMPUS_ID: "Campus boundary",
}

# GPS_POINTS + LANDMARKS from src/lib/mapGeo.ts (main) and the OSM feature each marks.
ANCHORS = [
    ("A1", 2.830716513626805, 101.70238566331372, "way/544542215"),
    ("A2", 2.830894481771187, 101.70300445323068, "way/544542217"),
    ("A3", 2.831185702312712, 101.70377875057042, "way/544542218"),
    ("A4", 2.831229385384772, 101.70461460291834, "way/544542219"),
    ("A5", 2.8310562554223995, 101.70528647466466, "way/544542221"),
    ("Track & Field", 2.8303729712091497, 101.7068105515868, "way/544542214"),
    ("B1", 2.8326752117750265, 101.70648314368725, "way/544590728"),
    ("Tennis Court", 2.831869036722138, 101.70667501669327, "way/616495459"),
    ("Volleyball Court", 2.831858794362992, 101.7072533920544, "way/616495460"),
    ("LakeFront Cafe", 2.833032, 101.703063, "way/1145060153"),
    ("Lake causeway", 2.833101, 101.704567, "way/616517094"),
    ("Tan Kah Kee statue", 2.8299, 101.703976, "node/5264169557"),
]

KEEP_TAGS = {"name", "name:en", "name:zh", "ref", "building", "building:levels", "building:min_level",
             "height", "min_height", "highway", "width", "lanes", "bridge", "layer", "surface", "sport",
             "leisure", "landuse", "natural", "water", "amenity", "historic", "memorial", "man_made",
             "barrier", "parking", "area", "oneway"}
RECT_KINDS = {"building", "pitch", "track", "sports"}
ROADS = {"motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
         "service", "living_street", "road", "motorway_link", "trunk_link", "primary_link",
         "secondary_link", "tertiary_link"}
PATHS = {"footway", "path", "steps", "cycleway", "pedestrian", "track", "corridor", "bridleway"}


# ---------- geometry helpers ----------
def project(lat, lng):
    e, n = (lng - LNG0) * KX, (lat - LAT0) * KY
    if GLOBAL_ROT_DEG:
        c, s = math.cos(math.radians(GLOBAL_ROT_DEG)), math.sin(math.radians(GLOBAL_ROT_DEG))
        e, n = e * c - n * s, e * s + n * c
    return (e + GLOBAL_SHIFT_E, n + GLOBAL_SHIFT_N)


def ring_area(r):  # signed, CCW positive
    return 0.5 * sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r)))


def ring_centroid(r):
    a = cx = cy = 0.0
    for i in range(len(r)):
        x1, y1 = r[i]; x2, y2 = r[(i + 1) % len(r)]
        c = x1 * y2 - x2 * y1
        a += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c
    if abs(a) < 1e-9:
        return 0.0, (sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r))
    return a / 2, (cx / (3 * a), cy / (3 * a))


def seg_dist(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L2 = dx * dx + dy * dy
    t = 0 if L2 == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def dp(pts, tol):
    if len(pts) < 3:
        return list(pts)
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        best, k = -1.0, -1
        for m in range(i + 1, j):
            d = seg_dist(pts[m], pts[i], pts[j])
            if d > best:
                best, k = d, m
        if best > tol:
            keep[k] = True; stack += [(i, k), (k, j)]
    return [p for p, f in zip(pts, keep) if f]


def simplify_ring(r, tol):
    if len(r) <= 4:
        return list(r)
    far = max(range(len(r)), key=lambda i: math.dist(r[0], r[i]))
    out = dp(r[:far + 1], tol)[:-1] + dp(r[far:] + [r[0]], tol)[:-1]
    return out if len(out) >= 3 else list(r)


def pip(p, r):
    x, y = p; c = False
    for i in range(len(r)):
        x1, y1 = r[i]; x2, y2 = r[i - 1]
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            c = not c
    return c


def hull(pts):
    pts = sorted(set(pts))
    if len(pts) < 3:
        return pts
    cr = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cr(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]


def min_rect(pts):
    """Minimum-area rectangle: centre, long side, short side, long-axis bearing (deg cw from N, [0,180))."""
    h = hull(pts)
    best = None
    for i in range(len(h)):
        (x1, y1), (x2, y2) = h[i], h[(i + 1) % len(h)]
        L = math.hypot(x2 - x1, y2 - y1)
        if L < 1e-6:
            continue
        ux, uy = (x2 - x1) / L, (y2 - y1) / L
        us = [p[0] * ux + p[1] * uy for p in h]; vs = [-p[0] * uy + p[1] * ux for p in h]
        a, b = max(us) - min(us), max(vs) - min(vs)
        if best is None or a * b < best[0]:
            cu, cv = (max(us) + min(us)) / 2, (max(vs) + min(vs)) / 2
            best = (a * b, a, b, ux, uy, cu * ux - cv * uy, cu * uy + cv * ux)
    if best is None:
        return None
    _, a, b, ux, uy, cx, cy = best
    L, W, ax, ay = (a, b, ux, uy) if a >= b else (b, a, -uy, ux)
    return {"cE": r1(cx), "cN": r1(cy), "length": r1(L), "width": r1(W),
            "bearing": r1(math.degrees(math.atan2(ax, ay)) % 180)}


def r1(v):
    return round(v + 0.0, 1)


def rpts(pts):
    return [[r1(x), r1(y)] for x, y in pts]


def join_rings(segs):
    """Join member ways (lists of points) into rings by matching endpoints."""
    segs = [list(s) for s in segs if len(s) >= 2]
    rings, open_ = [], []
    while segs:
        cur = segs.pop(0)
        changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == cur[-1]: cur += s[1:]
                elif s[-1] == cur[-1]: cur += s[::-1][1:]
                elif s[-1] == cur[0]: cur = s[:-1] + cur
                elif s[0] == cur[0]: cur = s[::-1][:-1] + cur
                else: continue
                segs.pop(i); changed = True; break
        (rings if cur[0] == cur[-1] else open_).append(cur[:-1] if cur[0] == cur[-1] else cur)
    return rings, open_


# ---------- classification ----------
def kind_of(t, is_node):
    if t.get("amenity") == "university": return "campus"
    if "building" in t: return "building"
    if t.get("leisure") == "pitch": return "pitch"
    if t.get("leisure") == "track": return "track"
    if t.get("leisure") in ("stadium", "sports_centre"): return "poi" if is_node else "sports"
    if t.get("natural") == "water" or "water" in t or t.get("landuse") in ("reservoir", "basin"): return "water"
    if "waterway" in t: return "waterway"
    if t.get("highway") in ROADS: return "road"
    if t.get("highway") in PATHS: return "path"
    if t.get("natural") == "tree": return "tree"
    if "historic" in t or "memorial" in t: return "monument"
    if t.get("amenity") == "parking": return "parking"
    if t.get("natural") in ("wood", "scrub", "grassland", "tree_row", "heath", "wetland") or "landcover" in t: return "vegetation"
    if "landuse" in t or t.get("leisure") in ("park", "garden", "playground", "golf_course", "nature_reserve"): return "landuse"
    if not is_node and t.get("amenity") in ("school", "college", "kindergarten", "hospital"): return "landuse"
    if "power" in t: return "power"
    if "barrier" in t: return "barrier"
    if "highway" in t: return "highway_other"
    return "poi" if is_node else "other"


def is_area(t, kind):
    if t.get("area") == "no": return False
    if kind in ("road", "path", "highway_other", "barrier", "waterway"): return t.get("area") == "yes"
    if t.get("natural") == "tree_row": return False
    return True


def keep(t):
    out = {k: v for k, v in t.items() if k in KEEP_TAGS or k.startswith("roof:")}
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    raw = "--raw" in sys.argv
    src = args[0] if args else "osm_full.json"
    dst = args[1] if len(args) > 1 else "campus.json"
    d = json.load(open(src))
    els = d["elements"]
    rel_members = {m["ref"] for e in els if e["type"] == "relation" for m in e["members"] if m["type"] == "way"}

    feats, skipped = [], {"untagged_ways": 0, "open_relations": 0}
    for e in els:
        t = {k: v for k, v in (e.get("tags") or {}).items() if k != "type" or e["type"] == "relation"}
        oid = f'{e["type"]}/{e["id"]}'
        if e["type"] == "node":
            if not t: continue
            kind = kind_of(t, True)
            geom = {"type": "Point", "coordinates": list(project(e["lat"], e["lon"]))}
        elif e["type"] == "way":
            if not t:
                skipped["untagged_ways"] += 1  # mostly relation members, emitted via the relation
                continue
            pts = [project(g["lat"], g["lon"]) for g in e["geometry"]]
            kind = kind_of(t, False)
            closed = len(pts) >= 4 and e["geometry"][0] == e["geometry"][-1]
            if closed and is_area(t, kind):
                geom = {"type": "Polygon", "coordinates": [pts[:-1]]}
            else:
                geom = {"type": "LineString", "coordinates": pts}
        else:
            if t.get("type") not in ("multipolygon", "boundary"):
                continue
            outers, inners = [], []
            for role, bucket in (("outer", outers), ("inner", inners)):
                segs = [[(g["lat"], g["lon"]) for g in m["geometry"]] for m in e["members"]
                        if m["type"] == "way" and m.get("role", "outer") in (role, "" if role == "outer" else role) and m.get("geometry")]
                rings, open_ = join_rings(segs)
                if open_: skipped["open_relations"] += 1
                bucket += [[project(*p) for p in r] for r in rings]
            if not outers: continue
            t.pop("type", None)
            kind = kind_of(t, False)
            polys = [[o] for o in outers]
            for inn in inners:
                for p in polys:
                    if pip(inn[0], p[0]): p.append(inn); break
            geom = {"type": "Polygon", "coordinates": polys[0]} if len(polys) == 1 else {"type": "MultiPolygon", "coordinates": polys}
        feats.append({"id": oid, "kind": kind, "tags": keep(t), "geometry": geom})

    # per-feature corrections
    corrections = []
    for f in feats:
        c = CORRECTIONS.get(f["id"])
        if not c or raw: continue
        f["correction"] = {"dE": c["dE"], "dN": c["dN"], "reason": c["reason"]}
        f["_raw"] = json.loads(json.dumps(f["geometry"]))
        f["geometry"] = shift_geom(f["geometry"], c["dE"], c["dN"])
        corrections.append({"id": f["id"], **c})

    byid = {f["id"]: f for f in feats}
    campus = byid[CAMPUS_ID]["geometry"]["coordinates"][0]

    # derived fields + simplification + rounding
    for f in feats:
        g = f["geometry"]
        derive(f, g, campus)
        if "_raw" in f:
            rawf = {"geometry": f.pop("_raw")}
            derive(rawf, rawf["geometry"], campus)
            f["correction"]["rawCentroid"] = rawf["centroid"]
        f["geometry"] = finish_geom(g)
        if f["id"] in PHASE1:
            f["phase"] = 1; f["label"] = PHASE1[f["id"]]
        else:
            f["phase"] = 2

    # anchors (after corrections) + raw distances
    anchors = []
    for name, lat, lng, fid in ANCHORS:
        p = project(lat, lng)
        f = byid[fid]
        row = {"name": name, "lat": lat, "lng": lng, "E": r1(p[0]), "N": r1(p[1]), "feature": fid,
               **anchor_dist(p, f["geometry"], f["centroid"])}
        if "correction" in f:
            c = f["correction"]
            rg = shift_geom(f["geometry"], -c["dE"], -c["dN"])
            rr = anchor_dist(p, rg, c["rawCentroid"])
            row["raw"] = {"distToFeature": rr["distToFeature"], "distToCentroid": rr["distToCentroid"]}
        row["flag"] = row["distToFeature"] > 20
        anchors.append(row)

    xs = campus  # bounds of the campus boundary (some landuse relations span kilometres)
    out = {
        "attribution": "© OpenStreetMap contributors (ODbL)",
        "source": {"file": src, "osm_base": d.get("osm3s", {}).get("timestamp_osm_base")},
        "origin": {"lat": LAT0, "lng": LNG0, "projection": "E=(lng-lng0)*111320*cos(lat0), N=(lat-lat0)*110574; metres"},
        "alignment": {"globalShiftE": GLOBAL_SHIFT_E, "globalShiftN": GLOBAL_SHIFT_N, "globalRotationDeg": GLOBAL_ROT_DEG,
                      "corrections": corrections, "raw": raw},
        "simplifyM": SIMPLIFY_M,
        "campusBounds": {"minE": r1(min(p[0] for p in xs)), "maxE": r1(max(p[0] for p in xs)),
                   "minN": r1(min(p[1] for p in xs)), "maxN": r1(max(p[1] for p in xs))},
        "campusBoundary": {"id": CAMPUS_ID, "ring": byid[CAMPUS_ID]["geometry"]["coordinates"][0],
                           "areaM2": byid[CAMPUS_ID]["areaM2"], "note": "OSM tags it fixme=imcomplete"},
        "anchors": anchors,
        "skipped": skipped,
        "features": feats,
    }
    json.dump(out, open(dst, "w"), ensure_ascii=False, separators=(",", ":"))
    from collections import Counter
    print(f"{dst}: {len(feats)} features", dict(Counter(f["kind"] for f in feats)), "skipped", skipped)
    for a in anchors:
        print(f'  {a["name"]:<20} E={a["E"]:7.1f} N={a["N"]:6.1f} dFeat={a["distToFeature"]:5.1f} dCen={a["distToCentroid"]:5.1f}'
              + (f' raw dFeat={a["raw"]["distToFeature"]} dCen={a["raw"]["distToCentroid"]}' if "raw" in a else "")
              + ("  FLAG" if a["flag"] else ""))


def shift_geom(g, dE, dN):
    sh = lambda p: (p[0] + dE, p[1] + dN)
    if g["type"] == "Point": return {"type": "Point", "coordinates": sh(g["coordinates"])}
    if g["type"] == "LineString": return {"type": g["type"], "coordinates": [sh(p) for p in g["coordinates"]]}
    if g["type"] == "Polygon": return {"type": g["type"], "coordinates": [[sh(p) for p in r] for r in g["coordinates"]]}
    return {"type": g["type"], "coordinates": [[[sh(p) for p in r] for r in poly] for poly in g["coordinates"]]}


def polys_of(g):
    return [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"] if g["type"] == "MultiPolygon" else []


def iter_pts(g):
    if g["type"] == "Point": yield g["coordinates"]
    elif g["type"] == "LineString": yield from g["coordinates"]
    else:
        for poly in polys_of(g):
            for r in poly: yield from r


def derive(f, g, campus):
    if g["type"] == "Point":
        c = g["coordinates"]; f["centroid"] = [r1(c[0]), r1(c[1])]
        f["inCampus"] = pip(c, campus)
        return
    if g["type"] == "LineString":
        pts = g["coordinates"]
        L = sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
        if L > 0:
            cx = sum((pts[i][0] + pts[i + 1][0]) / 2 * math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)) / L
            cy = sum((pts[i][1] + pts[i + 1][1]) / 2 * math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)) / L
        else:
            cx, cy = pts[0]
        f["centroid"] = [r1(cx), r1(cy)]; f["lengthM"] = r1(L)
        f["inCampus"] = sum(pip(p, campus) for p in pts) * 2 >= len(pts)
        return
    A = cx = cy = 0.0
    for poly in polys_of(g):
        for k, r in enumerate(poly):
            a, (x, y) = ring_centroid(r)
            a = abs(a) * (1 if k == 0 else -1)
            A += a; cx += a * x; cy += a * y
    f["centroid"] = [r1(cx / A), r1(cy / A)] if A else [r1(v) for v in ring_centroid(polys_of(g)[0][0])[1]]
    f["areaM2"] = round(A)
    f["inCampus"] = pip(f["centroid"], campus) if f.get("kind") != "campus" else True
    if f.get("kind") in RECT_KINDS:
        f["rect"] = min_rect([p for poly in polys_of(g) for p in poly[0]])


def finish_geom(g):
    if g["type"] == "Point": return {"type": "Point", "coordinates": [r1(v) for v in g["coordinates"]]}
    if g["type"] == "LineString": return {"type": "LineString", "coordinates": rpts(dp(g["coordinates"], SIMPLIFY_M))}
    fix = lambda r, outer: rpts(orient(simplify_ring(r, SIMPLIFY_M), outer))
    if g["type"] == "Polygon":
        return {"type": "Polygon", "coordinates": [fix(r, k == 0) for k, r in enumerate(g["coordinates"])]}
    return {"type": "MultiPolygon", "coordinates": [[fix(r, k == 0) for k, r in enumerate(p)] for p in g["coordinates"]]}


def orient(r, outer):  # outer rings CCW, holes CW
    return r if (ring_area(r) > 0) == outer else r[::-1]


def anchor_dist(p, g, cen):
    if g["type"] == "Point":
        d = math.dist(p, g["coordinates"]); inside = False
    elif g["type"] == "LineString":
        c = g["coordinates"]; d = min(seg_dist(p, c[i], c[i + 1]) for i in range(len(c) - 1)); inside = d < 0.05
    else:
        inside = any(pip(p, poly[0]) and not any(pip(p, h) for h in poly[1:]) for poly in polys_of(g))
        edges = [seg_dist(p, r[i - 1], r[i]) for poly in polys_of(g) for r in poly for i in range(len(r))]
        d = 0.0 if inside else min(edges)
    return {"inside": inside, "distToFeature": r1(d), "distToCentroid": r1(math.dist(p, cen))}


if __name__ == "__main__":
    main()
