/** Send a browser-side error to Privi's error log. Never throws. */
export function reportError(where: string, err: unknown) {
  try {
    const e = err as { name?: string; message?: string };
    const body = JSON.stringify({
      where,
      name: e?.name,
      message: (e?.message ?? String(err)).slice(0, 500),
      path: location.pathname.slice(0, 120),
    });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/telemetry", new Blob([body], { type: "application/json" }));
    else void fetch("/api/telemetry", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true });
  } catch {
    /* monitoring must never break the app */
  }
}
