export const REASON_CODE_LABELS: Record<string, string> = {
  COUNT_GAIN: "Count Gain",
  FOUND_STOCK: "Found Stock",
  OPENING_BALANCE: "Opening Balance",
  COUNT_LOSS: "Count Loss",
  DAMAGE_IN_TRANSIT: "Damage — Transit",
  DAMAGE_WAREHOUSE: "Damage — Warehouse",
  DAMAGE_SHOWROOM: "Damage — Showroom",
  WARRANTY_WRITE_OFF: "Warranty Write-Off",
  SHRINKAGE_MISSING: "Shrinkage / Missing",
  OBSOLETE_WRITE_OFF: "Obsolete Write-Off",
  TRANSFER_SHORTAGE_CONFIRMED: "Transfer Shortage",
  DATA_CORRECTION: "Data Correction",
};

export const ALL_REASON_CODES = Object.keys(REASON_CODE_LABELS);

export const CAN_CREATE_ADJUSTMENTS = true;
