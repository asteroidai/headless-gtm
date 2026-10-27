#!/bin/sh
# Stands in for `claude` in tests. Prints one stream-json result line.
# FAKE_CLAUDE_MODE=fail exits 1; =hang sleeps so the timeout fires.
case "$FAKE_CLAUDE_MODE" in
  fail) echo "boom" >&2; exit 1 ;;
  hang) sleep 30 ;;
esac
printf '{"type":"assistant","message":{"content":[]}}\n'
printf '{"type":"result","subtype":"success","is_error":false,"result":"ran %s","total_cost_usd":0.01}\n' "$2"
