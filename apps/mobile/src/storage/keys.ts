export const KEYS = {
  // Auth
  AUTH_TOKEN: 'auth.token',
  AUTH_USER: 'auth.user',
  AUTH_LOCATION_ID: 'auth.locationId',

  // Device provisioning
  API_BASE_URL: 'device.apiBaseUrl',
  DEVICE_ID: 'device.id',
  THEME_MODE: 'device.themeMode',

  // Printer
  PRINTER_DEVICE_ID: 'printer.lastDeviceId',
  PRINTER_PAPER_WIDTH: 'printer.paperWidth',

  // Scanner
  SCANNER_MODE: 'scanner.mode',

  // Sync
  LAST_CATALOG_SYNC: 'sync.lastCatalogSync',
  LAST_INVENTORY_SYNC: 'sync.lastInventorySync',

  // Cart persistence (scoped key — see cartKey() helper)
  CART_STATE_PREFIX: 'cart.state',

  // Receipt number auto-increment
  LAST_RECEIPT_NUMBER: 'apex.last_receipt_number',

  // Pending sales queue
  PENDING_SALES: 'pending.sales',
} as const;
