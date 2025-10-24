import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { PokemonDataService } from '../../services/pokemon-data.service';
import { DataManagerService } from '../../services/data-manager.service';
import { ImageService } from '../services/image.service';
import { SupabaseService, Profile } from '../services/supabase.service';
import { Card } from '../../services/card-data.service';
import { SetInfo, RarityMapping } from '../../services/pokemon-data.service';
import { Router } from '@angular/router';
import { RarityService } from '../services/rarity.service';

@Component({
  selector: 'app-card-collection',
  templateUrl: './card-collection.component.html',
  styleUrls: ['./card-collection.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CardCollectionComponent implements OnInit {
  cards: Card[] = [];
  filteredCards: Card[] = [];
  sets: SetInfo[] = [];
  rarityMapping: RarityMapping = {};
  
  // Collection tracking
  ownedCards: { [key: string]: number } = {};
  
  // Filter options
  selectedSet: string = 'all';
  selectedRarity: string = 'all';
  selectedPack: string = 'all';
  searchTerm: string = '';
  
  // Available filter values
  availableSets: string[] = [];
  availableRarities: string[] = [];
  availableRaritySymbols: { symbol: string, rarities: string[], displayName: string }[] = [];
  availablePacks: string[] = [];
  
  // UI state
  loading = true;
  loadingOwnedCards = false;
  syncingCards = false;
  syncProgress = 0;
  syncMessage = '';
  error: string | null = null;
  viewMode: 'grid' | 'list' = 'grid';
  editingCardId: string | null = null;
  editingCountValue = 0;
  
  // Statistics
  totalCards = 0;
  ownedCount = 0;
  uniqueOwned = 0;
  completionPercentage = 0;

  // User data
  currentUser: Profile | null = null;

  constructor(
    private pokemonDataService: PokemonDataService,
    private dataManager: DataManagerService,
    private imageService: ImageService,
    private supabaseService: SupabaseService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private rarityService: RarityService
  ) {}

  ngOnInit(): void {
    // Check if user is signed in
    this.currentUser = this.supabaseService.getCurrentUser();
    if (!this.currentUser) {
      this.router.navigate(['/signin']);
      return;
    }

    // Load data first, then owned cards
    this.loadAllData();
  }

  loadAllData(): void {
    this.loading = true;
    this.error = null;

    this.pokemonDataService.loadAllData().subscribe({
      next: (data) => {
        this.cards = data.cards;
        this.filteredCards = [...this.cards];
        this.sets = data.sets;
        this.rarityMapping = data.rarities;
        
        this.extractFilterOptions();
        this.calculateStatistics();
        this.loading = false;
        
        this.cdr.detectChanges();
        this.loadOwnedCards();
      },
      error: (error) => {
        this.error = 'Failed to load card collection';
        this.loading = false;
        this.cdr.detectChanges();
        console.error('Error loading card collection:', error);
      }
    });
  }

  extractFilterOptions(): void {
    // Extract unique sets (keep original order, no sorting)
    this.availableSets = [...new Set(this.cards.map(card => card.set))];
    
    // Extract unique rarities and group by symbols (preserve original order)
    const uniqueRarities = [...new Set(this.cards.map(card => card.rarityCode).filter(code => code))];
    this.availableRarities = uniqueRarities;
    
    // Use standardized rarity service to group rarities by symbols
    this.availableRaritySymbols = [];
    
    // Get unique rarity codes from cards (use rarityCode only for consistency)
    const normalizedCodes = new Set<string>();
    this.cards.forEach(card => {
      if (card.rarityCode) {
        const normalizedCode = this.rarityService.getNormalizedCode(card.rarityCode);
        normalizedCodes.add(normalizedCode);
      }
    });
    
    // Convert to available rarity symbols using unified rarities, ensuring no duplicates
    const symbolMap = new Map<string, { symbol: string, rarities: string[], displayName: string }>();
    
    const unifiedRarities = this.rarityService.getUnifiedRarities();
    unifiedRarities.forEach(rarityInfo => {
      if (normalizedCodes.has(rarityInfo.code)) {
        // Use symbol as key to prevent duplicates
        symbolMap.set(rarityInfo.symbol, {
          symbol: rarityInfo.symbol,
          rarities: [rarityInfo.code],
          displayName: rarityInfo.displayName
        });
      }
    });
    
    this.availableRaritySymbols = Array.from(symbolMap.values())
      .sort((a, b) => {
        const orderA = this.rarityService.getRarityOrder(a.rarities[0]);
        const orderB = this.rarityService.getRarityOrder(b.rarities[0]);
        return orderA - orderB;
      });
    
    // Extract all packs for initial load
    this.extractAvailablePacks();
  }

  /**
   * Convert full rarity names to short codes
   */
  convertRarityNameToCode(rarityName: string): string {
    const nameToCodeMap: { [key: string]: string } = {
      'Common': 'C',
      'Uncommon': 'U',
      'Rare': 'R',
      'Double Rare': 'RR',
      'Art Rare': 'AR',
      'Super Rare': 'SR',
      'Special Art Rare': 'SAR',
      'Immersive Rare': 'IM',
      'Crown Rare': 'UR',
      'Shiny': 'S',
      'Shiny Super Rare': 'SSR'
    };
    return nameToCodeMap[rarityName] || rarityName;
  }

  extractAvailablePacks(): void {
    let cardsToCheck = this.cards;
    
    // If a set is selected, filter cards by that set first
    if (this.selectedSet !== 'all') {
      cardsToCheck = this.cards.filter(card => card.set === this.selectedSet);
    }
    
    // Extract unique packs from filtered cards
    const allPacks = cardsToCheck.flatMap(card => card.packs).filter(pack => pack && pack.trim());
    this.availablePacks = [...new Set(allPacks)];
    
    // Reset pack selection if current selection is no longer available
    if (this.selectedPack !== 'all' && !this.availablePacks.includes(this.selectedPack)) {
      this.selectedPack = 'all';
    }
  }

  applyFilters(): void {
    this.filteredCards = this.cards.filter(card => {
      // Set filter
      if (this.selectedSet !== 'all' && card.set !== this.selectedSet) {
        return false;
      }
      
      // Rarity filter - check if card rarity matches selected symbol
      if (this.selectedRarity !== 'all') {
        const selectedRarityGroup = this.availableRaritySymbols.find(group => group.symbol === this.selectedRarity);
        if (selectedRarityGroup) {
          // Check if card rarityCode normalized matches the selected symbol group
          const normalizedCode = card.rarityCode ? this.rarityService.getNormalizedCode(card.rarityCode) : '';
          if (!selectedRarityGroup.rarities.includes(normalizedCode)) {
            return false;
          }
        } else {
          // Fallback to direct rarityCode match
          const cardSymbol = card.rarityCode ? this.rarityService.getSymbol(card.rarityCode) : '';
          if (cardSymbol !== this.selectedRarity) {
            return false;
          }
        }
      }
      
      // Pack filter
      if (this.selectedPack !== 'all' && !card.packs.includes(this.selectedPack)) {
        return false;
      }
      
      // Search filter
      if (this.searchTerm && !card.label.eng.toLowerCase().includes(this.searchTerm.toLowerCase())) {
        return false;
      }
      
      return true;
    });

  }

  onFilterChange(): void {
    // Update available packs when set changes
    this.extractAvailablePacks();
    this.applyFilters();
  }

  onSetChange(): void {
    // When set changes, update available packs and apply filters
    this.extractAvailablePacks();
    this.applyFilters();
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  clearFilters(): void {
    this.selectedSet = 'all';
    this.selectedRarity = 'all';
    this.selectedPack = 'all';
    this.searchTerm = '';
    this.applyFilters();
  }

  // Card ownership management
  async loadOwnedCards(): Promise<void> {
    if (!this.currentUser) return;

    this.loadingOwnedCards = true;
    this.syncingCards = true;
    this.syncProgress = 0;
    this.syncMessage = 'Starting sync...';
    
    try {
      // Load from Supabase with progress callback
      const collection = await this.supabaseService.syncUserCollection(
        this.currentUser.id, 
        (loaded: number) => {
          this.syncProgress = loaded;
          this.syncMessage = `Syncing cards... ${loaded} loaded`;
          this.cdr.detectChanges();
        }
      );
      
      this.ownedCards = collection;
      this.calculateStatistics();
      this.syncMessage = `Sync completed! ${Object.keys(collection).length} cards loaded`;
      this.cdr.detectChanges();
      
      // Hide sync message after a short delay
      setTimeout(() => {
        this.syncingCards = false;
        this.syncMessage = '';
        this.cdr.detectChanges();
      }, 1500);
      
    } catch (error) {
      console.error('Error loading owned cards:', error);
      this.syncMessage = 'Sync failed, using local data...';
      
      // Fallback to localStorage
      const saved = localStorage.getItem('ownedPokemonCards');
      if (saved) {
        this.ownedCards = JSON.parse(saved);
        this.calculateStatistics();
      }
      
      this.cdr.detectChanges();
      
      // Hide sync message after delay
      setTimeout(() => {
        this.syncingCards = false;
        this.syncMessage = '';
        this.cdr.detectChanges();
      }, 2000);
    } finally {
      this.loadingOwnedCards = false;
    }
  }

  async saveOwnedCards(): Promise<void> {
    // Save to localStorage as backup
    localStorage.setItem('ownedPokemonCards', JSON.stringify(this.ownedCards));
    this.calculateStatistics();
  }

  getCardId(card: Card): string {
    return `${card.set}-${card.number}`;
  }

  getOwnedCount(card: Card): number {
    return this.ownedCards[this.getCardId(card)] || 0;
  }

  async increaseOwned(card: Card): Promise<void> {
    if (!this.currentUser) return;

    const cardId = this.getCardId(card);
    const currentQuantity = this.getOwnedCount(card);
    const newQuantity = currentQuantity + 1;

    this.updateLocalQuantity(cardId, newQuantity);
    await this.persistQuantity(cardId, newQuantity, currentQuantity);
  }

  async decreaseOwned(card: Card): Promise<void> {
    if (!this.currentUser) return;

    const cardId = this.getCardId(card);
    const currentQuantity = this.getOwnedCount(card);

    if (currentQuantity === 0) {
      return;
    }

    const newQuantity = currentQuantity - 1;
    this.updateLocalQuantity(cardId, newQuantity);
    await this.persistQuantity(cardId, newQuantity, currentQuantity);
  }

  startEditingCount(card: Card): void {
    this.editingCardId = this.getCardId(card);
    this.editingCountValue = this.getOwnedCount(card);
    this.cdr.detectChanges();
  }

  cancelEditingCount(): void {
    this.editingCardId = null;
    this.editingCountValue = 0;
    this.cdr.detectChanges();
  }

  async commitCount(card: Card): Promise<void> {
    if (!this.currentUser) {
      return;
    }

    const cardId = this.getCardId(card);
    if (this.editingCardId !== cardId) {
      return;
    }

    const sanitizedValue = Math.max(0, Math.floor(Number(this.editingCountValue) || 0));
    const previousQuantity = this.getOwnedCount(card);

    if (sanitizedValue === previousQuantity) {
      this.cancelEditingCount();
      return;
    }

    this.updateLocalQuantity(cardId, sanitizedValue);
    await this.persistQuantity(cardId, sanitizedValue, previousQuantity);
    this.cancelEditingCount();
  }

  private updateLocalQuantity(cardId: string, quantity: number): void {
    if (quantity <= 0) {
      delete this.ownedCards[cardId];
    } else {
      this.ownedCards[cardId] = quantity;
    }

    this.saveOwnedCards();
    this.cdr.detectChanges();
  }

  private async persistQuantity(cardId: string, newQuantity: number, previousQuantity: number): Promise<void> {
    if (!this.currentUser) {
      return;
    }

    try {
      await this.supabaseService.updateCardQuantity(this.currentUser.id, cardId, newQuantity);
    } catch (error) {
      console.error('Error updating card quantity in database:', error);

      if (previousQuantity <= 0) {
        delete this.ownedCards[cardId];
      } else {
        this.ownedCards[cardId] = previousQuantity;
      }

      this.saveOwnedCards();
      this.cdr.detectChanges();
    }
  }

  calculateStatistics(): void {
    this.totalCards = this.cards.length;
    this.ownedCount = Object.values(this.ownedCards).reduce((sum, count) => sum + count, 0);
    this.uniqueOwned = Object.keys(this.ownedCards).length;
    this.completionPercentage = this.totalCards > 0 ? Math.round((this.uniqueOwned / this.totalCards) * 100) : 0;
  }

  // Utility methods
  getSetName(setCode: string): string {
    const set = this.sets.find(s => s.code === setCode);
    return set ? set.label.en : setCode;
  }

  getFullRarityName(rarityCode: string): string {
    return this.rarityService.getStandardizedDisplayName(rarityCode);
  }

  getRarityClass(rarity: string): string {
    const rarityClasses: { [key: string]: string } = {
      'Common': 'rarity-common',
      'Uncommon': 'rarity-uncommon',
      'Rare': 'rarity-rare',
      'Double Rare': 'rarity-double-rare',
      'Art Rare': 'rarity-art-rare',
      'Super Rare': 'rarity-super-rare',
      'Special Art Rare': 'rarity-special-art-rare',
      'Immersive Rare': 'rarity-immersive-rare',
      'Crown Rare': 'rarity-crown-rare',
      'Shiny': 'rarity-shiny',
      'Shiny Super Rare': 'rarity-shiny-super-rare'
    };
    
    return rarityClasses[rarity] || 'rarity-default';
  }

  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'grid' ? 'list' : 'grid';
  }

  // Export/Import collection
  exportCollection(): void {
    // CSV Header with UTF-8 BOM for Excel compatibility
    let csvContent = '\uFEFF'; // UTF-8 BOM
    csvContent += 'Id,CardName,NumberOwn,Expansion,Pack,Rarity\n';
    
    // Add all cards with their owned quantities (including 0)
    this.cards.forEach(card => {
      const cardId = this.getCardId(card);
      const ownedCount = this.getOwnedCount(card);
      const raritySymbol = card.rarityCode ? this.rarityService.getSymbol(card.rarityCode) : 'Unknown';
      const primaryPack = (card.packs && card.packs.length > 0) ? card.packs[0] : '';
      
      // Escape commas in card names
      const cardName = card.label.eng.replace(/,/g, '""');
      
      csvContent += `${cardId},"${cardName}",${ownedCount},${card.set},"${primaryPack}",${raritySymbol}\n`;
    });
    
    const dataBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = 'pokemon-tcg-collection.csv';
    link.click();
  }

  importCollection(event: any): void {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const csvData = (e.target?.result as string) || '';
          const rawLines = csvData.split(/\r?\n/);
          const lines = rawLines.filter(l => l.trim().length > 0);

          if (lines.length === 0) {
            alert('CSV file appears to be empty.');
            return;
          }

          // Build ID index using normalized IDs (case-insensitive + set aliases)
          const idIndex = new Map<string, string>();
          this.cards.forEach(c => {
            const canonical = this.getCardId(c);
            idIndex.set(this.normalizeId(canonical), canonical);
          });

          // Determine if first row is a header
          const headerCandidates = this.parseCSVLine(lines[0]);
          const headerRegex = /(id|card|name|expansion|set|rarity|qty|quantity|owned|count|number|no)/i;
          const hasHeader = headerCandidates.some(h => headerRegex.test(h));

          const startIndex = hasHeader ? 1 : 0;
          const headerMap = hasHeader ? this.buildHeaderMap(headerCandidates) : null;

          let importedCount = 0;
          let errorCount = 0;
          let missingCardCount = 0;

          for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i];
            try {
              const columns = this.parseCSVLine(line);

              // Resolve cardId and quantity flexibly
              const { cardId, quantity } = this.resolveCsvRow(columns, headerMap);

              if (!cardId) {
                errorCount++;
                continue;
              }

              const numberOwn = Math.max(0, Math.floor(Number(quantity)) || 0);

              // Normalize input id (case-insensitive + set aliases) and map to canonical id
              const canonicalId = idIndex.get(this.normalizeId(cardId)) || null;

              if (canonicalId) {
                if (numberOwn > 0) {
                  this.ownedCards[canonicalId] = numberOwn;
                } else {
                  delete this.ownedCards[canonicalId];
                }
                importedCount++;
              } else {
                console.log(cardId)
                missingCardCount++;
              }
            } catch (lineError) {
              console.error(`Error parsing line: ${line}`, lineError);
              errorCount++;
            }
          }

          // Save the updated collection to localStorage
          this.saveOwnedCards();

          // Bulk sync to Supabase if user is logged in
          if (this.currentUser) {
            try {
              const result = await this.supabaseService.bulkReplaceUserCollection(
                this.currentUser.id, 
                this.ownedCards
              );
              
              if (result.success) {
                
                // Show success message
                let message = `Import completed!\n${importedCount} cards updated`;
                message += `\nCollection synced to database successfully`;
                if (missingCardCount > 0) message += `\n${missingCardCount} rows referenced unknown cards (skipped)`;
                if (errorCount > 0) message += `\n${errorCount} parse errors encountered`;
                // Refresh owned cards from database to reflect server state
                await this.loadOwnedCards();

                alert(message);
              } else {
                console.error('❌ Failed to sync collection to database:', result.error);
                
                // Show partial success message
                let message = `Import completed!\n${importedCount} cards updated locally`;
                message += `\nDatabase sync failed: ${result.error}`;
                if (missingCardCount > 0) message += `\n${missingCardCount} unknown cards (skipped)`;
                if (errorCount > 0) message += `\n${errorCount} parse errors encountered`;
                
                alert(message);
              }
            } catch (error) {
              console.error('❌ Error during bulk sync:', error);
              
              // Show error message
              let message = `Import completed!\n${importedCount} cards updated locally`;
              message += `\nDatabase sync failed - please try again`;
              if (missingCardCount > 0) message += `\n${missingCardCount} unknown cards (skipped)`;
              if (errorCount > 0) message += `\n${errorCount} parse errors encountered`;
              
              alert(message);
            }
          } else {
            // Show result message if not logged in
            let message = `Import completed!\n${importedCount} cards updated`;
            if (missingCardCount > 0) message += `\n${missingCardCount} unknown cards (skipped)`;
            if (errorCount > 0) message += `\n${errorCount} parse errors encountered`;
            
            alert(message);
          }
        } catch (error) {
          console.error('Failed to import collection:', error);
          alert('Failed to import collection. Please check the CSV file format.');
        }
      };
      reader.readAsText(file);
    }
  }

  /**
   * Build a simple header map (case-insensitive)
   */
  private buildHeaderMap(headers: string[]): { [key: string]: number } {
    const map: { [key: string]: number } = {};
    headers.forEach((h, idx) => {
      const key = h.trim().toLowerCase();
      map[key] = idx;
    });
    return map;
  }

  /**
   * Resolve a row into a cardId and quantity using flexible headers
   */
  private resolveCsvRow(columns: string[], headerMap: { [key: string]: number } | null): { cardId: string | null, quantity: number } {
    const getByKeys = (keys: string[]): string | undefined => {
      if (!headerMap) return undefined;
      for (const k of keys) {
        const idx = headerMap[k];
        if (idx !== undefined && idx >= 0 && idx < columns.length) {
          const val = (columns[idx] || '').trim();
          if (val) return val;
        }
      }
      return undefined;
    };

    // Quantity candidates
    const qtyStr = getByKeys([
      'numberown','quantity','qty','owned','count','number own','number_owned'
    ]);
    let quantity = 0;
    if (qtyStr !== undefined) {
      quantity = Math.max(0, Math.floor(Number(qtyStr) || 0));
    } else if (columns.length >= 3) {
      // Fallback to our original export format (col 2)
      quantity = Math.max(0, Math.floor(Number(columns[2]) || 0));
    }

    // Card ID direct
    let cardId = getByKeys(['id','cardid','card id']);

    if (!cardId) {
      // Derive from Set/Expansion + Number
      let setVal = getByKeys(['set','expansion']);
      let numVal = getByKeys(['number','no','card number','card no','card#']);

      if (!setVal && columns.length >= 4) {
        // Fallback to our export format (col 3 is set)
        setVal = (columns[3] || '').trim();
      }
      if (!numVal && columns.length >= 1) {
        // If file has no explicit number column and no direct id, try the first column
        // (not ideal, just a final fallback)
        const maybeNum = (columns[1] || '').trim();
        if (/^\d+/.test(maybeNum)) numVal = maybeNum;
      }

      if (setVal && numVal) {
        const setCode = this.mapToSetCode(setVal);
        const num = this.extractLeadingInt(numVal);
        if (setCode && num !== null) {
          cardId = `${setCode}-${num}`;
        }
      }
    }

    // Fallback to column 0 as id if nothing else
    if (!cardId && columns.length > 0) {
      const c0 = (columns[0] || '').trim();
      if (c0) cardId = c0;
    }

    return { cardId: cardId || null, quantity };
  }

  private extractLeadingInt(val: string): number | null {
    const m = (val || '').match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  }

  private mapToSetCode(value: string): string | null {
    const v = (value || '').trim();
    const upper = v.toUpperCase();

    // Special alias: PROMO-A => P-A
    if (upper === 'PROMO-A') {
      return 'P-A';
    }

    // Case-insensitive code match, return canonical code from sets list
    const codeMatch = this.sets.find(s => (s.code || '').toUpperCase() === upper);
    if (codeMatch) return codeMatch.code;

    // Case-insensitive name match (English)
    const nameMatch = this.sets.find(s => (s.label?.en || '').toUpperCase() === upper);
    if (nameMatch) return nameMatch.code;

    return null;
  }

  private normalizeId(id: string): string {
    let s = (id || '').trim().toUpperCase();
    // Apply set alias for PROMO-A within IDs like "PROMO-A-12" => "P-A-12"
    s = s.replace(/^PROMO-A(?=-)/, 'P-A');
    return s;
  }

  /**
   * Parse a CSV line handling quoted values
   */
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add the last field
    result.push(current);
    
    return result;
  }

  /**
   * Get the image URL for a card
   */
  getCardImageUrl(imageName: string): string {
    return this.imageService.getCardImageUrl(imageName);
  }

  /**
   * Get display name for card (format: "A4b-1 - Bulbasaur")
   */
  getCardDisplayName(card: Card): string {
    return `${card.set}-${card.number} – ${card.label.eng}`;
  }

  /**
   * Handle image error events
   */
  onImageError(event: Event, card: Card): void {
    console.error('❌ Image failed to load:', card.imageName);
    const imgElement = event.target as HTMLImageElement;
    imgElement.src = this.imageService.getPlaceholderImageUrl();
  }

  /**
   * Group filtered cards by their sets for display
   */
  getGroupedCards(): { groupTitle: string; cards: Card[] }[] {
    const groups: { [key: string]: Card[] } = {};
    
    // Group cards by their set (A1, A2, A4a, A4b, etc.)
    this.filteredCards.forEach(card => {
      const setKey = card.set;
      if (!groups[setKey]) {
        groups[setKey] = [];
      }
      groups[setKey].push(card);
    });
    
    // Convert to array and sort by set name
    return Object.keys(groups)
      .sort((a, b) => {
        // Custom sort for set names (A1, A2, A4a, A4b, etc.)
        const aMatch = a.match(/^([A-Z]+)(\d+)([a-z]*)$/);
        const bMatch = b.match(/^([A-Z]+)(\d+)([a-z]*)$/);
        
        if (aMatch && bMatch) {
          // Compare letter part first
          if (aMatch[1] !== bMatch[1]) {
            return aMatch[1].localeCompare(bMatch[1]);
          }
          // Then compare number part
          const aNum = parseInt(aMatch[2]);
          const bNum = parseInt(bMatch[2]);
          if (aNum !== bNum) {
            return aNum - bNum;
          }
          // Finally compare suffix (a, b, etc.)
          return (aMatch[3] || '').localeCompare(bMatch[3] || '');
        }
        
        // Fallback to simple string comparison
        return a.localeCompare(b);
      })
      .map(setKey => ({
        groupTitle: setKey,
        cards: groups[setKey].sort((a, b) => {
          // Sort cards within set by number, then by name
          if (a.number !== b.number) {
            return a.number - b.number;
          }
          return a.label.eng.localeCompare(b.label.eng);
        })
      }));
  }

  /**
   * Get the display name for a set group
   */
  getGroupDisplayName(groupTitle: string, cards: Card[]): string {
    // Get the set name from sets data
    const setName = this.getSetName(groupTitle);
    
    // Format: "A1 - Genetic Apex"
    if (setName && setName !== groupTitle) {
      return `${groupTitle} - ${setName}`;
    }
    
    // Fallback if set name not found
    return `Set ${groupTitle}`;
  }

  /**
   * Sign out the current user
   */

  /**
   * TrackBy functions to optimize Angular's change detection
   */
  trackByCardId = (index: number, card: Card): string => {
    return this.getCardId(card);
  }

  trackByGroupTitle = (index: number, group: { groupTitle: string; cards: Card[] }): string => {
    return group.groupTitle;
  }

  trackByCardInGroup = (index: number, card: Card): string => {
    return this.getCardId(card);
  }
}