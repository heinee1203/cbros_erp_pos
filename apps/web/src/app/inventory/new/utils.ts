export function familyToEnum(familyName: string): string {
  const name = familyName.toUpperCase();
  if (name.includes("TIRE")) return "TIRES";
  if (
    name.includes("LUBRIC") ||
    name.includes("OIL") ||
    name.includes("FLUID")
  ) {
    return "LUBRICANTS";
  }
  if (name.includes("ACCESSOR")) return "ACCESSORIES";
  if (name.includes("LABOR") || name.includes("SERVICE")) {
    return "LABOR_SERVICES";
  }
  return "HARD_PARTS";
}
