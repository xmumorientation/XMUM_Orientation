"use client";

import { useEffect } from "react";

// Root error boundary: catches render/data errors in any route and offers a
// styled recovery path instead of an unstyled crash.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for observability; replace with a reporter when one exists.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="card w-full max-w-md p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-sm font-black tracking-tight text-red-700">
          VX
        </span>
        <h1 className="mt-3 text-xl font-bold text-ink">Something went wrong</h1>
        <p className="mx-auto mt-2 max-w-[34ch] text-sm leading-5 text-ink-faint">
          An unexpected error interrupted this screen. You can try again — your
          progress is saved on the server.
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <button onClick={reset} className="btn-primary">
            Try again
          </button>
          <a href="/dashboard" className="btn-secondary">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
