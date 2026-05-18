import { db } from "@apex/database";
import { sql, type SQL } from "drizzle-orm";
import {
  generateSOA,
  getAgingReport,
  getARSummary,
  getSOA,
  getSOAById,
  recomputeSOAStatus,
} from "./service";

export {
  generateSOA,
  getAgingReport,
  getARSummary,
  getSOA,
  getSOAById,
  recomputeSOAStatus,
} from "./service";

type SearchSoaRecordsOptions = {
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: string;
  offset?: string;
};

export async function recomputeCustomerSOAStatus(orgId: string, soaId: string) {
  return await db.transaction(async (tx) => {
    return await recomputeSOAStatus(tx, orgId, soaId);
  });
}

export async function searchSOARecords(
  orgId: string,
  options: SearchSoaRecordsOptions,
) {
  const limit = Math.min(parseInt(options.limit || "50", 10) || 50, 200);
  const offset = parseInt(options.offset || "0", 10) || 0;

  const conditions: SQL[] = [sql`s.org_id = ${orgId}`];
  if (options.status) conditions.push(sql`s.status = ${options.status}`);
  if (options.dateFrom)
    conditions.push(sql`s.generated_at >= ${options.dateFrom}::timestamptz`);
  if (options.dateTo)
    conditions.push(sql`s.generated_at <= ${options.dateTo}::timestamptz`);
  if (options.search && options.search.length >= 1) {
    const pattern = `%${options.search}%`;
    conditions.push(
      sql`(s.soa_number ILIKE ${pattern} OR c.name ILIKE ${pattern})`,
    );
  }

  const where = sql.join(conditions, sql` AND `);
  const [countRow] = (await db.execute(
    sql`SELECT COUNT(*)::int AS total FROM soa_records s JOIN customers c ON c.id = s.customer_id WHERE ${where}`,
  )) as any[];
  const rows = await db.execute(sql`
    SELECT s.id, s.soa_number, s.customer_id, c.name AS customer_name,
      s.date_from, s.date_to, s.generated_at, s.total_charges, s.total_credits,
      s.total_payable, s.transaction_count, s.status
    FROM soa_records s JOIN customers c ON c.id = s.customer_id
    WHERE ${where} ORDER BY s.generated_at DESC LIMIT ${limit} OFFSET ${offset}
  `);

  return {
    data: (rows as any[]).map((r: any) => ({
      id: r.id,
      soaNumber: r.soa_number,
      customerId: r.customer_id,
      customerName: r.customer_name,
      dateFrom: r.date_from,
      dateTo: r.date_to,
      generatedAt: r.generated_at,
      totalCharges: parseFloat(r.total_charges),
      totalCredits: parseFloat(r.total_credits),
      totalPayable: parseFloat(r.total_payable),
      transactionCount: r.transaction_count,
      status: r.status,
    })),
    total: countRow.total,
  };
}
