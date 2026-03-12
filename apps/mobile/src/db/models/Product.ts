import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class Product extends Model {
  static table = 'products';

  @text('server_id') serverId!: string;
  @text('name') name!: string;
  @text('sku') sku!: string;
  @text('mnemonic_sku') mnemonicSku!: string;
  @text('barcode') barcode!: string | null;
  @text('category') category!: string;
  @field('unit_price') unitPrice!: number;
  @text('image_url') imageUrl!: string | null;
  @text('family_id') familyId!: string | null;
  @field('server_updated_at') serverUpdatedAt!: number;
}
