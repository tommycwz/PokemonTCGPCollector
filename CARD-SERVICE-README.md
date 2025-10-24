# Pokemon TCG Pocket Card Data Service

This service provides access to Pokemon TCG Pocket card data from the [pokemon-tcg-pocket-database](https://github.com/flibustier/pokemon-tcg-pocket-database) repository.

## Quick Start

1. **Load Card Data**
   ```typescript
   // In your component
   constructor(private dataManager: DataManagerService) {}
   
   ngOnInit() {
     this.dataManager.initializeCardData().subscribe(cards => {
       console.log('Loaded cards:', cards.length);
     });
   }
   ```

2. **Download Cards for Local Storage**
   ```typescript
   // Download cards.json file
   this.dataManager.downloadCardsFile();
   // Then move the downloaded file to src/assets/cards/cards.json
   ```

## Services Overview

### DataManagerService
Main service for managing card data operations.

```typescript
// Initialize and load data
initializeCardData(): Observable<Card[]>

// Download cards.json file
downloadCardsFile(): void

// Get setup instructions
getStorageInstructions(): string

// Search and filter operations
getAllCards(): Observable<Card[]>
getCardsBySet(setName: string): Observable<Card[]>
getCardsByType(type: string): Observable<Card[]>
searchCards(searchTerm: string): Observable<Card[]>
```

### CardDataService
Core service for card data operations.

```typescript
// Fetch from API
fetchCardsFromAPI(): Observable<Card[]>

// Local storage operations
downloadAndStoreCards(): Observable<Card[]>
getStoredCards(): Card[] | null

// Filter operations
getCardsBySet(setName: string): Observable<Card[]>
getCardsByType(type: string): Observable<Card[]>
getCardsByRarity(rarity: string): Observable<Card[]>
searchCardsByName(searchTerm: string): Observable<Card[]>

// Get unique values for filters
getUniqueSets(): Observable<string[]>
getUniqueTypes(): Observable<string[]>
getUniqueRarities(): Observable<string[]>
```

### FileStorageService
Utility service for file operations.

```typescript
// Download operations
downloadCardsData(): Observable<Card[]>
downloadCardsAsBlob(): Observable<Blob>
triggerDownload(): void
```

### AssetsHelperService
Helper service for downloading and setup instructions.

```typescript
// Download cards.json file with user guidance
downloadCardsJson(): void

// Get detailed setup instructions
showSetupInstructions(): string
```

## Card Interface

```typescript
interface Card {
  id: string;
  name: string;
  set: string;
  rarity: string;
  type: string;
  hp?: number;
  retreat_cost?: number;
  stage?: string;
  evolves_from?: string;
  abilities?: any[];
  attacks?: any[];
  weakness?: any;
  resistance?: any;
  artist?: string;
  description?: string;
  [key: string]: any;
}
```

## Usage Examples

### Basic Card Loading
```typescript
export class MyComponent implements OnInit {
  cards: Card[] = [];
  
  constructor(private dataManager: DataManagerService) {}
  
  ngOnInit() {
    this.dataManager.initializeCardData().subscribe({
      next: (cards) => {
        this.cards = cards;
        console.log(`Loaded ${cards.length} cards`);
      },
      error: (error) => {
        console.error('Failed to load cards:', error);
      }
    });
  }
}
```

### Filtering Cards
```typescript
// Get cards by set
this.dataManager.getCardsBySet('Genetic Apex').subscribe(cards => {
  console.log('Genetic Apex cards:', cards);
});

// Search cards by name
this.dataManager.searchCards('Pikachu').subscribe(cards => {
  console.log('Pikachu cards:', cards);
});

// Get filter options
this.dataManager.getFilterOptions().subscribe(options => {
  console.log('Available sets:', options.sets);
  console.log('Available types:', options.types);
  console.log('Available rarities:', options.rarities);
});
```

### Direct Service Usage
```typescript
// Use CardDataService directly
constructor(private cardDataService: CardDataService) {}

loadPokemonCards() {
  this.cardDataService.getCardsByType('Pokemon').subscribe(cards => {
    console.log('Pokemon cards:', cards);
  });
}

loadRareCards() {
  this.cardDataService.getCardsByRarity('★★★★').subscribe(cards => {
    console.log('Four-star cards:', cards);
  });
}
```

## Data Storage

The service uses multiple storage strategies:

1. **API Fetching**: Downloads data from the remote repository
2. **localStorage**: Caches data for offline access
3. **Local Assets**: Loads from `src/assets/cards/cards.json` if available

The service automatically falls back through these options if one is unavailable.

## Setup Instructions

1. **Automatic Setup** (Recommended):
   - Run the Angular app
   - Click "Download cards.json"
   - Move the downloaded file to `src/assets/cards/cards.json`
   - Restart the dev server

2. **Manual Setup**:
   - Download the JSON from: https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/cards.json
   - Save as `src/assets/cards/cards.json`
   - Restart the dev server

3. **API-Only Mode**:
   - No setup required
   - Data will be fetched from API and cached in localStorage
   - Requires internet connection for initial load

## Development

The services are already configured in `app.module.ts` with `HttpClientModule`. No additional setup is required for development.

## Error Handling

All services include comprehensive error handling:
- Network errors fall back to localStorage
- Missing local files fall back to API
- Clear error messages in console and UI
- Graceful degradation for offline use

## Browser Console

Enable browser console to see detailed logs including:
- Data loading status
- Card statistics
- Error messages
- Performance information
- Setup instructions