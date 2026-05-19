/**
 * Inventory Screen - local inventory browser with barcode lookup and product detail drill-in.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { database } from '@/db/database';
import { Product, Inventory } from '@/db/models';
import { Q } from '@nozbe/watermelondb';
import { storage } from '@/storage/mmkv';
import { KEYS } from '@/storage/keys';
import { BarcodeScanModal } from '@/components/BarcodeScanModal';
import { ManagerPinModal, type ManagerAuthorization } from '@/components/ManagerPinModal';
import { ProductDetailSheet } from '@/components/ProductDetailSheet';
import { Icon } from '@/components/ui';
import { apiFetch } from '@/services/api-client';
import { logElevation } from '@/services/audit-logger';
import { getLockedLocationId } from '@/config/device-binding';
import { formatPosError } from '@/utils/pos-error-messages';
import { colors, fonts, fontSize, layout, radius, spacing, textStyles } from '@/theme';
import { useAuth } from '@/hooks/use-auth';
import { useLayout } from '@/hooks/use-layout';
import type { CatalogItem } from '@/hooks/use-catalog-search';
import type { LocationInfo } from '@/services/auth';

type StockFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';
type InventoryOperationKind = 'adjust' | 'count' | 'transfer';
type AdjustmentDirection = 'IN' | 'OUT';
type AdjustmentReasonCode =
  | 'COUNT_GAIN'
  | 'FOUND_STOCK'
  | 'COUNT_LOSS'
  | 'DAMAGE_WAREHOUSE'
  | 'WARRANTY_WRITE_OFF'
  | 'SHRINKAGE_MISSING'
  | 'OBSOLETE_WRITE_OFF'
  | 'DATA_CORRECTION';

interface InventoryItem extends CatalogItem {
  availableQty: number;
  stockStatus: StockStatus;
}

interface InventoryOperationRequest {
  kind: InventoryOperationKind;
  product: InventoryItem;
  quantity: number;
  direction?: AdjustmentDirection;
  reasonCode?: AdjustmentReasonCode;
  countedQty?: number;
  destinationLocationId?: string;
  notes?: string;
}

interface StockJournalEntry {
  id: string;
  effectiveAt?: string;
  createdAt?: string;
  productId: string;
  productName: string;
  productSku?: string | null;
  mnemonicSku?: string | null;
  locationId: string;
  locationName: string;
  changeQuantity: number;
  balanceAfter: number;
  referenceType: string;
  referenceNumber?: string | null;
  reasonCode?: string | null;
  notes?: string | null;
  actorName?: string | null;
}

interface StockJournalResponse {
  data: StockJournalEntry[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface TransferSummary {
  id: string;
  transferNo: string;
  status: string;
  sourceLocationName: string;
  destinationLocationName: string;
  lineCount: number;
  createdAt?: string;
  updatedAt?: string;
}

interface TransferListResponse {
  data: TransferSummary[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface CreateTransferResponse {
  transfer?: {
    id: string;
    transferNo?: string;
    status?: string;
  };
  items?: unknown[];
}

const FILTERS: { key: StockFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'in_stock', label: 'In Stock' },
  { key: 'low_stock', label: 'Low Stock' },
  { key: 'out_of_stock', label: 'Out of Stock' },
];

const ADJUSTMENT_REASONS: Record<AdjustmentDirection, { code: AdjustmentReasonCode; label: string }[]> = {
  IN: [
    { code: 'FOUND_STOCK', label: 'Found Stock' },
    { code: 'COUNT_GAIN', label: 'Count Gain' },
    { code: 'DATA_CORRECTION', label: 'Data Correction' },
  ],
  OUT: [
    { code: 'DAMAGE_WAREHOUSE', label: 'Damage' },
    { code: 'SHRINKAGE_MISSING', label: 'Missing' },
    { code: 'COUNT_LOSS', label: 'Count Loss' },
    { code: 'OBSOLETE_WRITE_OFF', label: 'Obsolete' },
    { code: 'WARRANTY_WRITE_OFF', label: 'Warranty' },
    { code: 'DATA_CORRECTION', label: 'Data Correction' },
  ],
};

const LARGE_STOCK_CHANGE_QTY = 10;
const MIN_OPERATION_NOTE_LENGTH = 8;
const ADJUST_CONFIRMATION_WORD = 'ADJUST';
const TRANSFER_CONFIRMATION_WORD = 'REQUEST';

function getStockStatus(stockLevel: number, reservedLevel: number, reorderPoint: number): StockStatus {
  const availableQty = Math.max(0, stockLevel - reservedLevel);
  if (availableQty <= 0) return 'out_of_stock';
  if (availableQty <= reorderPoint) return 'low_stock';
  return 'in_stock';
}

function getStockTone(status: StockStatus) {
  if (status === 'out_of_stock') {
    return {
      label: 'Out',
      color: colors.status.dangerText,
      bg: colors.status.dangerBg,
      border: 'rgba(194,65,58,0.22)',
    };
  }

  if (status === 'low_stock') {
    return {
      label: 'Low',
      color: colors.status.warningText,
      bg: colors.status.warningBg,
      border: 'rgba(183,121,31,0.24)',
    };
  }

  return {
    label: 'In Stock',
    color: colors.status.successText,
    bg: colors.status.successBg,
    border: 'rgba(15,138,95,0.20)',
  };
}

function fmtPrice(n: number): string {
  return `\u20B1${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function mapProductToInventoryItem(product: Product, inventory?: Inventory | null): InventoryItem {
  const stockLevel = inventory?.stockLevel ?? 0;
  const reservedLevel = inventory?.reservedLevel ?? 0;
  const reorderPoint = inventory?.reorderPoint ?? 10;
  const stockStatus = getStockStatus(stockLevel, reservedLevel, reorderPoint);

  return {
    id: product.id,
    serverId: product.serverId,
    name: product.name,
    sku: product.sku,
    mnemonicSku: product.mnemonicSku,
    barcode: product.barcode,
    category: product.category || '',
    familyName: product.familyName,
    unitPrice: product.unitPrice,
    isVariablePrice: product.isVariablePrice,
    isParent: product.isParent,
    parentProductId: product.parentProductId,
    isSerialized: product.isSerialized ?? false,
    isTire: product.isTire ?? false,
    warrantyMonths: product.warrantyMonths ?? null,
    stockLevel,
    reservedLevel,
    reorderPoint,
    availableForSale: inventory?.availableForSale ?? false,
    availableQty: Math.max(0, stockLevel - reservedLevel),
    stockStatus,
  };
}

function applyStockLevel(item: InventoryItem, stockLevel: number): InventoryItem {
  const nextStock = Math.max(0, stockLevel);
  const availableQty = Math.max(0, nextStock - item.reservedLevel);

  return {
    ...item,
    stockLevel: nextStock,
    availableQty,
    availableForSale: availableQty > 0,
    stockStatus: getStockStatus(nextStock, item.reservedLevel, item.reorderPoint),
  };
}

function makeIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildAuthorizedNotes(
  notes: string | undefined,
  approval: ManagerAuthorization | undefined,
  maxLength: number,
): string | undefined {
  const lines = [
    notes?.trim(),
    approval ? `Authorized by ${approval.approverName} via ${approval.method}.` : undefined,
  ].filter(Boolean);

  const value = lines.join('\n').trim();
  return value ? value.slice(0, maxLength) : undefined;
}

function operationTitle(kind: InventoryOperationKind): string {
  switch (kind) {
    case 'count':
      return 'Count Item';
    case 'transfer':
      return 'Request Transfer';
    default:
      return 'Adjust Stock';
  }
}

function describeInventoryRequest(request: InventoryOperationRequest): string {
  if (request.kind === 'transfer') {
    return `Request ${request.quantity} unit(s) transfer for ${request.product.name}`;
  }

  if (request.kind === 'count') {
    const counted = request.countedQty ?? request.product.stockLevel;
    return `Count ${request.product.name}: system ${request.product.stockLevel}, counted ${counted}`;
  }

  const sign = request.direction === 'OUT' ? '-' : '+';
  return `${sign}${request.quantity} ${request.product.name} (${formatReason(request.reasonCode)})`;
}

function buildInventoryAuthorizationAction(request: InventoryOperationRequest): string {
  const detail = describeInventoryRequest(request);
  if (request.kind === 'transfer') {
    return `${detail}\nCreates a draft transfer request only.`;
  }

  const nextStock = request.direction === 'OUT'
    ? Math.max(0, request.product.stockLevel - request.quantity)
    : request.product.stockLevel + request.quantity;
  return `${detail}\nCurrent stock ${request.product.stockLevel}; after approval ${nextStock}.`;
}

function formatDateTime(value?: string): string {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';

  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatReferenceType(referenceType: string): string {
  return referenceType
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function formatReason(reason?: string | null): string {
  if (!reason) return 'No reason';
  return reason
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase());
}

export default function InventoryScreen() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StockFilter>('all');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [detailProduct, setDetailProduct] = useState<InventoryItem | null>(null);
  const [operationMode, setOperationMode] = useState<InventoryOperationKind | null>(null);
  const [operationProduct, setOperationProduct] = useState<InventoryItem | null>(null);
  const [operationSubmitting, setOperationSubmitting] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [authorizationRequest, setAuthorizationRequest] = useState<InventoryOperationRequest | null>(null);
  const [activityVisible, setActivityVisible] = useState(false);
  const [activityProduct, setActivityProduct] = useState<InventoryItem | null>(null);
  const [activityEntries, setActivityEntries] = useState<StockJournalEntry[]>([]);
  const [activityTransfers, setActivityTransfers] = useState<TransferSummary[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const { locationId: authLocationId, locations, user } = useAuth();
  const { isTablet, screenPadding } = useLayout();
  const styles = createStyles(screenPadding, isTablet);

  const lockedLocationId = getLockedLocationId();
  const locationId = lockedLocationId ?? authLocationId ?? storage.getString(KEYS.AUTH_LOCATION_ID);

  const fetchInventoryForProducts = useCallback(async (productIds: string[]) => {
    const inventoryCollection = database.get<Inventory>('inventory');
    const invMap = new Map<string, Inventory>();

    if (!locationId || productIds.length === 0) {
      return invMap;
    }

    const allInventory = await inventoryCollection
      .query(
        Q.where('product_server_id', Q.oneOf(productIds)),
        Q.where('location_id', locationId),
      )
      .fetch();

    for (const inv of allInventory) {
      invMap.set(inv.productServerId, inv);
    }

    return invMap;
  }, [locationId]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const productCollection = database.get<Product>('products');

      const conditions: any[] = [
        Q.where('parent_product_id', Q.eq(null)),
      ];

      const trimmedQuery = query.trim();
      if (trimmedQuery.length >= 2) {
        const words = trimmedQuery.split(/\s+/).filter(w => w.length > 0);
        const sanitizedFull = Q.sanitizeLikeString(trimmedQuery);
        const nameConditions = words.map(word =>
          Q.where('name', Q.like(`%${Q.sanitizeLikeString(word)}%`)),
        );
        const nameQuery = nameConditions.length === 1
          ? nameConditions[0]
          : Q.and(...nameConditions);

        conditions.push(
          Q.or(
            nameQuery,
            Q.where('sku', Q.like(`%${sanitizedFull}%`)),
            Q.where('mnemonic_sku', Q.like(`%${sanitizedFull}%`)),
            Q.where('barcode', Q.like(`%${sanitizedFull}%`)),
          ),
        );
      }

      const products = await productCollection
        .query(...conditions, Q.sortBy('name', Q.asc), Q.take(120))
        .fetch();

      const invMap = await fetchInventoryForProducts(products.map(p => p.serverId));

      let enriched = products.map(product =>
        mapProductToInventoryItem(product, invMap.get(product.serverId)),
      );

      if (filter !== 'all') {
        enriched = enriched.filter(item => item.stockStatus === filter);
      }

      setItems(enriched);
    } catch (err) {
      console.error('[InventoryScreen] Error:', err);
      setItems([]);
      setError('Inventory could not be loaded. Tap Refresh to try again.');
    } finally {
      setLoading(false);
    }
  }, [fetchInventoryForProducts, filter, query]);

  useEffect(() => {
    const timer = setTimeout(() => fetchProducts(), query.trim().length > 0 ? 250 : 0);
    return () => clearTimeout(timer);
  }, [fetchProducts, query]);

  const findProductByBarcode = useCallback(async (barcode: string) => {
    const productCollection = database.get<Product>('products');
    const products = await productCollection
      .query(Q.where('barcode', barcode.trim()))
      .fetch();

    if (products.length === 0) return null;

    const product = products[0];
    const invMap = await fetchInventoryForProducts([product.serverId]);
    return mapProductToInventoryItem(product, invMap.get(product.serverId));
  }, [fetchInventoryForProducts]);

  const handleScanSubmit = useCallback(async (barcode: string) => {
    const product = await findProductByBarcode(barcode);
    if (!product) {
      Alert.alert('No Product Found', 'That barcode is not in the local inventory catalog.');
      return false;
    }

    setQuery(barcode.trim());
    setFilter('all');
    setDetailProduct(product);
    return true;
  }, [findProductByBarcode]);

  const handleInventoryAddToCart = useCallback(() => {
    Alert.alert('Open POS', 'Use the POS tab to add inventory items to a cart.');
    return false;
  }, []);

  const openOperation = useCallback((kind: InventoryOperationKind, product: InventoryItem) => {
    setDetailProduct(null);
    setOperationProduct(product);
    setOperationMode(kind);
    setOperationError(null);
  }, []);

  const closeOperation = useCallback(() => {
    if (operationSubmitting) return;
    setOperationMode(null);
    setOperationProduct(null);
    setOperationError(null);
    setAuthorizationRequest(null);
  }, [operationSubmitting]);

  const updateLocalStock = useCallback(async (product: InventoryItem, delta: number) => {
    if (!locationId || delta === 0) return;

    const nextStock = Math.max(0, product.stockLevel + delta);
    const updateItem = (item: InventoryItem) =>
      item.serverId === product.serverId ? applyStockLevel(item, nextStock) : item;

    setItems(prev => prev.map(updateItem));
    setDetailProduct(prev => prev && prev.serverId === product.serverId ? applyStockLevel(prev, nextStock) : prev);
    setOperationProduct(prev => prev && prev.serverId === product.serverId ? applyStockLevel(prev, nextStock) : prev);

    try {
      const collection = database.get<Inventory>('inventory');
      const rows = await collection
        .query(
          Q.where('product_server_id', product.serverId),
          Q.where('location_id', locationId),
        )
        .fetch();

      if (rows.length === 0) return;

      await database.write(async () => {
        await rows[0].update((record: any) => {
          record.stockLevel = nextStock;
          record.availableForSale = nextStock - record.reservedLevel > 0;
          record.serverUpdatedAt = Date.now();
        });
      });
    } catch (err) {
      console.error('[InventoryScreen] Local inventory update failed:', err);
    }
  }, [locationId]);

  const fetchActivity = useCallback(async (product?: InventoryItem | null) => {
    setActivityLoading(true);
    setActivityError(null);

    try {
      const productParam = product?.serverId ? `&productId=${encodeURIComponent(product.serverId)}` : '';
      const journal = await apiFetch<StockJournalResponse>(`/inventory/journal?limit=30${productParam}`);
      setActivityEntries(journal.data ?? []);

      if (product) {
        setActivityTransfers([]);
      } else {
        const transfers = await apiFetch<TransferListResponse>('/transfers?limit=8')
          .catch(() => ({ data: [], nextCursor: null, hasMore: false }));
        setActivityTransfers(transfers.data ?? []);
      }
    } catch (err: any) {
      setActivityEntries([]);
      setActivityTransfers([]);
      setActivityError(formatPosError(err, 'Inventory activity could not be loaded.'));
    } finally {
      setActivityLoading(false);
    }
  }, []);

  const openActivity = useCallback((product?: InventoryItem | null) => {
    const selectedProduct = product ?? null;
    setActivityProduct(selectedProduct);
    setActivityVisible(true);
    void fetchActivity(selectedProduct);
  }, [fetchActivity]);

  const closeActivity = useCallback(() => {
    setActivityVisible(false);
    setActivityProduct(null);
    setActivityError(null);
  }, []);

  const runInventoryOperation = useCallback(async (
    request: InventoryOperationRequest,
    approval?: ManagerAuthorization,
  ) => {
    const operationLocationId = getLockedLocationId();
    if (!operationLocationId) {
      setOperationError('Register this device to a store before changing inventory.');
      return;
    }

    setAuthorizationRequest(null);
    setOperationSubmitting(true);
    setOperationError(null);

    try {
      if (request.kind === 'transfer') {
        if (!request.destinationLocationId) {
          throw new Error('Choose a destination location.');
        }

        const result = await apiFetch<CreateTransferResponse>('/transfers', {
          method: 'POST',
          requireLockedLocation: true,
          body: JSON.stringify({
            sourceLocationId: operationLocationId,
            destinationLocationId: request.destinationLocationId,
            notes: buildAuthorizedNotes(request.notes, approval, 1000),
            authorizationCredential: approval?.credential,
            authorizationMethod: approval?.method,
            items: [
              {
                productId: request.product.serverId,
                requestedQty: request.quantity,
              },
            ],
          }),
        });

        const transferNo = result.transfer?.transferNo ?? 'Transfer draft';
        logElevation({
          action: 'inventory_transfer_request',
          description: `${transferNo}: ${request.quantity} unit(s) requested for ${request.product.name}`,
          approvedBy: approval?.approverName ?? 'Manager',
          performedBy: user?.fullName ?? 'Unknown',
          metadata: {
            productId: request.product.serverId,
            productName: request.product.name,
            quantity: request.quantity,
            sourceLocationId: operationLocationId,
            destinationLocationId: request.destinationLocationId,
            transferId: result.transfer?.id,
            transferNo,
            notes: request.notes,
            authorizationMethod: approval?.method,
            authorizationUserId: approval?.userId,
            authorizationRole: approval?.role,
          },
        });
        Alert.alert(
          'Transfer Draft Created',
          `${transferNo}: ${request.quantity} unit(s) requested for ${request.product.name}.`,
          [
            { text: 'View Activity', onPress: () => openActivity(null) },
            { text: 'OK', style: 'cancel' },
          ],
        );
      } else {
        const direction = request.direction ?? 'IN';
        const reasonCode = request.reasonCode ?? (direction === 'IN' ? 'FOUND_STOCK' : 'COUNT_LOSS');
        const delta = direction === 'IN' ? request.quantity : -request.quantity;

        await apiFetch('/inventory/adjustments', {
          method: 'POST',
          requireLockedLocation: true,
          body: JSON.stringify({
            productId: request.product.serverId,
            locationId: operationLocationId,
            quantity: request.quantity,
            direction,
            reasonCode,
            notes: buildAuthorizedNotes(request.notes, approval, 500),
            authorizationCredential: approval?.credential,
            authorizationMethod: approval?.method,
            effectiveAt: new Date().toISOString(),
            idempotencyKey: makeIdempotencyKey(`mobile-${request.kind}`),
          }),
        });

        await updateLocalStock(request.product, delta);
        logElevation({
          action: request.kind === 'count' ? 'inventory_count' : 'inventory_adjustment',
          description: describeInventoryRequest(request),
          approvedBy: approval?.approverName ?? 'Manager',
          performedBy: user?.fullName ?? 'Unknown',
          metadata: {
            productId: request.product.serverId,
            productName: request.product.name,
            previousStock: request.product.stockLevel,
            newStock: Math.max(0, request.product.stockLevel + delta),
            quantity: request.quantity,
            countedQty: request.countedQty,
            direction,
            reasonCode,
            notes: request.notes,
            authorizationMethod: approval?.method,
            authorizationUserId: approval?.userId,
            authorizationRole: approval?.role,
          },
        });
        void fetchProducts();
        Alert.alert(
          'Inventory Updated',
          `${request.product.name} stock is now ${Math.max(0, request.product.stockLevel + delta)}.`,
          [
            { text: 'View History', onPress: () => openActivity(request.product) },
            { text: 'OK', style: 'cancel' },
          ],
        );
      }

      closeOperation();
    } catch (err: any) {
      setOperationError(formatPosError(err, 'Inventory operation failed.'));
    } finally {
      setOperationSubmitting(false);
    }
  }, [closeOperation, fetchProducts, openActivity, updateLocalStock, user?.fullName]);

  const requestOperationAuthorization = useCallback((request: InventoryOperationRequest) => {
    setOperationError(null);
    setAuthorizationRequest(request);
  }, []);

  const handleAuthorizationApprove = useCallback((approverName: string, approval?: ManagerAuthorization) => {
    if (!authorizationRequest) return;

    const resolvedApproval = approval ?? {
      approverName,
      credential: '',
      method: 'pin' as const,
    };

    void runInventoryOperation(authorizationRequest, resolvedApproval);
  }, [authorizationRequest, runInventoryOperation]);

  const stockSummary = useMemo(() => ({
    total: items.length,
    low: items.filter(item => item.stockStatus === 'low_stock').length,
    out: items.filter(item => item.stockStatus === 'out_of_stock').length,
  }), [items]);

  const isInitialLoading = loading && items.length === 0;

  const renderItem = ({ item }: { item: InventoryItem }) => {
    const tone = getStockTone(item.stockStatus);
    const metaParts = [
      item.sku || 'No SKU',
      item.barcode ? `BC ${item.barcode}` : null,
      item.category || item.familyName,
    ].filter(Boolean);

    return (
      <Pressable
        style={styles.row}
        onPress={() => setDetailProduct(item)}
        android_ripple={{ color: colors.accent.glow }}
      >
        <View style={styles.rowLeft}>
          <View style={[styles.stockRail, { backgroundColor: tone.color }]} />
          <View style={styles.rowInfo}>
            <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.productSku} numberOfLines={1}>{metaParts.join(' / ')}</Text>
          </View>
        </View>
        <View style={styles.rowRight}>
          <Text style={styles.price}>{item.isVariablePrice ? 'Variable' : fmtPrice(item.unitPrice)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
            <Text style={[styles.statusText, { color: tone.color }]}>{tone.label}</Text>
          </View>
          <Text style={styles.stock}>{item.availableQty} available</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Inventory</Text>
          <Text style={styles.subtitle}>Search stock, scan labels, and inspect item availability.</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.secondaryHeaderButton}
            onPress={() => openActivity(null)}
            android_ripple={{ color: colors.accent.glow }}
          >
            <Icon name="receipt" size={18} color={colors.text.primary} />
            <Text style={styles.headerButtonText}>Activity</Text>
          </Pressable>
          <Pressable
            style={styles.refreshButton}
            onPress={fetchProducts}
            disabled={loading}
            android_ripple={{ color: colors.accent.glow }}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.text.primary} />
            ) : (
              <Icon name="sync" size={18} color={colors.text.primary} />
            )}
            <Text style={styles.headerButtonText}>{loading ? 'Refreshing' : 'Refresh'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <SummaryTile label="Shown" value={stockSummary.total} />
        <SummaryTile label="Low" value={stockSummary.low} tone="warning" />
        <SummaryTile label="Out" value={stockSummary.out} tone="danger" />
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchContainer}>
          <Icon name="search" size={18} color={colors.text.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, SKU, or barcode"
            placeholderTextColor={colors.text.muted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            selectionColor={colors.accent.primary}
            cursorColor={colors.accent.primary}
          />
          {query.length > 0 ? (
            <Pressable
              style={styles.clearButton}
              onPress={() => setQuery('')}
              android_ripple={{ color: colors.accent.glow, borderless: true }}
              accessibilityLabel="Clear inventory search"
            >
              <Icon name="close" size={16} color={colors.text.muted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          style={styles.scanButton}
          onPress={() => setScanModalVisible(true)}
          android_ripple={{ color: colors.accent.pressed }}
        >
          <Icon name="barcode" size={20} color={colors.text.inverse} />
          <Text style={styles.scanButtonText}>Scan</Text>
        </Pressable>
      </View>

      <View style={styles.chipRow}>
        {FILTERS.map(f => (
          <Pressable
            key={f.key}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            onPress={() => setFilter(f.key)}
            android_ripple={{ color: colors.accent.glow }}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Icon name="alert" size={18} color={colors.status.dangerText} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {isInitialLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accent.primary} size="large" />
          <Text style={styles.loadingText}>Loading inventory...</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={fetchProducts}
              tintColor={colors.accent.primary}
              progressBackgroundColor={colors.bg.surface}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Icon name="inventory" size={30} color={colors.text.muted} />
              </View>
              <Text style={styles.emptyTitle}>No products found</Text>
              <Text style={styles.emptySubtitle}>Adjust the search or switch filters.</Text>
            </View>
          }
        />
      )}

      <ProductDetailSheet
        product={detailProduct}
        visible={!!detailProduct}
        onClose={() => setDetailProduct(null)}
        onAddToCart={handleInventoryAddToCart}
        showAddToCart={false}
        footerActions={detailProduct ? (
          <View style={styles.detailActionStack}>
            <Pressable
              style={styles.detailHistoryButton}
              onPress={() => {
                setDetailProduct(null);
                openActivity(detailProduct);
              }}
              android_ripple={{ color: colors.accent.glow }}
            >
              <Icon name="receipt" size={18} color={colors.accent.primary} />
              <Text style={styles.detailHistoryText}>View Movement History</Text>
            </Pressable>
            <View style={styles.detailActionGrid}>
              <InventoryActionButton
                icon="check"
                label="Count"
                onPress={() => openOperation('count', detailProduct)}
              />
              <InventoryActionButton
                icon="more"
                label="Adjust"
                onPress={() => openOperation('adjust', detailProduct)}
              />
              <InventoryActionButton
                icon="sync"
                label="Transfer"
                onPress={() => openOperation('transfer', detailProduct)}
              />
            </View>
          </View>
        ) : null}
      />

      <InventoryOperationModal
        visible={!!operationMode && !!operationProduct}
        mode={operationMode ?? 'adjust'}
        product={operationProduct}
        locations={locations}
        currentLocationId={locationId ?? null}
        submitting={operationSubmitting}
        error={operationError}
        onClose={closeOperation}
        onModeChange={setOperationMode}
        onSubmit={requestOperationAuthorization}
      />

      <InventoryActivityModal
        visible={activityVisible}
        product={activityProduct}
        entries={activityEntries}
        transfers={activityTransfers}
        loading={activityLoading}
        error={activityError}
        onRefresh={() => fetchActivity(activityProduct)}
        onClose={closeActivity}
      />

      <BarcodeScanModal
        visible={scanModalVisible}
        title="Scan Inventory Barcode"
        subtitle="Use the paired scanner, or type the product barcode to open its inventory detail."
        placeholder="Scan or enter barcode"
        actionLabel="Open Item"
        onSubmit={handleScanSubmit}
        onClose={() => setScanModalVisible(false)}
      />

      <ManagerPinModal
        visible={!!authorizationRequest}
        action={authorizationRequest ? buildInventoryAuthorizationAction(authorizationRequest) : 'Inventory operation'}
        requiredLevel={2}
        onApprove={handleAuthorizationApprove}
        onCancel={() => setAuthorizationRequest(null)}
      />
    </View>
  );
}

function InventoryActionButton({
  icon,
  label,
  onPress,
}: {
  icon: 'check' | 'more' | 'sync';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={sharedStyles.actionButton}
      onPress={onPress}
      android_ripple={{ color: colors.accent.glow }}
    >
      <Icon name={icon} size={18} color={colors.accent.primary} />
      <Text style={sharedStyles.actionButtonText}>{label}</Text>
    </Pressable>
  );
}

function InventoryActivityModal({
  visible,
  product,
  entries,
  transfers,
  loading,
  error,
  onRefresh,
  onClose,
}: {
  visible: boolean;
  product: InventoryItem | null;
  entries: StockJournalEntry[];
  transfers: TransferSummary[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const hasContent = entries.length > 0 || transfers.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={activityStyles.overlay}>
        <Pressable style={activityStyles.backdrop} onPress={onClose} />
        <View style={activityStyles.panel}>
          <View style={activityStyles.header}>
            <View style={activityStyles.headerCopy}>
              <Text style={activityStyles.title}>
                {product ? 'Movement History' : 'Inventory Activity'}
              </Text>
              <Text style={activityStyles.subtitle} numberOfLines={1}>
                {product ? product.name : 'Recent stock movements and transfer drafts'}
              </Text>
            </View>
            <View style={activityStyles.headerButtons}>
              <Pressable
                style={activityStyles.iconButton}
                onPress={onRefresh}
                disabled={loading}
                android_ripple={{ color: colors.accent.glow, borderless: true }}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.text.secondary} />
                ) : (
                  <Icon name="sync" size={20} color={colors.text.secondary} />
                )}
              </Pressable>
              <Pressable
                style={activityStyles.iconButton}
                onPress={onClose}
                android_ripple={{ color: colors.accent.glow, borderless: true }}
              >
                <Icon name="close" size={22} color={colors.text.secondary} />
              </Pressable>
            </View>
          </View>

          {loading && !hasContent ? (
            <View style={activityStyles.loadingState}>
              <ActivityIndicator size="large" color={colors.accent.primary} />
              <Text style={activityStyles.emptyText}>Loading activity...</Text>
            </View>
          ) : error ? (
            <View style={activityStyles.errorBox}>
              <Icon name="alert" size={18} color={colors.status.dangerText} />
              <Text style={activityStyles.errorText}>{error}</Text>
            </View>
          ) : !hasContent ? (
            <View style={activityStyles.emptyState}>
              <View style={activityStyles.emptyIcon}>
                <Icon name="receipt" size={30} color={colors.text.muted} />
              </View>
              <Text style={activityStyles.emptyTitle}>No recent activity</Text>
              <Text style={activityStyles.emptyText}>
                Completed stock movements will appear here after sync.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={activityStyles.content}
              showsVerticalScrollIndicator={false}
            >
              {!product && transfers.length > 0 ? (
                <View style={activityStyles.section}>
                  <Text style={activityStyles.sectionTitle}>TRANSFER DRAFTS</Text>
                  {transfers.map(transfer => (
                    <TransferActivityRow key={transfer.id} transfer={transfer} />
                  ))}
                </View>
              ) : null}

              <View style={activityStyles.section}>
                <Text style={activityStyles.sectionTitle}>STOCK MOVEMENTS</Text>
                {entries.map(entry => (
                  <JournalActivityRow key={entry.id} entry={entry} />
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function JournalActivityRow({ entry }: { entry: StockJournalEntry }) {
  const qty = Number(entry.changeQuantity ?? 0);
  const isPositive = qty > 0;
  const color = isPositive ? colors.status.successText : colors.status.dangerText;
  const qtyLabel = `${isPositive ? '+' : ''}${qty}`;
  const date = formatDateTime(entry.effectiveAt || entry.createdAt);

  return (
    <View style={activityStyles.activityRow}>
      <View style={[activityStyles.activityRail, { backgroundColor: color }]} />
      <View style={activityStyles.activityBody}>
        <View style={activityStyles.activityTopLine}>
          <Text style={activityStyles.activityName} numberOfLines={1}>{entry.productName}</Text>
          <Text style={[activityStyles.activityQty, { color }]}>{qtyLabel}</Text>
        </View>
        <Text style={activityStyles.activityMeta} numberOfLines={1}>
          {formatReferenceType(entry.referenceType)} / {entry.locationName} / Balance {entry.balanceAfter}
        </Text>
        <Text style={activityStyles.activityDetail} numberOfLines={1}>
          {formatReason(entry.reasonCode)}
          {entry.referenceNumber ? ` / ${entry.referenceNumber}` : ''}
          {entry.actorName ? ` / ${entry.actorName}` : ''}
        </Text>
        {entry.notes ? (
          <Text style={activityStyles.activityNotes} numberOfLines={2}>{entry.notes}</Text>
        ) : null}
      </View>
      <Text style={activityStyles.activityDate}>{date}</Text>
    </View>
  );
}

function TransferActivityRow({ transfer }: { transfer: TransferSummary }) {
  return (
    <View style={activityStyles.transferRow}>
      <View style={activityStyles.transferIcon}>
        <Icon name="sync" size={18} color={colors.accent.primary} />
      </View>
      <View style={activityStyles.transferBody}>
        <View style={activityStyles.activityTopLine}>
          <Text style={activityStyles.activityName} numberOfLines={1}>{transfer.transferNo}</Text>
          <View style={activityStyles.transferStatus}>
            <Text style={activityStyles.transferStatusText}>{transfer.status}</Text>
          </View>
        </View>
        <Text style={activityStyles.activityMeta} numberOfLines={1}>
          {transfer.sourceLocationName} to {transfer.destinationLocationName}
        </Text>
        <Text style={activityStyles.activityDetail}>
          {transfer.lineCount} line{transfer.lineCount === 1 ? '' : 's'} / {formatDateTime(transfer.createdAt)}
        </Text>
      </View>
    </View>
  );
}

function InventoryOperationModal({
  visible,
  mode,
  product,
  locations,
  currentLocationId,
  submitting,
  error,
  onClose,
  onModeChange,
  onSubmit,
}: {
  visible: boolean;
  mode: InventoryOperationKind;
  product: InventoryItem | null;
  locations: LocationInfo[];
  currentLocationId: string | null;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onModeChange: (mode: InventoryOperationKind) => void;
  onSubmit: (request: InventoryOperationRequest) => void;
}) {
  const [direction, setDirection] = useState<AdjustmentDirection>('IN');
  const [reasonCode, setReasonCode] = useState<AdjustmentReasonCode>('FOUND_STOCK');
  const [quantityText, setQuantityText] = useState('1');
  const [countedText, setCountedText] = useState('0');
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [confirmationText, setConfirmationText] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const destinationOptions = useMemo(
    () => locations.filter(location =>
      location.isActive &&
      location.id !== currentLocationId &&
      location.type !== 'TRANSIT_BUFFER',
    ),
    [currentLocationId, locations],
  );

  useEffect(() => {
    if (!visible || !product) return;

    setDirection('IN');
    setReasonCode('FOUND_STOCK');
    setQuantityText('1');
    setCountedText(String(product.stockLevel));
    setDestinationId(destinationOptions[0]?.id ?? null);
    setNotes('');
    setConfirmationText('');
    setLocalError(null);
  }, [destinationOptions, product, visible]);

  useEffect(() => {
    const firstReason = ADJUSTMENT_REASONS[direction][0]?.code;
    if (firstReason) setReasonCode(firstReason);
    setConfirmationText('');
  }, [direction]);

  useEffect(() => {
    setConfirmationText('');
  }, [mode, reasonCode]);

  if (!product) return null;

  const quantity = Number.parseInt(quantityText, 10);
  const countedQty = Number.parseInt(countedText, 10);
  const variance = Number.isFinite(countedQty) ? countedQty - product.stockLevel : 0;
  const selectedDestination = destinationOptions.find(location => location.id === destinationId);
  const effectiveQuantity = mode === 'count' ? Math.abs(variance) : quantity;
  const adjustmentDirection = mode === 'count'
    ? variance >= 0 ? 'IN' : 'OUT'
    : direction;
  const isStockMutation = mode !== 'transfer';
  const requiresNote = isStockMutation && (
    (mode === 'count' && variance !== 0) ||
    adjustmentDirection === 'OUT' ||
    reasonCode === 'DATA_CORRECTION'
  );
  const noteReady = !requiresNote || notes.trim().length >= MIN_OPERATION_NOTE_LENGTH;
  const requiresConfirmation = mode === 'transfer'
    ? Number.isInteger(quantity) && quantity >= LARGE_STOCK_CHANGE_QTY
    : Number.isInteger(effectiveQuantity) && (
      effectiveQuantity >= LARGE_STOCK_CHANGE_QTY ||
      (mode === 'count' ? variance < 0 : adjustmentDirection === 'OUT') ||
      reasonCode === 'DATA_CORRECTION'
    );
  const confirmationWord = mode === 'transfer' ? TRANSFER_CONFIRMATION_WORD : ADJUST_CONFIRMATION_WORD;
  const confirmationReady = !requiresConfirmation ||
    confirmationText.trim().toUpperCase() === confirmationWord;
  const riskItems = [
    mode === 'count' && variance !== 0 ? 'Cycle count will create a stock adjustment for the variance.' : null,
    adjustmentDirection === 'OUT' && mode !== 'transfer' && effectiveQuantity > 0 ? 'Stock removal affects sellable quantity immediately.' : null,
    isStockMutation && reasonCode === 'DATA_CORRECTION' ? 'Data correction should be used only for verified system corrections.' : null,
    effectiveQuantity >= LARGE_STOCK_CHANGE_QTY ? `Large quantity: ${effectiveQuantity} unit(s).` : null,
    mode === 'transfer' ? 'Transfer is created as a draft request; it does not move stock yet.' : null,
  ].filter((item): item is string => Boolean(item));

  const showError = localError || error;

  const handleSubmit = () => {
    setLocalError(null);

    if (mode === 'count') {
      if (!Number.isInteger(countedQty) || countedQty < 0) {
        setLocalError('Enter a valid counted quantity.');
        return;
      }

      if (variance === 0) {
        setLocalError('Count matches system stock. No adjustment is needed.');
        return;
      }

      if (!noteReady) {
        setLocalError(`Add an audit note of at least ${MIN_OPERATION_NOTE_LENGTH} characters for this count.`);
        return;
      }

      if (!confirmationReady) {
        setLocalError(`Type ${confirmationWord} to confirm this stock count adjustment.`);
        return;
      }

      const countNotes = [
        `Cycle count variance. System ${product.stockLevel}; counted ${countedQty}.`,
        notes.trim(),
      ].filter(Boolean).join('\n');

      onSubmit({
        kind: 'count',
        product,
        quantity: Math.abs(variance),
        countedQty,
        direction: variance > 0 ? 'IN' : 'OUT',
        reasonCode: variance > 0 ? 'COUNT_GAIN' : 'COUNT_LOSS',
        notes: countNotes,
      });
      return;
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      setLocalError('Enter a quantity of at least 1.');
      return;
    }

    if (mode === 'transfer') {
      if (!currentLocationId) {
        setLocalError('Select a source location first.');
        return;
      }

      if (!destinationId) {
        setLocalError('Choose a destination location.');
        return;
      }

      if (quantity > product.availableQty) {
        setLocalError(`Only ${product.availableQty} unit(s) are available for transfer.`);
        return;
      }

      if (!confirmationReady) {
        setLocalError(`Type ${confirmationWord} to confirm this transfer request.`);
        return;
      }

      onSubmit({
        kind: 'transfer',
        product,
        quantity,
        destinationLocationId: destinationId,
        notes: notes.trim(),
      });
      return;
    }

    if (direction === 'OUT' && quantity > product.stockLevel) {
      setLocalError(`Only ${product.stockLevel} unit(s) are on hand.`);
      return;
    }

    if (!noteReady) {
      setLocalError(`Add an audit note of at least ${MIN_OPERATION_NOTE_LENGTH} characters for this adjustment.`);
      return;
    }

    if (!confirmationReady) {
      setLocalError(`Type ${confirmationWord} to confirm this stock adjustment.`);
      return;
    }

    onSubmit({
      kind: 'adjust',
      product,
      quantity,
      direction,
      reasonCode,
      notes: notes.trim(),
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={operationStyles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={operationStyles.backdrop} onPress={onClose} />
        <View style={operationStyles.panel}>
          <View style={operationStyles.header}>
            <View style={operationStyles.headerCopy}>
              <Text style={operationStyles.title}>{operationTitle(mode)}</Text>
              <Text style={operationStyles.productName} numberOfLines={1}>{product.name}</Text>
            </View>
            <Pressable
              style={operationStyles.closeButton}
              onPress={onClose}
              disabled={submitting}
              android_ripple={{ color: colors.accent.glow, borderless: true }}
            >
              <Icon name="close" size={22} color={colors.text.secondary} />
            </Pressable>
          </View>

          <View style={operationStyles.modeRow}>
            {(['adjust', 'count', 'transfer'] as InventoryOperationKind[]).map(item => (
              <Pressable
                key={item}
                style={[operationStyles.modeButton, mode === item && operationStyles.modeButtonActive]}
                onPress={() => onModeChange(item)}
                disabled={submitting}
                android_ripple={{ color: colors.accent.glow }}
              >
                <Text style={[operationStyles.modeButtonText, mode === item && operationStyles.modeButtonTextActive]}>
                  {operationTitle(item)}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView
            style={operationStyles.form}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={operationStyles.metricRow}>
              <Metric label="On Hand" value={product.stockLevel} />
              <Metric label="Available" value={product.availableQty} />
              <Metric label="Reserved" value={product.reservedLevel} />
            </View>

            <View style={operationStyles.guardrailCard}>
              <View style={operationStyles.guardrailHeader}>
                <Text style={operationStyles.guardrailTitle}>POS inventory guardrail</Text>
                <Text style={operationStyles.guardrailPill}>Manager approval</Text>
              </View>
              <Text style={operationStyles.guardrailText}>
                {mode === 'transfer'
                  ? 'This creates a transfer request only. ERP or warehouse flow still controls fulfillment.'
                  : 'This changes store stock for the locked register location and is recorded in movement history.'}
              </Text>
              {riskItems.length > 0 ? (
                <View style={operationStyles.riskList}>
                  {riskItems.map(item => (
                    <View key={item} style={operationStyles.riskRow}>
                      <View style={operationStyles.riskDot} />
                      <Text style={operationStyles.riskText}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {mode === 'adjust' ? (
              <>
                <Text style={operationStyles.fieldLabel}>Direction</Text>
                <View style={operationStyles.segmentRow}>
                  {(['IN', 'OUT'] as AdjustmentDirection[]).map(item => (
                    <Pressable
                      key={item}
                      style={[operationStyles.segment, direction === item && operationStyles.segmentActive]}
                      onPress={() => setDirection(item)}
                      disabled={submitting}
                      android_ripple={{ color: colors.accent.glow }}
                    >
                      <Text style={[operationStyles.segmentText, direction === item && operationStyles.segmentTextActive]}>
                        {item === 'IN' ? 'Add Stock' : 'Remove Stock'}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={operationStyles.fieldLabel}>Reason</Text>
                <View style={operationStyles.reasonGrid}>
                  {ADJUSTMENT_REASONS[direction].map(reason => (
                    <Pressable
                      key={reason.code}
                      style={[operationStyles.reasonChip, reasonCode === reason.code && operationStyles.reasonChipActive]}
                      onPress={() => setReasonCode(reason.code)}
                      disabled={submitting}
                      android_ripple={{ color: colors.accent.glow }}
                    >
                      <Text style={[operationStyles.reasonText, reasonCode === reason.code && operationStyles.reasonTextActive]}>
                        {reason.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <QuantityInput
                  label="Quantity"
                  value={quantityText}
                  onChangeText={setQuantityText}
                  editable={!submitting}
                />
              </>
            ) : null}

            {mode === 'count' ? (
              <>
                <QuantityInput
                  label="Counted Quantity"
                  value={countedText}
                  onChangeText={setCountedText}
                  editable={!submitting}
                />
                <View style={operationStyles.varianceRow}>
                  <Text style={operationStyles.varianceLabel}>Variance</Text>
                  <Text
                    style={[
                      operationStyles.varianceValue,
                      variance < 0 && operationStyles.varianceNegative,
                      variance > 0 && operationStyles.variancePositive,
                    ]}
                  >
                    {variance > 0 ? `+${variance}` : variance}
                  </Text>
                </View>
              </>
            ) : null}

            {mode === 'transfer' ? (
              <>
                <QuantityInput
                  label="Requested Quantity"
                  value={quantityText}
                  onChangeText={setQuantityText}
                  editable={!submitting}
                />

                <Text style={operationStyles.fieldLabel}>Destination</Text>
                {destinationOptions.length > 0 ? (
                  <View style={operationStyles.destinationList}>
                    {destinationOptions.map(location => (
                      <Pressable
                        key={location.id}
                        style={[
                          operationStyles.destinationButton,
                          destinationId === location.id && operationStyles.destinationButtonActive,
                        ]}
                        onPress={() => setDestinationId(location.id)}
                        disabled={submitting}
                        android_ripple={{ color: colors.accent.glow }}
                      >
                        <View>
                          <Text
                            style={[
                              operationStyles.destinationName,
                              destinationId === location.id && operationStyles.destinationNameActive,
                            ]}
                            numberOfLines={1}
                          >
                            {location.name}
                          </Text>
                          <Text style={operationStyles.destinationMeta}>{location.code} / {location.type}</Text>
                        </View>
                        {destinationId === location.id ? (
                          <Icon name="check" size={18} color={colors.accent.primary} />
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text style={operationStyles.emptyHelp}>No other active locations are available.</Text>
                )}

                {selectedDestination ? (
                  <Text style={operationStyles.destinationHint}>
                    Draft transfer to {selectedDestination.name}
                  </Text>
                ) : null}
              </>
            ) : null}

            <Text style={operationStyles.fieldLabel}>Notes</Text>
            <TextInput
              style={operationStyles.notesInput}
              value={notes}
              onChangeText={setNotes}
              editable={!submitting}
              placeholder={mode === 'transfer' ? 'Transfer note' : 'Reason details'}
              placeholderTextColor={colors.text.muted}
              multiline
              textAlignVertical="top"
              selectionColor={colors.accent.primary}
              cursorColor={colors.accent.primary}
            />
            <Text style={[
              operationStyles.readinessHint,
              noteReady ? operationStyles.readinessReady : operationStyles.readinessBlocked,
            ]}>
              {requiresNote
                ? noteReady
                  ? 'Audit note is ready.'
                  : `Required: add at least ${MIN_OPERATION_NOTE_LENGTH} characters for audit.`
                : 'Optional, but useful for later review.'}
            </Text>

            {requiresConfirmation ? (
              <>
                <Text style={operationStyles.fieldLabel}>Confirmation</Text>
                <TextInput
                  style={operationStyles.confirmInput}
                  value={confirmationText}
                  onChangeText={(text) => setConfirmationText(text.toUpperCase())}
                  editable={!submitting}
                  placeholder={`Type ${confirmationWord}`}
                  placeholderTextColor={colors.text.muted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="done"
                  selectionColor={colors.accent.primary}
                  cursorColor={colors.accent.primary}
                />
                <Text style={[
                  operationStyles.readinessHint,
                  confirmationReady ? operationStyles.readinessReady : operationStyles.readinessBlocked,
                ]}>
                  {confirmationReady
                    ? 'Confirmation accepted.'
                    : `Required for this higher-risk ${mode === 'transfer' ? 'request' : 'stock change'}.`}
                </Text>
              </>
            ) : null}

            {showError ? (
              <View style={operationStyles.errorBox}>
                <Icon name="alert" size={16} color={colors.status.dangerText} />
                <Text style={operationStyles.errorText}>{showError}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={operationStyles.footer}>
            <Pressable
              style={operationStyles.cancelButton}
              onPress={onClose}
              disabled={submitting}
              android_ripple={{ color: colors.accent.glow }}
            >
              <Text style={operationStyles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[operationStyles.submitButton, submitting && operationStyles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
              android_ripple={{ color: colors.accent.pressed }}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.text.inverse} />
              ) : (
                <Text style={operationStyles.submitText}>Authorize</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function QuantityInput({
  label,
  value,
  onChangeText,
  editable,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  editable: boolean;
}) {
  return (
    <View style={operationStyles.inputGroup}>
      <Text style={operationStyles.fieldLabel}>{label}</Text>
      <TextInput
        style={operationStyles.quantityInput}
        value={value}
        onChangeText={(text) => onChangeText(text.replace(/[^\d]/g, ''))}
        editable={editable}
        keyboardType="number-pad"
        selectTextOnFocus
        placeholder="0"
        placeholderTextColor={colors.text.muted}
        selectionColor={colors.accent.primary}
        cursorColor={colors.accent.primary}
      />
    </View>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={operationStyles.metric}>
      <Text style={operationStyles.metricLabel}>{label}</Text>
      <Text style={operationStyles.metricValue}>{value}</Text>
    </View>
  );
}

function SummaryTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'warning' | 'danger';
}) {
  return (
    <View style={sharedStyles.summaryTile}>
      <Text style={sharedStyles.summaryLabel}>{label}</Text>
      <Text
        style={[
          sharedStyles.summaryValue,
          tone === 'warning' && sharedStyles.summaryWarning,
          tone === 'danger' && sharedStyles.summaryDanger,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const sharedStyles = StyleSheet.create({
  actionButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: radius.md,
    backgroundColor: colors.bg.surface,
    paddingHorizontal: spacing.sm,
  },
  actionButtonText: {
    color: colors.accent.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
  summaryTile: {
    flex: 1,
    minHeight: 62,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: radius.md,
    backgroundColor: colors.bg.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  summaryLabel: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
  },
  summaryValue: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize['3xl'],
    marginTop: spacing.xs,
  },
  summaryWarning: {
    color: colors.status.warningText,
  },
  summaryDanger: {
    color: colors.status.dangerText,
  },
});

const activityStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(23,32,51,0.48)',
  },
  panel: {
    width: '100%',
    maxWidth: 720,
    maxHeight: '86%',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.bg.surface,
    padding: spacing.lg,
    elevation: 18,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.20,
    shadowRadius: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...textStyles.heading,
    color: colors.text.primary,
  },
  subtitle: {
    color: colors.text.secondary,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  content: {
    maxHeight: 620,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...textStyles.label,
    color: colors.text.muted,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  activityRow: {
    flexDirection: 'row',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    paddingVertical: spacing.md,
  },
  activityRail: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: radius.sm,
  },
  activityBody: {
    flex: 1,
    minWidth: 0,
  },
  activityTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  activityName: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fonts.display.semiBold,
    fontSize: fontSize.lg,
  },
  activityQty: {
    fontFamily: fonts.display.bold,
    fontSize: fontSize['2xl'],
    minWidth: 48,
    textAlign: 'right',
  },
  activityMeta: {
    color: colors.text.secondary,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  activityDetail: {
    color: colors.text.muted,
    fontFamily: fonts.body.regular,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  activityNotes: {
    color: colors.text.secondary,
    fontFamily: fonts.body.regular,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
  },
  activityDate: {
    width: 86,
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
    textAlign: 'right',
  },
  transferRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    backgroundColor: colors.bg.base,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  transferIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.accent.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferBody: {
    flex: 1,
    minWidth: 0,
  },
  transferStatus: {
    minHeight: 24,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: radius.sm,
    backgroundColor: colors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  transferStatusText: {
    color: colors.text.secondary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.xs,
  },
  loadingState: {
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  emptyState: {
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.bg.base,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display.semiBold,
    fontSize: fontSize.xl,
  },
  emptyText: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  errorBox: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(194,65,58,0.20)',
    borderRadius: radius.md,
    backgroundColor: colors.status.dangerBg,
    paddingHorizontal: spacing.md,
  },
  errorText: {
    flex: 1,
    color: colors.status.dangerText,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
  },
});

const operationStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(23,32,51,0.48)',
  },
  panel: {
    width: '100%',
    maxWidth: 620,
    maxHeight: '90%',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.bg.surface,
    padding: spacing.lg,
    elevation: 18,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.20,
    shadowRadius: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...textStyles.heading,
    color: colors.text.primary,
  },
  productName: {
    color: colors.text.secondary,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
  },
  closeButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  modeButton: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: radius.md,
    backgroundColor: colors.bg.surface,
    paddingHorizontal: spacing.sm,
  },
  modeButtonActive: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.accent.muted,
  },
  modeButtonText: {
    color: colors.text.secondary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  modeButtonTextActive: {
    color: colors.accent.primary,
  },
  form: {
    maxHeight: 620,
  },
  metricRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  metric: {
    flex: 1,
    minHeight: 58,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    backgroundColor: colors.bg.base,
    paddingHorizontal: spacing.md,
  },
  metricLabel: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
  },
  metricValue: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize['2xl'],
    marginTop: spacing.xs,
  },
  guardrailCard: {
    borderWidth: 1,
    borderColor: colors.status.warning,
    borderRadius: radius.md,
    backgroundColor: colors.status.warningBg,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  guardrailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  guardrailTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display.semiBold,
    fontSize: fontSize.md,
  },
  guardrailPill: {
    color: colors.status.warningText,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.xs,
    borderWidth: 1,
    borderColor: colors.status.warning,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  guardrailText: {
    color: colors.text.secondary,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
  },
  riskList: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  riskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  riskDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.status.warning,
    marginTop: 6,
  },
  riskText: {
    flex: 1,
    color: colors.text.secondary,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
  },
  fieldLabel: {
    color: colors.text.secondary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  segment: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: radius.md,
    backgroundColor: colors.bg.surface,
  },
  segmentActive: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.accent.muted,
  },
  segmentText: {
    color: colors.text.secondary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.md,
  },
  segmentTextActive: {
    color: colors.accent.primary,
  },
  reasonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  reasonChip: {
    minHeight: 38,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: radius.md,
    backgroundColor: colors.bg.surface,
    paddingHorizontal: spacing.md,
  },
  reasonChipActive: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.accent.muted,
  },
  reasonText: {
    color: colors.text.secondary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
  reasonTextActive: {
    color: colors.accent.primary,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  quantityInput: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    backgroundColor: colors.bg.input,
    paddingHorizontal: spacing.md,
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize['3xl'],
  },
  varianceRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.md,
    backgroundColor: colors.bg.base,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  varianceLabel: {
    color: colors.text.secondary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.md,
  },
  varianceValue: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize['2xl'],
  },
  variancePositive: {
    color: colors.status.successText,
  },
  varianceNegative: {
    color: colors.status.dangerText,
  },
  destinationList: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  destinationButton: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: radius.md,
    backgroundColor: colors.bg.surface,
    paddingHorizontal: spacing.md,
  },
  destinationButtonActive: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.accent.muted,
  },
  destinationName: {
    color: colors.text.primary,
    fontFamily: fonts.display.semiBold,
    fontSize: fontSize.lg,
  },
  destinationNameActive: {
    color: colors.accent.primary,
  },
  destinationMeta: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  destinationHint: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },
  emptyHelp: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.md,
    marginBottom: spacing.md,
  },
  notesInput: {
    minHeight: 86,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    backgroundColor: colors.bg.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text.primary,
    fontFamily: fonts.body.regular,
    fontSize: fontSize.lg,
    marginBottom: spacing.xs,
  },
  confirmInput: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: radius.md,
    backgroundColor: colors.bg.input,
    paddingHorizontal: spacing.md,
    color: colors.text.primary,
    fontFamily: fonts.mono.semiBold,
    fontSize: fontSize.lg,
    marginBottom: spacing.xs,
  },
  readinessHint: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.xs,
    marginBottom: spacing.md,
  },
  readinessReady: {
    color: colors.status.successText,
  },
  readinessBlocked: {
    color: colors.status.warningText,
  },
  errorBox: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(194,65,58,0.20)',
    borderRadius: radius.md,
    backgroundColor: colors.status.dangerBg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    flex: 1,
    color: colors.status.dangerText,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    paddingTop: spacing.md,
  },
  cancelButton: {
    minWidth: 118,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: radius.md,
    backgroundColor: colors.bg.surface,
    paddingHorizontal: spacing.lg,
  },
  cancelText: {
    color: colors.text.secondary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.md,
  },
  submitButton: {
    minWidth: 138,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accent.primary,
    paddingHorizontal: spacing.lg,
  },
  submitButtonDisabled: {
    opacity: 0.65,
  },
  submitText: {
    ...textStyles.button,
    color: colors.text.inverse,
  },
});

const createStyles = (screenPadding: number, isTablet: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    ...textStyles.heading,
    color: colors.text.primary,
  },
  subtitle: {
    color: colors.text.secondary,
    fontFamily: fonts.body.regular,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  secondaryHeaderButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bg.surface,
  },
  refreshButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bg.surface,
  },
  headerButtonText: {
    color: colors.text.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.md,
  },
  searchRow: {
    flexDirection: isTablet ? 'row' : 'column',
    gap: spacing.sm,
    paddingHorizontal: screenPadding,
  },
  searchContainer: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bg.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  searchInput: {
    flex: 1,
    minHeight: 50,
    color: colors.text.primary,
    fontFamily: fonts.body.regular,
    fontSize: fontSize.lg,
  },
  clearButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  scanButton: {
    minHeight: 52,
    minWidth: isTablet ? 132 : undefined,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accent.primary,
    paddingHorizontal: spacing.lg,
  },
  scanButtonText: {
    ...textStyles.button,
    color: colors.text.inverse,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: screenPadding,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  chip: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.bg.surface,
  },
  chipActive: {
    backgroundColor: colors.accent.muted,
    borderColor: colors.accent.primary,
  },
  chipText: {
    color: colors.text.secondary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
  chipTextActive: {
    color: colors.accent.primary,
  },
  errorBanner: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: screenPadding,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(194,65,58,0.20)',
    borderRadius: radius.md,
    backgroundColor: colors.status.dangerBg,
    paddingHorizontal: spacing.md,
  },
  errorText: {
    flex: 1,
    color: colors.status.dangerText,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
  },
  listContent: {
    paddingHorizontal: screenPadding,
    paddingBottom: layout.tabBarHeight + spacing['3xl'],
  },
  row: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    backgroundColor: colors.bg.base,
    paddingVertical: spacing.md,
  },
  rowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minWidth: 0,
  },
  stockRail: {
    width: 4,
    alignSelf: 'stretch',
    minHeight: 44,
    borderRadius: radius.sm,
  },
  rowInfo: {
    flex: 1,
    minWidth: 0,
  },
  productName: {
    color: colors.text.primary,
    fontFamily: fonts.display.semiBold,
    fontSize: fontSize.xl,
  },
  productSku: {
    color: colors.text.secondary,
    fontFamily: fonts.body.regular,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
  },
  rowRight: {
    alignItems: 'flex-end',
    marginLeft: spacing.sm,
    gap: spacing.xs,
  },
  price: {
    color: colors.text.primary,
    fontFamily: fonts.display.bold,
    fontSize: fontSize.lg,
  },
  statusBadge: {
    minHeight: 24,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  statusText: {
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.xs,
  },
  stock: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.sm,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    color: colors.text.muted,
    fontFamily: fonts.body.medium,
    fontSize: fontSize.md,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['4xl'],
    gap: spacing.sm,
  },
  emptyIconWrap: {
    width: 58,
    height: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.bg.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    color: colors.text.primary,
    fontFamily: fonts.display.semiBold,
    fontSize: fontSize.xl,
  },
  emptySubtitle: {
    color: colors.text.muted,
    fontFamily: fonts.body.regular,
    fontSize: fontSize.md,
  },
  detailActionStack: {
    gap: spacing.sm,
  },
  detailHistoryButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: radius.md,
    backgroundColor: colors.bg.surface,
    paddingHorizontal: spacing.md,
  },
  detailHistoryText: {
    color: colors.accent.primary,
    fontFamily: fonts.body.semiBold,
    fontSize: fontSize.sm,
  },
  detailActionGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
