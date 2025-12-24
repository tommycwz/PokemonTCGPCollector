import { Injectable } from '@angular/core';

export interface RarityInfo {
  code: string;
  symbol: string;
  name: string;
  displayName: string;
  order: number;
}

@Injectable({
  providedIn: 'root'
})
export class RarityService {
  private readonly rarityMap: Map<string, RarityInfo> = new Map([
    // Short codes
    ['C', { code: 'C', symbol: '◊', name: 'Common', displayName: '◊ - Common', order: 1 }],
    ['U', { code: 'U', symbol: '◊◊', name: 'Uncommon', displayName: '◊◊ - Uncommon', order: 2 }],
    ['R', { code: 'R', symbol: '◊◊◊', name: 'Rare', displayName: '◊◊◊ - Rare', order: 3 }],
    ['RR', { code: 'RR', symbol: '◊◊◊◊', name: 'Double Rare', displayName: '◊◊◊◊ - Double Rare', order: 4 }],
    ['AR', { code: 'AR', symbol: '☆', name: 'Art Rare', displayName: '☆ - Art Rare', order: 5 }],
    ['SR', { code: 'SR', symbol: '☆☆', name: 'Super Rare', displayName: '☆☆ - Super Rare', order: 6 }],
    ['SAR', { code: 'SAR', symbol: '🌈', name: 'Special Art Rare', displayName: '🌈 - Special Art Rare', order: 6 }],
    ['IM', { code: 'IM', symbol: '☆☆☆', name: 'Immersive Rare', displayName: '☆☆☆ - Immersive Rare', order: 7 }],
    ['UR', { code: 'UR', symbol: '👑', name: 'Ultimate Rare', displayName: '👑 - Ultimate Rare', order: 8 }],
    ['CR', { code: 'CR', symbol: '👑', name: 'Crown Rare', displayName: '👑 - Crown Rare', order: 8 }], // Same level as UR
    ['S', { code: 'S', symbol: '✵', name: 'Shiny', displayName: '✵ - Shiny', order: 9 }],
    ['SSR', { code: 'SSR', symbol: '✵✵', name: 'Shiny Super Rare', displayName: '✵✵ - Shiny Super Rare', order: 10 }],
    
    // Full names (map to same info as codes)
    ['Common', { code: 'C', symbol: '◊', name: 'Common', displayName: '◊ - Common', order: 1 }],
    ['Uncommon', { code: 'U', symbol: '◊◊', name: 'Uncommon', displayName: '◊◊ - Uncommon', order: 2 }],
    ['Rare', { code: 'R', symbol: '◊◊◊', name: 'Rare', displayName: '◊◊◊ - Rare', order: 3 }],
    ['Double Rare', { code: 'RR', symbol: '◊◊◊◊', name: 'Double Rare', displayName: '◊◊◊◊ - Double Rare', order: 4 }],
    ['Art Rare', { code: 'AR', symbol: '☆', name: 'Art Rare', displayName: '☆ - Art Rare', order: 5 }],
    ['Super Rare', { code: 'SR', symbol: '☆☆', name: 'Super Rare', displayName: '☆☆ - Super Rare', order: 6 }],
    ['Special Art Rare', { code: 'SAR', symbol: '🌈', name: 'Special Art Rare', displayName: '🌈 - Special Art Rare', order: 6 }],
    ['Immersive Rare', { code: 'IM', symbol: '☆☆☆', name: 'Immersive Rare', displayName: '☆☆☆ - Immersive Rare', order: 7 }],
    ['Ultimate Rare', { code: 'UR', symbol: '👑', name: 'Ultimate Rare', displayName: '👑 - Ultimate Rare', order: 8 }],
    ['Crown Rare', { code: 'CR', symbol: '👑', name: 'Crown Rare', displayName: '👑 - Crown Rare', order: 8 }], // Same level as UR
    ['Shiny', { code: 'S', symbol: '✵', name: 'Shiny', displayName: '✵ - Shiny', order: 9 }],
    ['Shiny Super Rare', { code: 'SSR', symbol: '✵✵', name: 'Shiny Super Rare', displayName: '✵✵ - Shiny Super Rare', order: 10 }]
  ]);

  /**
   * Get rarity information by code
   */
  getRarityInfo(code: string): RarityInfo | undefined {
    return this.rarityMap.get(code);
  }

  /**
   * Get standardized display name for a rarity code
   */
  getDisplayName(code: string): string {
    const info = this.getRarityInfo(code);
    return info ? info.displayName : code;
  }

  /**
   * Get symbol for a rarity code
   */
  getSymbol(code: string): string {
    const info = this.getRarityInfo(code);
    return info ? info.symbol : code;
  }

  /**
   * Get all rarities sorted by order (code-based only, no full name duplicates)
   */
  getAllRarities(): RarityInfo[] {
    return Array.from(this.rarityMap.values())
      .filter(r => !r.code.includes(' ')) // Only include code-based entries
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Get rarity order for sorting
   */
  getRarityOrder(code: string): number {
    const info = this.getRarityInfo(code);
    return info ? info.order : 999;
  }

  /**
   * Sort rarities by their defined order
   */
  sortRarities(rarities: string[]): string[] {
    return rarities.sort((a, b) => this.getRarityOrder(a) - this.getRarityOrder(b));
  }

  /**
   * Check if a rarity is considered rare (★★★+ level)
   */
  isRare(code: string): boolean {
    const rareRarities = ['IM', 'UR', 'SSR'];
    return rareRarities.includes(code);
  }

  /**
   * Check if a rarity is considered super rare (★★+ level)
   */
  isSuperRare(code: string): boolean {
    const superRareRarities = ['SR', 'SAR', 'IM', 'UR', 'SSR'];
    return superRareRarities.includes(code);
  }

  /**
   * Merge SAR and SR into the same category for display
   */
  getNormalizedCode(rarityInput: string): string {
    // Get the base info for this rarity
    const info = this.getRarityInfo(rarityInput);
    if (!info) return rarityInput; // Return as-is if not found
    
    // Keep SAR distinct
    return info.code;
  }

  /**
   * Get standardized display name (merging SAR with SR)
   */
  getStandardizedDisplayName(rarityInput: string): string {
    const normalizedCode = this.getNormalizedCode(rarityInput);
    const info = this.getRarityInfo(normalizedCode);
    return info ? info.displayName : rarityInput;
  }

  /**
   * Get unified rarity information (merging SAR with SR and deduplicating by symbol)
   */
  getUnifiedRarities(): RarityInfo[] {
    const rarities = this.getAllRarities();
    const filtered = rarities;
    
    // Deduplicate by symbol (keep first occurrence of each symbol)
    const seen = new Set<string>();
    return filtered.filter(r => {
      if (seen.has(r.symbol)) {
        return false;
      }
      seen.add(r.symbol);
      return true;
    });
  }

  /**
   * Get rarity code from symbol
   */
  getCodeFromSymbol(symbol: string): string {
    for (const [, rarityInfo] of this.rarityMap) {
      if (rarityInfo.symbol === symbol) {
        return rarityInfo.code;
      }
    }
    return symbol; // Return original if not found
  }

  /**
   * Group cards by normalized rarity code (using rarity symbol field)
   */
  groupCardsByNormalizedRarity(cards: any[]): Map<string, any[]> {
    const groups = new Map<string, any[]>();
    
    cards.forEach(card => {
      if (!card.rarity) return; // Skip cards without rarity
      
      // Convert rarity symbol to code
      const rarityCode = this.getCodeFromSymbol(card.rarity);
      const normalizedCode = this.getNormalizedCode(rarityCode);
      
      if (!groups.has(normalizedCode)) {
        groups.set(normalizedCode, []);
      }
      groups.get(normalizedCode)!.push(card);
    });
    
    return groups;
  }
}