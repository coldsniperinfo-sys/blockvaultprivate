# Block Vault Systems — V4 Camera and Blockchain MVP

Block Vault Systems V4 is a camera-event monitoring and blockchain audit platform.

The system processes live Axis camera streams, detects security events, generates cryptographic evidence and metadata hashes, submits those records through the BlockVault API, and anchors them to Hyperledger Fabric.

## Current MVP capabilities

- Live Axis network-camera support
- Multi-camera monitoring dashboard
- Individual camera detail views
- Motion and high-motion detection
- Camera-moved detection
- Camera tamper and lens-obstruction detection
- Restricted-zone entry detection
- After-hours detector scheduling
- SHA-256 evidence and metadata hashing
- Hyperledger Fabric transaction submission
- Camera-specific blockchain history
- Real-time `HASH ANCHORED` confirmations

The complete application flow currently works in the local development environment.

Permanent hosting, domain routing, secure production configuration, and infrastructure deployment remain separate production-integration responsibilities.

## System architecture

```text
Axis Cameras
    |
    v
camera-service
Axis authentication and browser-safe MJPEG proxy
    |
    v
frontend-v4
Camera monitoring, detection, evidence capture, and event submission
    |
    v
blockvault-api
Validation, Fabric connectivity, transaction submission, and queries
    |
    v
Hyperledger Fabric
Hashledger chaincode and immutable audit records
    |
    v
frontend-v4
Anchored transaction status and camera-specific history
```

## Repository components

### `frontend-v4`

React and Vite monitoring interface.

Primary responsibilities:

- Display live camera feeds
- Run camera-event detectors
- Capture frame evidence
- Generate evidence and metadata payloads
- Submit security events to the BlockVault API
- Display transaction states
- Query camera-specific blockchain history

### `camera-service`

Local or edge-hosted Axis camera proxy.

Primary responsibilities:

- Authenticate with configured Axis cameras
- Keep camera credentials out of browser code
- Expose browser-compatible MJPEG streams
- Report camera connectivity

Camera credentials must remain in a local `.env` file and must never be committed.

### `blockvault-api`

Node.js interface between the V4 frontend and Hyperledger Fabric.

Primary responsibilities:

- Validate submitted events
- Connect to the Fabric Gateway
- Submit records to Hashledger chaincode
- Query records by camera and event
- Report Fabric connectivity

Primary API endpoints:

```text
GET  /api/health
GET  /api/config
GET  /api/hashes
GET  /api/hashes/grouped
GET  /api/hashes/by-camera/:cameraId
GET  /api/hashes/event/:id
POST /api/hashes
```

### `hashledger-javascript`

Hyperledger Fabric chaincode for storing BlockVault security-event hashes and audit records.

### `scripts`

Local helper scripts for starting services and checking system health.

## Security requirements

The repository must never contain:

- Camera usernames or passwords
- Real `.env` or `.env.local` files
- API keys or access tokens
- Temporary tunnel credentials
- Fabric wallets
- Fabric private keys or certificates
- Evidence images or snapshots
- Private network configuration
- Developer-specific filesystem paths
- `node_modules`
- Generated build output
- Application logs containing private data

Only sanitized `.env.example` files may be committed.

Camera credentials must remain within `camera-service/.env` on the authorized edge or local system.

Fabric identity and cryptographic material must remain outside the Git repository.

## Prerequisites

- Node.js
- npm
- Docker Desktop or a compatible Docker environment
- A running Hyperledger Fabric network
- Deployed Hashledger chaincode
- Fabric connection and identity material stored outside Git
- Reachable Axis cameras for physical-camera operation

## Local configuration

### BlockVault API

```bash
cd blockvault-api
cp .env.example .env
```

Configure the Fabric network path and connection settings inside:

```text
blockvault-api/.env
```

Do not commit this file.

### Camera service

```bash
cd camera-service
cp .env.example .env
```

Add authorized Axis camera connection details inside:

```text
camera-service/.env
```

Do not place camera credentials in frontend source code or committed files.

### V4 frontend

```bash
cd frontend-v4
cp .env.example .env.local
```

Default local service addresses:

```text
BlockVault API: http://localhost:8081
Camera service: http://localhost:5600
Frontend:       http://localhost:5173
```

## Install dependencies

Install each application separately:

```bash
cd blockvault-api
npm ci

cd ../camera-service
npm ci

cd ../frontend-v4
npm ci
```

Install chaincode dependencies only when developing or deploying the chaincode:

```bash
cd ../hashledger-javascript
npm ci
```

## Local startup order

### 1. Start Hyperledger Fabric

Start the configured Fabric network.

Confirm that the required channel and Hashledger chaincode are available before starting the API.

### 2. Start the BlockVault API

```bash
cd blockvault-api
npm run dev
```

Verify:

```bash
curl http://localhost:8081/api/health
```

### 3. Start the camera service

```bash
cd camera-service
npm run dev
```

Verify:

```bash
curl http://localhost:5600/health
```

A configured camera stream is exposed through a route such as:

```text
http://localhost:5600/camera/CAM-01
```

### 4. Start the V4 frontend

```bash
cd frontend-v4
npm run dev -- --host 0.0.0.0 --port 5173
```

Open:

```text
http://localhost:5173
```

## Verification workflow

A successful end-to-end test should demonstrate:

```text
Axis camera
→ camera service
→ V4 detector
→ frame evidence capture
→ SHA-256 evidence and metadata hashes
→ BlockVault API
→ Hyperledger Fabric transaction
→ anchored transaction confirmation
→ camera-specific blockchain history
```

Recommended verification sequence:

1. Confirm the BlockVault API reports a healthy Fabric connection.
2. Confirm the camera service reports configured cameras as reachable.
3. Open each camera in V4.
4. Allow detector baselines to initialize or set them manually.
5. Trigger a supported camera event.
6. Confirm the event appears in the interface.
7. Confirm the event progresses to `HASH ANCHORED`.
8. Query the camera’s blockchain history.
9. Repeat for each configured camera.

## Detector baselines

Camera-moved and tamper detection compare the current view against a clean reference view.

The system automatically learns an initial reference after startup.

Operators may also select **Set Baseline** to capture and lock the current clean view immediately.

A new baseline should be set after:

- Repositioning a camera
- Changing the monitored scene
- Major lighting or exposure changes
- Restarting the application before a controlled demonstration

## Production deployment

The finalized frontend and supporting services are intended to be integrated into the permanent Block Vault Systems hosted environment.

Production deployment should include:

- Permanent Block Vault domain routing
- TLS termination
- Secure secret management
- Managed and persistent services
- Restricted camera-network access
- Fabric identity provisioning
- Centralized operational logging
- Health monitoring
- Restart policies
- Evidence-retention controls
- Backup and recovery procedures

Local development credentials, temporary tunnels, private network addresses, and machine-specific paths must not be reused as production configuration.

## Git workflow

New development should use feature branches and pull requests.

Before every commit and push, review:

```bash
git status
git diff --cached
```

Confirm that no credentials, secrets, environment files, evidence captures, dependency folders, generated files, or private infrastructure configuration are staged.
