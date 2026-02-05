import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SupabaseService } from '../services/supabase.service';

type SyncInputItem = {
  cardId: string;
  amount?: number;
  [key: string]: unknown;
};

type MappedResult = {
  cardId: string;
  mappedId: string | null;
  amount: number;
};

@Component({
  selector: 'app-sync',
  templateUrl: './sync.component.html',
  styleUrls: ['./sync.component.css']
})
export class SyncComponent {
  inputText = '';
  loading = false;
  uploading = false;
  error: string | null = null;
  results: MappedResult[] = [];
  processedCount = 0;
  skippedCount = 0;
  failedCount = 0;
  packStats: Record<string, {
    pack: string;
    updated: number;
    skipped: number;
    failed: number;
    deleted: number;
    skippedItems: { cardId: string; mappedId?: string | null; reason: string }[];
    failedItems: { cardId: string; mappedId?: string | null; error?: string }[];
  }> = {};
  packOrder: string[] = [];

  private SYNC_URL = 'https://raw.githubusercontent.com/tommycwz/PokemonTCGPDatabase/refs/heads/main/release/sync.json';

  constructor(private http: HttpClient, private supabase: SupabaseService) {}

  submit() {
    this.error = null;
    this.results = [];
    this.packStats = {};
    this.packOrder = [];

    let parsed: SyncInputItem[];
    try {
      parsed = JSON.parse(this.inputText);
      if (!Array.isArray(parsed)) {
        throw new Error('JSON must be an array of items');
      }
    } catch (e: any) {
      this.error = `Invalid JSON: ${e?.message ?? 'parse error'}`;
      return;
    }

    this.loading = true;
    this.http.get<Record<string, string>>(this.SYNC_URL).subscribe({
      next: (mapping) => {
        const out: MappedResult[] = parsed.map((item) => {
          const cardId = String((item as any).cardId ?? '');
          const amount = Number((item as any).amount ?? 0);
          let mappedId = cardId && mapping[cardId] ? mapping[cardId] : null;
          if (mappedId) {
            mappedId = this.normalizeMappedId(mappedId);
          }
          return { cardId, mappedId, amount };
        });
        this.results = out;
        // Prepare pack stats buckets using mapped prefixes
        for (const r of out) {
          const packKey = this.getPackKey(r.mappedId);
          this.ensurePack(packKey);
        }
        this.loading = false;
        // Proceed to upload to Supabase
        this.uploadToSupabase(out);
      },
      error: (err) => {
        this.error = `Failed to fetch mapping: ${err?.status ?? ''} ${err?.message ?? ''}`.trim();
        this.loading = false;
      },
    });
  }

  clear() {
    this.inputText = '';
    this.results = [];
    this.error = null;
    this.uploading = false;
    this.processedCount = 0;
    this.skippedCount = 0;
    this.failedCount = 0;
  }

  private async uploadToSupabase(items: MappedResult[]) {
    const user = this.supabase.getCurrentUser();
    if (!user) {
      this.error = 'Please sign in to upload your cards.';
      return;
    }

    this.uploading = true;
    this.processedCount = 0;
    this.skippedCount = 0;
    this.failedCount = 0;

    const userId = user.id;

    for (const item of items) {
      // Skip unmapped IDs or non-positive quantities
      if (!item.mappedId || !item.amount || item.amount <= 0) {
        this.skippedCount++;
        const packKey = this.getPackKey(item.mappedId);
        this.ensurePack(packKey);
        this.packStats[packKey].skipped++;
        this.packStats[packKey].skippedItems.push({ cardId: item.cardId, mappedId: item.mappedId, reason: !item.mappedId ? 'No mapping' : 'Non-positive quantity' });
        continue;
      }
      try {
        const { success, error } = await this.supabase.updateCardQuantity(userId, item.mappedId, item.amount);
        if (!success) {
          this.failedCount++;
          const packKey = this.getPackKey(item.mappedId);
          this.ensurePack(packKey);
          this.packStats[packKey].failed++;
          this.packStats[packKey].failedItems.push({ cardId: item.cardId, mappedId: item.mappedId, error: error ?? undefined });
          if (!this.error && error) {
            this.error = `Upload error: ${error}`;
          }
        }
        this.processedCount++;
        if (success) {
          const packKey = this.getPackKey(item.mappedId);
          this.ensurePack(packKey);
          this.packStats[packKey].updated++;
        }
      } catch (e: any) {
        this.failedCount++;
        const packKey = this.getPackKey(item.mappedId);
        this.ensurePack(packKey);
        this.packStats[packKey].failed++;
        this.packStats[packKey].failedItems.push({ cardId: item.cardId, mappedId: item.mappedId, error: e?.message ?? undefined });
      }
    }

    // Delete any existing DB records not present in this JSON
    try {
      const keepKeys = items
        .map((i) => i.mappedId)
        .filter((k): k is string => !!k);
      const { deletedKeys, error } = await this.supabase.deleteUserCardsNotIn(userId, keepKeys);
      if (error) {
        if (!this.error) this.error = `Delete error: ${error}`;
      }
      for (const key of deletedKeys) {
        const packKey = this.getPackKey(key);
        this.ensurePack(packKey);
        this.packStats[packKey].deleted++;
      }
    } catch (e: any) {
      if (!this.error) this.error = `Delete error: ${e?.message ?? 'unknown'}`;
    }

    this.uploading = false;
  }

  private getPackKey(mappedId: string | null): string {
    if (!mappedId) return 'Unmapped';
    const idx = mappedId.lastIndexOf('-');
    return idx > 0 ? mappedId.substring(0, idx) : 'Unknown';
  }

  private normalizeMappedId(raw: string): string {
    const idx = raw.lastIndexOf('-');
    if (idx < 0) return raw;
    const prefix = raw.substring(0, idx);
    const suffix = raw.substring(idx + 1);
    if (/^\d+$/.test(suffix)) {
      const num = parseInt(suffix, 10);
      return `${prefix}-${String(num)}`;
    }
    // Fallback: strip leading zeros if non-pure numeric
    const trimmed = suffix.replace(/^0+/, '');
    return `${prefix}-${trimmed || '0'}`;
  }

  private ensurePack(packKey: string) {
    if (!this.packStats[packKey]) {
      this.packStats[packKey] = {
        pack: packKey,
        updated: 0,
        skipped: 0,
        failed: 0,
        deleted: 0,
        skippedItems: [],
        failedItems: [],
      };
      this.packOrder.push(packKey);
    }
  }
}
