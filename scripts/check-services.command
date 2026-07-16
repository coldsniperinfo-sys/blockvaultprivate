#!/bin/bash
printf '\n--- Fabric containers ---\n'
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E 'NAMES|peer0|orderer|hashledger' || true
printf '\n--- Hashledger API ---\n'
curl -sS http://localhost:8081/api/health || true
printf '\n\n--- Camera service ---\n'
curl -sS http://localhost:5600/health || true
printf '\n'
