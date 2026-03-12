#!/bin/bash
BASE="http://localhost:3000"
HC="Content-Type: application/json"
TOKEN=$(curl -s $BASE/auth/login -H "$HC" -d '{"email":"admin@apex.com","password":"admin12345"}' | python -c "import sys,json;print(json.load(sys.stdin)['token'])")
H1="Authorization: Bearer $TOKEN"
WH="6fe1aa31-c5ea-463e-9907-12c1035ef308"
DT="1754da7a-19fd-4c30-9fd7-41727f4073b9"
SUPPLIER="1a549c85-6af7-4d03-84ca-4f38e31a7997"
PASS=0; FAIL=0; RESULTS=""
ik() { python -c "import uuid;print(uuid.uuid4())"; }
ok() { local n=$1 d=$2 c=$3; if echo "$c" | grep -qE "^(200|201|204)$"; then PASS=$((PASS+1)); RESULTS="${RESULTS}\n$n | $d | $c | PASS"; else FAIL=$((FAIL+1)); RESULTS="${RESULTS}\n$n | $d | $c | FAIL"; fi; }
c() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
j() { curl -s "$@"; }

PROD_ID=$(j "$BASE/products?limit=1" -H "$H1" -H "X-Location-ID: $DT" | python -c "import sys,json;print(json.load(sys.stdin)['data'][0]['id'])")
UP=$(j "$BASE/products?limit=1" -H "$H1" -H "X-Location-ID: $DT" | python -c "import sys,json;print(json.load(sys.stdin)['data'][0]['unitPrice'])")

# ========== SALES ==========
SR=$(j -X POST "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"locationId\":\"$DT\",\"lines\":[{\"productId\":\"$PROD_ID\",\"quantity\":1,\"unitPrice\":$UP}]}")
SALE_ID=$(echo "$SR" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('sale',d).get('id',''))")
[ -n "$SALE_ID" ] && ok "T48" "Create sale" "201" || ok "T48" "Create sale" "400"
ok "T56" "List sales" "$(c "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT")"
ok "T57" "Get sale by ID" "$(c "$BASE/sales/$SALE_ID" -H "$H1" -H "X-Location-ID: $DT")"

# Lifecycle: park -> resume -> complete(CASH) -> journal -> refund
ok "T62" "Park sale" "$(c -X POST "$BASE/sales/$SALE_ID/park" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" -d '{}')"
ok "T63" "Resume sale" "$(c -X POST "$BASE/sales/$SALE_ID/resume" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" -d '{}')"
IK=$(ik)
ok "T64" "Complete (CASH)" "$(c -X POST "$BASE/sales/$SALE_ID/complete" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"idempotencyKey\":\"$IK\",\"payments\":[{\"method\":\"CASH\",\"amount\":\"$UP\"}]}")"
ok "T65" "Sale journal" "$(c "$BASE/sales/$SALE_ID/journal" -H "$H1" -H "X-Location-ID: $DT")"

# Refund
IK=$(ik)
ok "T66" "Refund sale" "$(c -X POST "$BASE/sales/$SALE_ID/refund" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"idempotencyKey\":\"$IK\",\"notes\":\"Return\"}")"

# All 5 payment methods (CASH CARD EFT ACCOUNT OTHER)
for METHOD in CASH CARD EFT ACCOUNT OTHER; do
  SR=$(j -X POST "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
    -d "{\"locationId\":\"$DT\",\"lines\":[{\"productId\":\"$PROD_ID\",\"quantity\":1,\"unitPrice\":$UP}]}")
  SID=$(echo "$SR" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('sale',d).get('id',''))")
  IK=$(ik)
  ok "   " "$METHOD payment" "$(c -X POST "$BASE/sales/$SID/complete" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
    -d "{\"idempotencyKey\":\"$IK\",\"payments\":[{\"method\":\"$METHOD\",\"amount\":\"$UP\"}]}")"
done

# Void
VR=$(j -X POST "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"locationId\":\"$DT\",\"lines\":[{\"productId\":\"$PROD_ID\",\"quantity\":1,\"unitPrice\":$UP}]}")
VID=$(echo "$VR" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('sale',d).get('id',''))")
ok "T67" "Void sale" "$(c -X POST "$BASE/sales/$VID/void" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" -d '{"reason":"Void test"}')"

# By number
SN=$(j "$BASE/sales?limit=1" -H "$H1" -H "X-Location-ID: $DT" | python -c "import sys,json;print(json.load(sys.stdin)['data'][0]['saleNo'])")
ok "T68" "Get sale by number" "$(c "$BASE/sales/by-number/$SN" -H "$H1" -H "X-Location-ID: $DT")"

# Edge cases
ok "T59" "Empty lines" "$(c -X POST "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" -d "{\"locationId\":\"$DT\",\"lines\":[]}")"
ok "T61" "Neg qty" "$(c -X POST "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" -d "{\"locationId\":\"$DT\",\"lines\":[{\"productId\":\"$PROD_ID\",\"quantity\":-1,\"unitPrice\":$UP}]}")"

# ========== ADJUSTMENTS ==========
IK=$(ik)
ok "T40" "Adjustment IN" "$(c -X POST "$BASE/inventory/adjustments" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"productId\":\"$PROD_ID\",\"locationId\":\"$DT\",\"quantity\":10,\"direction\":\"IN\",\"reasonCode\":\"COUNT_GAIN\",\"notes\":\"test\",\"idempotencyKey\":\"$IK\"}")"

IK=$(ik)
ok "T41" "Adjustment OUT" "$(c -X POST "$BASE/inventory/adjustments" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"productId\":\"$PROD_ID\",\"locationId\":\"$DT\",\"quantity\":3,\"direction\":\"OUT\",\"reasonCode\":\"DAMAGE_WAREHOUSE\",\"notes\":\"test\",\"idempotencyKey\":\"$IK\"}")"

# ========== TRANSFERS (requestedQty, idempotencyKey) ==========
TR=$(j -X POST "$BASE/transfers" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" \
  -d "{\"sourceLocationId\":\"$WH\",\"destinationLocationId\":\"$DT\",\"items\":[{\"productId\":\"$PROD_ID\",\"requestedQty\":5}]}")
XFER_ID=$(echo "$TR" | python -c "import sys,json;d=json.load(sys.stdin);t=d.get('transfer',d);print(t.get('id',''))" 2>/dev/null)
if [ -n "$XFER_ID" ] && [ "$XFER_ID" != "" ]; then
  ok "T70" "Create transfer" "201"
  ok "T71" "Get transfer" "$(c "$BASE/transfers/$XFER_ID" -H "$H1" -H "X-Location-ID: $WH")"
  IK=$(ik); ok "T72" "Approve" "$(c -X POST "$BASE/transfers/$XFER_ID/approve" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" -d "{\"idempotencyKey\":\"$IK\"}")"
  IK=$(ik); ok "T73" "Start picking" "$(c -X POST "$BASE/transfers/$XFER_ID/start-picking" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" -d "{\"idempotencyKey\":\"$IK\"}")"
  IK=$(ik); ok "T74" "Dispatch" "$(c -X POST "$BASE/transfers/$XFER_ID/dispatch" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" -d "{\"idempotencyKey\":\"$IK\"}")"
  IK=$(ik); ok "T75" "Receive" "$(c -X POST "$BASE/transfers/$XFER_ID/receive" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
    -d "{\"idempotencyKey\":\"$IK\",\"lines\":[{\"productId\":\"$PROD_ID\",\"receivedQty\":5}]}")"
  ok "T76" "Transfer journal" "$(c "$BASE/transfers/$XFER_ID/journal" -H "$H1" -H "X-Location-ID: $WH")"
else
  ok "T70" "Create transfer" "400"
fi

# Cancel
TR2=$(j -X POST "$BASE/transfers" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" \
  -d "{\"sourceLocationId\":\"$WH\",\"destinationLocationId\":\"$DT\",\"items\":[{\"productId\":\"$PROD_ID\",\"requestedQty\":2}]}")
CID=$(echo "$TR2" | python -c "import sys,json;d=json.load(sys.stdin);t=d.get('transfer',d);print(t.get('id',''))" 2>/dev/null)
if [ -n "$CID" ]; then
  IK=$(ik); ok "T77" "Cancel transfer" "$(c -X POST "$BASE/transfers/$CID/cancel" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" -d "{\"idempotencyKey\":\"$IK\",\"reason\":\"test\"}")"
fi

# ========== PROCUREMENT (orderedQty, idempotencyKey) ==========
ok "T78" "List suppliers" "$(c "$BASE/procurement/suppliers" -H "$H1" -H "X-Location-ID: $WH")"
ok "T79" "List POs" "$(c "$BASE/procurement/purchase-orders" -H "$H1" -H "X-Location-ID: $WH")"

PR=$(j -X POST "$BASE/procurement/purchase-orders" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" \
  -d "{\"supplierId\":\"$SUPPLIER\",\"destinationLocationId\":\"$WH\",\"lines\":[{\"productId\":\"$PROD_ID\",\"orderedQty\":20,\"unitCost\":\"10.00\"}]}")
PO_ID=$(echo "$PR" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
if [ -n "$PO_ID" ] && [ "$PO_ID" != "" ]; then
  ok "T80" "Create PO" "201"
  ok "T81" "Get PO" "$(c "$BASE/procurement/purchase-orders/$PO_ID" -H "$H1" -H "X-Location-ID: $WH")"
  IK=$(ik); ok "T82" "Submit PO" "$(c -X POST "$BASE/procurement/purchase-orders/$PO_ID/submit" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" -d "{\"idempotencyKey\":\"$IK\"}")"
  IK=$(ik); ok "T83" "Receive PO" "$(c -X POST "$BASE/procurement/purchase-orders/$PO_ID/receive" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" \
    -d "{\"idempotencyKey\":\"$IK\",\"lines\":[{\"poLineId\":\"dummy\",\"receivedQty\":20}]}")"
  ok "T84" "PO journal" "$(c "$BASE/procurement/purchase-orders/$PO_ID/journal" -H "$H1" -H "X-Location-ID: $WH")"
else
  ok "T80" "Create PO" "400"
fi

# Cancel PO
PR2=$(j -X POST "$BASE/procurement/purchase-orders" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" \
  -d "{\"supplierId\":\"$SUPPLIER\",\"destinationLocationId\":\"$WH\",\"lines\":[{\"productId\":\"$PROD_ID\",\"orderedQty\":5,\"unitCost\":\"8.00\"}]}")
CPOID=$(echo "$PR2" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
if [ -n "$CPOID" ]; then
  IK=$(ik); ok "T85" "Cancel PO" "$(c -X POST "$BASE/procurement/purchase-orders/$CPOID/cancel" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" -d "{\"idempotencyKey\":\"$IK\",\"reason\":\"test\"}")"
fi

echo ""
echo "=============================================="
printf "$RESULTS\n"
echo ""
echo "  TOTALS: $PASS PASS / $FAIL FAIL"
echo "=============================================="
