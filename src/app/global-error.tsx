"use client";

import { useEffect } from "react";

// Last-resort boundary: replaces the root layout, so it must render its own
// <html>/<body>. Fires only when the root layout itself throws.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100dvh",
          margin: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#f7f7f5",
          color: "#1c1a17",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "26rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>
            The app hit a fatal error
          </h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#6b6660" }}>
            Please reload. If this keeps happening, contact the committee.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              minHeight: "44px",
              padding: "0 1.25rem",
              borderRadius: "999px",
              border: "none",
              background: "#1c1a17",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
