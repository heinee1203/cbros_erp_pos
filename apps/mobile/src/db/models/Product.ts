import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class Product extends Model {
  static table = 'products';

  @text('server_id') serverId!: string;
  @text('name') name!: string;
  @text('sku') sku!: string;
  @text('mnemonic_sku') mnemonicSku!: string;
  @text('barcode') barcode!: string | null;
  @text('oem_number') oemNumber!: string | null;
  @text('category') category!: string;
  @field('unit_price') unitPrice!: number;
  @field('is_variable_price') isVariablePrice!: boolean;
  @text('image_url') imageUrl!: string | null;
  @text('family_id') familyId!: string | null;
  @text('family_name') familyName!: string | null;
  @text('brand_id') brandId!: string | null;
  @text('parent_product_id') parentProductId!: string | null;
  @field('is_parent') isParent!: boolean;
  @field('server_updated_at') serverUpdatedAt!: number;
}
