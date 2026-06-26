# Block Vault Systems MVP

Block Vault Systems MVP is an AI-driven physical security prototype designed to demonstrate live camera monitoring, event-based alerting, and blockchain-backed audit records. The system combines a React frontend, a Node.js API bridge, and Hyperledger Fabric chaincode to create a verifiable event pipeline for security incidents.

## Overview

This MVP is built to show the core concept of Block Vault Systems:

* live camera-based monitoring
* detector-driven security events
* real-time operational visibility
* immutable blockchain-backed hash logging

The current build focuses on proving the end-to-end workflow:

**camera activity → event detection → API submission → blockchain write → ledger display**

## Repository Structure

### `BlockVault V4/`

Frontend application built with React and Vite.

This folder contains the main operator-facing interface, including:

* dashboard views
* camera detail views
* detector controls
* live event logs
* hash ledger display
* scheduling controls for selected security features

### `BlockVault API/`

Node.js API layer that connects the frontend to Hyperledger Fabric.

This service is responsible for:

* receiving event submissions from the frontend
* generating or normalizing hash payloads
* submitting records to the Fabric network
* returning blockchain-backed event data to the UI
* exposing health and ledger endpoints for testing and integration

### `hashledger-javascript/`

Hyperledger Fabric chaincode for the blockchain event ledger.

This smart contract handles:

* creating hash event records
* retrieving individual records
* retrieving all records
* retrieving records by camera
* updating event status

## Core Features

* Live camera monitoring UI
* Motion, tamper, moved-camera, and zone-entry event detection
* Per-feature scheduling controls
* Dedicated per-camera detail pages
* Hash ledger page grouped by camera
* Blockchain-backed event storage using Hyperledger Fabric
* API bridge for frontend-to-ledger communication
* Real-time event visibility for demo and pilot workflows

## Tech Stack

### Frontend

* React
* Vite
* CSS
* Lucide React

### Backend

* Node.js
* Express
* Hyperledger Fabric Gateway
* gRPC

### Blockchain

* Hyperledger Fabric
* JavaScript chaincode

## High-Level Flow

1. A detector in the frontend identifies an event.
2. The frontend posts the event to the API.
3. The API formats the event payload and submits it to Fabric.
4. The chaincode stores the event as an immutable ledger record.
5. The frontend reads the updated ledger data and displays it in the UI.

## Local Development

### Frontend

From `BlockVault V4/`:

```bash
npm install
npm run dev
```

### API

From `BlockVault API/`:

```bash
npm install
npm run dev
```

### Chaincode

The Fabric network and chaincode must be running separately in the local Hyperledger Fabric environment.

## Notes

* This repository is an MVP / prototype build.
* Generated Fabric network artifacts, local credentials, and large dependency folders should not be committed.
* Cloudflare demo tunnels are temporary and are intended only for short-term preview links.
* Environment-specific URLs should be provided at runtime or through local env configuration.

## Purpose

The goal of this MVP is to validate the product concept for Block Vault Systems by demonstrating that security events can be monitored, logged, and verified through a blockchain-backed audit layer.

## Author

Developed by Jomari Santiago for Block Vault Systems MVP.
