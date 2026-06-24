#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/voice_agent"
exec python main.py
