<div align="center">

# LinkSight

<p align="center">
  <strong>Linux-first network diagnostics & connectivity intelligence</strong>
</p>

<p align="center">
  Tauri v2 · React + TypeScript · Rust (Tokio) · SQLite
</p>

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![MIT License][license-shield]][license-url]

</div>

---

LinkSight is a unified network analysis and connectivity intelligence desktop
application. It combines everyday diagnostics (ping, traceroute, LAN discovery,
speed tests) with an advanced, remote-capable toolset (iperf3 bandwidth, SSH
session management, remote metrics) — all behind a single, animated UI.

## Features

**Basic Mode** (no remote permission required)
- Internet speed test (local machine)
- ICMP ping — latency / jitter / packet loss
- Traceroute (hop analysis)
- LAN discovery (network scan)

**Advanced Mode** (requires remote access)
- iperf3 bandwidth measurement
- SSH remote execution (Termius-like terminal)
- Remote system metrics
- Bidirectional latency measurement

Both modes share the **same result schema** (`NetworkTestResult`) so every test
renders through the same UI components and persists to the same tables.

## Architecture

```
LinkSight/
├── run.sh                     # Docker dev-environment launcher (X11 forwarding)
├── index.html                 # Frontend entry
├── src/                       # React frontend
│   ├── pages/                 # Route-level screens
│   ├── components/            # UI + layout (shadcn/ui based)
│   ├── features/              # Network test / terminal feature modules
│   ├── hooks/                 # Test execution flow hooks
│   ├── store/                 # Zustand state
│   └── lib/                   # API wrappers + shared types
├── src-tauri/                 # Rust backend (Tauri v2 core)
│   └── src/
│       ├── commands.rs        # Tauri RPC surface
│       ├── network/           # ping · traceroute · scan · bandwidth + model
│       ├── ssh/               # session manager · executor (Advanced Mode)
│       ├── system/            # interface / routing introspection
│       ├── db/                # SQLite schema + store
│       └── agent/             # LinkSight Agent abstraction (future)
├── docker/                    # Reproducible dev environment
│   ├── Dockerfile.dev
│   └── docker-compose.yml
├── scripts/                   # setup · dev · build · test · release
└── .github/workflows/         # CI + Release (AppImage / deb / rpm)
```

### Layering

- **Frontend** renders UI, dashboards, animations, and the terminal; it only
  ever talks to the backend through typed `invoke` wrappers in `src/lib/api.ts`.
- **Backend (Rust core)** executes system commands, manages SSH sessions, runs
  diagnostics, parses results, and exposes them as Tauri commands.
- **Agent model** is designed now (`src-tauri/src/agent`) as a trait so a future
  lightweight remote daemon (or SSH fallback) can be dropped in without changing
  callers.

## Getting Started

### Prerequisites

- Docker & Docker Compose (recommended path — reproducible toolchain)
- An X server (for the desktop window when running from the container)

Or, for a host install: Node.js 20, the Rust stable toolchain, `tauri-cli`, and
the Tauri Linux system dependencies (`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, …).

### Run with Docker (recommended)

```bash
./run.sh dev      # build image, start container, drop into a shell
# inside the container:
./scripts/setup.sh
./scripts/dev.sh  # launches the app with hot reload
```

Stop the environment:

```bash
./run.sh down
```

### Run on the host

```bash
./scripts/setup.sh    # npm install + cargo fetch
./scripts/dev.sh      # cargo tauri dev
```

## The ping example (end-to-end)

The reference flow is fully wired:

1. **UI** — `src/features/network/PingTest.tsx` renders a host input + button.
2. **Hook** — `src/hooks/usePing.ts` drives `idle → running → analyzing → result`.
3. **API** — `src/lib/api.ts` calls `invoke("run_ping", …)`.
4. **Command** — `src-tauri/src/commands.rs::run_ping`.
5. **Core** — `src-tauri/src/network/ping.rs` shells out to `ping`, parses RTT /
   loss / jitter into `NetworkTestResult`, and persists via `db`.
6. **Result** — rendered by `src/features/network/ResultCard.tsx`.

## Scripts

| Script                | Purpose                                        |
| --------------------- | ---------------------------------------------- |
| `scripts/setup.sh`    | Install deps & prepare the environment          |
| `scripts/dev.sh`      | Start frontend + backend (hot reload)           |
| `scripts/build.sh`    | Build production bundles (AppImage / deb / rpm) |
| `scripts/test.sh`     | fmt + clippy + cargo test + frontend typecheck  |
| `scripts/release.sh`  | Build & stage artifacts (+ checksums) for GitHub |

## Build & packaging

`./scripts/build.sh` produces Linux bundles configured in
`src-tauri/tauri.conf.json`:

- **AppImage** (primary distribution format)
- **deb** package
- **rpm** package

Tagging a release (`git tag vX.Y.Z && git push --tags`) triggers
`.github/workflows/release.yml`, which builds and drafts a GitHub release.

## Data model (SQLite)

`devices`, `network_tests`, `ssh_sessions`, `bandwidth_results`,
`latency_results` — see `src-tauri/src/db/schema.rs`. Schema is extensible via
JSON metadata columns and nullable metric fields.

## License

Distributed under the MIT License. See `LICENSE`.

<!-- MARKDOWN LINKS & IMAGES -->
[contributors-shield]: https://img.shields.io/github/contributors/pomelo925/LinkSight.svg?style=for-the-badge
[contributors-url]: https://github.com/pomelo925/LinkSight/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/pomelo925/LinkSight.svg?style=for-the-badge
[forks-url]: https://github.com/pomelo925/LinkSight/network/members
[stars-shield]: https://img.shields.io/github/stars/pomelo925/LinkSight.svg?style=for-the-badge
[stars-url]: https://github.com/pomelo925/LinkSight/stargazers
[issues-shield]: https://img.shields.io/github/issues/pomelo925/LinkSight.svg?style=for-the-badge
[issues-url]: https://github.com/pomelo925/LinkSight/issues
[license-shield]: https://img.shields.io/github/license/pomelo925/LinkSight.svg?style=for-the-badge
[license-url]: https://github.com/pomelo925/LinkSight/blob/main/LICENSE
