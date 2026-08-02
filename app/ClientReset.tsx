"use client";

import { useEffect } from "react";
import { clearAllAppData } from "@/lib/auth";

export default function ClientReset() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const resetFlag = window.sessionStorage.getItem("vega_reset_app");
    if (resetFlag === "1") {
      clearAllAppData();
      window.sessionStorage.removeItem("vega_reset_app");
    }
  }, []);

  return null;
}
