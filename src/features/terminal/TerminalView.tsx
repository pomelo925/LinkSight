import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

/**
 * Embedded xterm.js surface. Wired here as a self-contained local shell demo;
 * the SSH backend (src-tauri/src/ssh) will stream real session I/O into this
 * component via Tauri events in a later iteration.
 */
export function TerminalView() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 13,
      cursorBlink: true,
      theme: {
        background: "#0b1120",
        foreground: "#cbd5e1",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    term.writeln("LinkSight terminal — SSH session manager (preview)");
    term.writeln("Connect a host from the SSH panel to start a session.");
    term.write("\r\n$ ");

    // Local echo for the preview (replaced by SSH stream in a later iteration).
    term.onData((data) => {
      if (data === "\r") term.write("\r\n$ ");
      else if (data === "\u007f") term.write("\b \b");
      else term.write(data);
    });

    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      term.dispose();
    };
  }, []);

  return (
    <div className="h-[70vh] overflow-hidden rounded-xl border border-border bg-[#0b1120] p-2">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
