import { Injectable } from '@angular/core';
import { Card, CardDataService } from './card-data.service';
import { FileStorageService } from './file-storage.service';
import { AssetsHelperService } from './assets-helper.service';
import { PokemonDataService, SetInfo, RarityMapping } from './pokemon-data.service';
import { Observable, of } from 'rxjs';
import { catchError, tap, map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class DataManagerService {

  constructor(
    private cardDataService: CardDataService,
    private fileStorageService: FileStorageService,
    private assetsHelper: AssetsHelperService,
    private pokemonDataService: PokemonDataService
  ) { }

  /**
   * Initializes the card data by downloading from API and storing locally
   */
  initializeCardData(): Observable<Card[]> {
    return this.cardDataService.downloadAndStoreCards().pipe(
      tap(cards => {
        this.logDataSummary(cards);
      }),
      catchError(error => {
        console.error('Failed to initialize card data:', error);
        
        // Try to load from localStorage as fallback
        const storedCards = this.cardDataService.getStoredCards();
        if (storedCards) {
          return of(storedCards);
        }
        
        return of([]);
      })
    );
  }

  /**
   * Downloads the cards.json file for manual storage
   */
  downloadCardsFile(): void {
    this.assetsHelper.downloadCardsJson();
  }

  /**
   * Gets storage instructions
   */
  getStorageInstructions(): string {
    return this.assetsHelper.showSetupInstructions();
  }

  /**
   * Logs a summary of the card data
   */
  private logDataSummary(cards: Card[]): void {
    const sets = new Set(cards.map(card => card.set));
    const rarities = new Set(cards.map(card => card.rarity));
    const packs = new Set(cards.flatMap(card => card.packs));
  }

  /**
   * Gets all available cards
   */
  getAllCards(): Observable<Card[]> {
    return this.cardDataService.loadCards();
  }

  /**
   * Gets cards by set
   */
  getCardsBySet(setName: string): Observable<Card[]> {
    return this.cardDataService.getCardsBySet(setName);
  }

  /**
   * Gets cards by type
   */
  getCardsByType(type: string): Observable<Card[]> {
    return this.cardDataService.getCardsByType(type);
  }

  /**
   * Gets cards by pack
   */
  getCardsByPack(pack: string): Observable<Card[]> {
    return this.cardDataService.loadCards().pipe(
      map(cards => cards.filter(card => card.packs.includes(pack)))
    );
  }

  /**
   * Searches cards by name
   */
  searchCards(searchTerm: string): Observable<Card[]> {
    return this.cardDataService.searchCardsByName(searchTerm);
  }

  /**
   * Gets filter options
   */
  getFilterOptions(): Observable<{sets: string[], types: string[], rarities: string[], packs: string[]}> {
    return new Observable(observer => {
      Promise.all([
        this.cardDataService.getUniqueSets().toPromise(),
        this.cardDataService.getUniqueTypes().toPromise(),
        this.cardDataService.getUniqueRarities().toPromise(),
        this.cardDataService.getUniquePacks().toPromise()
      ]).then(([sets, types, rarities, packs]) => {
        observer.next({
          sets: sets || [],
          types: types || [],
          rarities: rarities || [],
          packs: packs || []
        });
        observer.complete();
      }).catch(error => {
        observer.error(error);
      });
    });
  }

  // === NEW ENHANCED METHODS ===

  /**
   * Load all Pokemon TCG data (cards, sets, rarities)
   */
  loadAllPokemonData(): Observable<any> {
    return this.pokemonDataService.loadAllData().pipe(
      tap(data => {
        this.logEnhancedDataSummary(data);
      })
    );
  }

  /**
   * Get all sets with detailed information
   */
  getAllSets(): Observable<SetInfo[]> {
    return this.pokemonDataService.loadSets();
  }

  /**
   * Get sets with actual card counts
   */
  getSetsWithCounts(): Observable<any[]> {
    return this.pokemonDataService.getSetsWithCardCounts();
  }

  /**
   * Get rarity mapping
   */
  getRarityMapping(): Observable<RarityMapping> {
    return this.pokemonDataService.loadRarities();
  }

  /**
   * Get set information by code
   */
  getSetInfo(setCode: string): Observable<SetInfo | undefined> {
    return this.pokemonDataService.getSetByCode(setCode);
  }

  /**
   * Get cards by set with enhanced information (includes set info and full rarity names)
   */
  getCardsBySetEnhanced(setCode: string): Observable<any[]> {
    return this.pokemonDataService.getCardsBySetWithInfo(setCode);
  }

  /**
   * Search cards with enhanced information
   */
  searchCardsEnhanced(searchTerm: string): Observable<any[]> {
    return this.pokemonDataService.searchCardsEnhanced(searchTerm);
  }

  /**
   * Get rarity distribution statistics
   */
  getRarityStats(): Observable<any[]> {
    return this.pokemonDataService.getRarityDistribution();
  }

  /**
   * Get pack distribution statistics
   */
  getPackStats(): Observable<any[]> {
    return this.pokemonDataService.getPackDistribution();
  }

  /**
   * Get comprehensive collection statistics
   */
  getComprehensiveStats(): Observable<any> {
    return this.pokemonDataService.getComprehensiveStats();
  }

  /**
   * Enhanced data summary logging
   */
  private logEnhancedDataSummary(data: any): void {
    // Summary logic without console output
  }
}