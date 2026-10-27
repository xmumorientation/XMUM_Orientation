"use client";

import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MapControls as MapControlsImpl } from "three-stdlib";

import { parseFunfair, type FunfairPower } from "@/lib/funfair";

import { MODES, type Mode } from "./atmosphere";
import CampusScene, { type CameraView } from "./CampusScene";

import { GPS_MARKERS } from "./geo";
import type { LiveCourt } from "./tennis/board";
import { courtView, TENNIS_COURTS } from "./tennis/court";
import { TennisDemo } from "./tennis/TennisDemo";
import type { Game, TennisOptions } from "./tennis/TennisGame";
import type { Spectator } from "./tennis/TennisLive";
import { prefersLite } from "./webgl";

// DRAFT (map-3d-draft branch, not for main): the /map3d demo page. Wraps
// CampusScene with a header, mode buttons and a labels toggle.

type Demo = {
  camera?: CameraView;
  intro: boolean;
  gps: boolean;
  lite: boolean;
  stats: boolean;
  touch: boolean;
  funfair: FunfairPower;
  /**
   * The lake stage's concert: on, off, "flip" (on 4 s after load, to watch the opening), or undefined: it follows
   * the funfair, like the real map (on while all three zones are on).
   */
  concert: boolean | "flip" | undefined;
  /** The tennis courts' looping rally (the tennis game's batch T1a), with the broadcast view's lens; `at` holds it. */
  tennis: { fov: number; at: number | null } | null;
  /** The tennis game: against a bot (batch T1b), or against another tab (batch T2a). */
  game: TennisOptions | null;
  /** The tennis courts as everyone with the map open sees them (batch T3a): busy courts, and a match up close. */
  watch: { net: TennisOptions["net"] } | null;
};

/**
 * Draft-only URL params, for screenshots: ?cam=x,y,z,tx,ty,tz the start view, ?mode=day|sunset|night the look,
 * ?intro=0 no swoop, ?gps=1 the team's GPS points, ?lite=0|1 force lite mode, ?stats=1 log draw calls (dev only),
 * ?funfair=1,0,1 which funfair zones are on (west, central, east; default all on), ?concert=0|1|flip the lake
 * stage's concert (default: on while all three zones are on; flip: on 4 s after load), ?showt=<seconds>
 * (development) hold the concert at that moment, ?tennis=demo a rally on each tennis court, seen from behind the
 * middle court (unless ?cam is given), ?tennis=bot the tennis game against a bot on the middle court (?auto=1 two
 * bots, ?color=%23rrggbb the player's shirt), ?t=<seconds> hold the rally or the two bots' match at that moment,
 * ?tennis=online the game against another tab of this browser (open two; ?name= the player's name, ?auto=1 a bot
 * plays for this tab), and with ?net=realtime against any other phone, over the Supabase project's Realtime.
 * ?tennis=watch the courts as a spectator sees them (the matches being played in other tabs, or with ?net=realtime
 * on other phones), starting near the middle court: move the camera in and out.
 */
function readDemo(): { demo: Demo; mode: Mode | null } {
  const q = new URLSearchParams(window.location.search);
  const v = q.get("cam")?.split(",").map(Number);
  const cam = v && v.length === 6 && !v.some(Number.isNaN) ? v : null;
  const m = q.get("mode");
  const lite = q.get("lite");
  const concert = q.get("concert");
  const tq = q.get("tennis");
  const play = tq === "bot" || tq === "online" ? tq : null;
  const net = q.get("net") === "realtime" ? "realtime" : "tabs";
  const tennis = tq === "demo" || tq === "watch" || play ? courtView(TENNIS_COURTS[1], window.innerWidth / window.innerHeight) : null;
  const held = q.get("t") === null ? NaN : Number(q.get("t"));
  const at = Number.isFinite(held) ? held : null;
  return {
    demo: {
      camera: cam
        ? { position: [cam[0], cam[1], cam[2]], target: [cam[3], cam[4], cam[5]] }
        : tennis
          ? { position: tennis.position, target: tennis.target }
          : undefined,
      intro: !cam && !tennis && q.get("intro") !== "0",
      gps: q.get("gps") === "1",
      lite: lite === "1" ? true : lite === "0" ? false : prefersLite(),
      stats: process.env.NODE_ENV === "development" && q.get("stats") === "1",
      touch: window.matchMedia("(max-width: 768px)").matches,
      funfair: parseFunfair(q.get("funfair")) ?? { west: 1, central: 1, east: 1 },
      concert: concert === "1" ? true : concert === "0" ? false : concert === "flip" ? "flip" : undefined,
      tennis: tq === "demo" && tennis ? { fov: cam ? 30 : tennis.fov, at } : null,
      game: play && {
        mode: play,
        color: q.get("color") ?? "",
        name: q.get("name") ?? "",
        auto: q.get("auto") === "1",
        at,
        net,
      },
      watch: tq === "watch" ? { net } : null,
    },
    mode: m === "day" || m === "sunset" || m === "night" ? m : null,
  };
}

/** Debug layer: a magenta pin on each GPS point in src/lib/mapGeo.ts, to check the true-scale layout. */
function GpsMarkers() {
  return (
    <>
      {GPS_MARKERS.map(({ name, pos: [x, z] }) => (
        <group key={name} position={[x, 0, z]}>
          <mesh position={[0, 2, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 4, 6]} />
            <meshBasicMaterial color="#ff2bd6" />
          </mesh>
          <mesh position={[0, 4.2, 0]}>
            <sphereGeometry args={[0.45, 12, 8]} />
            <meshBasicMaterial color="#ff2bd6" />
          </mesh>
          <Html position={[0, 5.2, 0]} center zIndexRange={[11, 0]} style={{ pointerEvents: "none" }}>
            <div
              style={{
                font: "600 10px system-ui, sans-serif",
                color: "#fff",
                background: "#c0179f",
                padding: "1px 5px",
                borderRadius: 4,
                whiteSpace: "nowrap",
              }}
            >
              GPS / {name}
            </div>
          </Html>
        </group>
      ))}
    </>
  );
}

/**
 * Dev-only (?stats=1): logs draw calls and triangles for one whole frame (shadow and effect passes included),
 * once, 6 s in. Logged as a warning so the screenshot script prints it.
 */
function RenderStats({ lite }: { lite: boolean }) {
  const { gl, size } = useThree();
  const done = useRef(false);
  useEffect(() => {
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);
  // Runs first in each frame, so gl.info holds everything the previous frame drew.
  useFrame(({ clock }) => {
    if (done.current) return;
    if (clock.elapsedTime > 6) {
      done.current = true;
      const { calls, triangles } = gl.info.render;
      console.warn(
        `[map3d stats] lite=${lite} ${size.width}x${size.height} dpr=${gl.getPixelRatio()} calls=${calls} triangles=${triangles}`,
      );
      gl.info.autoReset = true;
    }
    gl.info.reset();
  }, -1000);
  return null;
}

const pill = (active: boolean): React.CSSProperties => ({
  pointerEvents: "auto",
  background: active ? "rgba(255,255,255,0.92)" : "transparent",
  color: active ? "#1b1b24" : "#fff",
  border: "none",
  borderRadius: 999,
  padding: "7px 13px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
});

const glass: React.CSSProperties = {
  background: "rgba(20,18,30,0.45)",
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 999,
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
};

const noSubscribe = () => () => {};
const NO_COURTS: LiveCourt[] = [];
const noCourts = () => NO_COURTS;

export default function CampusMap3D() {
  const controls = useRef<MapControlsImpl>(null);
  const [demo, setDemo] = useState<Demo | null>(null);
  const [mode, setMode] = useState<Mode>("sunset");
  const [labels, setLabels] = useState(true);
  useEffect(() => {
    const r = readDemo();
    setDemo(r.demo);
    if (r.mode) setMode(r.mode);
    // the names sit over the courts in the broadcast view
    if (r.demo.tennis || r.demo.game) setLabels(false);
  }, []);
  // the game's code loads only when the page asks for it
  const [tennis, setTennis] = useState<{ mod: typeof import("./tennis/TennisGame"); game: Game } | null>(null);
  const gameOptions = demo?.game;
  useEffect(() => {
    if (!gameOptions) return;
    let live = true;
    import("./tennis/TennisGame").then((mod) => {
      if (live) mod.createGame(gameOptions).then((game) => live && setTennis({ mod, game }));
    });
    return () => {
      live = false;
    };
  }, [gameOptions]);
  // the courts as a spectator sees them, loaded only when asked for too
  const [live, setLive] = useState<{ mod: typeof import("./tennis/TennisLive"); spectator: Spectator } | null>(null);
  const watchNet = demo?.watch?.net;
  useEffect(() => {
    if (!watchNet) return;
    let on = true;
    let made: Spectator | null = null;
    import("./tennis/TennisLive").then((mod) =>
      mod.createSpectator(watchNet).then((spectator) => {
        if (!on) return spectator.board.close();
        made = spectator;
        setLive({ mod, spectator });
      }),
    );
    return () => {
      on = false;
      made?.board.close();
      setLive(null);
    };
  }, [watchNet]);
  const board = live?.spectator.board;
  const courts = useSyncExternalStore(board?.subscribe ?? noSubscribe, board?.getView ?? noCourts, board?.getView ?? noCourts);
  const touch = demo?.touch ?? false;
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    if (demo?.concert !== "flip") return;
    const id = window.setTimeout(() => setFlipped(true), 4000);
    return () => window.clearTimeout(id);
  }, [demo?.concert]);

  return (
    <main style={{ position: "fixed", inset: 0, background: MODES[mode].skyTop }}>
      {demo && (
        <CampusScene
          mode={mode}
          lite={demo.lite}
          camera={demo.camera}
          intro={demo.intro}
          labels={labels}
          controlsRef={controls}
          // the game owns the camera and every touch
          interactive={!demo.game}
          funfair={demo.funfair}
          concert={demo.concert === "flip" ? flipped : demo.concert}
          tennisLive={courts.length > 0}
        >
          {demo.gps && <GpsMarkers />}
          {demo.tennis && <TennisDemo fov={demo.tennis.fov} at={demo.tennis.at} />}
          {tennis && <tennis.mod.TennisCourt game={tennis.game} />}
          {live && <live.mod.LiveCourts spectator={live.spectator} />}
          {demo.stats && <RenderStats lite={demo.lite} />}
        </CampusScene>
      )}
      {tennis && <tennis.mod.TennisHud game={tennis.game} />}

      {/* the game has its own HUD instead */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          right: 16,
          display: demo?.game ? "none" : "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          pointerEvents: "none",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
          zIndex: 20,
          textShadow: "0 1px 6px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>XMUM campus / 3D draft</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
            {touch ? "1 finger: move / 2 fingers: rotate and zoom" : "Drag: move / Right-drag: rotate / Scroll: zoom"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => controls.current?.reset()}
          style={{ ...pill(false), ...glass, flexShrink: 0, padding: "8px 14px" }}
        >
          Reset view
        </button>
      </div>

      <div
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: "calc(20px + env(safe-area-inset-bottom))",
          display: demo?.game ? "none" : "flex",
          justifyContent: "center",
          gap: 8,
          flexWrap: "wrap",
          pointerEvents: "none",
          fontFamily: "system-ui, sans-serif",
          zIndex: 20,
        }}
      >
        <div style={{ ...glass, display: "flex", padding: 4, gap: 2 }}>
          {(Object.keys(MODES) as Mode[]).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} style={pill(mode === m)}>
              {MODES[m].label}
            </button>
          ))}
        </div>
        <div style={{ ...glass, display: "flex", padding: 4 }}>
          <button type="button" onClick={() => setLabels((v) => !v)} style={pill(labels)}>
            Labels
          </button>
        </div>
      </div>
    </main>
  );
}
