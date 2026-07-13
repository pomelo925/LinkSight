<div align="center">

<img src="src-tauri/icons/128x128.png" alt="LinkSight logo" width="72" height="72" />

# LinkSight

A lightweight desktop app for quick **single-host internet** and **two-host peer** connectivity checks.

[中文](README.md) · [English](README-en.md)

[![Latest release](https://img.shields.io/github/v/release/pomelo925/LinkSight?label=download)](https://github.com/pomelo925/LinkSight/releases/latest)
[![MIT License](https://img.shields.io/github/license/pomelo925/LinkSight.svg?style=flat)](LICENSE)

<table>
  <tr>
    <td align="center" width="50%">
      <strong>Internet Connectivity</strong><br />
      <img src="assets/internet-test.gif" alt="Internet Connectivity animation" width="100%" />
    </td>
    <td align="center" width="50%">
      <strong>Peer-to-Peer</strong><br />
      <img src="assets/p2p-test.gif" alt="Peer-to-Peer animation" width="100%" />
    </td>
  </tr>
</table>

</div>


<br /><br />

## 1. How to run

**Linux only** for now. Download from [Releases](https://github.com/pomelo925/LinkSight/releases/latest):

- **`.deb`** — Ubuntu / Debian. After install, it appears in your app list:

  ```bash
  sudo dpkg -i LinkSight_*.deb
  ```

  or:

  ```bash
  sudo apt install ./LinkSight_*.deb
  ```

- **`.AppImage`** — works on most distros:

  ```bash
  chmod +x LinkSight_*_amd64.AppImage
  ./LinkSight_*_amd64.AppImage
  ```

> Some distros (e.g. Ubuntu 22.04+) may need `libfuse2` to run AppImage.


<br /><br />

## 2. Features

<table>
  <tr>
    <td align="center" width="50%">
      <strong>Internet Connectivity</strong><br />
      <img src="assets/internet-connectivity-results.png" alt="Internet Connectivity results" width="100%" />
    </td>
    <td align="center" width="50%">
      <strong>LAN Scan</strong><br />
      <img src="assets/lanscan-results.png" alt="LAN Scan results" width="100%" />
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <strong>Peer-to-Peer</strong><br />
      <img src="assets/p2p-results.png" alt="Peer-to-Peer results" width="100%" />
    </td>
    <td align="center" width="50%">
      <strong>SFTP</strong><br />
      <img src="assets/sftp-results.png" alt="SFTP results" width="100%" />
    </td>
  </tr>
</table>

- **Internet Connectivity** — Test download / upload, latency, and route from this machine.
- **LAN Scan** — Discover devices on the local network.
- **Peer-to-Peer** — Diagnose connectivity quality between this machine and another host.
- **SFTP** — Browse and transfer files between local and remote hosts.

---

<div align="center">

### Theme colors

<table>
  <tr>
    <td align="center" width="50%">
      <strong>Rose Charcoal</strong><br />
      <img src="assets/color-roseCharcoal.png" alt="Rose Charcoal" width="100%" />
    </td>
    <td align="center" width="50%">
      <strong>Monokai</strong><br />
      <img src="assets/color-monokai.png" alt="Monokai" width="100%" />
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <strong>Slate Blue</strong><br />
      <img src="assets/color-slateBlue.png" alt="Slate Blue" width="100%" />
    </td>
    <td align="center" width="50%">
      <strong>Watermelon</strong><br />
      <img src="assets/color-watermelon.png" alt="Watermelon" width="100%" />
    </td>
  </tr>
</table>

</div>


<br /><br />

## 3. Development

Docker is the recommended development path:

```bash
./run.sh dev      # Start the container and launch the Tauri app (hot reload)
./run.sh shell    # Open a container shell (debugging)
./run.sh down     # Stop and remove the development container
```

Requires Docker, Docker Compose, and a working X server.


<br /><br />

## 4. Contribution

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

Main workflow: fork the repo → branch your changes → open a Pull Request.


<br /><br />

## 5. License

Distributed under the [MIT License](LICENSE).
