import { Routes, Route } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Dashboard } from "@/pages/Dashboard";
import { NetworkTest } from "@/pages/NetworkTest";
import { Scan } from "@/pages/Scan";
import { Bandwidth } from "@/pages/Bandwidth";
import { TerminalPage } from "@/pages/TerminalPage";
import { Settings } from "@/pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="network" element={<NetworkTest />} />
        <Route path="scan" element={<Scan />} />
        <Route path="bandwidth" element={<Bandwidth />} />
        <Route path="terminal" element={<TerminalPage />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
