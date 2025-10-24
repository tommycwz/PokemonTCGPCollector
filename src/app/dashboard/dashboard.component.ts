import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { DataManagerService } from '../../services/data-manager.service';
import { SupabaseService } from '../services/supabase.service';
import { Card } from '../../services/card-data.service';
import { SetInfo } from '../../services/pokemon-data.service';
import { RarityService } from '../services/rarity.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  title = 'Pokemon TCG Pocket Collector';
  cards: Card[] = [];
  sets: SetInfo[] = [];
  rarityStats: any[] = [];
  packStats: any[] = [];
  loading = false;
  error: string | null = null;
  dataLoaded = false;
  
  // User collection data
  userCollectionLoaded = false;
  userCards: any[] = [];
  userStats = {
    totalOwned: 0,
    uniqueCards: 0,
    completionPercentage: 0,
    rareCards: 0,
    recentSetsOwned: 0,
    missingCommons: 0,
    missingRares: 0
  };
  
  setProgress: any[] = [];
  userRarityStats: any[] = [];
  recentCards: any[] = [];
  nearestCompleteSet: any = null;
  packSuggestions: any[] = [];
  excludeDeluxePack = true; // UI toggle to exclude A4B - DELUXE PACK by default

  constructor(
    private dataManager: DataManagerService,
    private supabaseService: SupabaseService,
    private router: Router,
    private rarityService: RarityService
  ) {}

  ngOnInit(): void {
    // Check authentication
    if (!this.supabaseService.isSignedIn()) {
      this.router.navigate(['/signin']);
      return;
    }

    this.loadAllData();
  }

  loadCards(): void {
    this.loading = true;
    this.error = null;
    
    this.dataManager.initializeCardData().subscribe({
      next: (cards) => {
        this.cards = cards;
        this.loading = false;
      },
      error: (error) => {
        this.error = 'Failed to load cards data';
        this.loading = false;
        console.error('Error loading cards:', error);
      }
    });
  }

  loadAllData(): void {
    this.loading = true;
    this.error = null;
    
    this.dataManager.loadAllPokemonData().subscribe({
      next: (data) => {
        this.cards = data.cards;
        this.sets = data.sets;
        this.dataLoaded = true;
        this.loading = false;
        
        // Load statistics
        this.loadStats();
        
        // Load user collection data
        this.loadUserCollection();
      },
      error: (error) => {
        this.error = 'Failed to load Pokemon data';
        this.loading = false;
        console.error('Error loading data:', error);
      }
    });
  }

  loadStats(): void {
    // Load rarity statistics
    this.dataManager.getRarityStats().subscribe({
      next: (stats) => {
        this.rarityStats = stats;
      },
      error: (error) => console.error('Error loading rarity stats:', error)
    });

    // Load pack statistics
    this.dataManager.getPackStats().subscribe({
      next: (stats) => {
        this.packStats = stats.slice(0, 10); // Top 10 packs
      },
      error: (error) => console.error('Error loading pack stats:', error)
    });
  }

  downloadCardsFile(): void {
    this.dataManager.downloadCardsFile();
  }

  getStorageInstructions(): void {
    const instructions = this.dataManager.getStorageInstructions();
    alert(instructions);
  }

  showComprehensiveStats(): void {
    this.dataManager.getComprehensiveStats().subscribe({
      next: (stats) => {
        alert(`Comprehensive Statistics loaded!\n\nSummary:\n- ${stats.totalCards} total cards\n- ${stats.totalSets} sets\n- ${stats.totalRarities} rarity types\n- Date range: ${stats.dateRange.earliest} to ${stats.dateRange.latest}`);
      },
      error: (error) => {
        console.error('Error loading comprehensive stats:', error);
        alert('Failed to load comprehensive statistics');
      }
    });
  }

  /**
   * Load user's collection data
   */
  async loadUserCollection(): Promise<void> {
    const user = await this.supabaseService.getCurrentUser();
    if (!user) return;

    try {
      // Use syncUserCollection which returns the correct format
      const collection = await this.supabaseService.syncUserCollection(user.id);
      
      // Convert to array format for easier processing
      this.userCards = Object.entries(collection).map(([cardDefKey, quantity]) => ({
        card_def_key: cardDefKey,
        quantity: quantity
      }));
      
      this.userCollectionLoaded = true;
      this.calculateUserStats();
      this.calculateSetProgress();
      this.calculateUserRarityStats();
      this.loadRecentCards();
      this.calculatePackSuggestions();
    } catch (error) {
      console.error('Error loading user collection:', error);
    }
  }

  /**
   * Helper method to get card ID from card data
   */
  private getCardId(card: any): string {
    return `${card.set}-${card.number}`;
  }

  /**
   * Calculate user collection statistics
   */
  calculateUserStats(): void {
    if (!this.userCards || !this.cards.length) return;

    // Create a map of owned cards
    const ownedCardMap = new Map();
    let totalOwned = 0;
    
    this.userCards.forEach(card => {
      ownedCardMap.set(card.card_def_key, card.quantity);
      totalOwned += card.quantity;
    });

    const uniqueCards = this.userCards.length;
    const completionPercentage = Math.round((uniqueCards / this.cards.length) * 100);

    // Count rare cards using standardized rarity service
    const rareCards = this.userCards.filter(userCard => {
      const fullCard = this.cards.find(c => this.getCardId(c) === userCard.card_def_key);
      if (!fullCard || !fullCard.rarityCode) return false;
      
      const normalizedCode = this.rarityService.getNormalizedCode(fullCard.rarityCode);
      return this.rarityService.isSuperRare(normalizedCode);
    }).length;

    // Count recent sets (assume sets are ordered by release date)
    const recentSetCodes = this.sets.slice(-3).map(set => set.code); // Last 3 sets
    const recentSetsOwned = this.userCards.filter(userCard => {
      const fullCard = this.cards.find(c => this.getCardId(c) === userCard.card_def_key);
      return fullCard && recentSetCodes.includes(fullCard.set);
    }).length;

    // Count missing commons and rares using standardized rarity service
    const missingCards = this.cards.filter(card => !ownedCardMap.has(this.getCardId(card)));
    const missingCommons = missingCards.filter(card => {
      if (!card.rarityCode) return false;
      const normalizedCode = this.rarityService.getNormalizedCode(card.rarityCode);
      return normalizedCode === 'C'; // Only commons
    }).length;
    const missingRares = missingCards.filter(card => {
      if (!card.rarityCode) return false;
      const normalizedCode = this.rarityService.getNormalizedCode(card.rarityCode);
      return this.rarityService.isSuperRare(normalizedCode);
    }).length;

    this.userStats = {
      totalOwned,
      uniqueCards,
      completionPercentage,
      rareCards,
      recentSetsOwned,
      missingCommons,
      missingRares
    };
  }

  /**
   * Calculate progress for each set
   */
  calculateSetProgress(): void {
    if (!this.userCards || !this.sets.length || !this.cards.length) return;

    const ownedCardMap = new Map();
    this.userCards.forEach(card => {
      ownedCardMap.set(card.card_def_key, true);
    });

    this.setProgress = this.sets.map(set => {
      const setCards = this.cards.filter(card => card.set === set.code);
      const ownedInSet = setCards.filter(card => ownedCardMap.has(this.getCardId(card)));
      
      const percentage = setCards.length > 0 ? Math.round((ownedInSet.length / setCards.length) * 100) : 0;
      
      // Calculate rarity breakdown for this set
      const rarityBreakdown = this.calculateSetRarityBreakdown(setCards, ownedCardMap);
      
      return {
        name: set.label?.en || set.code,
        code: set.code,
        owned: ownedInSet.length,
        total: setCards.length,
        percentage,
        rarityBreakdown
      };
    }).sort((a, b) => a.code.localeCompare(b.code)); // Sort by set ID alphabetically

    // Find nearest complete set
    this.nearestCompleteSet = this.setProgress.find(set => set.percentage < 100) || this.setProgress[0];
  }

  /**
   * Calculate rarity breakdown for a specific set
   */
  private calculateSetRarityBreakdown(setCards: any[], ownedCardMap: Map<string, boolean>): any[] {
    // Group cards by normalized rarity using the rarity service
    const rarityGroups = this.rarityService.groupCardsByNormalizedRarity(setCards);
    
    // Convert to array with percentages
    const breakdown: any[] = [];
    rarityGroups.forEach((cards, normalizedCode) => {
      const ownedInRarity = cards.filter(card => ownedCardMap.has(this.getCardId(card)));
      const percentage = cards.length > 0 ? Math.round((ownedInRarity.length / cards.length) * 100) : 0;
      
      // Use standardized display name
      const displayName = this.rarityService.getStandardizedDisplayName(normalizedCode);
      breakdown.push({
        name: displayName,
        code: normalizedCode,
        owned: ownedInRarity.length,
        total: cards.length,
        percentage
      });
    });
    
    // Sort by rarity order
    return breakdown.sort((a, b) => 
      this.rarityService.getRarityOrder(a.code) - this.rarityService.getRarityOrder(b.code)
    );
  }

  /**
   * Calculate user's rarity statistics
   */
  calculateUserRarityStats(): void {
    if (!this.userCards || !this.cards.length) return;

    const ownedCardMap = new Map();
    this.userCards.forEach(card => {
      ownedCardMap.set(card.card_def_key, true);
    });

    // Group all cards by normalized rarity using the rarity service
    const rarityGroups = this.rarityService.groupCardsByNormalizedRarity(this.cards);

    // Convert to array with percentages
    this.userRarityStats = [];
    rarityGroups.forEach((cards, normalizedCode) => {
      const ownedInRarity = cards.filter(card => ownedCardMap.has(this.getCardId(card)));
      const percentage = cards.length > 0 ? Math.round((ownedInRarity.length / cards.length) * 100) : 0;
      
      // Use standardized display name
      const displayName = this.rarityService.getStandardizedDisplayName(normalizedCode);
      this.userRarityStats.push({
        name: displayName,
        code: normalizedCode,
        owned: ownedInRarity.length,
        total: cards.length,
        percentage
      });
    });

    // Sort by rarity order
    this.userRarityStats.sort((a, b) => 
      this.rarityService.getRarityOrder(a.code) - this.rarityService.getRarityOrder(b.code)
    );
  }

  /**
   * Load recent cards (simulate with newest additions)
   */
  loadRecentCards(): void {
    if (!this.userCards || !this.cards.length) return;

    // For now, just show the first few user cards as "recent"
    // In a real app, you'd track addition dates
    this.recentCards = this.userCards.slice(0, 6).map(userCard => {
      const fullCard = this.cards.find(c => this.getCardId(c) === userCard.card_def_key);
      return {
        ...fullCard,
        quantity: userCard.quantity
      };
    }).filter(card => card);
  }

  /**
   * Calculate pack suggestions based on missing cards
   */
  calculatePackSuggestions(): void {
    if (!this.userCards || !this.cards.length) return;

    // Create a map of owned cards for quick lookup
    const ownedCardMap = new Map();
    this.userCards.forEach(card => {
      ownedCardMap.set(card.card_def_key, true);
    });

    // Get all unique packs
    const allPacks = new Set<string>();
    this.cards.forEach(card => {
      if (card.packs && card.packs.length > 0) {
        card.packs.forEach(pack => {
          // Optionally exclude deluxe pack when toggled (robust match)
          if (this.excludeDeluxePack && this.isDeluxeA4B(pack)) return;
          allPacks.add(pack);
        });
      }
    });

    console.log(allPacks)

    // Calculate missing cards per pack
    const packAnalysis = Array.from(allPacks).map(packName => {
      const cardsInPack = this.cards.filter(card => 
        card.packs && card.packs.includes(packName)
      );
      
      const missingCards = cardsInPack.filter(card => 
        !ownedCardMap.has(this.getCardId(card))
      );

      // Calculate rarity breakdown of missing cards
      const rarityBreakdown = new Map();
      missingCards.forEach(card => {
        const rarityCode = card.rarityCode || 'Unknown';
        const normalizedCode = this.rarityService.getNormalizedCode(rarityCode);
        const current = rarityBreakdown.get(normalizedCode) || 0;
        rarityBreakdown.set(normalizedCode, current + 1);
      });

      // Calculate score based on missing rare cards (higher weight for rarer cards)
      let score = 0;
      rarityBreakdown.forEach((count, rarityCode) => {
        const rarityOrder = this.rarityService.getRarityOrder(rarityCode);
        // Higher score for rarer cards (inverse of order)
        const weight = Math.max(1, 10 - rarityOrder);
        score += count * weight;
      });

      return {
        packName,
        totalCards: cardsInPack.length,
        missingCards: missingCards.length,
        ownedCards: cardsInPack.length - missingCards.length,
        completionPercentage: cardsInPack.length > 0 ? 
          Math.round(((cardsInPack.length - missingCards.length) / cardsInPack.length) * 100) : 100,
        rarityBreakdown: Array.from(rarityBreakdown.entries()).map(([code, count]) => ({
          code,
          count,
          displayName: this.rarityService.getDisplayName(code),
          symbol: this.rarityService.getSymbol(code)
        })).sort((a, b) => this.rarityService.getRarityOrder(a.code) - this.rarityService.getRarityOrder(b.code)),
        score,
        missingCardsList: missingCards.slice(0, 5) // Show top 5 missing cards as examples
      };
    });

    // Sort by score (highest priority first) and filter out completed packs
    this.packSuggestions = packAnalysis
      .filter(pack => pack.missingCards > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5); // Show top 5 suggestions
  }

  /**
   * Robust matcher for the A4B - DELUXE PACK name across variations
   */
  private isDeluxeA4B(packName: string | undefined | null): boolean {
    if (!packName) return false;
    // Normalize case, whitespace, and dash types
    const norm = packName
      .toUpperCase()
      .replace(/[\u2012\u2013\u2014\u2015\-]/g, '-') // various dashes to hyphen-minus
      .replace(/\s+/g, ' ') // collapse spaces
      .trim();
    

    return norm.includes('DELUXE');
  }

  /**
   * Export user collection as CSV
   */
  exportCollection(): void {
    if (!this.userCollectionLoaded) {
      alert('Collection not loaded yet. Please wait...');
      return;
    }

    // Create CSV content
    const csvContent = this.generateCollectionCSV();
    
    // Create download
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'pokemon_collection.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Generate CSV content for user collection
   */
  private generateCollectionCSV(): string {
    const headers = ['Card Name', 'Set', 'Number', 'Rarity', 'Quantity'];
    const rows = [headers.join(',')];

    this.userCards.forEach(userCard => {
      const fullCard = this.cards.find(c => this.getCardId(c) === userCard.card_def_key);
      if (fullCard) {
        const row = [
          `"${fullCard.label?.eng || fullCard['name'] || ''}"`,
          `"${fullCard.set || ''}"`,
          `"${fullCard.number || ''}"`,
          `"${fullCard.rarity || ''}"`,
          userCard.quantity.toString()
        ];
        rows.push(row.join(','));
      }
    });

    return rows.join('\n');
  }

  /**
   * Sign out the current user
   */
  signOut(): void {
    this.supabaseService.signOut();
    this.router.navigate(['/signin']);
  }
}