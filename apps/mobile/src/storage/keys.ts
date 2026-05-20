export const KEYS = {
  // Auth
  AUTH_TOKEN: 'auth.token',
  AUTH_USER: 'auth.user',
  AUTH_LOCATION_ID: 'auth.locationId',
  AUTH_LOCATIONS: 'auth.locations',

  // Device provisioning
  API_BASE_URL: 'device.apiBaseUrl',
  DEVICE_ID: 'device.id',
  THEME_MODE: 'device.themeMode',
  DISABLED_DEVICE_STATE: 'device.disabledState',
  REGISTRATION_METADATA: 'device.registrationMetadata',

  // Printer
  PRINTER_DEVICE_ID: 'printer.lastDeviceId',
  PRINTER_PAPER_WIDTH: 'printer.paperWidth',
  PRINTER_LANGUAGE: 'printer.language',
  PRINT_JOBS: 'printer.printJobs',
  HARDWARE_TEST_RESULTS: 'hardware.testResults',
  SUPPORT_LOGS: 'support.logs',

  // Scanner
  SCANNER_MODE: 'scanner.mode',
  SCANNER_DIAGNOSTICS: 'scanner.diagnostics',

  // Protected action session
  PROTECTED_ACTION_LAST_AUTH: 'security.protectedActionLastAuth',

  // Sync
  LAST_CATALOG_SYNC: 'sync.lastCatalogSync',
  LAST_INVENTORY_SYNC: 'sync.lastInventorySync',

  // Cart persistence (scoped key — see cartKey() helper)
  CART_STATE_PREFIX: 'cart.state',
  CART_RESTORE_SNAPSHOT: 'cart.restoreSnapshot',

  // Receipt number auto-increment
  LAST_RECEIPT_NUMBER: 'apex.last_receipt_number',

  // Pending sales queue
  PENDING_SALES: 'pending.sales',

  // Register drawer events
  REGISTER_DRAWER_EVENTS: 'register.drawerEvents',

  // Cashier speed
  RECENT_PRODUCTS: 'catalog.recentProducts',
} as const;
