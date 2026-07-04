import { Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Home } from "@/pages/Home";
import { Hosts } from "@/pages/Hosts";
import { Scan } from "@/pages/Scan";
import { Speedtest } from "@/pages/Speedtest";
import { Bandwidth } from "@/pages/Bandwidth";
import { TerminalPage } from "@/pages/TerminalPage";
import { Settings } from "@/pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="hosts" element={<Hosts />} />
        <Route path="scan" element={<Scan />} />
        <Route path="speedtest" element={<Speedtest />} />
        <Route path="bandwidth" element={<Bandwidth />} />
        <Route path="terminal" element={<TerminalPage />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
