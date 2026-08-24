"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock,
  Coins,
  Compass,
  Filter,
  List,
  Map as MapIcon,
  MapPin,
  Radio,
  RefreshCw,
  Shield,
  Users,
  XCircle,
} from "lucide-react";

import { CampusMap, getStationDotFill } from "@/components/CampusMap";
import { useProfile } from "@/components/ProfileProvider";
import { useGroup } from "@/components/useGroup";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogClose,
  DialogContent,
  EmptyState,
  ErrorBanner,
  PageTitle,
  Select,
  StationStatusChip,
  SuccessBanner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  COMMITTEE_TIER,
  LatestLocation,
  Projector,
  RISK_TIER_META,
  Station,
  StationOccupancy,
} from "@/lib/types";
import { cn, friendlyError, isStale, timeAgo } from "@/lib/utils";

type FilterTab = "all" | "available" | "occupied" | "closed";

export default function MapPage() {
  const profile = useProfile();
  const { group } = useGroup();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [stations, setStations] = useState<Station[]>([]);
  const [occupancy, setOccupancy] = useState<StationOccupancy[]>([]);
  const [locations, setLocations] = useState<LatestLocation[]>([]);
  const [projectors, setProjectors] = useState<Projector[]>([]);
  const [day2Layer, setDay2Layer] = useState(false);
  const [loading, setLoading] = useState(true);

  // View & Filter States
  const [activeTab, setActiveTab] = useState<"map" | "list">("map");
  const [filter, setFilter] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Station Detail Sheet State
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Faci Quick Update State
  const [selectedStationForUpdate, setSelectedStationForUpdate] = useState<string>("");
  const [updateLoading, setUpdateLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // GPS Auto-report State
  const [gpsActive, setGpsActive] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);

  const isFaci = profile.role === "faci";
  const isCommittee = COMMITTEE_TIER.includes(profile.role);
  const showPins = isCommittee || isFaci;

  // Data Loading
  const loadData = useCallback(async () => {
    try {
      const [
        stationsRes,
        occupancyRes,
        configRes,
        projectorsRes,
        locationsRes,
      ] = await Promise.all([
        supabase.from("stations").select("*").order("id"),
        supabase.rpc("fn_public_station_occupancy"),
        supabase.from("game_config").select("value").eq("key", "day2_map_layer").single(),
        supabase.from("projectors").select("*"),
        showPins ? supabase.rpc("fn_latest_locations") : Promise.resolve({ data: [] }),
      ]);

      if (stationsRes.data) setStations(stationsRes.data as Station[]);
      if (occupancyRes.data) setOccupancy(occupancyRes.data as StationOccupancy[]);
      if (configRes.data) {
        setDay2Layer(configRes.data.value === true || configRes.data.value === "true");
      }
      if (projectorsRes.data) setProjectors(projectorsRes.data as Projector[]);
      if (locationsRes.data) setLocations(locationsRes.data as LatestLocation[]);
    } catch (err) {
      console.error("Failed to load map data:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, showPins]);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel("map-page-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stations" },
        () => loadData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_config" },
        () => loadData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projectors" },
        () => loadData()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_locations" },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, loadData]);

  // GPS Auto-report Loop for Faci
  useEffect(() => {
    if (!gpsActive || !isFaci || !profile.group_id) return;

    let timer: NodeJS.Timeout | null = null;
    let active = true;

    const reportCurrentGps = () => {
      if (typeof window === "undefined" || !navigator.geolocation) {
        setGpsStatus("GPS unsupported");
        return;
      }
      if (document.visibilityState !== "visible") return;

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (!active) return;
          const { latitude, longitude, accuracy } = pos.coords;
          try {
            await supabase.rpc("fn_report_gps", {
              p_lat: latitude,
              p_lng: longitude,
              p_accuracy: accuracy,
            });
            if (active) {
              setGpsStatus(`±${Math.round(accuracy)}m`);
            }
          } catch {
            if (active) setGpsStatus("Report failed");
          }
        },
        (err) => {
          if (!active) return;
          setGpsStatus(
            err.code === 1
              ? "Permission denied"
              : err.code === 2
                ? "Unavailable"
                : "Timeout"
          );
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    };

    reportCurrentGps();
    timer = setInterval(reportCurrentGps, 60000);

    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [gpsActive, isFaci, profile.group_id, supabase]);

  // Current Faci Group Location Info
  const myGroupLocation = useMemo(() => {
    if (!profile.group_id) return null;
    return locations.find(
      (l) => l.group_id === profile.group_id && l.source === "manual"
    );
  }, [locations, profile.group_id]);

  const currentStationInfo = useMemo(() => {
    if (!myGroupLocation || !myGroupLocation.station_id) return null;
    return stations.find((s) => s.id === myGroupLocation.station_id) || null;
  }, [myGroupLocation, stations]);

  // Handle Manual Check-in / Checkout
  async function handleCheckin(stationId: number | null) {
    setError(null);
    setNotice(null);
    setActionLoading(true);
    try {
      const { error: rpcErr } = await supabase.rpc("fn_manual_checkin", {
        p_station_id: stationId,
      });
      if (rpcErr) throw rpcErr;

      if (stationId === null) {
        setNotice("Checked out successfully. Location cleared.");
      } else {
        const target = stations.find((s) => s.id === stationId);
        setNotice(`Checked in at ${target ? target.name : "station"} successfully.`);
      }
      setSelectedStationForUpdate("");
      await loadData();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setActionLoading(false);
    }
  }

  // Handle Quick Update Submit
  async function handleQuickUpdateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStationForUpdate) return;
    setUpdateLoading(true);
    setError(null);
    setNotice(null);
    try {
      const stationId =
        selectedStationForUpdate === "checkout"
          ? null
          : Number(selectedStationForUpdate);
      const { error: rpcErr } = await supabase.rpc("fn_manual_checkin", {
        p_station_id: stationId,
      });
      if (rpcErr) throw rpcErr;

      if (stationId === null) {
        setNotice("Checked out of station.");
      } else {
        const target = stations.find((s) => s.id === stationId);
        setNotice(`Location updated to ${target?.name || "selected station"}.`);
      }
      setSelectedStationForUpdate("");
      await loadData();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setUpdateLoading(false);
    }
  }

  // Station Occupancy Helpers
  const getOccupancyCount = useCallback(
    (stationId: number): number => {
      return (
        occupancy.find((o) => o.station_id === stationId)?.occupancy_count ?? 0
      );
    },
    [occupancy]
  );

  const getCapacity = useCallback((station: Station): number => {
    return station.is_pk_day1 ? 2 : 1;
  }, []);

  const getStationStatusText = useCallback(
    (station: Station) => {
      const occ = getOccupancyCount(station.id);
      const cap = getCapacity(station);
      if (station.status === "closed") return "Closed";
      if (station.status === "in_progress") return "In Progress";
      if (station.is_pk_day1) {
        if (occ === 0) return "0/2 Available";
        if (occ === 1) return "1/2 Waiting for Opponent";
        return "2/2 Full";
      }
      return occ >= 1 ? "1/1 Occupied" : "0/1 Available";
    },
    [getOccupancyCount, getCapacity]
  );

  // Filter Stations for List Tab
  const filteredStations = useMemo(() => {
    return stations.filter((station) => {
      const occ = getOccupancyCount(station.id);
      const cap = getCapacity(station);

      // Filter tab
      if (filter === "available") {
        if (station.status !== "available" || occ >= cap) return false;
      } else if (filter === "occupied") {
        const isOccupied =
          station.status === "in_progress" ||
          (station.status === "available" && occ >= 1);
        if (!isOccupied) return false;
      } else if (filter === "closed") {
        if (station.status !== "closed") return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesCode = station.code.toLowerCase().includes(query);
        const matchesName = station.name.toLowerCase().includes(query);
        const matchesArea = station.area.toLowerCase().includes(query);
        if (!matchesCode && !matchesName && !matchesArea) return false;
      }

      return true;
    });
  }, [stations, filter, searchQuery, getOccupancyCount, getCapacity]);

  // Counts for filter badges
  const filterCounts = useMemo(() => {
    let avail = 0;
    let occCount = 0;
    let closed = 0;

    stations.forEach((s) => {
      const occ = getOccupancyCount(s.id);
      const cap = getCapacity(s);
      if (s.status === "closed") {
        closed++;
      } else if (
        s.status === "in_progress" ||
        (s.status === "available" && occ >= 1)
      ) {
        occCount++;
      }
      if (s.status === "available" && occ < cap) {
        avail++;
      }
    });

    return { all: stations.length, available: avail, occupied: occCount, closed };
  }, [stations, getOccupancyCount, getCapacity]);

  // Open Bottom Sheet Modal
  function openStationSheet(station: Station) {
    setSelectedStation(station);
    setSheetOpen(true);
  }

  // Groups currently checked in at selected station (for Faci & Committee)
  const currentGroupsAtSelected = useMemo(() => {
    if (!selectedStation) return [];
    return locations.filter(
      (l) => l.source === "manual" && l.station_id === selectedStation.id
    );
  }, [selectedStation, locations]);

  const isMyGroupHere = useMemo(() => {
    if (!selectedStation || !profile.group_id) return false;
    return (
      myGroupLocation?.station_id === selectedStation.id &&
      !isStale(myGroupLocation.reported_at)
    );
  }, [selectedStation, profile.group_id, myGroupLocation]);

  return (
    <div className="space-y-4 pb-20">
      {/* Page Title & Refresh */}
      <div className="flex items-start justify-between gap-4">
        <PageTitle
          title="Campus Map & Stations"
          subtitle="Real-time station status, live occupancy, and mobile location check-in."
        />
        <button
          onClick={() => loadData()}
          aria-label="Refresh map data"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-paper-300 bg-white text-ink-soft shadow-raised transition hover:bg-paper-100 hover:text-ink active:scale-95"
        >
          <RefreshCw
            size={18}
            strokeWidth={1.75}
            className={loading ? "animate-spin text-brand-1" : ""}
          />
        </button>
      </div>

      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      {/* Faci Sticky Quick Location Update Card */}
      {isFaci && (
        <div className="sticky top-16 z-30 -mx-3 px-3 sm:mx-0 sm:px-0">
          <div className="rounded-2xl border border-brand-1/30 bg-white/95 p-4 shadow-overlay backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-paper-200/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-1/15 text-brand-1">
                  <MapPin size={18} strokeWidth={1.75} />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-ink">My Group Location</h2>
                  <p className="text-xs font-semibold text-brand-1">
                    {group?.name || `Group ${profile.group_id ?? "—"}`}
                  </p>
                </div>
              </div>

              {/* GPS Auto-report Switch */}
              <div className="flex items-center gap-2 rounded-full border border-paper-300 bg-paper-100/90 px-3 py-1 text-xs">
                <Radio
                  size={14}
                  strokeWidth={1.75}
                  className={gpsActive ? "animate-pulse text-green-600" : "text-ink-muted"}
                />
                <span className="font-semibold text-ink-soft">
                  GPS Auto {gpsStatus && `(${gpsStatus})`}
                </span>
                <button
                  type="button"
                  onClick={() => setGpsActive(!gpsActive)}
                  className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none",
                    gpsActive ? "bg-green-600" : "bg-paper-300"
                  )}
                  role="switch"
                  aria-checked={gpsActive}
                  aria-label="Toggle GPS Auto-report"
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out mt-0.5",
                      gpsActive ? "translate-x-4 ml-0.5" : "translate-x-0.5"
                    )}
                  />
                </button>
              </div>
            </div>

            {/* Current Location readout */}
            <div className="my-2.5 flex items-center justify-between gap-2 text-xs">
              <span className="text-ink-faint">Current status:</span>
              <div className="flex items-center gap-1.5 font-semibold text-ink">
                {currentStationInfo ? (
                  <>
                    <span className="chip border border-brand-1/20 bg-brand-1/10 text-brand-1 font-bold">
                      {currentStationInfo.code}
                    </span>
                    <span className="truncate">{currentStationInfo.name}</span>
                    <span className="text-ink-muted font-normal">
                      · {timeAgo(myGroupLocation!.reported_at)}
                    </span>
                  </>
                ) : (
                  <span className="text-ink-muted italic">Not checked in</span>
                )}
              </div>
            </div>

            {/* Quick Update Form */}
            <form
              onSubmit={handleQuickUpdateSubmit}
              className="flex flex-col gap-2 pt-1 sm:flex-row"
            >
              <div className="flex-1">
                <Select
                  value={selectedStationForUpdate}
                  onChange={(e) => setSelectedStationForUpdate(e.target.value)}
                  className="w-full text-sm font-medium"
                >
                  <option value="">-- Select Destination Station --</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      [{s.code}] {s.name} ({s.area})
                    </option>
                  ))}
                  <option value="checkout">⚡ Check Out / Leave Station</option>
                </Select>
              </div>
              <Button
                type="submit"
                intent="primary"
                size="md"
                disabled={!selectedStationForUpdate || updateLoading}
                loading={updateLoading}
                className="w-full sm:w-auto"
              >
                Update Location
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Main Tabs (Map View vs List View) */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "map" | "list")}>
        <TabsList variant="pill" className="grid w-full grid-cols-2 p-1">
          <TabsTrigger
            variant="pill"
            value="map"
            className="flex items-center justify-center gap-2"
          >
            <MapIcon size={16} strokeWidth={1.75} />
            <span>Map View</span>
          </TabsTrigger>
          <TabsTrigger
            variant="pill"
            value="list"
            className="flex items-center justify-center gap-2"
          >
            <List size={16} strokeWidth={1.75} />
            <span>Station List ({stations.length})</span>
          </TabsTrigger>
        </TabsList>

        {/* MAP TAB CONTENT */}
        <TabsContent value="map" className="mt-4 space-y-3 outline-none">
          <CampusMap
            showGroupPins={showPins}
            onStationTap={openStationSheet}
            highlightStationId={selectedStation?.id}
            occupancy={occupancy}
            stations={stations}
            locations={locations}
            projectors={projectors}
            day2Layer={day2Layer}
            hideDetailsCard={true}
          />

          {/* Interactive Legend Bar */}
          <div className="card p-3 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted mb-2">
              Map Status Legend
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs text-ink-soft sm:grid-cols-4">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[#16a34a] ring-2 ring-green-200" />
                <span>Available</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-[#d97706]" />
                </span>
                <span>Waiting (1/2)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[#dc2626] ring-2 ring-red-200" />
                <span>Occupied / Full</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-3 w-3 items-center justify-center rounded-full bg-[#9ca3af] text-[9px] font-bold text-white">
                  ✕
                </span>
                <span>Closed</span>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* LIST TAB CONTENT */}
        <TabsContent value="list" className="mt-4 space-y-3 outline-none">
          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            <button
              onClick={() => setFilter("all")}
              className={cn(
                "chip min-h-[36px] px-3.5 text-xs font-bold transition-all shrink-0 cursor-pointer",
                filter === "all"
                  ? "bg-ink text-white shadow-sm"
                  : "bg-white text-ink-soft border border-paper-300 hover:border-paper-400"
              )}
            >
              All ({filterCounts.all})
            </button>
            <button
              onClick={() => setFilter("available")}
              className={cn(
                "chip min-h-[36px] px-3.5 text-xs font-bold transition-all shrink-0 cursor-pointer",
                filter === "available"
                  ? "bg-green-700 text-white shadow-sm"
                  : "bg-green-50 text-green-800 border border-green-200 hover:bg-green-100"
              )}
            >
              Available ({filterCounts.available})
            </button>
            <button
              onClick={() => setFilter("occupied")}
              className={cn(
                "chip min-h-[36px] px-3.5 text-xs font-bold transition-all shrink-0 cursor-pointer",
                filter === "occupied"
                  ? "bg-red-700 text-white shadow-sm"
                  : "bg-red-50 text-red-800 border border-red-200 hover:bg-red-100"
              )}
            >
              Occupied ({filterCounts.occupied})
            </button>
            <button
              onClick={() => setFilter("closed")}
              className={cn(
                "chip min-h-[36px] px-3.5 text-xs font-bold transition-all shrink-0 cursor-pointer",
                filter === "closed"
                  ? "bg-gray-700 text-white shadow-sm"
                  : "bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200"
              )}
            >
              Closed ({filterCounts.closed})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search station by name, code or area..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input text-sm pr-8"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
              >
                ✕
              </button>
            )}
          </div>

          {/* Station Cards List */}
          {filteredStations.length === 0 ? (
            <EmptyState
              title="No stations found"
              message="No stations match the selected filter or search term."
            />
          ) : (
            <div className="space-y-2.5">
              {filteredStations.map((station) => {
                const occ = getOccupancyCount(station.id);
                const cap = getCapacity(station);
                const isPk = Boolean(station.is_pk_day1);
                const percent = Math.min(100, Math.round((occ / cap) * 100));
                const dotColor = getStationDotFill(station.status, occ, isPk);
                const isWaiting = station.status === "available" && isPk && occ === 1;

                return (
                  <div
                    key={station.id}
                    onClick={() => openStationSheet(station)}
                    className="card flex flex-col gap-3 p-4 transition-all duration-base hover:border-brand-1/40 hover:shadow-card active:scale-[0.99] cursor-pointer"
                  >
                    {/* Top Row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="chip border border-brand-1/25 bg-brand-1/10 text-brand-1 font-bold">
                            {station.code}
                          </span>
                          <h3 className="truncate font-bold text-ink">
                            {station.name}
                          </h3>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                          <span>{station.area}</span>
                          <span>•</span>
                          <span className="font-semibold text-ink-soft">
                            {RISK_TIER_META[station.risk_tier]?.label}
                          </span>
                          {station.is_pk_day1 && (
                            <>
                              <span>•</span>
                              <span className="chip bg-purple-100 text-purple-800 text-[10px] font-bold">
                                PK Day 1 (Cap: 2)
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Status Chip */}
                      <div className="shrink-0">
                        {station.status === "closed" ? (
                          <Badge tone="neutral">Closed</Badge>
                        ) : station.status === "in_progress" ? (
                          <Badge tone="danger">In Progress</Badge>
                        ) : isWaiting ? (
                          <Badge tone="warning" className="animate-pulse">
                            1/2 Waiting
                          </Badge>
                        ) : occ >= cap ? (
                          <Badge tone="danger">Full ({occ}/{cap})</Badge>
                        ) : (
                          <Badge tone="success">Available</Badge>
                        )}
                      </div>
                    </div>

                    {/* Occupancy Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-ink-soft">
                          {getStationStatusText(station)}
                        </span>
                        <span className="text-ink-muted">
                          {occ}/{cap} groups
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-paper-200">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${percent}%`,
                            backgroundColor: dotColor,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Station Detail Bottom Sheet Modal */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent
          layout="sheetBottom"
          title={selectedStation?.name || "Station Details"}
          className="sm:max-w-lg sm:rounded-2xl"
        >
          {selectedStation && (
            <div className="space-y-4 pt-1">
              {/* Header Info */}
              <div className="flex items-start justify-between gap-3 border-b border-paper-200 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="chip border border-brand-1/30 bg-brand-1/10 text-brand-1 font-bold">
                      {selectedStation.code}
                    </span>
                    <h2 className="text-lg font-black text-ink">
                      {selectedStation.name}
                    </h2>
                  </div>
                  <p className="mt-1 text-xs text-ink-faint">
                    {selectedStation.area}
                  </p>
                </div>
                <StationStatusChip status={selectedStation.status} />
              </div>

              {/* Badges & Meta */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2 rounded-xl border border-paper-200 bg-paper-50 p-2.5">
                  <Shield size={16} strokeWidth={1.75} className="text-brand-2" />
                  <div>
                    <p className="text-ink-muted">Risk Tier</p>
                    <p className="font-bold text-ink">
                      {RISK_TIER_META[selectedStation.risk_tier]?.label}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-paper-200 bg-paper-50 p-2.5">
                  <Coins size={16} strokeWidth={1.75} className="text-amber-600" />
                  <div>
                    <p className="text-ink-muted">Entry Cost</p>
                    <p className="font-bold text-ink">
                      {selectedStation.entry_cost} tokens
                    </p>
                  </div>
                </div>
              </div>

              {/* Occupancy Status Section */}
              <div className="rounded-xl border border-paper-200 bg-white p-3 shadow-sm space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 font-bold text-ink">
                    <Users size={16} strokeWidth={1.75} className="text-brand-1" />
                    <span>Occupancy & Capacity</span>
                  </div>
                  <span className="chip font-bold bg-paper-100 text-ink-soft">
                    {getOccupancyCount(selectedStation.id)} /{" "}
                    {getCapacity(selectedStation)} Groups
                  </span>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-paper-200">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (getOccupancyCount(selectedStation.id) /
                            getCapacity(selectedStation)) *
                            100
                        )
                      )}%`,
                      backgroundColor: getStationDotFill(
                        selectedStation.status,
                        getOccupancyCount(selectedStation.id),
                        selectedStation.is_pk_day1
                      ),
                    }}
                  />
                </div>

                {/* Privacy-Preserving View vs Facilitator/Committee View */}
                {!isFaci && !isCommittee ? (
                  /* FRESHIE VIEW: Counts only, no group names */
                  <div className="mt-2 rounded-lg bg-paper-50 p-2.5 text-xs text-ink-soft">
                    <p className="font-semibold text-ink">
                      {getStationStatusText(selectedStation)}
                    </p>
                    <p className="mt-0.5 text-ink-muted">
                      {selectedStation.is_pk_day1
                        ? "PK Stage: Hosts 2 competing groups simultaneously."
                        : "Solo Stage: Hosts 1 group at a time."}
                    </p>
                  </div>
                ) : (
                  /* FACI & COMMITTEE VIEW: Group list & timing */
                  <div className="mt-2 space-y-1.5 pt-1">
                    <p className="text-xs font-bold text-ink-muted uppercase tracking-wider">
                      Groups currently checked in:
                    </p>
                    {currentGroupsAtSelected.length === 0 ? (
                      <p className="text-xs italic text-ink-faint py-1">
                        No groups checked in at this station.
                      </p>
                    ) : (
                      currentGroupsAtSelected.map((groupLoc) => (
                        <div
                          key={groupLoc.group_id}
                          className="flex items-center justify-between rounded-lg border border-paper-200 bg-paper-50 px-3 py-1.5 text-xs"
                        >
                          <span className="font-bold text-ink">
                            {groupLoc.group_name}
                          </span>
                          <span className="flex items-center gap-1 text-ink-faint">
                            <Clock size={12} strokeWidth={1.75} />
                            <span>{timeAgo(groupLoc.reported_at)}</span>
                            {isStale(groupLoc.reported_at) && (
                              <span className="text-red-500 font-semibold">(stale)</span>
                            )}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Faci Action Button */}
              {isFaci && (
                <div className="pt-2">
                  {isMyGroupHere ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-2 rounded-xl bg-green-50 border border-green-200 p-3 text-sm font-bold text-green-800">
                        <CheckCircle2 size={18} strokeWidth={1.75} />
                        <span>Your group is currently checked in here</span>
                      </div>
                      <Button
                        intent="secondary"
                        size="md"
                        fullWidth
                        onClick={() => handleCheckin(null)}
                        loading={actionLoading}
                      >
                        Check Out / Leave Station
                      </Button>
                    </div>
                  ) : (
                    <Button
                      intent="primary"
                      size="lg"
                      fullWidth
                      onClick={() => handleCheckin(selectedStation.id)}
                      loading={actionLoading}
                      disabled={selectedStation.status === "closed"}
                    >
                      Check in at {selectedStation.name}
                    </Button>
                  )}
                </div>
              )}

              {/* Close sheet */}
              <div className="pt-1">
                <DialogClose asChild>
                  <Button intent="secondary" size="md" fullWidth>
                    Close
                  </Button>
                </DialogClose>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

