#!/bin/bash
TOKEN="985be5a0e24b41b1c193a3897b91e1dc9854418ba4b22d063ac251a695a6a10d"
USER_UID="jcexCW6JHoQxSoGJYAICopk5gWp2"
URL="https://lifelog-orpin.vercel.app/api/widget/calories?uid=${USER_UID}"

echo "--- Request ---"
echo "URL: $URL"
echo ""
echo "--- Response ---"
curl -i -H "x-widget-token: $TOKEN" "$URL"
echo ""
