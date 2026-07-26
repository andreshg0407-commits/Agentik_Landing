"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{ padding: 40, fontFamily: "monospace" }}>
          <h2>Something went wrong</h2>
          <pre style={{ color: "#c00", whiteSpace: "pre-wrap" }}>
            {error.message}
          </pre>
          <button onClick={() => reset()} style={{ marginTop: 16, padding: "8px 16px" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
