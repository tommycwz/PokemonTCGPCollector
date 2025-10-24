import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin } from 'rxjs';
import { map, tap } from 'rxjs/operators';

export interface SetInfo {
  code: string;
  releaseDate: string;
  count: number;
  label: {
    en: string;
  };
  packs: string[];
}

export interface RarityMapping {
  [key: string]: string;
}

export interface PokemonTCGData {
  cards: any[];
  sets: SetInfo[];
  rarities: RarityMapping;
}

@Injectable({
  providedIn: 'root'
})
export class PokemonDataService {
  private readonly BASE_PATH = 'assets/cards/';
  private readonly API_BASE = 'https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/';

  constructor(private http: HttpClient) { }

  /**
   * Load sets data from local assets
   */
  loadSets(): Observable<SetInfo[]> {
    return this.http.get<SetInfo[]>(`${this.BASE_PATH}sets.json`);
  }

  /**
   * Load rarity mapping from local assets
   */
  loadRarities(): Observable<RarityMapping> {
    return this.http.get<RarityMapping>(`${this.BASE_PATH}rarity.json`);
  }

  /**
   * Load cards data from local assets
   */
  loadCards(): Observable<any[]> {
    return this.http.get<any[]>(`${this.BASE_PATH}cards.json`);
  }

  /**
   * Load all data at once
   */
  loadAllData(): Observable<PokemonTCGData> {
    return forkJoin({
      cards: this.loadCards(),
      sets: this.loadSets(),
      rarities: this.loadRarities()
    }).pipe(
      tap(data => {
      })
    );
  }

  /**
   * Get set information by code
   */
  getSetByCode(code: string): Observable<SetInfo | undefined> {
    return this.loadSets().pipe(
      map(sets => sets.find(set => set.code === code))
    );
  }

  /**
   * Get full rarity name by code
   */
  getRarityName(rarityCode: string): Observable<string | undefined> {
    return this.loadRarities().pipe(
      map(rarities => rarities[rarityCode])
    );
  }

  /**
   * Get cards by set with enhanced information
   */
  getCardsBySetWithInfo(setCode: string): Observable<any[]> {
    return forkJoin({
      cards: this.loadCards(),
      sets: this.loadSets(),
      rarities: this.loadRarities()
    }).pipe(
      map(({ cards, sets, rarities }) => {
        const setInfo = sets.find(set => set.code === setCode);
        return cards
          .filter(card => card.set === setCode)
          .map(card => ({
            ...card,
            setInfo,
            fullRarityName: rarities[card.rarityCode] || card.rarity
          }));
      })
    );
  }

  /**
   * Get all sets with card counts
   */
  getSetsWithCardCounts(): Observable<(SetInfo & { actualCardCount: number })[]> {
    return forkJoin({
      cards: this.loadCards(),
      sets: this.loadSets()
    }).pipe(
      map(({ cards, sets }) => {
        return sets.map(set => {
          const actualCardCount = cards.filter(card => card.set === set.code).length;
          return {
            ...set,
            actualCardCount
          };
        });
      })
    );
  }

  /**
   * Get rarity distribution across all cards
   */
  getRarityDistribution(): Observable<{ code: string; name: string; count: number; percentage: number }[]> {
    return forkJoin({
      cards: this.loadCards(),
      rarities: this.loadRarities()
    }).pipe(
      map(({ cards, rarities }) => {
        const distribution: { [key: string]: number } = {};
        
        cards.forEach(card => {
          const rarityCode = card.rarityCode;
          distribution[rarityCode] = (distribution[rarityCode] || 0) + 1;
        });

        const total = cards.length;
        
        return Object.entries(distribution).map(([code, count]) => ({
          code,
          name: rarities[code] || code,
          count,
          percentage: Math.round((count / total) * 100 * 100) / 100
        })).sort((a, b) => b.count - a.count);
      })
    );
  }

  /**
   * Get pack distribution across all cards
   */
  getPackDistribution(): Observable<{ pack: string; count: number; percentage: number }[]> {
    return this.loadCards().pipe(
      map(cards => {
        const distribution: { [key: string]: number } = {};
        
        cards.forEach(card => {
          card.packs.forEach((pack: string) => {
            if (pack && pack.trim()) { // Filter out empty strings
              distribution[pack] = (distribution[pack] || 0) + 1;
            }
          });
        });

        const total = Object.values(distribution).reduce((sum, count) => sum + count, 0);
        
        return Object.entries(distribution).map(([pack, count]) => ({
          pack,
          count,
          percentage: Math.round((count / total) * 100 * 100) / 100
        })).sort((a, b) => b.count - a.count);
      })
    );
  }

  /**
   * Search cards with enhanced information
   */
  searchCardsEnhanced(searchTerm: string): Observable<any[]> {
    return forkJoin({
      cards: this.loadCards(),
      sets: this.loadSets(),
      rarities: this.loadRarities()
    }).pipe(
      map(({ cards, sets, rarities }) => {
        const filteredCards = cards.filter(card =>
          card.label.eng.toLowerCase().includes(searchTerm.toLowerCase())
        );

        return filteredCards.map(card => {
          const setInfo = sets.find(set => set.code === card.set);
          return {
            ...card,
            setInfo,
            fullRarityName: rarities[card.rarityCode] || card.rarity
          };
        });
      })
    );
  }

  /**
   * Get comprehensive statistics
   */
  getComprehensiveStats(): Observable<any> {
    return forkJoin({
      cards: this.loadCards(),
      sets: this.loadSets(),
      rarities: this.loadRarities()
    }).pipe(
      map(({ cards, sets, rarities }) => {
        const stats = {
          totalCards: cards.length,
          totalSets: sets.length,
          totalRarities: Object.keys(rarities).length,
          
          setBreakdown: sets.map(set => ({
            ...set,
            actualCardCount: cards.filter(card => card.set === set.code).length
          })),
          
          rarityBreakdown: Object.entries(rarities).map(([code, name]) => ({
            code,
            name,
            count: cards.filter(card => card.rarityCode === code).length
          })),
          
          packBreakdown: this.calculatePackDistribution(cards),
          
          dateRange: {
            earliest: sets.reduce((earliest, set) => 
              new Date(set.releaseDate) < new Date(earliest) ? set.releaseDate : earliest, 
              sets[0]?.releaseDate || ''),
            latest: sets.reduce((latest, set) => 
              new Date(set.releaseDate) > new Date(latest) ? set.releaseDate : latest, 
              sets[0]?.releaseDate || '')
          }
        };

        return stats;
      })
    );
  }

  private calculatePackDistribution(cards: any[]): { pack: string; count: number }[] {
    const distribution: { [key: string]: number } = {};
    
    cards.forEach(card => {
      card.packs.forEach((pack: string) => {
        if (pack && pack.trim()) {
          distribution[pack] = (distribution[pack] || 0) + 1;
        }
      });
    });

    return Object.entries(distribution)
      .map(([pack, count]) => ({ pack, count }))
      .sort((a, b) => b.count - a.count);
  }
}