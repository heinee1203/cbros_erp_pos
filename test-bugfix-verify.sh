#!/bin/bash
BASE="http://localhost:3000"
HC="Content-Type: application/json"
TOKEN=$(curl -s $BASE/auth/login -H "$HC" -d '{"email":"admin@apex.com","password":"admin12345"}' | python -c "import sys,json;print(json.load(sys.stdin)['token'])")
H1="Authorization: Bearer $TOKEN"
DT="1754da7a-19fd-4c30-9fd7-41727f4073b9"
WH="6fe1aa31-c5ea-463e-9907-12c1035ef308"
SUPPLIER="1a549c85-6af7-4d03-84ca-4f38e31a7997"
PASS=0; FAIL=0; RESULTS=""
ik() { python -c "import uuid;print(uuid.uuid4())"; }
ok() { local n=$1 d=$2 c=$3; if echo "$c" | grep -qE "^(200|201|204)$"; then PASS=$((PASS+1)); RESULTS="${RESULTS}\n$n | $d | $c | PASS"; else FAIL=$((FAIL+1)); RESULTS="${RESULTS}\n$n | $d | $c | FAIL"; fi; }
expect_reject() { local n=$1 d=$2 c=$3; if echo "$c" | grep -qE "^(400|422)$"; then PASS=$((PASS+1)); RESULTS="${RESULTS}\n$n | $d | $c | PASS (rejected)"; else FAIL=$((FAIL+1)); RESULTS="${RESULTS}\n$n | $d | $c | FAIL (should reject)"; fi; }
c() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
j() { curl -s "$@"; }

PROD_ID=$(j "$BASE/products?limit=1" -H "$H1" -H "X-Location-ID: $DT" | python -c "import sys,json;print(json.load(sys.stdin)['data'][0]['id'])")
UP=$(j "$BASE/products?limit=1" -H "$H1" -H "X-Location-ID: $DT" | python -c "import sys,json;print(json.load(sys.stdin)['data'][0]['unitPrice'])")

echo "=== BUG FIX VERIFICATION ==="

# --- Bug 1: Inventory count creation (stack overflow fix) ---
echo "--- Bug 1: Inventory Count ---"
CR=$(j -X POST "$BASE/inventory/counts" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"locationId\":\"$DT\",\"label\":\"Bugfix Test\",\"scope\":\"FULL_LOCATION\"}")
COUNTID=$(echo "$CR" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
if [ -n "$COUNTID" ] && [ "$COUNTID" != "" ]; then
  ok "BUG1" "Inventory count (no stack overflow)" "201"
else
  ERR=$(echo "$CR" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('error',d.get('message','unknown')))" 2>/dev/null)
  echo "  ERROR: $ERR"
  ok "BUG1" "Inventory count (no stack overflow)" "500"
fi

# --- Bug 2: Negative price validation ---
echo "--- Bug 2: Price Validation ---"
# These SHOULD be rejected (400) - negative prices
expect_reject "BUG2a" "Reject negative unitPrice" "$(c -X POST "$BASE/products" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d '{"name":"Bad Product","sku":"NEGPRICE1","mnemonicSku":"ABCDEFGHIJ","category":"TIRES","unitPrice":"-5.00","costPrice":"2.00"}')"
expect_reject "BUG2b" "Reject negative costPrice" "$(c -X POST "$BASE/products" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d '{"name":"Bad Product2","sku":"NEGPRICE2","mnemonicSku":"ABCDEFGHIK","category":"TIRES","unitPrice":"5.00","costPrice":"-2.00"}')"
# This SHOULD succeed (201) - valid prices
ok "BUG2c" "Accept valid prices" "$(c -X POST "$BASE/products" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d '{"name":"Good Product Test","sku":"GOODPRC01","mnemonicSku":"ZZZZZZZZZY","category":"TIRES","unitPrice":"10.00","costPrice":"5.00"}')"

# --- Bug 3: Payment method enum ---
echo "--- Bug 3: All Payment Methods ---"
for METHOD in CASH CARD CREDIT_CARD DEBIT_CARD EFT QRPH GCASH MAYA BANK_TRANSFER ACCOUNT OTHER; do
  SR=$(j -X POST "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
    -d "{\"locationId\":\"$DT\",\"lines\":[{\"productId\":\"$PROD_ID\",\"quantity\":1,\"unitPrice\":$UP}]}")
  SID=$(echo "$SR" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('sale',d).get('id',''))")
  IK=$(ik)
  CC=$(c -X POST "$BASE/sales/$SID/complete" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
    -d "{\"idempotencyKey\":\"$IK\",\"payments\":[{\"method\":\"$METHOD\",\"amount\":\"$UP\"}]}")
  ok "BUG3" "$METHOD payment" "$CC"
done

# --- Regression: Sales lifecycle ---
echo "--- Regression: Sales Lifecycle ---"
SR=$(j -X POST "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"locationId\":\"$DT\",\"lines\":[{\"productId\":\"$PROD_ID\",\"quantity\":1,\"unitPrice\":$UP}]}")
SALE_ID=$(echo "$SR" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('sale',d).get('id',''))")
[ -n "$SALE_ID" ] && ok "REG" "Create sale" "201" || ok "REG" "Create sale" "400"
ok "REG" "List sales" "$(c "$BASE/sales" -H "$H1" -H "X-Location-ID: $DT")"
ok "REG" "Get sale" "$(c "$BASE/sales/$SALE_ID" -H "$H1" -H "X-Location-ID: $DT")"
ok "REG" "Park sale" "$(c -X POST "$BASE/sales/$SALE_ID/park" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" -d '{}')"
ok "REG" "Resume sale" "$(c -X POST "$BASE/sales/$SALE_ID/resume" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" -d '{}')"
IK=$(ik)
ok "REG" "Complete sale" "$(c -X POST "$BASE/sales/$SALE_ID/complete" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"idempotencyKey\":\"$IK\",\"payments\":[{\"method\":\"CASH\",\"amount\":\"$UP\"}]}")"
ok "REG" "Sale journal" "$(c "$BASE/sales/$SALE_ID/journal" -H "$H1" -H "X-Location-ID: $DT")"

echo "--- Regression: Adjustments ---"
IK=$(ik)
ok "REG" "Adjustment IN" "$(c -X POST "$BASE/inventory/adjustments" -H "$H1" -H "X-Location-ID: $DT" -H "$HC" \
  -d "{\"productId\":\"$PROD_ID\",\"locationId\":\"$DT\",\"quantity\":10,\"direction\":\"IN\",\"reasonCode\":\"COUNT_GAIN\",\"notes\":\"test\",\"idempotencyKey\":\"$IK\"}")"

echo "--- Regression: Transfers ---"
TR=$(j -X POST "$BASE/transfers" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" \
  -d "{\"sourceLocationId\":\"$WH\",\"destinationLocationId\":\"$DT\",\"items\":[{\"productId\":\"$PROD_ID\",\"requestedQty\":5}]}")
XFER_ID=$(echo "$TR" | python -c "import sys,json;d=json.load(sys.stdin);print(d.get('id',''))" 2>/dev/null)
if [ -n "$XFER_ID" ] && [ "$XFER_ID" != "" ]; then
  ok "REG" "Create transfer" "201"
  IK=$(ik); ok "REG" "Approve" "$(c -X POST "$BASE/transfers/$XFER_ID/approve" -H "$H1" -H "X-Location-ID: $WH" -H "$HC" -d "{\"idempotencyKey\":\"$IK\"}")"
fi

echo "--- Regression: Procurement ---"
ok "REG" "List suppliers" "$(c "$BASE/procurement/suppliers" -H "$H1" -H "X-Location-ID: $WH")"

echo ""
echo "=============================================="
printf "$RESULTS\n"
echo ""
echo "  TOTALS: $PASS PASS / $FAIL FAIL"
echo "=============================================="
