#!/bin/bash
# Apex POS API Comprehensive Test Script
BASE="http://localhost:3000"
HC="Content-Type: application/json"

# Auth
TOKEN=$(curl -s $BASE/auth/login -H "$HC" -d '{"email":"admin@apex.com","password":"admin12345"}' | python -c "import sys,json;print(json.load(sys.stdin)['token'])" 2>/dev/null)
H1="Authorization: Bearer $TOKEN"

WH="6fe1aa31-c5ea-463e-9907-12c1035ef308"
DT="1754da7a-19fd-4c30-9fd7-41727f4073b9"
UT="ee723818-293a-43df-b849-3479d4ef517e"

PASS=0
FAIL=0
RESULTS=""

t() {
  local num=$1 desc=$2 expected=$3 actual=$4
  if [ "$actual" = "$expected" ]; then
    PASS=$((PASS+1))
    RESULTS="$RESULTS\n$num | $desc | $actual | PASS"
  else
    FAIL=$((FAIL+1))
    RESULTS="$RESULTS\n$num | $desc | $actual (expected $expected) | FAIL"
  fi
}

c() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
j() { curl -s "$@"; }

PROD_ID=$(j "$BASE/products?limit=1" -H "$H1" -H "X-Location-ID: $DT" | python -c "import sys,json;d=json.load(sys.stdin);print(d['data'][0]['id'])" 2>/dev/null)
UNIT_PRICE=$(j "$BASE/products?limit=1" -H "$H1" -H "X-Location-ID: $DT" | python -c "import sys,json;d=json.load(sys.stdin);print(d['data'][0]['unitPrice'])" 2>/dev/null)

echo "=== SALES MODULE ==="
# T48: Cash sale
IK=$(python -c "import uuid;print(uuid.uuid4())")
SALE_RESP=$(j -X POST "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"idempotencyKey\":\"$IK\",\"items\":[{\"productId\":\"$PROD_ID\",\"quantity\":1,\"unitPrice\":$UNIT_PRICE}],\"payments\":[{\"method\":\"CASH\",\"amount\":$UNIT_PRICE}]}")
SALE_CODE=$(echo "$SALE_RESP" | python -c "import sys,json;d=json.load(sys.stdin);print('OK' if 'id' in d else 'ERR')" 2>/dev/null)
SALE_ID=$(echo "$SALE_RESP" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
t "T48" "POST /sales (Cash)" "OK" "$SALE_CODE"

# T49: Idempotency replay
CODE=$(c -X POST "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"idempotencyKey\":\"$IK\",\"items\":[{\"productId\":\"$PROD_ID\",\"quantity\":1,\"unitPrice\":$UNIT_PRICE}],\"payments\":[{\"method\":\"CASH\",\"amount\":$UNIT_PRICE}]}")
if [ "$CODE" = "200" ] || [ "$CODE" = "201" ] || [ "$CODE" = "409" ]; then
  PASS=$((PASS+1)); RESULTS="$RESULTS\nT49 | POST /sales (idempotency) | $CODE | PASS"
else
  FAIL=$((FAIL+1)); RESULTS="$RESULTS\nT49 | POST /sales (idempotency) | $CODE | FAIL"
fi

# T50-T55: All payment methods
for METHOD in CREDIT_CARD DEBIT_CARD QRPH GCASH MAYA BANK_TRANSFER; do
  IK=$(python -c "import uuid;print(uuid.uuid4())")
  RESP=$(j -X POST "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
    -d "{\"idempotencyKey\":\"$IK\",\"items\":[{\"productId\":\"$PROD_ID\",\"quantity\":1,\"unitPrice\":$UNIT_PRICE}],\"payments\":[{\"method\":\"$METHOD\",\"amount\":$UNIT_PRICE}]}")
  HAS_ID=$(echo "$RESP" | python -c "import sys,json;d=json.load(sys.stdin);print('OK' if 'id' in d else 'ERR: '+d.get('error','?'))" 2>/dev/null)
  if [[ "$HAS_ID" == "OK" ]]; then
    PASS=$((PASS+1)); RESULTS="$RESULTS\n     | POST /sales ($METHOD) | PASS"
  else
    FAIL=$((FAIL+1)); RESULTS="$RESULTS\n     | POST /sales ($METHOD) | $HAS_ID | FAIL"
  fi
done

# T56: List sales
CODE=$(c "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT")
t "T56" "GET /sales (list)" "200" "$CODE"

# T57: Get sale by ID
CODE=$(c "$BASE/sales/$SALE_ID" -H "$H1" -H "X-Location-ID: $DT")
t "T57" "GET /sales/:id" "200" "$CODE"

# T58: Get by idempotency key
CODE=$(c "$BASE/sales/by-idempotency-key/$IK" -H "$H1" -H "X-Location-ID: $DT")
t "T58" "GET /sales/by-idempotency-key" "200" "$CODE"

# T59: Empty items
IK=$(python -c "import uuid;print(uuid.uuid4())")
CODE=$(c -X POST "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"idempotencyKey\":\"$IK\",\"items\":[],\"payments\":[{\"method\":\"CASH\",\"amount\":0}]}")
t "T59" "POST /sales (empty items)" "400" "$CODE"

# T60: Empty payments
IK=$(python -c "import uuid;print(uuid.uuid4())")
CODE=$(c -X POST "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"idempotencyKey\":\"$IK\",\"items\":[{\"productId\":\"$PROD_ID\",\"quantity\":1,\"unitPrice\":$UNIT_PRICE}],\"payments\":[]}")
t "T60" "POST /sales (empty payments)" "400" "$CODE"

# T61: Negative quantity
IK=$(python -c "import uuid;print(uuid.uuid4())")
CODE=$(c -X POST "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"idempotencyKey\":\"$IK\",\"items\":[{\"productId\":\"$PROD_ID\",\"quantity\":-1,\"unitPrice\":$UNIT_PRICE}],\"payments\":[{\"method\":\"CASH\",\"amount\":$UNIT_PRICE}]}")
t "T61" "POST /sales (neg quantity)" "400" "$CODE"

echo "=== SALE LIFECYCLE ==="

# Park
CODE=$(c -X POST "$BASE/sales/$SALE_ID/park" -H "$H1" -H "X-Location-ID: $DT" -H "$HC")
t "T62" "POST /sales/:id/park" "200" "$CODE"

# Resume
CODE=$(c -X POST "$BASE/sales/$SALE_ID/resume" -H "$H1" -H "X-Location-ID: $DT" -H "$HC")
t "T63" "POST /sales/:id/resume" "200" "$CODE"

# Complete
CODE=$(c -X POST "$BASE/sales/$SALE_ID/complete" -H "$H1" -H "X-Location-ID: $DT" -H "$HC")
t "T64" "POST /sales/:id/complete" "200" "$CODE"

# Journal
CODE=$(c "$BASE/sales/$SALE_ID/journal" -H "$H1" -H "X-Location-ID: $DT")
t "T65" "GET /sales/:id/journal" "200" "$CODE"

# Refund
CODE=$(c -X POST "$BASE/sales/$SALE_ID/refund" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"reason\":\"Return\",\"items\":[{\"productId\":\"$PROD_ID\",\"quantity\":1}]}")
if [ "$CODE" = "200" ] || [ "$CODE" = "201" ]; then
  PASS=$((PASS+1)); RESULTS="$RESULTS\nT66 | POST /sales/:id/refund | $CODE | PASS"
else
  FAIL=$((FAIL+1)); RESULTS="$RESULTS\nT66 | POST /sales/:id/refund | $CODE | FAIL"
fi

# Void a new sale
IK=$(python -c "import uuid;print(uuid.uuid4())")
VID=$(j -X POST "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"idempotencyKey\":\"$IK\",\"items\":[{\"productId\":\"$PROD_ID\",\"quantity\":1,\"unitPrice\":$UNIT_PRICE}],\"payments\":[{\"method\":\"CASH\",\"amount\":$UNIT_PRICE}]}" | python -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
CODE=$(c -X POST "$BASE/sales/$VID/void" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d '{"reason":"Test void"}')
t "T67" "POST /sales/:id/void" "200" "$CODE"

# Sale by number
SALE_NO=$(j "$BASE/sales?limit=1" -H "$H1" -H "X-Location-ID: $DT" | python -c "import sys,json;d=json.load(sys.stdin);data=d.get('data',d);print(data[0].get('saleNo',''))" 2>/dev/null)
CODE=$(c "$BASE/sales/by-number/$SALE_NO" -H "$H1" -H "X-Location-ID: $DT")
t "T68" "GET /sales/by-number/:no" "200" "$CODE"

echo ""
echo "=== INVENTORY ADJUSTMENTS (corrected schema) ==="

# Proper adjustment with all required fields
IK=$(python -c "import uuid;print(uuid.uuid4())")
CODE=$(c -X POST "$BASE/inventory/adjustments" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"productId\":\"$PROD_ID\",\"locationId\":\"$DT\",\"direction\":\"IN\",\"quantity\":10,\"reasonCode\":\"RECOUNT\",\"notes\":\"Test\",\"idempotencyKey\":\"$IK\"}")
t "T40" "POST /adjustments IN +10" "200" "$CODE"
if [ "$CODE" != "200" ] && [ "$CODE" != "201" ]; then
  # Try 201
  t "T40" "POST /adjustments IN +10" "201" "$CODE"
fi

IK=$(python -c "import uuid;print(uuid.uuid4())")
CODE=$(c -X POST "$BASE/inventory/adjustments" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"productId\":\"$PROD_ID\",\"locationId\":\"$DT\",\"direction\":\"OUT\",\"quantity\":3,\"reasonCode\":\"DAMAGED\",\"notes\":\"Shrinkage\",\"idempotencyKey\":\"$IK\"}")
if [ "$CODE" = "200" ] || [ "$CODE" = "201" ]; then
  PASS=$((PASS+1)); RESULTS="$RESULTS\nT41 | POST /adjustments OUT -3 | $CODE | PASS"
else
  FAIL=$((FAIL+1)); RESULTS="$RESULTS\nT41 | POST /adjustments OUT -3 | $CODE | FAIL"
fi

echo ""
echo "=== INVENTORY COUNTS (corrected schema) ==="
IK=$(python -c "import uuid;print(uuid.uuid4())")
RESP=$(j -X POST "$BASE/inventory/counts" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"locationId\":\"$DT\",\"label\":\"Test Count\",\"scope\":\"FULL\"}")
HAS_ID=$(echo "$RESP" | python -c "import sys,json;d=json.load(sys.stdin);print('OK' if 'id' in d else 'ERR: '+str(d)[:200])" 2>/dev/null)
if [[ "$HAS_ID" == "OK" ]]; then
  PASS=$((PASS+1)); RESULTS="$RESULTS\nT46 | POST /inventory/counts (create) | PASS"
  COUNTID=$(echo "$RESP" | python -c "import sys,json;print(json.load(sys.stdin)['id'])" 2>/dev/null)
  CODE=$(c "$BASE/inventory/counts/$COUNTID" -H "$H1" -H "X-Location-ID: $DT")
  t "T47" "GET /inventory/counts/:id" "200" "$CODE"
else
  FAIL=$((FAIL+1)); RESULTS="$RESULTS\nT46 | POST /inventory/counts (create) | $HAS_ID | FAIL"
fi

echo ""
echo "=== TRANSFERS ==="
# Create transfer
R=$(j -X POST "$BASE/transfers" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" \
  -d "{\"fromLocationId\":\"$WH\",\"toLocationId\":\"$DT\",\"items\":[{\"productId\":\"$PROD_ID\",\"quantity\":5}],\"notes\":\"Test\"}")
XFER_ID=$(echo "$R" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
if [ -n "$XFER_ID" ] && [ "$XFER_ID" != "" ]; then
  PASS=$((PASS+1)); RESULTS="$RESULTS\nT70 | POST /transfers (create) | PASS"

  CODE=$(c "$BASE/transfers/$XFER_ID" -H "$H1" -H "X-Location-ID: $WH")
  t "T71" "GET /transfers/:id" "200" "$CODE"

  CODE=$(c -X POST "$BASE/transfers/$XFER_ID/approve" -H "$H1" -H "X-Location-ID: $WH" -H "$HC")
  t "T72" "POST /transfers/approve" "200" "$CODE"

  CODE=$(c -X POST "$BASE/transfers/$XFER_ID/start-picking" -H "$H1" -H "X-Location-ID: $WH" -H "$HC")
  t "T73" "POST /transfers/start-picking" "200" "$CODE"

  CODE=$(c -X POST "$BASE/transfers/$XFER_ID/dispatch" -H "$H1" -H "X-Location-ID: $WH" -H "$HC")
  t "T74" "POST /transfers/dispatch" "200" "$CODE"

  CODE=$(c -X POST "$BASE/transfers/$XFER_ID/receive" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
    -d "{\"items\":[{\"productId\":\"$PROD_ID\",\"receivedQty\":5}]}")
  t "T75" "POST /transfers/receive" "200" "$CODE"

  CODE=$(c "$BASE/transfers/$XFER_ID/journal" -H "$H1" -H "X-Location-ID: $WH")
  t "T76" "GET /transfers/:id/journal" "200" "$CODE"
else
  FAIL=$((FAIL+1)); RESULTS="$RESULTS\nT70 | POST /transfers (create) | FAIL: $R"
fi

# Cancel
R=$(j -X POST "$BASE/transfers" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" \
  -d "{\"fromLocationId\":\"$WH\",\"toLocationId\":\"$DT\",\"items\":[{\"productId\":\"$PROD_ID\",\"quantity\":2}],\"notes\":\"Cancel\"}")
CID=$(echo "$R" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
if [ -n "$CID" ]; then
  CODE=$(c -X POST "$BASE/transfers/$CID/cancel" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" -d '{"reason":"Cancel"}')
  t "T77" "POST /transfers/cancel" "200" "$CODE"
fi

echo ""
echo "=== PROCUREMENT ==="
CODE=$(c "$BASE/procurement/suppliers" -H "$H1" -H "X-Location-ID: $WH")
t "T78" "GET /procurement/suppliers" "200" "$CODE"

CODE=$(c "$BASE/procurement/purchase-orders" -H "$H1" -H "X-Location-ID: $WH")
t "T79" "GET /procurement/purchase-orders" "200" "$CODE"

R=$(j -X POST "$BASE/procurement/purchase-orders" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" \
  -d "{\"items\":[{\"productId\":\"$PROD_ID\",\"quantity\":20,\"unitCost\":\"10.00\"}],\"notes\":\"Test PO\"}")
PO_ID=$(echo "$R" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
if [ -n "$PO_ID" ] && [ "$PO_ID" != "" ]; then
  PASS=$((PASS+1)); RESULTS="$RESULTS\nT80 | POST /procurement/po (create) | PASS"

  CODE=$(c "$BASE/procurement/purchase-orders/$PO_ID" -H "$H1" -H "X-Location-ID: $WH")
  t "T81" "GET /procurement/po/:id" "200" "$CODE"

  CODE=$(c -X POST "$BASE/procurement/purchase-orders/$PO_ID/submit" -H "$H1" -H "X-Location-ID: $WH" -H "$HC")
  t "T82" "POST /procurement/po/submit" "200" "$CODE"

  CODE=$(c -X POST "$BASE/procurement/purchase-orders/$PO_ID/receive" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" \
    -d "{\"items\":[{\"productId\":\"$PROD_ID\",\"receivedQty\":20}]}")
  t "T83" "POST /procurement/po/receive" "200" "$CODE"

  CODE=$(c "$BASE/procurement/purchase-orders/$PO_ID/journal" -H "$H1" -H "X-Location-ID: $WH")
  t "T84" "GET /procurement/po/journal" "200" "$CODE"
else
  FAIL=$((FAIL+1)); RESULTS="$RESULTS\nT80 | POST /procurement/po (create) | FAIL: $R"
fi

# Cancel PO
R=$(j -X POST "$BASE/procurement/purchase-orders" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" \
  -d "{\"items\":[{\"productId\":\"$PROD_ID\",\"quantity\":5,\"unitCost\":\"8.00\"}],\"notes\":\"Cancel\"}")
CPOID=$(echo "$R" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
if [ -n "$CPOID" ]; then
  CODE=$(c -X POST "$BASE/procurement/purchase-orders/$CPOID/cancel" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" -d '{"reason":"Cancel"}')
  t "T85" "POST /procurement/po/cancel" "200" "$CODE"
fi

echo ""
echo "=== CUSTOMERS ==="
R=$(j -X POST "$BASE/customers" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d '{"name":"John Test","phone":"09171234567","email":"john@test.com"}')
CUST_ID=$(echo "$R" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
if [ -n "$CUST_ID" ] && [ "$CUST_ID" != "" ]; then
  PASS=$((PASS+1)); RESULTS="$RESULTS\nT86 | POST /customers (create) | PASS"
else
  FAIL=$((FAIL+1)); RESULTS="$RESULTS\nT86 | POST /customers (create) | FAIL"
fi

CODE=$(c "$BASE/customers/search?q=John" -H "$H1" -H "X-Location-ID: $DT")
t "T87" "GET /customers/search" "200" "$CODE"

# Vehicle
if [ -n "$CUST_ID" ]; then
  R=$(j -X POST "$BASE/customers/$CUST_ID/vehicles" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
    -d '{"make":"Toyota","model":"Vios","year":2022,"plateNumber":"ZZZ-9999"}')
  VEH=$(echo "$R" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
  if [ -n "$VEH" ]; then
    PASS=$((PASS+1)); RESULTS="$RESULTS\nT89 | POST /customers/:id/vehicles | PASS"
  else
    FAIL=$((FAIL+1)); RESULTS="$RESULTS\nT89 | POST /customers/:id/vehicles | FAIL"
  fi
  CODE=$(c "$BASE/customers/$CUST_ID/vehicles" -H "$H1" -H "X-Location-ID: $DT")
  t "T90" "GET /customers/:id/vehicles" "200" "$CODE"
fi

echo ""
echo "=== SYNC ==="
CODE=$(c "$BASE/sync/catalog" -H "$H1" -H "X-Location-ID: $DT")
t "T91" "GET /sync/catalog" "200" "$CODE"
CODE=$(c "$BASE/sync/inventory" -H "$H1" -H "X-Location-ID: $DT")
t "T92" "GET /sync/inventory" "200" "$CODE"

echo ""
echo "=== DASHBOARD ==="
CODE=$(c "$BASE/dashboard/summary" -H "$H1" -H "X-Location-ID: $DT")
t "T93" "GET /dashboard/summary" "200" "$CODE"

echo ""
echo "=== REPORTING ==="
for EP in kpi-summary sales-by-item sales-by-category sales-by-employee sales-summary daily-sales-summary sales-kpis employees job-margins technician-efficiency; do
  CODE=$(c "$BASE/reports/$EP" -H "$H1" -H "X-Location-ID: $DT")
  if [ "$CODE" = "200" ]; then
    PASS=$((PASS+1)); RESULTS="$RESULTS\n     | GET /reports/$EP | $CODE | PASS"
  else
    FAIL=$((FAIL+1)); RESULTS="$RESULTS\n     | GET /reports/$EP | $CODE | FAIL"
  fi
done

echo ""
echo "=== JOB CARDS ==="
CODE=$(c "$BASE/job-cards/service-operations" -H "$H1" -H "X-Location-ID: $DT")
t "T104" "GET /job-cards/service-operations" "200" "$CODE"

CODE=$(c "$BASE/job-cards" -H "$H1" -H "X-Location-ID: $DT")
t "T106" "GET /job-cards" "200" "$CODE"

# Create job card
if [ -n "$CUST_ID" ] && [ -n "$VEH" ]; then
  R=$(j -X POST "$BASE/job-cards" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
    -d "{\"customerId\":\"$CUST_ID\",\"vehicleId\":\"$VEH\",\"complaint\":\"AC not cooling\"}")
  JOB_ID=$(echo "$R" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
  if [ -n "$JOB_ID" ] && [ "$JOB_ID" != "" ]; then
    PASS=$((PASS+1)); RESULTS="$RESULTS\nT107 | POST /job-cards (create) | PASS"
    CODE=$(c "$BASE/job-cards/$JOB_ID" -H "$H1" -H "X-Location-ID: $DT")
    t "T108" "GET /job-cards/:id" "200" "$CODE"
  else
    FAIL=$((FAIL+1)); RESULTS="$RESULTS\nT107 | POST /job-cards (create) | FAIL: $(echo $R | head -c 200)"
  fi
fi

CODE=$(c "$BASE/locations" -H "$H1")
t "T109" "GET /locations" "200" "$CODE"

CODE=$(c -X POST "$BASE/auth/register" -H "$HC" -d '{"email":"","password":"","orgName":""}')
t "T110" "POST /auth/register (empty)" "400" "$CODE"

echo ""
echo "=============================================="
echo "  FULL RESULTS"
echo "=============================================="
echo -e "$RESULTS"
echo ""
echo "=============================================="
echo "  TOTALS: $PASS PASS / $FAIL FAIL"
echo "=============================================="
