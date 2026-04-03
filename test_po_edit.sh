#!/bin/bash
BASE="http://localhost:3000"
PASS=0
FAIL=0

pass() { PASS=$((PASS+1)); echo "  PASS: $1"; }
fail() { FAIL=$((FAIL+1)); echo "  FAIL: $1 -- $2"; }

# Login
echo "=== Logging in ==="
LOGIN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@apex.com","password":"admin12345"}')
TOKEN=$(echo "$LOGIN" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
[ -z "$TOKEN" ] && { echo "Login failed"; exit 1; }

# Get a location
LOCS=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/locations")
LOC_ID=$(echo "$LOCS" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
H=(-H "Authorization: Bearer $TOKEN" -H "X-Location-ID: $LOC_ID" -H "Content-Type: application/json")

# Get supplier
SUPS=$(curl -s "${H[@]}" "$BASE/procurement/suppliers")
SUP_ID=$(echo "$SUPS" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

# Get products
PRODS=$(curl -s "${H[@]}" "$BASE/products?limit=3&allLocations=true")
PROD1=$(echo "$PRODS" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
PROD2=$(echo "$PRODS" | grep -o '"id":"[^"]*' | sed -n '2p' | cut -d'"' -f4)
PROD3=$(echo "$PRODS" | grep -o '"id":"[^"]*' | sed -n '3p' | cut -d'"' -f4)

echo ""
echo "=== Test 1: Create a DRAFT PO ==="
PO=$(curl -s -X POST "${H[@]}" "$BASE/procurement/purchase-orders" \
  -d "{\"supplierId\":\"$SUP_ID\",\"destinationLocationId\":\"$LOC_ID\",\"lines\":[{\"productId\":\"$PROD1\",\"orderedQty\":10,\"unitCost\":\"100.00\"},{\"productId\":\"$PROD2\",\"orderedQty\":5,\"unitCost\":\"50.00\"}]}")
PO_ID=$(echo "$PO" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
PO_STATUS=$(echo "$PO" | grep -o '"status":"[^"]*' | head -1 | cut -d'"' -f4)
[ "$PO_STATUS" = "DRAFT" ] && pass "Created DRAFT PO ($PO_ID)" || fail "Create PO" "status=$PO_STATUS"

echo ""
echo "=== Test 2: PATCH header -- change notes ==="
PATCH1=$(curl -s -X PATCH "${H[@]}" "$BASE/procurement/purchase-orders/$PO_ID" \
  -d '{"notes":"Updated notes via PATCH"}')
NOTES=$(echo "$PATCH1" | grep -o '"notes":"[^"]*' | head -1 | cut -d'"' -f4)
[ "$NOTES" = "Updated notes via PATCH" ] && pass "PATCH header notes" || fail "PATCH notes" "notes=$NOTES"

echo ""
echo "=== Test 3: Add a new line ==="
LINE3=$(curl -s -X POST "${H[@]}" "$BASE/procurement/purchase-orders/$PO_ID/lines" \
  -d "{\"productId\":\"$PROD3\",\"orderedQty\":20,\"unitCost\":\"75.00\"}")
LINE3_ID=$(echo "$LINE3" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
LINE3_QTY=$(echo "$LINE3" | grep -o '"orderedQty":[0-9]*' | head -1 | grep -o '[0-9]*')
[ "$LINE3_QTY" = "20" ] && pass "Add line (qty=20)" || fail "Add line" "qty=$LINE3_QTY"

echo ""
echo "=== Test 4: PATCH line -- change qty ==="
PO_DETAIL=$(curl -s "${H[@]}" "$BASE/procurement/purchase-orders/$PO_ID")
LINE1_ID=$(echo "$PO_DETAIL" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['lines'][0]['id'])")
PATCH_LINE=$(curl -s -X PATCH "${H[@]}" "$BASE/procurement/purchase-orders/$PO_ID/lines/$LINE1_ID" \
  -d '{"orderedQty":15}')
PATCHED_QTY=$(echo "$PATCH_LINE" | grep -o '"orderedQty":[0-9]*' | head -1 | grep -o '[0-9]*')
[ "$PATCHED_QTY" = "15" ] && pass "PATCH line qty to 15" || fail "PATCH line qty" "got=$PATCHED_QTY"

echo ""
echo "=== Test 5: PATCH line -- change unit cost ==="
PATCH_COST=$(curl -s -X PATCH "${H[@]}" "$BASE/procurement/purchase-orders/$PO_ID/lines/$LINE1_ID" \
  -d '{"unitCost":"125.50"}')
PATCHED_COST=$(echo "$PATCH_COST" | grep -o '"unitCost":"[^"]*' | head -1 | cut -d'"' -f4)
[ "$PATCHED_COST" = "125.50" ] && pass "PATCH line cost to 125.50" || fail "PATCH line cost" "got=$PATCHED_COST"

echo ""
echo "=== Test 6: DELETE line ==="
DEL=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "Authorization: Bearer $TOKEN" -H "X-Location-ID: $LOC_ID" "$BASE/procurement/purchase-orders/$PO_ID/lines/$LINE3_ID")
[ "$DEL" = "204" ] && pass "DELETE line (204)" || fail "DELETE line" "status=$DEL"

echo ""
echo "=== Test 7: Submit PO, then edit SUBMITTED ==="
TS=$(date +%s%N)
SUBMIT=$(curl -s -X POST "${H[@]}" "$BASE/procurement/purchase-orders/$PO_ID/submit" \
  -d "{\"idempotencyKey\":\"test-edit-$TS\"}")
STATUS=$(echo "$SUBMIT" | grep -o '"status":"[^"]*' | head -1 | cut -d'"' -f4)
[ "$STATUS" = "SUBMITTED" ] && pass "Submit PO" || fail "Submit PO" "status=$STATUS"

PATCH3=$(curl -s -X PATCH "${H[@]}" "$BASE/procurement/purchase-orders/$PO_ID" \
  -d '{"notes":"Edited while submitted"}')
NOTES2=$(echo "$PATCH3" | grep -o '"notes":"[^"]*' | head -1 | cut -d'"' -f4)
[ "$NOTES2" = "Edited while submitted" ] && pass "PATCH SUBMITTED PO header" || fail "PATCH submitted" "notes=$NOTES2"

echo ""
echo "=== Test 8: FULLY_RECEIVED PO rejects edit ==="
TS2=$(date +%s%N)
PO2=$(curl -s -X POST "${H[@]}" "$BASE/procurement/purchase-orders" \
  -d "{\"supplierId\":\"$SUP_ID\",\"destinationLocationId\":\"$LOC_ID\",\"lines\":[{\"productId\":\"$PROD1\",\"orderedQty\":1,\"unitCost\":\"10.00\"}]}")
PO2_ID=$(echo "$PO2" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
curl -s -X POST "${H[@]}" "$BASE/procurement/purchase-orders/$PO2_ID/submit" \
  -d "{\"idempotencyKey\":\"sub-$TS2\"}" > /dev/null
PO2_DET=$(curl -s "${H[@]}" "$BASE/procurement/purchase-orders/$PO2_ID")
PO2_LINE=$(echo "$PO2_DET" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['lines'][0]['id'])")
TS3=$(date +%s%N)
curl -s -X POST "${H[@]}" "$BASE/procurement/purchase-orders/$PO2_ID/receive" \
  -d "{\"idempotencyKey\":\"rcv-$TS3\",\"supplierDrNo\":\"DR-EDIT-TEST-$TS3\",\"lines\":[{\"poLineId\":\"$PO2_LINE\",\"receivedAcceptedQty\":1,\"rejectedQty\":0,\"unitCost\":\"10.00\"}]}" > /dev/null
PATCH_FR=$(curl -s -X PATCH "${H[@]}" "$BASE/procurement/purchase-orders/$PO2_ID" \
  -d '{"notes":"Should fail"}')
ERR=$(echo "$PATCH_FR" | grep -o '"error":"[^"]*' | cut -d'"' -f4)
echo "$ERR" | grep -q "Cannot edit" && pass "FULLY_RECEIVED rejects edit" || fail "FR rejects edit" "err=$ERR"

echo ""
echo "=== Test 9: CANCELLED PO rejects edit ==="
TS4=$(date +%s%N)
PO3=$(curl -s -X POST "${H[@]}" "$BASE/procurement/purchase-orders" \
  -d "{\"supplierId\":\"$SUP_ID\",\"destinationLocationId\":\"$LOC_ID\",\"lines\":[{\"productId\":\"$PROD1\",\"orderedQty\":1,\"unitCost\":\"10.00\"}]}")
PO3_ID=$(echo "$PO3" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
curl -s -X POST "${H[@]}" "$BASE/procurement/purchase-orders/$PO3_ID/cancel" \
  -d "{\"idempotencyKey\":\"can-$TS4\"}" > /dev/null
PATCH_CAN=$(curl -s -X PATCH "${H[@]}" "$BASE/procurement/purchase-orders/$PO3_ID" \
  -d '{"notes":"Should fail"}')
ERR2=$(echo "$PATCH_CAN" | grep -o '"error":"[^"]*' | cut -d'"' -f4)
echo "$ERR2" | grep -q "Cannot edit" && pass "CANCELLED rejects edit" || fail "Cancelled rejects" "err=$ERR2"

echo ""
echo "=== Test 10: Cannot add line to FULLY_RECEIVED ==="
ADD_FR=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${H[@]}" "$BASE/procurement/purchase-orders/$PO2_ID/lines" \
  -d "{\"productId\":\"$PROD1\",\"orderedQty\":5,\"unitCost\":\"10.00\"}")
[ "$ADD_FR" = "400" ] && pass "Add line rejected on FULLY_RECEIVED" || fail "Add line FR" "status=$ADD_FR"

echo ""
echo "=== Test 11: Required fields validation ==="
ADD_BAD=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${H[@]}" "$BASE/procurement/purchase-orders/$PO_ID/lines" \
  -d '{"orderedQty":0}')
[ "$ADD_BAD" = "400" ] && pass "Missing fields rejected (400)" || fail "Missing fields" "status=$ADD_BAD"

echo ""
echo "================================"
echo "RESULTS: $PASS passed, $FAIL failed"
echo "================================"
