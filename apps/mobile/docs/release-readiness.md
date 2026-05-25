# Android POS Release Readiness

## Build

1. Rebuild the React Native bundle:
   `node ../../node_modules/react-native/cli.js bundle --platform android --dev false --entry-file index.js --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res`
2. Build the debug APK:
   `cd android && .\gradlew.bat assembleDebug`
3. Confirm About and Recovery & Diagnostics show the intended version, build date, and git SHA.

## Smoke Commands

Run low-impact emulator checks only:

`pnpm --filter @apex/mobile smoke:android:ui`

For size screenshots:

`$env:APEX_SMOKE_UI_SIZES="1"; pnpm --filter @apex/mobile smoke:android:ui`

For strict authenticated smoke, provide local environment variables only:

`$env:APEX_SMOKE_EMAIL="cashier@example.com"`
`$env:APEX_SMOKE_PASSWORD="local-password"`
`$env:APEX_SMOKE_STORE_CODE="STORE01"`
`$env:APEX_SMOKE_REQUIRE_AUTH="1"`
`pnpm --filter @apex/mobile smoke:android:auth`

Do not commit smoke credentials, manager PINs, card credentials, or registration codes.

## Store Rollout

1. ERP admin creates a POS registration code for the target store.
2. Cashier/manager logs into Android POS.
3. Register the tablet by scanning or entering the ERP code.
4. Confirm the tablet opens POS without a store picker after restart.
5. Open Recovery & Diagnostics and verify Store Lock, API, printer, scanner, and pending local counts.
6. Complete Hardware Certification for receipt printer, ZPL label printer, scanner/manual scan, manager authorization, and cash drawer kick.

## Hardware Certification

Record pass/fail notes locally for:

- Receipt test print
- ZPL label test print
- Scanner or manual barcode capture
- Manager PIN, barcode, or card authorization
- Cash drawer kick

Certification results appear in Recovery & Diagnostics and the copy-friendly support packet.

## Store-Pilot Readiness

Before the first pilot shift:

- Create the device registration code from ERP > Settings > POS Devices, then scan or type it on the Android tablet.
- Open More > Setup Wizard and complete printer connection, receipt test, label test, scanner/manual scan, manager authorization, and drawer kick.
- Confirm More > Recovery & Diagnostics reports the pilot register as Ready or only Warning, never Blocked.
- Confirm More > Manager Audit shows hardware outcomes, drawer variance history, and offline reconciliation outcomes.
- Complete a small cash sale, then use More > Last Reprint to preview and reprint through the print queue.

## Performance QA

Keep this pass low-impact. Use one tablet or emulator and avoid long stress loops:

- Build a 50+ line cart and confirm add/remove, discount, payment, and clear-cart restore stay responsive.
- Search catalog terms with many matches and confirm barcode/manual scan still returns quickly.
- Seed or simulate several pending sales and drawer events, then confirm Recovery & Diagnostics opens detail views without lag.
- Create a large print queue with failed and printed jobs, then confirm preview, retry, and clear-printed actions remain usable.
- Test weak/offline network by disconnecting briefly; non-cash checkout should block and recovery cards should stay visible.
- Reprint the last receipt several times and confirm failed print jobs remain retryable rather than disappearing.
- Capture tablet landscape, tablet portrait, and compact-width screenshots with `APEX_SMOKE_UI_SIZES=1`.

## Next 8 QA Checklist

Use this after the emulator smoke and before a store pilot:

- Recovery & Diagnostics shows Hardware Certification as Ready, Warning, or Blocked.
- Pending sale and drawer-event rows open detail views and can be marked manager-reviewed without deleting the local record.
- Receipt, Z-reading, test-page, and label print jobs can be previewed before retry/reprint.
- Settings can enable Guided Cashier Mode, and checkout/tender removal prompts become more explicit.
- Expired sessions return to login with a clear message while preserving store binding and local cart/sync state.
- Checkout blocks unsafe cases: missing receipt, missing charge customer, offline non-cash/charge payment, overpay on non-cash tender, and missing payment references.
- Checkout warns on high-value carts, large discounts, under-tendered cash, split-payment imbalance, and offline-sensitive workflows.
- Manager Audit is visible from More and shows local approvals, offline reviews, hardware outcomes, and copy-friendly audit text.
- Tablet landscape, tablet portrait, and compact screenshots show no clipped primary controls, modal overflow, unreachable buttons, or keyboard overlap on cashier paths.

## Rollback

1. Stop rollout to new stores.
2. Keep already-bound tablets online so pending local sales can reconcile.
3. Disable lost or bad devices from ERP, not from the Android app.
4. Reinstall the prior APK only after support confirms pending sales, drawer events, and print jobs have been reviewed.
5. Preserve the support packet before wiping app data.
