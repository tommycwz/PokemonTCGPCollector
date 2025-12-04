import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { PokemonDataService, SetInfo, RarityMapping } from '../../services/pokemon-data.service';
import { DataManagerService } from '../../services/data-manager.service';
import { Card } from '../../services/card-data.service';
import { SupabaseService, Profile } from '../services/supabase.service';

export interface RarityBreakdown {
  rarity: string;
  owned: number;
  total: number;
  percentage: number;
}

export interface PackSuggestion {
  setCode: string;
  setName: string;
  packName: string;
  missingCards: number;
  totalCards: number;
  percentage: number;
  newCardChance: number;
  rarityBreakdown: RarityBreakdown[];
}

export type SuggestionAlgorithm = 'new-card-chance';

@Component({
  selector: 'app-suggestion',
  templateUrl: './suggestion.component.html',
  styleUrls: ['./suggestion.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SuggestionComponent implements OnInit {
  cards: Card[] = [];
  sets: SetInfo[] = [];
  rarityMapping: RarityMapping = {};
  currentUser: Profile | null = null;
  ownedCards: { [key: string]: number } = {};

  selectedAlgorithm: SuggestionAlgorithm = 'new-card-chance';
  excludeSpecialPacks = true; // Default to true to exclude A4b and promo packs
  rarityFilterMode: 'tradable' | 'common' | 'all' = 'tradable'; // 'tradable' = diamonds + ☆ + ☆☆, 'common' = diamonds + ☆, 'all' = no filter
  selectedSeriesFilter: string = 'top-3'; // 'top-3' or a series name
  seriesList: string[] = [];
  packSuggestions: PackSuggestion[] = [];
  isLoading = true;



  constructor(
    private pokemonDataService: PokemonDataService,
    private dataManager: DataManagerService,
    private supabaseService: SupabaseService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadData();
  }

  onRarityClick(suggestion: PackSuggestion, breakdown: RarityBreakdown) {
    // Find the set to get its series
    const set = this.sets.find(s => s.code === suggestion.setCode);
    const series = set?.series || 'all';

    this.router.navigate(['/collection'], {
      queryParams: {
        series: series,
        set: suggestion.setCode,
        pack: suggestion.packName,
        rarity: breakdown.rarity
      }
    });
  }

  private async loadData() {
    this.isLoading = true;
    
    try {
      // Load current user
      this.currentUser = await this.supabaseService.getCurrentUser();
      
      // Load Pokemon data
      const data = await this.pokemonDataService.loadAllData().toPromise();
      if (data) {
        this.cards = data.cards;
        this.sets = data.sets;
        this.rarityMapping = data.rarities;
      }

      // Load user collection if signed in
      if (this.currentUser) {
        await this.loadOwnedCardsForUser(this.currentUser.id);
      }

      // Build unique series list
      this.seriesList = Array.from(new Set(this.sets.map(s => s.series))).sort();

      this.calculateSuggestions();
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  onExcludeSpecialPacksChange() {
    this.calculateSuggestions();
    this.cdr.markForCheck();
  }

  onRarityFilterChange() {
    // Cycle through: tradable -> common -> all -> tradable
    if (this.rarityFilterMode === 'tradable') {
      this.rarityFilterMode = 'common';
    } else if (this.rarityFilterMode === 'common') {
      this.rarityFilterMode = 'all';
    } else {
      this.rarityFilterMode = 'tradable';
    }
    this.calculateSuggestions();
    this.cdr.markForCheck();
  }

  onSeriesFilterChange() {
    this.calculateSuggestions();
    this.cdr.markForCheck();
  }

  private calculateSuggestions() {
    if (!this.cards.length || !this.sets.length) return;

    const suggestions: PackSuggestion[] = [];

    // Determine which sets to include based on filter
    const targetSets =
      this.selectedSeriesFilter === 'top-3'
        ? this.sets
        : this.sets.filter(s => s.series === this.selectedSeriesFilter);

    // Get all unique packs from target sets
    const allPacks = new Set<string>();
    targetSets.forEach(set => {
      set.packs?.forEach(pack => {
        // Filter out special packs if checkbox is checked
        if (this.excludeSpecialPacks && this.isSpecialPack(pack)) {
          return;
        }
        allPacks.add(pack);
      });
    });

    // Calculate suggestion for each pack
    allPacks.forEach(packName => {
      const suggestion = this.calculatePackSuggestion(packName);
      if (suggestion) {
        suggestions.push(suggestion);
      }
    });

    // Sort by new card chance (higher percentage is better)
    const sorted = suggestions.sort((a, b) => b.newCardChance - a.newCardChance);

    // Apply Top 3 limit if selected
    this.packSuggestions =
      this.selectedSeriesFilter === 'top-3' ? sorted.slice(0, 3) : sorted;
  }

  private calculatePackSuggestion(packName: string): PackSuggestion | null {
    // Get all cards available in this pack
    let packCards = this.cards.filter(card => 
      card.packs && card.packs.includes(packName)
    );

    if (packCards.length === 0) return null;

    // Find which set this pack belongs to (use the first set that contains this pack)
    const parentSet = this.sets.find(set => 
      set.packs && set.packs.includes(packName)
    );

    if (!parentSet) return null;

    // Filter by rarity mode
    if (this.rarityFilterMode === 'tradable') {
      // All tradable: diamonds + ☆ + ☆☆
      const tradableRarities = ['◊', '◊◊', '◊◊◊', '◊◊◊◊', '☆', '☆☆'];
      packCards = packCards.filter(card => tradableRarities.includes(card.rarity));
    } else if (this.rarityFilterMode === 'common') {
      // Only diamonds + ☆
      const commonRarities = ['◊', '◊◊', '◊◊◊', '◊◊◊◊', '☆'];
      packCards = packCards.filter(card => commonRarities.includes(card.rarity));
    }
    // 'all' mode: no filter

    // Get all cards in the pack
    const relevantCards = packCards;
    
    // Calculate missing cards
    const missingCards = relevantCards.filter(card => 
      this.getOwnedCount(card) === 0
    );

    const missingCount = missingCards.length;
    const totalCount = relevantCards.length;
    const percentage = totalCount > 0 ? ((totalCount - missingCount) / totalCount) * 100 : 0;
    
    // Calculate new card chance (percentage of missing cards in pack)
    const newCardChance = totalCount > 0 ? (missingCount / totalCount) * 100 : 0;

    // Calculate rarity breakdown
    const rarityBreakdown = this.calculateRarityBreakdown(relevantCards);

    return {
      setCode: parentSet.code,
      setName: parentSet.name,
      packName,
      missingCards: missingCount,
      totalCards: totalCount,
      percentage,
      newCardChance,
      rarityBreakdown
    };
  }

  private calculateRarityBreakdown(relevantCards: Card[]): RarityBreakdown[] {
    // Get all unique rarities in this pack
    const rarities = [...new Set(relevantCards.map(card => card.rarity))];
    
    // Sort rarities by priority (common to rare)
    const rarityOrder = ['◊', '◊◊', '◊◊◊', '◊◊◊◊', '☆', '☆☆', '☆☆☆', '👑', '✵', '✵✵'];
    rarities.sort((a, b) => {
      const indexA = rarityOrder.indexOf(a);
      const indexB = rarityOrder.indexOf(b);
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });

    return rarities.map(rarity => {
      const cardsOfRarity = relevantCards.filter(card => card.rarity === rarity);
      const ownedCount = cardsOfRarity.filter(card => this.getOwnedCount(card) > 0).length;
      const totalCount = cardsOfRarity.length;
      const percentage = totalCount > 0 ? (ownedCount / totalCount) * 100 : 0;

      return {
        rarity,
        owned: ownedCount,
        total: totalCount,
        percentage
      };
    });
  }

  private getOwnedCount(card: Card): number {
    if (!this.currentUser) return 0;
    return this.ownedCards[this.getCardId(card)] || 0;
  }

  private async loadOwnedCardsForUser(userId: string): Promise<void> {
    try {
      const collection = await this.supabaseService.syncUserCollection(userId);
      this.ownedCards = collection;
    } catch (error) {
      console.error('Error loading owned cards:', error);
      this.ownedCards = {};
    }
  }

  private getCardId(card: Card): string {
    return `${card.set}-${card.number}`;
  }

  private isSpecialPack(packName: string): boolean {
    const specialPackPatterns = [
      /Deluxe/i,           // Deluxe packs
      /vol/i,         // Promo packs
    ];
    
    return specialPackPatterns.some(pattern => pattern.test(packName));
  }

  getRarityDisplayName(rarity: string): string {
    // Find the rarity mapping entry that matches this symbol
    for (const [code, description] of Object.entries(this.rarityMapping)) {
      const symbol = description.split(' - ')[0];
      if (symbol === rarity) {
        return description;
      }
    }
    return rarity;
  }

}