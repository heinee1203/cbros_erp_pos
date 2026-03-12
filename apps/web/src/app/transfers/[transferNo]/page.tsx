import { redirect } from "next/navigation";

export default async function TransferDetailRedirect({
  params,
}: {
  params: Promise<{ transferNo: string }>;
}) {
  const { transferNo } = await params;
  redirect(`/procurement/transfer-orders/${transferNo}`);
}
