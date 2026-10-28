# Teledentistry Real-Time Clinical Mentorship Platform

A production-ready WebRTC teledentistry platform designed for real-time remote clinical mentorship, enabling junior dentists in rural clinics to connect with senior dental specialists in metro centers.

---

## 🌟 Key Features

### 1. Multi-Feed Video Aggregation
- Aggregates up to three simultaneous video feeds on the clinic PC:
  - **USB Intraoral Camera**: Primary high-magnification macro feed with mirror flip toggle.
  - **Face / Clinician Webcam**: Secondary picture-in-picture communication feed.
  - **Mobile Companion Camera**: Over-the-shoulder situational view paired via dynamic QR code.
- **Flicker-Free "Click to Focus"**: Static `<video>` DOM slots maintain active WebRTC streams without remounting or decoder restarts.
- **Dynamic Track Badging**: Real-time resolution and framerate telemetry queried directly from native hardware tracks.

### 2. Dual-Mode Telestration
- **Live Laser Pointer**: Ephemeral glowing laser strokes synchronized over ultra-low-latency WebRTC DataChannels with 1.2-second automatic decay.
- **Freeze & Annotate Studio**: High-resolution freeze-frame collaborative whiteboard supporting:
  - Multi-color diagnostic drawing (red, cyan, amber, green).
  - FDI World Dental Federation notation badges (`#11`, `#21`, `#36`, `#46`, etc.).
  - Clinical tags (`Caries`, `Fracture`, `Margin Discrepancy`, `Calculus`, `Perio Pocket`).
  - Bi-directional collaborative canvas synchronization via Socket.io.
  - One-click export to diagnostic case summary PDF.
- **Coordinate Invariance**: Mathematical letterbox/pillarbox normalization ensuring pixel-perfect alignment across different display aspect ratios (16:9 monitor, 4:3 iPad, mobile).

### 3. Rural Low-Bandwidth Engine
- Automatic tier adjustment based on sliding window moving average RTT, packet loss, and uplink bitrate:
  - **Optimal (Normal)**: 1080p @ 20fps intraoral + 720p @ 15fps webcam + 720p @ 20fps mobile.
  - **Degraded**: 720p @ 15fps intraoral + 480p @ 10fps webcam.
  - **Critical**: 720p @ 10fps intraoral + 240p @ 5fps webcam (Mobile throttled/paused to protect clinic audio uplink).
- Hysteresis prevention: Requires 3 consecutive degraded ticks to step down, and 4 sustained healthy ticks to step up, preventing visual oscillation.
- Manual toggle: Instant force-override for clinics experiencing intermittent line noise.

### 4. Hands-Free Clinical Workflow
- **Foot Pedal / Spacebar Capture**: Gloves stay sterile—pressing Spacebar or an attached USB foot pedal captures a crystal-clear snapshot of the primary camera.
- **Hardware Native Resolution Capture**: Snapshots are drawn directly from native sensor buffers (1920x1080) using `ImageCapture` / offscreen canvas, unaffected by on-screen CSS downscaling.
- **USB Root Hub Contention Ladder**: Automatically steps down acquisition constraints (`1080p` $\rightarrow$ `720p` $\rightarrow$ `480p`) if adjacent USB ports saturate older motherboard controllers.

### 5. Apple iOS, iPadOS & Safari Hardening
- **Safari Audio Autoplay Gesture Unlock**: Detects suspended WebKit `AudioContext` and presents a one-click unlock gesture banner.
- **iOS Page Visibility API Background Detection**: Detects when mobile companion users switch apps or pull down Control Center, notifying the PC with an amber `"Paused by iOS (Backgrounded)"` banner without dropping signaling.
- **Apple Pencil & iPad Touch Isolation**: Strict `touch-action: none;` on drawing canvases completely prevents Safari viewport gesture scrolling during telestration.
- **CSS-Based Fullscreen Fallback**: Bypasses missing `Element.requestFullscreen()` support on iPhone `<div>` elements with a fixed CSS overlay.
- **Exact Rear Camera Ladder**: Mandates `{ facingMode: { exact: "environment" } }` with automatic fallbacks for over-the-shoulder clinical capture.

### 6. Xirsys STUN/TURN NAT Traversal
- Integrated server-side Xirsys TURN REST API generating dynamic, secure time-limited TURN credentials over UDP, TCP, and TLS (`turns:443`).
- Ensures connectivity through strict hospital/clinic symmetric NATs and mobile 4G/5G carrier firewalls.

---

## 🛠️ Architecture

```
                       +-----------------------------+
                       |      Metro Specialist       |
                       |    (Desktop / iPad Safari)   |
                       +--------------+--------------+
                                      |
                      WebRTC P2P + Xirsys STUN/TURN
                                      |
+--------------------------+          |          +-------------------------+
|   Rural Junior Dentist   |<---------+--------->| Mobile Companion Camera |
| (PC Webcam + USB Wand)   |                     |     (iPhone / Android)  |
+------------+-------------+                     +------------+------------+
             |                                                |
             +-----------------------+------------------------+
                                     |
                       Socket.io Dual-Port Server
                       HTTP :3000 | HTTPS :3443
                                     |
                          +----------+----------+
                          |   Xirsys Cloud REST |
                          |   STUN/TURN API     |
                          +---------------------+
```

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js 18.x or 20.x
- Modern web browser (Chrome, Edge, Safari, Firefox)

### 2. Installation
```bash
git clone https://github.com/kathirmn/teledentistry-platform.git
cd teledentistry-platform
npm install
```

### 3. Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Configure your Xirsys STUN/TURN credentials in `.env.local`:
```env
PORT=3000
HTTPS_PORT=3443

XIRSYS_GATEWAY=https://global.xirsys.net
XIRSYS_IDENT=your_ident
XIRSYS_SECRET=your_secret
XIRSYS_CHANNEL=your_channel
```

### 4. Running the Platform
```bash
# Build the production bundle
npm run build

# Start the dual-port server (HTTP 3000 + HTTPS 3443)
npm start
```

### 5. Accessing the Application
- **Clinic PC Dashboard**: Open [http://localhost:3000](http://localhost:3000)
- **Local LAN Access**: Open `http://<YOUR_LOCAL_IP>:3000`
- **Mobile Companion Camera**: Scan the QR code displayed in the dashboard or navigate to `https://<YOUR_LOCAL_IP>:3443`

---

## 📁 Project Structure

```
├── server.js                    # Dual-port HTTP/HTTPS server + Socket.io + Xirsys TURN proxy
├── src/
│   ├── app/
│   │   ├── api/ice-servers/     # Dynamic REST endpoint for Xirsys STUN/TURN credentials
│   │   ├── room/[roomId]/
│   │   │   ├── page.tsx         # Primary Clinical Mentorship Room (Junior & Senior roles)
│   │   │   └── mobile/page.tsx  # Mobile Companion Camera client (Rear camera optimized)
│   │   ├── layout.tsx           # Global layout & Tailwind configuration
│   │   └── page.tsx             # Lobby & case creation landing page
│   ├── components/
│   │   ├── clinical/            # Video viewports, multi-feed dashboard, case drawer, QR pairing
│   │   ├── communication/       # Session header, in-call chat, latency monitors
│   │   └── telestration/        # Live laser pointer & Freeze & Annotate diagnostic studio
│   ├── hooks/                   # useWebRTC, useBandwidthMonitor, useDeviceEnumeration, useFootPedal
│   └── lib/                     # WebRTC types, coordinate utils, PDF export, dental constants
└── test/                        # Unit tests for telestration coordinate invariance
```

---

## 📄 License
ISC License. Designed for clinical mentorship and educational teledentistry workflows.
