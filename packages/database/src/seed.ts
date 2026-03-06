import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";
import * as schema from "./schema/index";

const TOTAL_PRODUCTS = 50_000;
const BATCH_SIZE = 1_000;

// ── Mnemonic SKU generator ──
// Business uses 10-letter code: K=1, I=2, L=3, O=4, S=5, U=6, T=7, A=8, N=9, G=0
const MNEMONIC_CHARS = "KILOSUTANG";
function generateMnemonicSku(): string {
  let sku = "";
  for (let i = 0; i < 10; i++) {
    sku += MNEMONIC_CHARS[Math.floor(Math.random() * 10)];
  }
  return sku;
}

// ── Realistic automotive product names ──
const TIRE_BRANDS = [
  "Hankook", "Nitto", "Continental", "Bridgestone", "Michelin",
  "Goodyear", "Yokohama", "Toyo", "Pirelli", "BFGoodrich",
];
const TIRE_TYPES = [
  "All-Season", "Performance", "Mud-Terrain", "Highway",
  "Winter", "All-Terrain", "Touring", "Sport",
];
const TIRE_SIZES = [
  "195/65R15", "205/55R16", "215/60R16", "225/45R17", "235/55R18",
  "245/40R18", "255/35R19", "265/70R17", "275/55R20", "285/45R22",
  "185/60R15", "225/65R17", "245/75R16", "315/70R17",
];

const OIL_BRANDS = [
  "Mobil 1", "Castrol", "Valvoline", "Pennzoil",
  "Shell Rotella", "Royal Purple", "Amsoil", "Liqui Moly",
];
const OIL_WEIGHTS = ["0W-20", "5W-30", "10W-40", "15W-40", "5W-20", "0W-40", "10W-30"];
const OIL_TYPES = ["Full Synthetic", "Synthetic Blend", "High Mileage", "Conventional", "Diesel"];

const HARD_PARTS = [
  "Brake Pad Set", "Brake Rotor", "Spark Plug", "Oil Filter", "Air Filter",
  "Cabin Filter", "Alternator", "Starter Motor", "Water Pump", "Thermostat",
  "Fuel Pump", "Ignition Coil", "CV Axle", "Tie Rod End", "Ball Joint",
  "Wheel Bearing", "Shock Absorber", "Strut Assembly", "Control Arm",
  "Serpentine Belt", "Timing Belt Kit", "Clutch Kit", "Radiator",
  "AC Compressor", "Power Steering Pump",
];
const HARD_PART_BRANDS = [
  "Bosch", "Denso", "ACDelco", "Moog", "Monroe",
  "KYB", "Dorman", "TRW", "Gates", "Dayco",
];

const ACCESSORIES = [
  "Floor Mat Set", "Seat Cover", "Phone Mount", "Dash Cam", "LED Light Bar",
  "Roof Rack", "Cargo Net", "Mud Flaps", "Fender Flares", "Bug Deflector",
  "Tonneau Cover", "Running Boards", "Tow Hitch", "Wheel Lock Set", "Valve Stem Caps",
];

const LABOR_SERVICES = [
  "Tire Mounting", "Wheel Alignment", "Oil Change Service", "Brake Inspection",
  "Engine Diagnostic", "AC Recharge", "Transmission Flush", "Coolant Flush",
  "Battery Test & Replace", "Headlight Restoration",
];

type Category = "TIRES" | "LUBRICANTS" | "HARD_PARTS" | "ACCESSORIES" | "LABOR_SERVICES";

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateProduct(index: number): {
  name: string;
  category: Category;
  unitPrice: string;
  costPrice: string;
} {
  const roll = Math.random();

  if (roll < 0.3) {
    const brand = randomFrom(TIRE_BRANDS);
    const type = randomFrom(TIRE_TYPES);
    const size = randomFrom(TIRE_SIZES);
    const unitPrice = (2500 + Math.random() * 12000).toFixed(2);
    return {
      name: `${brand} ${type} ${size}`,
      category: "TIRES",
      unitPrice,
      costPrice: (Number(unitPrice) * 0.65).toFixed(2),
    };
  } else if (roll < 0.5) {
    const brand = randomFrom(OIL_BRANDS);
    const weight = randomFrom(OIL_WEIGHTS);
    const type = randomFrom(OIL_TYPES);
    const liters = randomFrom([1, 4, 5, 6]);
    const unitPrice = (250 + Math.random() * 2500).toFixed(2);
    return {
      name: `${brand} ${type} ${weight} ${liters}L`,
      category: "LUBRICANTS",
      unitPrice,
      costPrice: (Number(unitPrice) * 0.6).toFixed(2),
    };
  } else if (roll < 0.8) {
    const part = randomFrom(HARD_PARTS);
    const brand = randomFrom(HARD_PART_BRANDS);
    const unitPrice = (150 + Math.random() * 8000).toFixed(2);
    return {
      name: `${brand} ${part} - ${faker.vehicle.manufacturer()} ${faker.vehicle.model()}`,
      category: "HARD_PARTS",
      unitPrice,
      costPrice: (Number(unitPrice) * 0.55).toFixed(2),
    };
  } else if (roll < 0.95) {
    const acc = randomFrom(ACCESSORIES);
    const unitPrice = (200 + Math.random() * 5000).toFixed(2);
    return {
      name: `${acc} - Universal Fit #${index}`,
      category: "ACCESSORIES",
      unitPrice,
      costPrice: (Number(unitPrice) * 0.5).toFixed(2),
    };
  } else {
    const svc = randomFrom(LABOR_SERVICES);
    const unitPrice = (300 + Math.random() * 3000).toFixed(2);
    return {
      name: `${svc} (Standard)`,
      category: "LABOR_SERVICES",
      unitPrice,
      costPrice: "0.00",
    };
  }
}

async function seed() {
  console.log("Starting seed...");
  const start = Date.now();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  // ── 1. Create Organization ──
  console.log("  Creating organization...");
  const [org] = await db
    .insert(schema.organizations)
    .values({ name: "Apex Auto Parts Inc.", slug: "apex-auto-parts" })
    .returning();

  // ── 2. Create Locations ──
  console.log("  Creating locations...");
  const [warehouse] = await db
    .insert(schema.locations)
    .values({ orgId: org.id, name: "Central Warehouse", type: "WAREHOUSE", address: "123 Industrial Ave" })
    .returning();

  const [store1] = await db
    .insert(schema.locations)
    .values({ orgId: org.id, name: "Downtown Retail Store", type: "RETAIL_STORE", address: "456 Main St" })
    .returning();

  const [store2] = await db
    .insert(schema.locations)
    .values({ orgId: org.id, name: "Uptown Retail Store", type: "RETAIL_STORE", address: "789 Commerce Blvd" })
    .returning();

  const allLocations = [warehouse, store1, store2];

  // ── 3. Create Admin User ──
  console.log("  Creating admin user...");
  const passwordHash = await bcrypt.hash("admin12345", 12);
  const [adminUser] = await db
    .insert(schema.users)
    .values({
      orgId: org.id,
      primaryLocationId: warehouse.id,
      fullName: "Admin User",
      email: "admin@apex.com",
      passwordHash,
      role: "ADMIN",
    })
    .returning();

  // ── 4. Create Supplier ──
  console.log("  Creating supplier...");
  await db.insert(schema.suppliers).values({
    orgId: org.id,
    name: "PhilParts Distributor",
    contactEmail: "orders@philparts.com",
    contactPhone: "+63-2-8888-1234",
    avgLeadTimeDays: 5,
  });

  // ── 5. Generate 50k Products in batches ──
  console.log(`  Generating ${TOTAL_PRODUCTS.toLocaleString()} products...`);

  for (let batch = 0; batch < TOTAL_PRODUCTS / BATCH_SIZE; batch++) {
    const productBatch: (typeof schema.products.$inferInsert)[] = [];

    for (let i = 0; i < BATCH_SIZE; i++) {
      const idx = batch * BATCH_SIZE + i;
      const { name, category, unitPrice, costPrice } = generateProduct(idx);

      const sku = `${category.slice(0, 3)}-${String(idx).padStart(6, "0")}`;

      productBatch.push({
        orgId: org.id,
        name,
        sku,
        mnemonicSku: generateMnemonicSku(),
        category,
        unitPrice,
        costPrice,
      });
    }

    await db.insert(schema.products).values(productBatch);

    if ((batch + 1) % 10 === 0) {
      console.log(
        `    Inserted ${((batch + 1) * BATCH_SIZE).toLocaleString()} products...`,
      );
    }
  }

  // ── 6. Distribute Inventory across locations ──
  console.log("  Distributing inventory across locations...");

  const allProducts = await db
    .select({ id: schema.products.id })
    .from(schema.products);

  for (let batch = 0; batch < allProducts.length / BATCH_SIZE; batch++) {
    const slice = allProducts.slice(
      batch * BATCH_SIZE,
      (batch + 1) * BATCH_SIZE,
    );

    const inventoryBatch: (typeof schema.inventory.$inferInsert)[] = [];

    for (const product of slice) {
      for (const loc of allLocations) {
        const isWarehouse = loc.id === warehouse.id;
        inventoryBatch.push({
          productId: product.id,
          locationId: loc.id,
          stockLevel: isWarehouse
            ? Math.floor(Math.random() * 500) + 50
            : Math.floor(Math.random() * 50) + 5,
          reorderPoint: isWarehouse ? 20 : 5,
          leadTimeDays: isWarehouse ? 14 : 3,
        });
      }
    }

    await db.insert(schema.inventory).values(inventoryBatch);

    if ((batch + 1) % 10 === 0) {
      console.log(
        `    Distributed ${((batch + 1) * BATCH_SIZE).toLocaleString()} products to 3 locations...`,
      );
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nSeed complete in ${elapsed}s`);
  console.log(`   Organization: ${org.name} (${org.id})`);
  console.log(`   Warehouse: ${warehouse.name} (${warehouse.id})`);
  console.log(`   Store 1: ${store1.name} (${store1.id})`);
  console.log(`   Store 2: ${store2.name} (${store2.id})`);
  console.log(`   Admin: admin@apex.com / admin12345`);
  console.log(`   Products: ${TOTAL_PRODUCTS.toLocaleString()}`);
  console.log(`   Inventory rows: ${(TOTAL_PRODUCTS * 3).toLocaleString()}`);

  await client.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
