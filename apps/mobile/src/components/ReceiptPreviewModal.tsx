import React, { useMemo } from 'react';
import type { SaleDetail } from '@/hooks/use-transactions';
import { ReceiptDataPreviewModal } from '@/components/ReceiptDataPreviewModal';
import { buildSaleReceiptData } from '@/utils/receipt-data';

interface ReceiptPreviewModalProps {
  visible: boolean;
  sale: SaleDetail;
  cashierName: string;
  onClose: () => void;
  onPrint?: () => void;
  printing?: boolean;
  printDisabled?: boolean;
  printLabel?: string;
  statusLabel?: string;
}

export function ReceiptPreviewModal({
  visible,
  sale,
  cashierName,
  onClose,
  onPrint,
  printing,
  printDisabled,
  printLabel,
  statusLabel,
}: ReceiptPreviewModalProps) {
  const receipt = useMemo(
    () => buildSaleReceiptData(sale, cashierName),
    [sale, cashierName],
  );

  return (
    <ReceiptDataPreviewModal
      visible={visible}
      receipt={receipt}
      onClose={onClose}
      onPrint={onPrint}
      printing={printing}
      printDisabled={printDisabled}
      printLabel={printLabel}
      statusLabel={statusLabel}
    />
  );
}
