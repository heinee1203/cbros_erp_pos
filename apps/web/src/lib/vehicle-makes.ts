export const PH_DEFAULT_MAKES = [
  "BAIC", "BMW", "BYD", "Chevrolet", "Chery", "Chrysler", "Daihatsu",
  "Dodge", "Ford", "Foton", "Fuso", "GAC", "Geely", "Hino", "Honda",
  "Hyundai", "Infiniti", "Isuzu", "JAC", "Jeep", "Kia", "Lexus",
  "Mahindra", "Mazda", "Mercedes-Benz", "MG", "Mitsubishi", "Nissan",
  "Peugeot", "Ram", "Subaru", "Suzuki", "Tata", "Toyota", "Volkswagen",
  "Volvo",
];

export function mergeVehicleMakes(dbMakes: string[]): string[] {
  const set = new Set([...PH_DEFAULT_MAKES, ...dbMakes]);
  return Array.from(set).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}
