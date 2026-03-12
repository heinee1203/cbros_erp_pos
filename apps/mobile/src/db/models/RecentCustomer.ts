import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export default class RecentCustomer extends Model {
  static table = 'recent_customers';

  @text('server_id') serverId!: string;
  @text('name') name!: string;
  @text('phone') phone!: string;
  @text('notes') notes!: string | null;
  @field('cached_at') cachedAt!: number;
}
