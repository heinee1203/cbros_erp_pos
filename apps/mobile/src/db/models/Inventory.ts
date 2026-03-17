import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class Inventory extends Model {
  static table = 'inventory';

  @text('server_id') serverId!: string;
  @text('product_server_id') productServerId!: string;
  @text('location_id') locationId!: string;
  @field('stock_level') stockLevel!: number;
  @field('reserved_level') reservedLevel!: number;
  @field('reorder_point') reorderPoint!: number;
  @field('available_for_sale') availableForSale!: boolean;
  @field('server_updated_at') serverUpdatedAt!: number;
}
