"use client";

import { useEffect } from "react";

export default function ClientReset() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const resetFlag = window.sessionStorage.getItem("vega_reset_app");
    if (resetFlag === "1") {
      localStorage.removeItem("vega_user_session");
      localStorage.removeItem("vega_users_db");
      localStorage.removeItem("vega_cache_event_8492");
      localStorage.removeItem("vega_gemini_api_key");
      Object.keys(localStorage)
        .filter((key) => key.startsWith("vega_cache_event_"))
        .forEach((key) => localStorage.removeItem(key));
      window.sessionStorage.removeItem("vega_reset_app");
    }
  }, []);

  return null;
}
