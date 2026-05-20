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

## Rollback

1. Stop rollout to new stores.
2. Keep already-bound tablets online so pending local sales can reconcile.
3. Disable lost or bad devices from ERP, not from the Android app.
4. Reinstall the prior APK only after support confirms pending sales, drawer events, and print jobs have been reviewed.
5. Preserve the support packet before wiping app data.
