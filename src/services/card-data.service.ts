import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';

export interface Card {
  series?: string;
  set: string;
  number: number;
  rarity: string; // Now contains symbols like "◊", "◊◊", "☆", etc.
  imageName: string;
  label: {
    slug: string;
    eng: string;
  };
  packs: string[];
  types?: string[];
  hp?: number;
  retreat?: number;
  stage?: string;
  evolveFrom?: string;
  abilities?: {
    type: string;
    name: string;
    effect: string;
  }[];
  attacks?: any[];
  weaknesses?: any[];
  resistance?: any;
  artist?: string;
  description?: string;
  [key: string]: any;
}

@Injectable({
  providedIn: 'root'
})
export class CardDataService {
  private readonly CARDS_API_URL = 'https://raw.githubusercontent.com/tommycwz/PokemonTCGPDatabase/refs/heads/main/release/cards.json';

  constructor(private http: HttpClient) { }

  /**
   * Fetches card data from the remote API
   */
  fetchCardsFromAPI(): Observable<Card[]> {
    return this.http.get<Card[]>(this.CARDS_API_URL);
  }

  /**
   * Downloads and saves card data to local assets
   */
  downloadAndStoreCards(): Observable<Card[]> {
    return this.fetchCardsFromAPI().pipe(
      tap(cards => {
        // In a real application, you'd need a backend to save files
        // For now, we'll store in localStorage as a fallback for local storage
        localStorage.setItem('pokemonCards', JSON.stringify(cards));
      })
    );
  }

  /**
   * Gets card data from local storage (fallback method)
   */
  getStoredCards(): Card[] | null {
    const storedData = localStorage.getItem('pokemonCards');
    return storedData ? JSON.parse(storedData) : null;
  }

  /**
   * Loads cards from the remote source.
   * Consider using localStorage via downloadAndStoreCards() as an optional cache.
   */
  loadCards(): Observable<Card[]> {
    return this.fetchCardsFromAPI().pipe(
      map(cards => cards || [])
    );
  }

  /**
   * Gets cards by set
   */
  getCardsBySet(setName: string): Observable<Card[]> {
    return this.loadCards().pipe(
      map(cards => cards.filter(card => card.set === setName))
    );
  }

  /**
   * Gets cards by type
   */
  getCardsByType(type: string): Observable<Card[]> {
    return this.loadCards().pipe(
      map(cards => cards.filter(card => card.types && card.types.includes(type)))
    );
  }

  /**
   * Gets cards by rarity
   */
  getCardsByRarity(rarity: string): Observable<Card[]> {
    return this.loadCards().pipe(
      map(cards => cards.filter(card => card.rarity === rarity))
    );
  }

  /**
   * Searches cards by name
   */
  searchCardsByName(searchTerm: string): Observable<Card[]> {
    return this.loadCards().pipe(
      map(cards => cards.filter(card => 
        card.label.eng.toLowerCase().includes(searchTerm.toLowerCase())
      ))
    );
  }

  /**
   * Gets unique sets from all cards
   */
  getUniqueSets(): Observable<string[]> {
    return this.loadCards().pipe(
      map(cards => [...new Set(cards.map(card => card.set))])
    );
  }

  /**
   * Gets unique types from all cards
   */
  getAvailableTypes(): Observable<string[]> {
    return this.loadCards().pipe(
      map(cards => [...new Set(cards.flatMap(card => card.types || []).filter((type): type is string => !!type))])
    );
  }

  /**
   * Gets unique rarities from all cards
   */
  getUniqueRarities(): Observable<string[]> {
    return this.loadCards().pipe(
      map(cards => [...new Set(cards.map(card => card.rarity))])
    );
  }

  /**
   * Gets unique packs from all cards
   */
  getUniquePacks(): Observable<string[]> {
    return this.loadCards().pipe(
      map(cards => [...new Set(cards.flatMap(card => card.packs))])
    );
  }
}