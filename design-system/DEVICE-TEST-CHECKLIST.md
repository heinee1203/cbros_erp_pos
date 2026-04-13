# CBROS ERP POS — Physical Device Test Checklist
## Samsung Galaxy Tablet

### Setup
- [ ] Connect tablet via USB, enable USB debugging
- [ ] `adb devices` shows the tablet
- [ ] `cd apps/mobile && npx react-native run-android` builds and installs
- [ ] App launches successfully

### First Launch
- [ ] App opens in DARK MODE by default (#0F172A slate background)
- [ ] Bottom tab bar visible with 4 tabs: POS, Inventory, Customers, More
- [ ] Top bar visible: CB blue logo + C-BROS text, branch selector, sync indicator
- [ ] No NavRail sidebar visible anywhere

### POS Tab
- [ ] Split layout: catalog/search left (~60%), cart/checkout right (~40%)
- [ ] Search bar: dark input, search icon left, SCAN button right
- [ ] Type product name -> results appear in left panel
- [ ] Tap product -> adds to cart in right panel
- [ ] Cart shows: product name, qty, price, line total
- [ ] Customer selector: "Walk-in Customer" card with chevron
- [ ] Subtotal + Total update as items are added
- [ ] Payment buttons visible (Cash green, Charge outlined, Split outlined, Hold text)
- [ ] Cash button -> navigates to payment flow
- [ ] Hold/Park -> parks the order
- [ ] Scan barcode via BLE scanner -> product found and added to cart
- [ ] Text is readable at arm's length (counter-mounted position)
- [ ] Touch targets are comfortable (no mis-taps)

### Inventory Tab
- [ ] "Inventory" title visible
- [ ] Search bar works
- [ ] Filter chips: All, In Stock, Low Stock, Out of Stock
- [ ] Tapping filter chip changes the product list
- [ ] Product rows show: name, SKU, brand, price, stock qty
- [ ] Stock dots: green (in stock), amber (low), red (out)
- [ ] Scrolling is smooth through product list
- [ ] Stock Count button visible top-right

### Customers Tab
- [ ] "Customers" title visible
- [ ] Search bar works
- [ ] "+ New Customer" button visible top-right
- [ ] Customer rows show: avatar circle, name, phone, tier, AR balance
- [ ] Avatar colors vary by tier (green/purple/gray/orange)
- [ ] AR balances: red if outstanding, "No balance" in gray if clear
- [ ] Scrolling is smooth

### More Tab
- [ ] Quick stats banner at top (Today's Sales, Transactions, Pending Sync)
- [ ] 3-column grid of 12 icon cards
- [ ] Cards are tappable with visual feedback
- [ ] Recent Transactions -> opens transaction list
- [ ] Settings -> opens settings screen
- [ ] Other items -> navigate to placeholder screens (not alerts)
- [ ] Back navigation works from sub-screens

### Cross-Cutting
- [ ] Tab switching is smooth (no lag, no flash)
- [ ] Top bar stays consistent across all tabs
- [ ] Sync indicator shows correct status (green if synced)
- [ ] No white/light mode flash on any screen
- [ ] Receipt printing works (BLE thermal printer)
- [ ] ZPL label printing works (ZD230)
- [ ] Manager PIN modal appears for restricted actions
- [ ] Overall: does the app look professional and match the Base44 reference?

### Issues Found
| # | Screen | Issue | Severity |
|---|--------|-------|----------|
| 1 | | | |
| 2 | | | |
| 3 | | | |

### Verdict
- [ ] PASS — Ready for staff training and rollout
- [ ] NEEDS FIXES — Issues listed above must be resolved
