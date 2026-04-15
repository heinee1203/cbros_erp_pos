"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Procurement Suppliers page — redirects to the canonical AP Suppliers page.
 * The AP version is the full-featured master data page with AP stats,
 * invoices, SOAs, DVs, and returns tabs.
 */
export default function ProcurementSuppliersRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/ap/suppliers");
  }, [router]);
  return null;
}
