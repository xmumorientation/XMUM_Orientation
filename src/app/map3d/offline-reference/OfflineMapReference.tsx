"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import { fitCamera } from "@/components/campus-map/CampusMap3DView";
import CampusScene from "@/components/map3d/CampusScene";
import { AREA_PLACES, labelPoint } from "@/components/map3d/places";

function Ready({ onReady }: { onReady: () => void }) {
  const frames = useRef(0);
  useFrame(({ invalidate }) => {
    if (frames.current >= 5) return;
    frames.current += 1;
    if (frames.current === 5) onReady();
    else invalidate();
  });
  return null;
}

export default function OfflineMapReference() {
  const [ready, setReady] = useState(false);
  return (
    <div id="offline-map-render" data-ready={ready} style={{ width: 1600, height: 1000 }}>
      <CampusScene
        mode="day"
        camera={fitCamera(1600 / 1000)}
        intro={false}
        labels
        interactive={false}
        tiltShift={false}
        lite={false}
        concert={false}
      >
        <Ready onReady={() => setReady(true)} />
        {AREA_PLACES.filter((place) => place.area.endsWith("Court")).map((place) => (
          <Html key={place.area} position={labelPoint(place)} center>
            <span style={{ whiteSpace: "nowrap", fontFamily: "system-ui, sans-serif", fontSize: 12, fontWeight: 700, color: "white", background: "rgba(20,18,30,0.85)", padding: "4px 8px", borderRadius: 999 }}>
              {place.area}
            </span>
          </Html>
        ))}
      </CampusScene>
    </div>
  );
}
