#!/bin/bash
# Apex POS API Test Suite v3 — Correct schemas
BASE="http://localhost:3000"
HC="Content-Type: application/json"
TOKEN=$(curl -s $BASE/auth/login -H "$HC" -d '{"email":"admin@apex.com","password":"admin12345"}' | python -c "import sys,json;print(json.load(sys.stdin)['token'])" 2>/dev/null)
H1="Authorization: Bearer $TOKEN"
WH="6fe1aa31-c5ea-463e-9907-12c1035ef308"
DT="1754da7a-19fd-4c30-9fd7-41727f4073b9"
UT="ee723818-293a-43df-b849-3479d4ef517e"
SUPPLIER="1a549c85-6af7-4d03-84ca-4f38e31a7997"
PASS=0; FAIL=0; RESULTS=""
ik() { python -c "import uuid;print(uuid.uuid4())"; }
ok() { local n=$1 d=$2 c=$3; if echo "$c" | grep -qE "^(200|201|204)$"; then PASS=$((PASS+1)); RESULTS="$RESULTS\n$n | $d | $c | PASS"; else FAIL=$((FAIL+1)); RESULTS="$RESULTS\n$n | $d | $c | FAIL"; fi; }
c() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
j() { curl -s "$@"; }

PROD_ID=$(j "$BASE/products?limit=1" -H "$H1" -H "X-Location-ID: $DT" | python -c "import sys,json;print(json.load(sys.stdin)['data'][0]['id'])")
UP=$(j "$BASE/products?limit=1" -H "$H1" -H "X-Location-ID: $DT" | python -c "import sys,json;print(json.load(sys.stdin)['data'][0]['unitPrice'])")

# ======== SALES CREATE & LIST ========
echo "=== SALES ==="
SALE_RESP=$(j -X POST "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"locationId\":\"$DT\",\"lines\":[{\"productId\":\"$PROD_ID\",\"quantity\":1,\"unitPrice\":$UP}]}")
SALE_ID=$(echo "$SALE_RESP" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('sale',d).get('id',''))")
[ -n "$SALE_ID" ] && ok "T48" "POST /sales (create)" "201" || ok "T48" "POST /sales" "400"

ok "T56" "GET /sales" "$(c "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT")"
ok "T57" "GET /sales/:id" "$(c "$BASE/sales/$SALE_ID" -H "$H1" -H "X-Location-ID: $DT")"
ok "T59" "POST /sales (empty lines)" "$(c -X POST "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" -d "{\"locationId\":\"$DT\",\"lines\":[]}")"
ok "T61" "POST /sales (neg qty)" "$(c -X POST "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" -d "{\"locationId\":\"$DT\",\"lines\":[{\"productId\":\"$PROD_ID\",\"quantity\":-1,\"unitPrice\":$UP}]}")"

# ======== SALE LIFECYCLE ========
echo "=== LIFECYCLE ==="
# Park
ok "T62" "POST /sales/park" "$(c -X POST "$BASE/sales/$SALE_ID/park" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" -d '{}')"

# Resume
ok "T63" "POST /sales/resume" "$(c -X POST "$BASE/sales/$SALE_ID/resume" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" -d '{}')"

# Complete (amount as STRING, idempotencyKey required)
IK=$(ik)
ok "T64" "POST /sales/complete (Cash)" "$(c -X POST "$BASE/sales/$SALE_ID/complete" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"idempotencyKey\":\"$IK\",\"payments\":[{\"method\":\"CASH\",\"amount\":\"$UP\"}]}")"

ok "T65" "GET /sales/journal" "$(c "$BASE/sales/$SALE_ID/journal" -H "$H1" -H "X-Location-ID: $DT")"

# Refund (need actual sale line ID)
LINE_ID=$(j "$BASE/sales/$SALE_ID" -H "$H1" -H "X-Location-ID: $DT" | python -c "import sys,json;d=json.load(sys.stdin);lines=d.get('lines',d.get('saleLines',[]));print(lines[0]['id'] if lines else '')" 2>/dev/null)
IK=$(ik)
RC=$(c -X POST "$BASE/sales/$SALE_ID/refund" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"idempotencyKey\":\"$IK\",\"reason\":\"Return\",\"lines\":[{\"saleLineId\":\"$LINE_ID\",\"quantity\":1}]}")
ok "T66" "POST /sales/refund" "$RC"

# ======== 7 PAYMENT METHODS ========
echo "=== ALL 7 PAYMENT METHODS ==="
for METHOD in CASH CREDIT_CARD DEBIT_CARD QRPH GCASH MAYA BANK_TRANSFER; do
  SR=$(j -X POST "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
    -d "{\"locationId\":\"$DT\",\"lines\":[{\"productId\":\"$PROD_ID\",\"quantity\":1,\"unitPrice\":$UP}]}")
  SID=$(echo "$SR" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('sale',d).get('id',''))")
  IK=$(ik)
  CC=$(c -X POST "$BASE/sales/$SID/complete" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
    -d "{\"idempotencyKey\":\"$IK\",\"payments\":[{\"method\":\"$METHOD\",\"amount\":\"$UP\"}]}")
  ok "   " "$METHOD payment" "$CC"
done

# Void
echo "=== VOID ==="
VR=$(j -X POST "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"locationId\":\"$DT\",\"lines\":[{\"productId\":\"$PROD_ID\",\"quantity\":1,\"unitPrice\":$UP}]}")
VID=$(echo "$VR" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('sale',d).get('id',''))")
ok "T67" "POST /sales/void" "$(c -X POST "$BASE/sales/$VID/void" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" -d '{"reason":"Void test"}')"

# By number
SALE_NO=$(j "$BASE/sales?limit=1" -H "$H1" -H "X-Location-ID: $DT" | python -c "import sys,json;d=json.load(sys.stdin);print(d['data'][0]['saleNo'])")
ok "T68" "GET /sales/by-number" "$(c "$BASE/sales/by-number/$SALE_NO" -H "$H1" -H "X-Location-ID: $DT")"

# ======== ADJUSTMENTS ========
echo "=== ADJUSTMENTS ==="
IK=$(ik)
ok "T40" "POST /adjust IN (COUNT_GAIN)" "$(c -X POST "$BASE/inventory/adjustments" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"productId\":\"$PROD_ID\",\"locationId\":\"$DT\",\"quantity\":10,\"direction\":\"IN\",\"reasonCode\":\"COUNT_GAIN\",\"notes\":\"test\",\"idempotencyKey\":\"$IK\"}")"

IK=$(ik)
ok "T41" "POST /adjust OUT (DAMAGE_WAREHOUSE)" "$(c -X POST "$BASE/inventory/adjustments" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"productId\":\"$PROD_ID\",\"locationId\":\"$DT\",\"quantity\":3,\"direction\":\"OUT\",\"reasonCode\":\"DAMAGE_WAREHOUSE\",\"notes\":\"test\",\"idempotencyKey\":\"$IK\"}")"

# Zero qty
IK=$(ik)
ok "T42" "POST /adjust qty=0" "$(c -X POST "$BASE/inventory/adjustments" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"productId\":\"$PROD_ID\",\"locationId\":\"$DT\",\"quantity\":0,\"direction\":\"IN\",\"reasonCode\":\"COUNT_GAIN\",\"notes\":\"test\",\"idempotencyKey\":\"$IK\"}")"

# ======== INVENTORY COUNTS ========
echo "=== COUNTS ==="
CR=$(j -X POST "$BASE/inventory/counts" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"locationId\":\"$DT\",\"label\":\"Test Count\",\"scope\":\"FULL_LOCATION\"}")
COUNTID=$(echo "$CR" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
[ -n "$COUNTID" ] && ok "T46" "POST /inventory/counts" "201" || ok "T46" "POST /inventory/counts" "400"
[ -n "$COUNTID" ] && ok "T47" "GET /inventory/counts/:id" "$(c "$BASE/inventory/counts/$COUNTID" -H "$H1" -H "X-Location-ID: $DT")"

# ======== TRANSFERS (requestedQty, idempotencyKey on lifecycle) ========
echo "=== TRANSFERS ==="
TR=$(j -X POST "$BASE/transfers" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" \
  -d "{\"sourceLocationId\":\"$WH\",\"destinationLocationId\":\"$DT\",\"items\":[{\"productId\":\"$PROD_ID\",\"requestedQty\":5}]}")
XFER_ID=$(echo "$TR" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
if [ -n "$XFER_ID" ] && [ "$XFER_ID" != "" ]; then
  ok "T70" "POST /transfers" "201"
  ok "T71" "GET /transfers/:id" "$(c "$BASE/transfers/$XFER_ID" -H "$H1" -H "X-Location-ID: $WH")"

  IK=$(ik)
  ok "T72" "POST /transfers/approve" "$(c -X POST "$BASE/transfers/$XFER_ID/approve" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" -d "{\"idempotencyKey\":\"$IK\"}")"

  IK=$(ik)
  ok "T73" "POST /transfers/start-picking" "$(c -X POST "$BASE/transfers/$XFER_ID/start-picking" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" -d "{\"idempotencyKey\":\"$IK\"}")"

  IK=$(ik)
  ok "T74" "POST /transfers/dispatch" "$(c -X POST "$BASE/transfers/$XFER_ID/dispatch" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" -d "{\"idempotencyKey\":\"$IK\"}")"

  IK=$(ik)
  ok "T75" "POST /transfers/receive" "$(c -X POST "$BASE/transfers/$XFER_ID/receive" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
    -d "{\"idempotencyKey\":\"$IK\",\"items\":[{\"productId\":\"$PROD_ID\",\"receivedQty\":5}]}")"

  ok "T76" "GET /transfers/journal" "$(c "$BASE/transfers/$XFER_ID/journal" -H "$H1" -H "X-Location-ID: $WH")"
else
  ok "T70" "POST /transfers" "400"
fi

# Cancel
TR2=$(j -X POST "$BASE/transfers" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" \
  -d "{\"sourceLocationId\":\"$WH\",\"destinationLocationId\":\"$DT\",\"items\":[{\"productId\":\"$PROD_ID\",\"requestedQty\":2}]}")
CID=$(echo "$TR2" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
if [ -n "$CID" ]; then
  IK=$(ik)
  ok "T77" "POST /transfers/cancel" "$(c -X POST "$BASE/transfers/$CID/cancel" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" -d "{\"idempotencyKey\":\"$IK\",\"reason\":\"Cancel test\"}")"
fi

# ======== PROCUREMENT ========
echo "=== PROCUREMENT ==="
ok "T78" "GET /procurement/suppliers" "$(c "$BASE/procurement/suppliers" -H "$H1" -H "X-Location-ID: $WH")"
ok "T79" "GET /procurement/purchase-orders" "$(c "$BASE/procurement/purchase-orders" -H "$H1" -H "X-Location-ID: $WH")"

PR=$(j -X POST "$BASE/procurement/purchase-orders" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" \
  -d "{\"supplierId\":\"$SUPPLIER\",\"destinationLocationId\":\"$WH\",\"lines\":[{\"productId\":\"$PROD_ID\",\"quantity\":20,\"unitCost\":\"10.00\"}]}")
PO_ID=$(echo "$PR" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
if [ -n "$PO_ID" ] && [ "$PO_ID" != "" ]; then
  ok "T80" "POST /procurement/po" "201"
  ok "T81" "GET /procurement/po/:id" "$(c "$BASE/procurement/purchase-orders/$PO_ID" -H "$H1" -H "X-Location-ID: $WH")"

  IK=$(ik)
  ok "T82" "POST /procurement/po/submit" "$(c -X POST "$BASE/procurement/purchase-orders/$PO_ID/submit" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" -d "{\"idempotencyKey\":\"$IK\"}")"

  IK=$(ik)
  ok "T83" "POST /procurement/po/receive" "$(c -X POST "$BASE/procurement/purchase-orders/$PO_ID/receive" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" \
    -d "{\"idempotencyKey\":\"$IK\",\"items\":[{\"productId\":\"$PROD_ID\",\"receivedQty\":20}]}")"

  ok "T84" "GET /procurement/po/journal" "$(c "$BASE/procurement/purchase-orders/$PO_ID/journal" -H "$H1" -H "X-Location-ID: $WH")"
else
  ok "T80" "POST /procurement/po" "400"
fi

# Cancel PO
PR2=$(j -X POST "$BASE/procurement/purchase-orders" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" \
  -d "{\"supplierId\":\"$SUPPLIER\",\"destinationLocationId\":\"$WH\",\"lines\":[{\"productId\":\"$PROD_ID\",\"quantity\":5,\"unitCost\":\"8.00\"}]}")
CPOID=$(echo "$PR2" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
if [ -n "$CPOID" ]; then
  IK=$(ik)
  ok "T85" "POST /procurement/po/cancel" "$(c -X POST "$BASE/procurement/purchase-orders/$CPOID/cancel" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" -d "{\"idempotencyKey\":\"$IK\",\"reason\":\"Cancel\"}")"
fi

echo ""
echo "=============================================="
printf "$RESULTS\n"
echo ""
echo "  TOTALS: $PASS PASS / $FAIL FAIL"
echo "=============================================="
