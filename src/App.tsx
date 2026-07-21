import { Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { FontSizeSync, LanguageSync, ThemeSync } from "@/components/layout/Sidebar";
import { Home } from "@/pages/Home";
import { Hosts } from "@/pages/Hosts";
import { Scan } from "@/pages/Scan";
import { Speedtest } from "@/pages/Speedtest";
import { Connectivity } from "@/pages/Connectivity";
import { Sftp } from "@/pages/Sftp";
import { Settings } from "@/pages/Settings";
import { Docker } from "@/pages/Docker";
import { useHostStore } from "@/store/useHostStore";
import { isTauri } from "@/lib/tauri";

/** Load saved hosts once at startup so lists survive app restarts everywhere. */
function HostBootstrap() {
  const load = useHostStore((s) => s.load);
  useEffect(() => {
    if (isTauri()) load().catch(() => undefined);
  }, [load]);
  return null;
}

export default function App() {
  return (
    <>
      <LanguageSync />
      <FontSizeSync />
      <ThemeSync />
      <HostBootstrap />
      <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="hosts" element={<Hosts />} />
        <Route path="scan" element={<Scan />} />
        <Route path="speedtest" element={<Speedtest />} />
        <Route path="connectivity" element={<Connectivity />} />
        <Route path="sftp" element={<Sftp />} />
        <Route path="docker" element={<Docker />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
    </>
  );
}
