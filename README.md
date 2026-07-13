<div align="center">

<img src="src-tauri/icons/128x128.png" alt="LinkSight logo" width="72" height="72" />

# LinkSight

快速測試**單機對外連線**或**兩機之間通訊**的桌面 App。

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

## 1. 如何運行

目前**僅支援 Linux**。到 [Releases](https://github.com/pomelo925/LinkSight/releases/latest) 下載即可使用：

- **`.deb`** — Ubuntu / Debian。安裝後即可在應用程式列表（app list）中找到：

  ```bash
  sudo dpkg -i LinkSight_*.deb
  ```

  或：

  ```bash
  sudo apt install ./LinkSight_*.deb
  ```

- **`.AppImage`** — 多數發行版通用：

  ```bash
  chmod +x LinkSight_*_amd64.AppImage
  ./LinkSight_*_amd64.AppImage
  ```

> 部分發行版（例如 Ubuntu 22.04+）執行 AppImage 可能需要 `libfuse2`。


<br /><br />

## 2. 功能

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

- **Internet Connectivity** — 測試本機對外下載／上傳、延遲與路由。
- **LAN Scan** — 掃描區域網路，找出附近裝置。
- **Peer-to-Peer** — 診斷本機與另一台主機之間的連線品質。
- **SFTP** — 在本機與遠端主機之間瀏覽並傳輸檔案。

---

<div align="center">

### 主題顏色

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

## 3. 開發

建議使用 Docker 開發環境：

```bash
./run.sh dev      # 啟動容器並執行 Tauri app（熱重載）
./run.sh shell    # 進入容器 shell（除錯用）
./run.sh down     # 停止並移除開發容器
```

需求：Docker & Docker Compose，和可用的 X server。


<br /><br />

## 4. 貢獻

<a href="https://github.com/pomelo925/LinkSight/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=pomelo925/LinkSight" alt="LinkSight contributors" />
</a>

歡迎貢獻！細節請見 [CONTRIBUTING.md](CONTRIBUTING.md)。


<br /><br />

## 5. License

Distributed under the [MIT License](LICENSE).
