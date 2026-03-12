#!/bin/bash
BASE="http://localhost:3000"
HC="Content-Type: application/json"
TOKEN=$(curl -s $BASE/auth/login -H "$HC" -d '{"email":"admin@apex.com","password":"admin12345"}' | python -c "import sys,json;print(json.load(sys.stdin)['token'])" 2>/dev/null)
H1="Authorization: Bearer $TOKEN"
WH="6fe1aa31-c5ea-463e-9907-12c1035ef308"
DT="1754da7a-19fd-4c30-9fd7-41727f4073b9"
UT="ee723818-293a-43df-b849-3479d4ef517e"
PASS=0; FAIL=0; RESULTS=""
ok() { local n=$1 d=$2 c=$3; if echo "$c" | grep -qE "^(200|201|204)$"; then PASS=$((PASS+1)); RESULTS="$RESULTS\n$n | $d | $c | PASS"; else FAIL=$((FAIL+1)); RESULTS="$RESULTS\n$n | $d | $c | FAIL"; fi; }
c() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
j() { curl -s "$@"; }

PROD_ID=$(j "$BASE/products?limit=1" -H "$H1" -H "X-Location-ID: $DT" | python -c "import sys,json;print(json.load(sys.stdin)['data'][0]['id'])" 2>/dev/null)
UP=$(j "$BASE/products?limit=1" -H "$H1" -H "X-Location-ID: $DT" | python -c "import sys,json;print(json.load(sys.stdin)['data'][0]['unitPrice'])" 2>/dev/null)
SUPPLIER="1a549c85-6af7-4d03-84ca-4f38e31a7997"

# ============ SALES ============
echo "=== SALES ==="
# Create sale (OPEN status, no payment needed yet)
SALE_RESP=$(j -X POST "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"locationId\":\"$DT\",\"lines\":[{\"productId\":\"$PROD_ID\",\"quantity\":1,\"unitPrice\":$UP}]}")
SALE_ID=$(echo "$SALE_RESP" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('sale',d).get('id',''))" 2>/dev/null)
if [ -n "$SALE_ID" ] && [ "$SALE_ID" != "" ]; then
  ok "T48" "POST /sales (create OPEN)" "201"
else
  ok "T48" "POST /sales (create)" "400"
fi

# T56: List
ok "T56" "GET /sales" "$(c "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT")"

# T57: Get by ID
ok "T57" "GET /sales/:id" "$(c "$BASE/sales/$SALE_ID" -H "$H1" -H "X-Location-ID: $DT")"

# T59: Empty lines
ok "T59" "POST /sales (empty lines)" "$(c -X POST "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" -d "{\"locationId\":\"$DT\",\"lines\":[]}")"

# T61: Neg qty
ok "T61" "POST /sales (neg qty)" "$(c -X POST "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" -d "{\"locationId\":\"$DT\",\"lines\":[{\"productId\":\"$PROD_ID\",\"quantity\":-1,\"unitPrice\":$UP}]}")"

# === SALE LIFECYCLE: park -> resume -> complete with payments -> refund ===
echo "=== SALE LIFECYCLE ==="
ok "T62" "POST /sales/:id/park" "$(c -X POST "$BASE/sales/$SALE_ID/park" -H "$H1" -H "X-Location-ID: $DT" -H "$HC")"
ok "T63" "POST /sales/:id/resume" "$(c -X POST "$BASE/sales/$SALE_ID/resume" -H "$H1" -H "X-Location-ID: $DT" -H "$HC")"

# Complete with Cash payment
COMP_CODE=$(c -X POST "$BASE/sales/$SALE_ID/complete" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"payments\":[{\"method\":\"CASH\",\"amount\":$UP}]}")
ok "T64" "POST /sales/:id/complete (Cash)" "$COMP_CODE"

ok "T65" "GET /sales/:id/journal" "$(c "$BASE/sales/$SALE_ID/journal" -H "$H1" -H "X-Location-ID: $DT")"

# Refund
REFUND_CODE=$(c -X POST "$BASE/sales/$SALE_ID/refund" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"reason\":\"Return\",\"lines\":[{\"saleLineId\":\"dummy\",\"quantity\":1}]}")
ok "T66" "POST /sales/:id/refund" "$REFUND_CODE"

# === ALL 7 PAYMENT METHODS ===
echo "=== PAYMENT METHODS ==="
for METHOD in CASH CREDIT_CARD DEBIT_CARD QRPH GCASH MAYA BANK_TRANSFER; do
  SR=$(j -X POST "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
    -d "{\"locationId\":\"$DT\",\"lines\":[{\"productId\":\"$PROD_ID\",\"quantity\":1,\"unitPrice\":$UP}]}")
  SID=$(echo "$SR" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('sale',d).get('id',''))" 2>/dev/null)
  if [ -n "$SID" ]; then
    CC=$(c -X POST "$BASE/sales/$SID/complete" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
      -d "{\"payments\":[{\"method\":\"$METHOD\",\"amount\":$UP}]}")
    ok "    " "Complete ($METHOD)" "$CC"
  else
    ok "    " "Complete ($METHOD)" "ERR"
  fi
done

# Void
echo "=== VOID ==="
VR=$(j -X POST "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"locationId\":\"$DT\",\"lines\":[{\"productId\":\"$PROD_ID\",\"quantity\":1,\"unitPrice\":$UP}]}")
VID=$(echo "$VR" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('sale',d).get('id',''))" 2>/dev/null)
ok "T67" "POST /sales/:id/void" "$(c -X POST "$BASE/sales/$VID/void" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" -d '{"reason":"Test void"}')"

# By sale number
SALE_NO=$(j "$BASE/sales?limit=1" -H "$H1" -H "X-Location-ID: $DT" | python -c "import sys,json;d=json.load(sys.stdin);data=d.get('data',d);print(data[0].get('saleNo',''))" 2>/dev/null)
ok "T68" "GET /sales/by-number/$SALE_NO" "$(c "$BASE/sales/by-number/$SALE_NO" -H "$H1" -H "X-Location-ID: $DT")"

# ============ INVENTORY ADJUSTMENTS ============
echo "=== ADJUSTMENTS ==="
IK=$(python -c "import uuid;print(uuid.uuid4())")
ok "T40" "POST /adjustments IN" "$(c -X POST "$BASE/inventory/adjustments" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"productId\":\"$PROD_ID\",\"locationId\":\"$DT\",\"quantity\":10,\"direction\":\"IN\",\"reasonCode\":\"RECOUNT\",\"notes\":\"test\",\"idempotencyKey\":\"$IK\"}")"

IK=$(python -c "import uuid;print(uuid.uuid4())")
ok "T41" "POST /adjustments OUT" "$(c -X POST "$BASE/inventory/adjustments" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"productId\":\"$PROD_ID\",\"locationId\":\"$DT\",\"quantity\":3,\"direction\":\"OUT\",\"reasonCode\":\"DAMAGED\",\"notes\":\"test\",\"idempotencyKey\":\"$IK\"}")"

# ============ INVENTORY COUNTS ============
echo "=== INV COUNTS ==="
CR=$(j -X POST "$BASE/inventory/counts" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"locationId\":\"$DT\",\"label\":\"Test Count\",\"scope\":\"FULL_LOCATION\"}")
COUNTID=$(echo "$CR" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
if [ -n "$COUNTID" ] && [ "$COUNTID" != "" ]; then
  ok "T46" "POST /inventory/counts" "201"
  ok "T47" "GET /inventory/counts/:id" "$(c "$BASE/inventory/counts/$COUNTID" -H "$H1" -H "X-Location-ID: $DT")"
else
  ok "T46" "POST /inventory/counts" "400"
fi

# ============ TRANSFERS ============
echo "=== TRANSFERS ==="
TR=$(j -X POST "$BASE/transfers" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" \
  -d "{\"sourceLocationId\":\"$WH\",\"destinationLocationId\":\"$DT\",\"items\":[{\"productId\":\"$PROD_ID\",\"quantity\":5}]}")
XFER_ID=$(echo "$TR" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
if [ -n "$XFER_ID" ] && [ "$XFER_ID" != "" ]; then
  ok "T70" "POST /transfers (create)" "201"
  ok "T71" "GET /transfers/:id" "$(c "$BASE/transfers/$XFER_ID" -H "$H1" -H "X-Location-ID: $WH")"
  ok "T72" "POST /transfers/approve" "$(c -X POST "$BASE/transfers/$XFER_ID/approve" -H "$H1" -H "X-Location-ID: $WH" -H "$HC")"
  ok "T73" "POST /transfers/start-picking" "$(c -X POST "$BASE/transfers/$XFER_ID/start-picking" -H "$H1" -H "X-Location-ID: $WH" -H "$HC")"
  ok "T74" "POST /transfers/dispatch" "$(c -X POST "$BASE/transfers/$XFER_ID/dispatch" -H "$H1" -H "X-Location-ID: $WH" -H "$HC")"
  ok "T75" "POST /transfers/receive" "$(c -X POST "$BASE/transfers/$XFER_ID/receive" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
    -d "{\"items\":[{\"productId\":\"$PROD_ID\",\"receivedQty\":5}]}")"
  ok "T76" "GET /transfers/journal" "$(c "$BASE/transfers/$XFER_ID/journal" -H "$H1" -H "X-Location-ID: $WH")"
else
  ok "T70" "POST /transfers (create)" "400"
fi

# Cancel
TR2=$(j -X POST "$BASE/transfers" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" \
  -d "{\"sourceLocationId\":\"$WH\",\"destinationLocationId\":\"$DT\",\"items\":[{\"productId\":\"$PROD_ID\",\"quantity\":2}]}")
CID=$(echo "$TR2" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
if [ -n "$CID" ]; then
  ok "T77" "POST /transfers/cancel" "$(c -X POST "$BASE/transfers/$CID/cancel" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" -d '{"reason":"Cancel"}')"
fi

# ============ PROCUREMENT ============
echo "=== PROCUREMENT ==="
ok "T78" "GET /procurement/suppliers" "$(c "$BASE/procurement/suppliers" -H "$H1" -H "X-Location-ID: $WH")"
ok "T79" "GET /procurement/purchase-orders" "$(c "$BASE/procurement/purchase-orders" -H "$H1" -H "X-Location-ID: $WH")"

PR=$(j -X POST "$BASE/procurement/purchase-orders" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" \
  -d "{\"supplierId\":\"$SUPPLIER\",\"destinationLocationId\":\"$WH\",\"lines\":[{\"productId\":\"$PROD_ID\",\"quantity\":20,\"unitCost\":\"10.00\"}]}")
PO_ID=$(echo "$PR" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
if [ -n "$PO_ID" ] && [ "$PO_ID" != "" ]; then
  ok "T80" "POST /procurement/po (create)" "201"
  ok "T81" "GET /procurement/po/:id" "$(c "$BASE/procurement/purchase-orders/$PO_ID" -H "$H1" -H "X-Location-ID: $WH")"
  ok "T82" "POST /procurement/po/submit" "$(c -X POST "$BASE/procurement/purchase-orders/$PO_ID/submit" -H "$H1" -H "X-Location-ID: $WH" -H "$HC")"
  ok "T83" "POST /procurement/po/receive" "$(c -X POST "$BASE/procurement/purchase-orders/$PO_ID/receive" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" \
    -d "{\"items\":[{\"productId\":\"$PROD_ID\",\"receivedQty\":20}]}")"
  ok "T84" "GET /procurement/po/journal" "$(c "$BASE/procurement/purchase-orders/$PO_ID/journal" -H "$H1" -H "X-Location-ID: $WH")"
else
  ok "T80" "POST /procurement/po (create)" "400"
fi

# Cancel PO
PR2=$(j -X POST "$BASE/procurement/purchase-orders" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" \
  -d "{\"supplierId\":\"$SUPPLIER\",\"destinationLocationId\":\"$WH\",\"lines\":[{\"productId\":\"$PROD_ID\",\"quantity\":5,\"unitCost\":\"8.00\"}]}")
CPOID=$(echo "$PR2" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
if [ -n "$CPOID" ]; then
  ok "T85" "POST /procurement/po/cancel" "$(c -X POST "$BASE/procurement/purchase-orders/$CPOID/cancel" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" -d '{"reason":"Cancel"}')"
fi

# ============ CUSTOMERS ============
echo "=== CUSTOMERS ==="
CR=$(j -X POST "$BASE/customers" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d '{"name":"Jane Doe","phone":"09179876543","email":"jane@test.com"}')
CUST_ID=$(echo "$CR" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
if [ -n "$CUST_ID" ]; then ok "T86" "POST /customers" "201"; else ok "T86" "POST /customers" "400"; fi
ok "T87" "GET /customers/search" "$(c "$BASE/customers/search?q=Jane" -H "$H1" -H "X-Location-ID: $DT")"

# Vehicle
VR=$(j -X POST "$BASE/customers/$CUST_ID/vehicles" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d '{"make":"Honda","model":"Civic","year":2023,"plateNumber":"XYZ-5678"}')
VEH_ID=$(echo "$VR" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
if [ -n "$VEH_ID" ]; then ok "T89" "POST /customers/:id/vehicles" "201"; else ok "T89" "POST /customers/:id/vehicles" "400"; fi
ok "T90" "GET /customers/:id/vehicles" "$(c "$BASE/customers/$CUST_ID/vehicles" -H "$H1" -H "X-Location-ID: $DT")"

# ============ JOB CARDS ============
echo "=== JOB CARDS ==="
ok "T104" "GET /job-cards/service-operations" "$(c "$BASE/job-cards/service-operations" -H "$H1" -H "X-Location-ID: $DT")"
ok "T106" "GET /job-cards" "$(c "$BASE/job-cards" -H "$H1" -H "X-Location-ID: $DT")"

if [ -n "$CUST_ID" ] && [ -n "$VEH_ID" ]; then
  JR=$(j -X POST "$BASE/job-cards" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
    -d "{\"customerId\":\"$CUST_ID\",\"customerVehicleId\":\"$VEH_ID\",\"locationId\":\"$DT\",\"complaint\":\"AC not cooling\"}")
  JOB_ID=$(echo "$JR" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
  if [ -n "$JOB_ID" ] && [ "$JOB_ID" != "" ]; then
    ok "T107" "POST /job-cards (create)" "201"
    ok "T108" "GET /job-cards/:id" "$(c "$BASE/job-cards/$JOB_ID" -H "$H1" -H "X-Location-ID: $DT")"
  else
    ok "T107" "POST /job-cards (create)" "400"
  fi
fi

echo ""
echo "=============================================="
echo "  FULL RESULTS"
echo "=============================================="
echo -e "$RESULTS"
echo ""
echo "  TOTALS: $PASS PASS / $FAIL FAIL"
echo "=============================================="
