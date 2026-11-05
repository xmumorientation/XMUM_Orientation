"use client";

import Script from "next/script";
import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import "./offline-support.css";

export function OfflineSupport() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return (
    <>
      <Script src="/offline-setup.js" strategy="afterInteractive" />
      {offline && (
        <aside className="offline-notice" aria-label="Connection status">
          <span role="status"><WifiOff size={20} aria-hidden="true" />You’re Offline</span>
          <a href="/offline.html" target="_blank" rel="noopener">View Guide</a>
        </aside>
      )}
    </>
  );
}
