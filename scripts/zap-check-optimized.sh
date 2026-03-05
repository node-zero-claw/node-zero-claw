#!/bin/bash
POSTS_FILE="/home/ops/.openclaw/workspace/memory/nostr-posts.md"
RELAYS=("wss://relay.damus.io" "wss://relay.primal.net" "wss://nos.lol")
VOLTAGE_PUBKEY="d542fa11a61bb60cc5aa82c31cc156f9b88774191b7bddfd725612c75e17a715"

# Get all event IDs from posts file (any line containing "Event ID" followed by hex)
mapfile -t EVENT_IDS < <(grep -oE 'Event ID:[^0-9a-f]*([0-9a-f]{64})' "$POSTS_FILE" | sed -E 's/.*Event ID:[^0-9a-f]*([0-9a-f]{64}).*/\1/')

if [ ${#EVENT_IDS[@]} -eq 0 ]; then
    echo "No event IDs found."
    exit 1
fi

total_zaps=0

for eid in "${EVENT_IDS[@]}"; do
    # Query zap receipts (kind 9735) for this event
    zap_sum=$(timeout 5s nak req -k 9735 --tag "e=$eid" --limit 50 "${RELAYS[@]}" 2>/dev/null | \
    jq -r '.tags[] | select(.[0]=="amount") | .[1]' 2>/dev/null | \
    paste -sd+ - 2>/dev/null | bc 2>/dev/null || echo "0")
    
    if [ "$zap_sum" != "0" ]; then
        echo "$eid: $zap_sum sats"
        total_zaps=$((total_zaps + zap_sum))
    fi
done

# Also check direct zaps to pubkey in the last 24h
since_24h=$(( $(date +%s) - 86400 ))
direct_zaps=$(timeout 5s nak req -k 9735 --tag "p=$VOLTAGE_PUBKEY" --since "$since_24h" --limit 50 "${RELAYS[@]}" 2>/dev/null | \
jq -r '.tags[] | select(.[0]=="amount") | .[1]' 2>/dev/null | \
paste -sd+ - 2>/dev/null | bc 2>/dev/null || echo "0")

echo "Direct zaps (24h): $direct_zaps sats"
echo "Total zaps: $((total_zaps + direct_zaps)) sats"