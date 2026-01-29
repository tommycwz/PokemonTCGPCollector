import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, HostListener } from '@angular/core';
import { PokemonDataService } from '../../services/pokemon-data.service';
import { DataManagerService } from '../../services/data-manager.service';
import { ImageService } from '../services/image.service';
import { SupabaseService, Profile } from '../services/supabase.service';
import { Card } from '../../services/card-data.service';
import { SetInfo, RarityMapping } from '../../services/pokemon-data.service';
import { Router, ActivatedRoute } from '@angular/router';
import { RarityService } from '../services/rarity.service';

@Component({
  selector: 'app-card-collection',
  templateUrl: './card-collection.component.html',
  styleUrls: ['./card-collection.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CardCollectionComponent implements OnInit, OnDestroy {
  /**
   * Get owned/total count for a given rarity and set
   */
  getOwnedRarityCount(cards: Card[], rarity: string, set: string): string {
    if (!cards) return '0/0';

    // Define grouped rarities
    const rarityGroups: Record<string, string[]> = {
      '◊': ['◊', '◊◊', '◊◊◊', '◊◊◊◊'],
      '☆': ['☆', '☆☆', '☆☆☆', '🌈'],
      '✵': ['✵', '✵✵'],
    };

    // Extract the set code before the " - " (e.g. "B1 - Mega Rising" -> "B1")
    const setId = set.split(' - ')[0].trim().toUpperCase();

    // Get valid rarities
    const matchList = rarityGroups[rarity] || [rarity];

    // Filter cards by rarity and set (compare by symbol derived from code)
    const filtered = cards.filter((card: Card) => {
      if (!card) return false;
      const code = this.getCardRarityCode(card);
      const symbol = code ? this.rarityService.getSymbol(code) : '';
      const matchesRarity = matchList.includes(symbol);
      const matchesSet = set === 'all' || (card.set && card.set.toUpperCase() === setId);
      return matchesRarity && matchesSet;
    });

    // Count owned
    const owned = filtered.filter((card: Card) => this.getOwnedCount(card) > 0).length;
    return `${owned}/${filtered.length}`;
  }

  private touchStartX: number | null = null;
  private touchEndX: number | null = null;

  // Add swipe listeners when modal opens
  openCardModal(card: Card): void {
    this.selectedCardForModal = card;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', this.handleModalKeydown);
    setTimeout(() => {
      const modal = document.querySelector('.modal-content.card-modal');
      if (modal) {
        modal.addEventListener('touchstart', (e) => this.handleModalTouchStart(e as TouchEvent), { passive: true });
        modal.addEventListener('touchend', (e) => this.handleModalTouchEnd(e as TouchEvent), { passive: true });
      }
    }, 0);
  }

  // Remove swipe listeners when modal closes
  closeCardModal(): void {
    this.selectedCardForModal = null;
    document.body.style.overflow = 'auto';
    document.removeEventListener('keydown', this.handleModalKeydown);
    const modal = document.querySelector('.modal-content.card-modal');
    if (modal) {
      // Remove all listeners by cloning the node (safe for modal)
      const clone = modal.cloneNode(true);
      modal.parentNode?.replaceChild(clone, modal);
    }
  }

  private handleModalTouchStart = (event: TouchEvent): void => {
    if (event.touches.length === 1) {
      this.touchStartX = event.touches[0].clientX;
    }
  }

  private handleModalTouchEnd = (event: TouchEvent): void => {
    if (this.touchStartX === null) return;
    this.touchEndX = event.changedTouches[0].clientX;
    const deltaX = this.touchEndX - this.touchStartX;
    if (Math.abs(deltaX) > 50) { // threshold for swipe
      if (deltaX < 0) {
        this.showNextCardInModal(); // swipe left
      } else {
        this.showPrevCardInModal(); // swipe right
      }
    }
    this.touchStartX = null;
    this.touchEndX = null;
  }
  /**
   * Show previous card in modal
   */
  showPrevCardInModal(event?: MouseEvent) {
    if (event) event.stopPropagation();
    const cards = this.getAllModalCards();
    if (!this.selectedCardForModal || !cards.length) return;
    if (!this.selectedCardForModal) return;
    const selectedId = this.getCardId(this.selectedCardForModal);
    const idx = cards.findIndex(card => this.getCardId(card) === selectedId);
    if (idx > 0) {
      this.selectedCardForModal = cards[idx - 1];
    } else {
      this.selectedCardForModal = cards[cards.length - 1]; // wrap around
    }
    this.cdr.markForCheck();
  }

  /**
   * Show next card in modal
   */
  showNextCardInModal(event?: MouseEvent) {
    if (event) event.stopPropagation();
    const cards = this.getAllModalCards();
    if (!this.selectedCardForModal || !cards.length) return;
    if (!this.selectedCardForModal) return;
    const selectedId = this.getCardId(this.selectedCardForModal);
    const idx = cards.findIndex(card => this.getCardId(card) === selectedId);
    if (idx < cards.length - 1) {
      this.selectedCardForModal = cards[idx + 1];
    } else {
      this.selectedCardForModal = cards[0]; // wrap around
    }
    this.cdr.markForCheck();
  }

  /**
   * Get all cards currently shown in modal navigation (filtered/grouped)
   */
  getAllModalCards(): Card[] {
    // Flatten all grouped cards into a single array
    const groups = this.getGroupedCards();
    return Array.isArray(groups) ? groups.flatMap(group => group.cards) : [];
  }
  /** Helper to get card name, supporting both old and new schema */
  getCardName(card: Card): string {
    const anyCard = card as any;
    return (anyCard.name && typeof anyCard.name === 'string') ? anyCard.name : (card.label?.eng || '');
  }
  /** Helper to get image filename, supporting both old and new schema */
  getCardImageName(card: Card): string {
    const anyCard = card as any;
    return (anyCard.image && typeof anyCard.image === 'string') ? anyCard.image : (anyCard.imageName || '');
  }
  cards: Card[] = [];
  filteredCards: Card[] = [];
  sets: SetInfo[] = [];
  rarityMapping: RarityMapping = {};

  // Collection tracking
  ownedCards: { [key: string]: number } = {};
  cardMinimumKeepCount: { [key: string]: number } = {}; // Track minimum keep count for each card
  cardAllowTrade: { [key: string]: boolean } = {}; // Track allow_trade status for each card
  
  // Expose Math to template
  Math = Math;

  // Filter options
  selectedSet: string = 'all';
  selectedSeries: string = 'all';
  // Multi-select rarity filter by symbol (e.g., C, U, R, RR, AR, etc.)
  selectedRarities: string[] = [];
  // Multi-select types filter (e.g., Grass, Fire, Water, etc.)
  selectedTypes: string[] = [];
  selectedPack: string = 'all';
  searchTerm: string = '';
  sortBy: 'latest' | 'oldest' = 'latest';
  ownershipFilter: 'all' | 'missing' | 'owned' = 'all';
  foilFilter: 'all' | 'no-foil' | 'foil-only' = 'all';
  groupBy: 'none' | 'rarity' | 'pack' | 'type' = 'none';
  // Advanced modal removed

  // Available filter values
  availableSets: string[] = [];
  availableSeries: string[] = [];
  availableRarities: string[] = [];
  availableRaritySymbols: { symbol: string, rarities: string[], displayName: string }[] = [];
  availableTypes: string[] = [];
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
  private lastFlatOrder: Card[] = [];

  // Card modal
  selectedCardForModal: Card | null = null;

  // Viewing another user's collection
  isViewingOther = false;
  otherUsername = '';
  viewingUser: Profile | null = null;

  // Statistics
  totalCards = 0;
  ownedCount = 0;
  uniqueOwned = 0;
  completionPercentage = 0;

  // User data
  currentUser: Profile | null = null;

  // Filters visibility (mobile toggle)
  filtersOpen = false;

  // Trade modal functionality removed

  // View Others modal state
  showViewOthersModal = false;

  // Helper: check if a rarity symbol is present in available chips
  hasRaritySymbol(symbol: string): boolean {
    return (this.availableRaritySymbols || []).some(g => g.symbol === symbol);
  }

  constructor(
    private pokemonDataService: PokemonDataService,
    private dataManager: DataManagerService,
    private imageService: ImageService,
    private supabaseService: SupabaseService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private rarityService: RarityService
  ) { }

  ngOnInit(): void {
    // Check if user is signed in
    this.currentUser = this.supabaseService.getCurrentUser();
    if (!this.currentUser) {
      this.router.navigate(['/signin']);
      return;
    }

    // Set initial filters visibility based on viewport
    try {
      if (typeof window !== 'undefined' && window?.innerWidth <= 768) {
        this.filtersOpen = false; // collapsed by default on mobile
      }
    } catch { }

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
        // Apply query params (if any) after data is available (may trigger viewing other user)
        this.applyQueryParamsIfAny().then(() => {
          // Only load current user's cards if we're not viewing another user
          if (!this.isViewingOther) {
            this.loadOwnedCards();
          }
        });
      },
      error: (error) => {
        this.error = 'Failed to load card collection';
        this.loading = false;
        this.cdr.detectChanges();
        console.error('Error loading card collection:', error);
      }
    });
  }

  private async applyQueryParamsIfAny(): Promise<void> {
    const qp = this.route.snapshot.queryParams || {};
    const qpSeries = qp['series'];
    const qpSet = qp['set'];
    const qpPack = qp['pack'];
    const qpRarity = qp['rarity']; // symbol expected (e.g., ◊, ☆, ✵)
    const qpOtherUser = qp['otherUser']; // username of another user's collection to view

    let changed = false;

    if (typeof qpSeries === 'string' && qpSeries.trim()) {
      this.selectedSeries = qpSeries;
      changed = true;
    }

    // Update sets based on series before setting set/pack
    this.extractAvailableSets();

    if (typeof qpSet === 'string' && qpSet.trim()) {
      this.selectedSet = qpSet;
      changed = true;
    }

    // Update packs based on set before setting pack
    this.extractAvailablePacks();

    if (typeof qpPack === 'string' && qpPack.trim()) {
      this.selectedPack = qpPack;
      changed = true;
    }

    if (typeof qpRarity === 'string' && qpRarity.trim()) {
      this.selectedRarities = [qpRarity];
      changed = true;
    }

    if (changed) {
      this.applyFilters();
      this.cdr.detectChanges();
    }

    // Handle viewing another user's collection if query param provided
    if (typeof qpOtherUser === 'string' && qpOtherUser.trim()) {
      // Set the otherUsername field so existing logic can reuse it
      this.otherUsername = qpOtherUser.trim();
      // If it's the same as current user, we'll just load own collection (viewOtherCollection handles this)
      await this.viewOtherCollection();
    }
  }

  extractFilterOptions(): void {
    // Extract unique series (keep original order, no sorting)
    this.availableSeries = [...new Set(this.cards.map(card => card.series).filter((series): series is string => !!series))];

    // Extract unique rarities and group by symbols (preserve original order)
    const uniqueRaritySymbols = [...new Set(this.cards.map(card => card.rarity).filter(symbol => symbol))];

    // Map rarity symbols to codes using the rarity mapping
    const rarityCodeMap = this.createRaritySymbolToCodeMap();

    this.availableRarities = uniqueRaritySymbols.map(symbol => rarityCodeMap.get(symbol) || symbol);

    // Show all standardized rarities from service (not limited by data presence)
    const unifiedRarities = this.rarityService.getUnifiedRarities();
    this.availableRaritySymbols = unifiedRarities
      .map(r => ({ symbol: r.symbol, rarities: [r.code], displayName: r.displayName }))
      .sort((a, b) => {
        const orderA = this.rarityService.getRarityOrder(a.rarities[0]);
        const orderB = this.rarityService.getRarityOrder(b.rarities[0]);
        return orderA - orderB;
      });

    // Extract all packs for initial load
    this.extractAvailablePacks();

    // Extract types for initial load
    this.extractAvailableTypes();

    // Extract sets for initial load (all sets)
    this.extractAvailableSets();
  }

  /**
   * Extract available sets based on selected series
   */
  extractAvailableSets(): void {
    if (this.selectedSeries === 'all') {
      // Show all sets when no series is selected
      this.availableSets = [...new Set(this.cards.map(card => card.set))];
    } else {
      // Show only sets from the selected series
      this.availableSets = [...new Set(
        this.cards
          .filter(card => card.series === this.selectedSeries)
          .map(card => card.set)
      )];
    }
  }

  /**
   * Create a mapping from rarity symbols to codes based on rarity service
   */
  private createRaritySymbolToCodeMap(): Map<string, string> {
    const map = new Map<string, string>();

    // Use the rarity service's unified rarities to create the mapping
    const unifiedRarities = this.rarityService.getUnifiedRarities();
    for (const rarityInfo of unifiedRarities) {
      map.set(rarityInfo.symbol, rarityInfo.code);
    }

    return map;
  }

  /**
   * Get rarity code from card's rarity symbol
   */
  private getCardRarityCode(card: Card): string {
    // Prefer explicit rarityCode from data when present
    const explicitCode = (card as any).rarityCode;
    if (typeof explicitCode === 'string' && explicitCode.trim()) {
      return explicitCode.trim();
    }
    const rarityCodeMap = this.createRaritySymbolToCodeMap();
    return rarityCodeMap.get(card.rarity) || card.rarity;
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

    // If a series is selected, filter cards by that series first
    if (this.selectedSeries !== 'all') {
      cardsToCheck = cardsToCheck.filter(card => card.series === this.selectedSeries);
    }

    // If a set is selected, filter cards by that set
    if (this.selectedSet !== 'all') {
      cardsToCheck = cardsToCheck.filter(card => card.set === this.selectedSet);
    }

    // Extract unique packs from filtered cards (guard against undefined/null packs)
    const allPacks = cardsToCheck
      .flatMap(card => Array.isArray((card as any).packs) ? (card as any).packs : [])
      .filter(pack => typeof pack === 'string' && pack.trim());
    this.availablePacks = [...new Set(allPacks)];

    // Reset pack selection if current selection is no longer available
    if (this.selectedPack !== 'all' && !this.availablePacks.includes(this.selectedPack)) {
      this.selectedPack = 'all';
    }
  }

  extractAvailableTypes(): void {
    // New schema: derive types from element (grass, fire, water, etc.)
    const allElements = this.cards
      .map(card => ((card as any).element as string | undefined)?.toLowerCase().trim())
      .filter((el): el is string => !!el);

    this.availableTypes = [...new Set(allElements)].sort((a, b) => a.localeCompare(b));
  }

  applyFilters(): void {
    this.filteredCards = this.cards.filter(card => {
      // Set filter
      if (this.selectedSet !== 'all' && card.set !== this.selectedSet) {
        return false;
      }

      // Series filter
      if (this.selectedSeries !== 'all' && card.series !== this.selectedSeries) {
        return false;
      }

      // Rarity filter: expand selected symbols into codes (SR includes SAR, crown includes UR+CR)
      if (this.selectedRarities.length > 0) {
        const selectedCodes = new Set<string>();
        for (const sym of this.selectedRarities) {
          if (sym === '🌈') {
            selectedCodes.add('SAR');
            continue;
          }
          const code = this.rarityService.getCodeFromSymbol(sym);
          if (code) {
            selectedCodes.add(code);
            if (code === 'SR') selectedCodes.add('SAR');
            if (code === 'UR') selectedCodes.add('CR');
          }
        }
        const cardCode = this.getCardRarityCode(card);
        if (!selectedCodes.has(cardCode)) {
          return false;
        }
      }

      // Types filter (multi-select) using element field in new schema
      if (this.selectedTypes.length > 0) {
        const element = ((card as any).element as string | undefined)?.toLowerCase().trim();
        if (!element || !this.selectedTypes.includes(element)) {
          return false;
        }
      }

      // Pack filter (only when a specific set is selected)
      // Pack filter (only when a specific set is selected); guard against undefined packs
      if (this.selectedSet !== 'all' && this.selectedPack !== 'all') {
        const packs = Array.isArray((card as any).packs) ? (card as any).packs as string[] : [];
        if (!packs.includes(this.selectedPack)) {
          return false;
        }
      }

      // Search filter on name (new) or label.eng (old)
      const nameToSearch = this.getCardName(card);
      if (this.searchTerm && !nameToSearch.toLowerCase().includes(this.searchTerm.toLowerCase())) {
        return false;
      }

      // Ownership filter
      if (this.ownershipFilter === 'missing' && this.getOwnedCount(card) > 0) return false;
      if (this.ownershipFilter === 'owned' && this.getOwnedCount(card) === 0) return false;

      // Foil filter
      const isFoil = (card as any).isFoil === true;
      if (this.foilFilter === 'no-foil' && isFoil) {
        return false; // Hide foil cards when "NO FOIL" is selected
      }
      if (this.foilFilter === 'foil-only' && !isFoil) {
        return false; // Hide non-foil cards when "FOIL ONLY" is selected
      }

      return true;
    });

    // Sorting
    const isPromoSetCode = (code: string) => this.isSpecialSet(code);
    const compareSetKeyAsc = (as: string, bs: string) => {
      const pattern = /^([A-Z]+)(\d+)([a-z]*)$/;
      const pa = (as || '').match(pattern);
      const pb = (bs || '').match(pattern);
      if (pa && pb) {
        if (pa[1] !== pb[1]) return pa[1].localeCompare(pb[1]);
        const na = parseInt(pa[2], 10); const nb = parseInt(pb[2], 10);
        if (na !== nb) return na - nb;
        return (pa[3] || '').localeCompare(pb[3] || '');
      }
      return (as || '').localeCompare(bs || '');
    };

    switch (this.sortBy) {
      case 'oldest':
        // Oldest set first (ascending), promo sets always last
        this.filteredCards.sort((a, b) => {
          const aPromo = isPromoSetCode(a.set), bPromo = isPromoSetCode(b.set);
          if (aPromo && !bPromo) return 1;
          if (!aPromo && bPromo) return -1;
          const cmp = compareSetKeyAsc(a.set, b.set);
          if (cmp !== 0) return cmp;
          if (a.number !== b.number) return a.number - b.number;
          return this.getCardName(a).localeCompare(this.getCardName(b));
        });
        break;
      case 'latest':
      default:
        // Latest set first (descending), promo sets always last
        this.filteredCards.sort((a, b) => {
          const aPromo = isPromoSetCode(a.set), bPromo = isPromoSetCode(b.set);
          if (aPromo && !bPromo) return 1;
          if (!aPromo && bPromo) return -1;
          const cmp = compareSetKeyAsc(b.set, a.set);
          if (cmp !== 0) return cmp;
          if (a.number !== b.number) return b.number - a.number;
          return this.getCardName(a).localeCompare(this.getCardName(b));
        });
        break;
    }
  }

  onFilterChange(): void {
    // Update available packs when set changes
    this.extractAvailablePacks();
    this.applyFilters();
  }

  onSetChange(): void {
    // When set changes, update available packs and apply filters
    this.extractAvailablePacks();
    // If switching back to 'all' sets, disable pack filtering explicitly
    if (this.selectedSet === 'all') {
      this.selectedPack = 'all';
      this.groupBy = 'none'; // Reset grouping when viewing all sets
    }
    this.applyFilters();
  }

  onSeriesChange(): void {
    // When series changes, update available sets and reset set/pack selections
    this.extractAvailableSets();
    this.selectedSet = 'all';
    this.selectedPack = 'all';
    this.groupBy = 'none'; // Reset grouping when changing series
    this.extractAvailablePacks();
    this.applyFilters();
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  onGroupByChange(): void {
    this.applyFilters();
  }

  clearFilters(): void {
    this.selectedSet = 'all';
    this.selectedSeries = 'all';
    this.selectedRarities = [];
    this.selectedTypes = [];
    this.selectedPack = 'all';
    this.searchTerm = '';
    this.sortBy = 'latest';
    this.ownershipFilter = 'all';
    this.foilFilter = 'all';
    this.groupBy = 'none';

    // Re-extract available options when clearing filters
    this.extractAvailableSets();
    this.extractAvailablePacks();
    this.applyFilters();
  }

  toggleFilters(): void {
    this.filtersOpen = !this.filtersOpen;
    this.cdr.detectChanges();
    if (this.filtersOpen) {
      // Ensure filters are in view when opened on mobile
      setTimeout(() => {
        const panel = document.querySelector('.filters-panel') as HTMLElement | null;
        if (panel) {
          const top = panel.getBoundingClientRect().top + window.scrollY - 8;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      });
    }
  }

  /** Determine if a set should be treated as a special/blocked set.
   *  Centralized so all features use the same logic.
   *  Rules:
   *  - Promo-style codes (P-*, *-P, P-A, PROMO-*)
   *  - A4B (kept for backward compatibility with previous logic)
   */
  private isSpecialSet(code: string): boolean {
    const c = (code || '').toUpperCase();
    return c.startsWith('P-') || c.endsWith('-P') || c === 'P-A' || c.startsWith('PROMO') || c.startsWith('A4B');
  }

  // Trade modal methods removed

  // View Others modal methods
  openViewOthersModal(): void {
    if (this.isViewingOther) return;
    this.showViewOthersModal = true;
    this.cdr.detectChanges();
  }

  closeViewOthersModal(): void {
    this.showViewOthersModal = false;
    this.cdr.detectChanges();
  }

  async viewOtherCollectionFromModal(): Promise<void> {
    // Open in a new browser tab with query param
    this.openOtherCollectionInNewTab();
    this.closeViewOthersModal();
  }

  /**
   * Open another user's collection in a new browser tab using query param otherUser
   */
  openOtherCollectionInNewTab(): void {
    const username = (this.otherUsername || '').trim();
    if (!username) {
      alert('Please enter a username');
      return;
    }
    const tree = this.router.createUrlTree(['/collection'], { queryParams: { otherUser: username } });
    const url = this.router.serializeUrl(tree);

    const baseEl = document.querySelector('base');
    const baseAttr = (baseEl?.getAttribute('href') || '/').trim();

    let finalUrl: string;
    if (/^https?:\/\//i.test(baseAttr)) {
      finalUrl = baseAttr.replace(/\/$/, '') + url;
    } else {
      finalUrl = baseAttr.replace(/\/$/, '') + url;
    }

    window.open(finalUrl, '_blank', 'noopener');
  }

  // Card ownership management
  async loadOwnedCards(): Promise<void> {
    if (!this.currentUser) return;
    await this.loadOwnedCardsForUser(this.currentUser.id, this.currentUser.username);
  }

  private async loadOwnedCardsForUser(userId: string, labelUsername?: string): Promise<void> {
    this.loadingOwnedCards = true;
    this.syncingCards = true;
    this.syncProgress = 0;
    this.syncMessage = labelUsername ? `Loading ${labelUsername}'s collection...` : 'Starting sync...';

    this.loadingOwnedCards = true;
    this.syncingCards = true;
    this.syncProgress = 0;
    this.syncMessage = 'Starting sync...';

    try {
      // Load from Supabase with progress callback
      const { quantities, minimumKeepCounts, allowTrade } = await this.supabaseService.syncUserCollection(
        userId,
        (loaded: number) => {
          this.syncProgress = loaded;
          this.syncMessage = `Syncing cards... ${loaded} loaded`;
          this.cdr.detectChanges();
        }
      );

      this.ownedCards = quantities;
      this.cardMinimumKeepCount = minimumKeepCounts;
      this.cardAllowTrade = allowTrade;
      this.calculateStatistics();
      this.syncMessage = `Sync completed! ${Object.keys(quantities).length} cards loaded`;
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

  getCardMinimumKeepCount(card: Card): number {
    const cardId = this.getCardId(card);
    return this.cardMinimumKeepCount[cardId] || 0; // Default to 0 if not set
  }

  isCardAllowTrade(card: Card): boolean {
    const cardId = this.getCardId(card);
    return this.cardAllowTrade[cardId] !== false; // Default to true if not set
  }

  async toggleCardAllowTrade(card: Card): Promise<void> {
    if (this.isViewingOther || !this.currentUser) {
      return;
    }

    const cardId = this.getCardId(card);
    const currentStatus = this.isCardAllowTrade(card);
    const newStatus = !currentStatus;
    const previousMinKeep = this.cardMinimumKeepCount[cardId] || 0;

    // Update allow_trade status
    this.cardAllowTrade[cardId] = newStatus;

    // Update minimum keep count based on lock status
    if (newStatus) {
      // Unlocked: restore previous value or set default based on rarity if it was 0
      if (previousMinKeep === 0) {
        const cardRarityCode = this.getCardRarityCode(card);
        const rarityOrder = this.rarityService.getRarityOrder(cardRarityCode);
        console.log(rarityOrder);
        this.cardMinimumKeepCount[cardId] = rarityOrder >= 5 ? 1 : 2;
      }
      // else keep the previous value (don't change it)
    } else {
      // Locked: set minimum keep to 0
      this.cardMinimumKeepCount[cardId] = 0;
    }

    this.cdr.detectChanges();

    // Persist allow_trade to database
    const tradeResult = await this.supabaseService.toggleAllowTrade(
      this.currentUser.id,
      cardId,
      newStatus
    );

    if (!tradeResult.success) {
      console.error('Error toggling allow trade:', tradeResult.error);
      // Revert on error
      this.cardAllowTrade[cardId] = currentStatus;
      this.cardMinimumKeepCount[cardId] = previousMinKeep;
      this.cdr.detectChanges();
      return;
    }

    // Persist minimum keep count to database
    const minKeepResult = await this.supabaseService.updateCardMinimumKeepCount(
      this.currentUser.id,
      cardId,
      this.cardMinimumKeepCount[cardId]
    );

    if (!minKeepResult.success) {
      console.error('Error updating minimum keep count:', minKeepResult.error);
    }
  }

  async updateCardMinimumKeepCount(card: Card, newMinimum: number): Promise<void> {
    if (this.isViewingOther) return; // read-only when viewing others
    if (!this.currentUser) return;
    if (newMinimum < 0) return; // Don't allow negative values

    const cardId = this.getCardId(card);
    const currentMinimum = this.getCardMinimumKeepCount(card);

    // Update locally
    this.cardMinimumKeepCount[cardId] = newMinimum;
    this.cdr.detectChanges();

    // Persist to database
    const result = await this.supabaseService.updateCardMinimumKeepCount(
      this.currentUser.id,
      cardId,
      newMinimum
    );

    if (!result.success) {
      console.error('Failed to update minimum keep count:', result.error);
      // Revert on error
      this.cardMinimumKeepCount[cardId] = currentMinimum;
      this.cdr.detectChanges();
    }
  }

  async increaseOwned(card: Card): Promise<void> {
    if (this.isViewingOther) return; // read-only when viewing others
    if (!this.currentUser) return;

    const cardId = this.getCardId(card);
    const currentQuantity = this.getOwnedCount(card);
    const newQuantity = currentQuantity + 1;

    this.updateLocalQuantity(cardId, newQuantity, card);
    await this.persistQuantity(cardId, newQuantity, currentQuantity, card);
  }

  async decreaseOwned(card: Card): Promise<void> {
    if (this.isViewingOther) return; // read-only when viewing others
    if (!this.currentUser) return;

    const cardId = this.getCardId(card);
    const currentQuantity = this.getOwnedCount(card);

    if (currentQuantity === 0) {
      return;
    }

    const newQuantity = currentQuantity - 1;
    this.updateLocalQuantity(cardId, newQuantity, card);
    await this.persistQuantity(cardId, newQuantity, currentQuantity, card);
  }

  startEditingCount(card: Card): void {
    if (this.isViewingOther) return; // read-only when viewing others
    this.editingCardId = this.getCardId(card);
    this.editingCountValue = this.getOwnedCount(card);
    this.cdr.detectChanges();
    this.focusEditingInput();
  }

  cancelEditingCount(): void {
    this.editingCardId = null;
    this.editingCountValue = 0;
    this.cdr.detectChanges();
  }

  async commitCount(card: Card): Promise<void> {
    if (this.isViewingOther) { this.cancelEditingCount(); return; }
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

    this.updateLocalQuantity(cardId, sanitizedValue, card);
    await this.persistQuantity(cardId, sanitizedValue, previousQuantity, card);
    this.cancelEditingCount();
  }

  onCountInputKeydown(event: KeyboardEvent, card: Card): void {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const ordered = this.getFlatOrderedCards();
    const currentId = this.getCardId(card);
    const idx = ordered.findIndex(c => this.getCardId(c) === currentId);
    if (idx === -1) return;
    const nextIdx = event.shiftKey ? idx - 1 : idx + 1;
    // Commit current value before moving
    this.commitCount(card).then(() => {
      const target = ordered[nextIdx];
      if (target) {
        this.startEditingCount(target);
      }
    });
  }

  private focusEditingInput(): void {
    const id = this.editingCardId;
    if (!id) return;
    setTimeout(() => {
      const el = document.querySelector(`.card-item[data-cardid="${id}"] .count-input`) as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.select();
      }
    });
  }

  private getFlatOrderedCards(): Card[] {
    // Cache last computed order to minimize work if needed
    const groups = this.getGroupedCards();
    this.lastFlatOrder = groups.flatMap(g => g.cards);
    return this.lastFlatOrder;
  }

  private updateLocalQuantity(cardId: string, quantity: number, card: Card): void {
    if (quantity <= 0) {
      delete this.ownedCards[cardId];
      delete this.cardMinimumKeepCount[cardId];
      delete this.cardAllowTrade[cardId];
    } else {
      this.ownedCards[cardId] = quantity;
      // Set default minimum keep count based on rarity
      if (this.cardMinimumKeepCount[cardId] === undefined) {
        const cardRarityCode = this.getCardRarityCode(card);
        const rarityOrder = this.rarityService.getRarityOrder(cardRarityCode);
        // 1-star and above (order >= 5) gets minimum keep of 1, otherwise 2
        this.cardMinimumKeepCount[cardId] = rarityOrder >= 5 ? 1 : 2;
      }
      // Set default allow_trade to true for new cards
      if (this.cardAllowTrade[cardId] === undefined) {
        this.cardAllowTrade[cardId] = true;
      }
    }

    this.saveOwnedCards();
    this.cdr.detectChanges();
  }

  private async persistQuantity(cardId: string, newQuantity: number, previousQuantity: number, card: Card): Promise<void> {
    if (!this.currentUser) {
      return;
    }

    try {
      await this.supabaseService.updateCardQuantity(this.currentUser.id, cardId, newQuantity);
      
      // For new cards, update the minimum_keep_card based on rarity
      if (previousQuantity === 0 && newQuantity > 0) {
        const cardRarityCode = this.getCardRarityCode(card);
        const rarityOrder = this.rarityService.getRarityOrder(cardRarityCode);
        const minKeep = rarityOrder >= 5 ? 1 : 2;
        await this.supabaseService.updateCardMinimumKeepCount(this.currentUser.id, cardId, minKeep);
      }
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
    const set = this.sets.find(s => (s.code || '').toUpperCase() === (setCode || '').toUpperCase());
    return set ? set.name : setCode;
  }

  getSetShortName(setCode: string): string {
    const set = this.sets.find(s => (s.code || '').toUpperCase() === (setCode || '').toUpperCase());
    return set ? set.shortName : setCode;
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
    console.log('View mode toggled to:', this.viewMode);
    this.cdr.detectChanges();
  }

  // Export/Import collection
  exportCollection(): void {
    if (this.isViewingOther) {
      alert('Export is disabled when viewing another user\'s collection');
      return;
    }
    // CSV Header with UTF-8 BOM for Excel compatibility
    let csvContent = '\uFEFF'; // UTF-8 BOM
    csvContent += 'Id,CardName,NumberOwn,Expansion,Pack,Rarity\n';

    // Add all cards with their owned quantities (including 0)
    this.cards.forEach(card => {
      const cardId = this.getCardId(card);
      const ownedCount = this.getOwnedCount(card);
      const cardRarityCode = this.getCardRarityCode(card);
      const raritySymbol = cardRarityCode ? this.rarityService.getSymbol(cardRarityCode) : 'Unknown';
      const primaryPack = (card.packs && card.packs.length > 0) ? card.packs[0] : '';

      // Escape commas in card names
      const cardName = this.getCardName(card).replace(/,/g, '""');

      csvContent += `${cardId},"${cardName}",${ownedCount},${card.set},"${primaryPack}",${raritySymbol}\n`;
    });

    const dataBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = 'pokemon-tcg-collection.csv';
    link.click();
  }

  importCollection(event: any): void {
    if (this.isViewingOther) {
      alert('Import is disabled when viewing another user\'s collection');
      return;
    }
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
          // Track per-card updates for allow_trade and minimum_keep_card
          const allowTradeUpdates: { [id: string]: boolean } = {};
          const minKeepUpdates: { [id: string]: number } = {};
          const updatedIds: string[] = [];

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
                // Determine allow_trade (optional column, default true)
                const allowTradeStr = headerMap ? (() => {
                  const keys = ['allowtrade', 'allow_trade', 'trade', 'allow'];
                  for (const k of keys) {
                    const idx = headerMap[k];
                    if (idx !== undefined && idx >= 0 && idx < columns.length) {
                      const v = (columns[idx] || '').trim();
                      if (v) return v;
                    }
                  }
                  return undefined;
                })() : undefined;
                const allowTradeVal = allowTradeStr !== undefined
                  ? (this.parseBooleanLike(allowTradeStr) ?? true)
                  : true;

                // Determine minimum_keep_card (optional column, default by rarity rule)
                const minKeepStr = headerMap ? (() => {
                  const keys = ['minimumkeepcard', 'minimum_keep_card', 'min_keep', 'min_keep_count', 'minimum'];
                  for (const k of keys) {
                    const idx = headerMap[k];
                    if (idx !== undefined && idx >= 0 && idx < columns.length) {
                      const v = (columns[idx] || '').trim();
                      if (v) return v;
                    }
                  }
                  return undefined;
                })() : undefined;

                const cardObj = this.cards.find(c => this.getCardId(c) === canonicalId) || null;
                const defaultMinKeep = cardObj ? this.getDefaultMinKeepForCard(cardObj) : 1;
                const parsedMinKeep = minKeepStr !== undefined ? Math.max(0, Math.floor(Number(minKeepStr) || 0)) : undefined;
                const minKeepVal = parsedMinKeep !== undefined ? parsedMinKeep : defaultMinKeep;

                console.log(`Importing ${canonicalId}: owned=${numberOwn}, allow_trade=${allowTradeVal}, min_keep=${minKeepVal}`);

                if (numberOwn > 0) {
                  this.ownedCards[canonicalId] = numberOwn;
                  // Apply local flags for cards we own
                  this.cardAllowTrade[canonicalId] = allowTradeVal;
                  this.cardMinimumKeepCount[canonicalId] = minKeepVal;
                  allowTradeUpdates[canonicalId] = allowTradeVal;
                  minKeepUpdates[canonicalId] = minKeepVal;
                  updatedIds.push(canonicalId);
                } else {
                  // Remove locally if zero
                  delete this.ownedCards[canonicalId];
                  delete this.cardAllowTrade[canonicalId];
                  delete this.cardMinimumKeepCount[canonicalId];
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
                this.ownedCards,
                { minKeep: minKeepUpdates, allowTrade: allowTradeUpdates }
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

  async viewOtherCollection(): Promise<void> {
    const username = (this.otherUsername || '').trim();
    if (!username) {
      alert('Please enter a username');
      return;
    }
    if (this.currentUser && username === this.currentUser.username) {
      // same as current user -> reset to own
      this.backToMyCollection();
      return;
    }

    const profile = await this.supabaseService.getProfileByUsername(username);
    if (!profile) {
      alert(`User '${username}' not found`);
      return;
    }

    this.isViewingOther = true;
    this.viewingUser = profile;
    await this.loadOwnedCardsForUser(profile.id, profile.username);
  }

  async backToMyCollection(): Promise<void> {
    this.isViewingOther = false;
    this.viewingUser = null;
    this.otherUsername = '';
    if (this.currentUser) {
      await this.loadOwnedCardsForUser(this.currentUser.id, this.currentUser.username);
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
      'numberown', 'quantity', 'qty', 'owned', 'count', 'number own', 'number_owned'
    ]);
    let quantity = 0;
    if (qtyStr !== undefined) {
      quantity = Math.max(0, Math.floor(Number(qtyStr) || 0));
    } else if (columns.length >= 3) {
      // Fallback to our original export format (col 2)
      quantity = Math.max(0, Math.floor(Number(columns[2]) || 0));
    }

    // Card ID direct
    let cardId = getByKeys(['id', 'cardid', 'card id']);

    if (!cardId) {
      // Derive from Set/Expansion + Number
      let setVal = getByKeys(['set', 'expansion']);
      let numVal = getByKeys(['number', 'no', 'card number', 'card no', 'card#']);

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
    const nameMatch = this.sets.find(s => (s.name || '').toUpperCase() === upper);
    if (nameMatch) return nameMatch.code;

    return null;
  }

  private normalizeId(id: string): string {
    let s = (id || '').trim().toUpperCase();
    // Apply set alias for PROMO-A within IDs like "PROMO-A-12" => "P-A-12"
    s = s.replace(/^PROMO-A(?=-)/, 'P-A');
    return s;
  }

  /** Parse boolean-like strings (true/false, 1/0, yes/no) */
  private parseBooleanLike(val: string): boolean | null {
    const s = (val || '').trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(s)) return true;
    if (['false', '0', 'no', 'n'].includes(s)) return false;
    return null;
  }

  /** Default minimum keep: ◊..◊◊◊◊ => 2, else 1 */
  private getDefaultMinKeepForCard(card: Card): number {
    const rarityCode = this.getCardRarityCode(card);
    const symbol = rarityCode ? this.rarityService.getSymbol(rarityCode) : '';
    const diamondSymbols = new Set(['◊', '◊◊', '◊◊◊', '◊◊◊◊']);
    return diamondSymbols.has(symbol) ? 2 : 1;
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
    return `${card.set}-${card.number} – ${this.getCardName(card)}`;
  }

  /**
   * Handle image error events
   */
  onImageError(event: Event, card: Card): void {
    console.error('❌ Image failed to load:', this.getCardImageName(card));
    const imgElement = event.target as HTMLImageElement;
    imgElement.src = this.imageService.getPlaceholderImageUrl();
  }

  /**
   * Group filtered cards by their sets or other criteria for display
   */
  getGroupedCards(): { groupTitle: string; cards: Card[] }[] {
    // If a specific set is selected and groupBy is not 'none', use the specified grouping
    if (this.selectedSet !== 'all' && this.groupBy !== 'none') {
      return this.getGroupedCardsByCategory();
    }

    // Default behavior: group by set
    const groups: { [key: string]: Card[] } = {};

    // Group cards by their set (A1, A2, A4a, A4b, etc.)
    this.filteredCards.forEach(card => {
      const setKey = card.set;
      if (!groups[setKey]) {
        groups[setKey] = [];
      }
      groups[setKey].push(card);
    });

    // Helper: compare set keys (A1, A2, A4a, A4b, etc.) ascending
    const compareSetKeyAsc = (x: string, y: string) => {
      const xm = x.match(/^([A-Z]+)(\d+)([a-z]*)$/);
      const ym = y.match(/^([A-Z]+)(\d+)([a-z]*)$/);
      if (xm && ym) {
        if (xm[1] !== ym[1]) return xm[1].localeCompare(ym[1]);
        const xn = parseInt(xm[2], 10), yn = parseInt(ym[2], 10);
        if (xn !== yn) return xn - yn;
        return (xm[3] || '').localeCompare(ym[3] || '');
      }
      return x.localeCompare(y);
    };

    // Decide group (set) order based on sortBy
    const groupComparator = (a: string, b: string) => {
      const isPromoSet = (code: string) => this.isSpecialSet(code);
      const aPromo = isPromoSet(a), bPromo = isPromoSet(b);
      // Promo always at bottom
      if (aPromo && !bPromo) return 1;
      if (!aPromo && bPromo) return -1;
      switch (this.sortBy) {
        case 'latest':
          // Latest set first => descending set order
          return compareSetKeyAsc(b, a);
        case 'oldest':
        default:
          // Oldest/name sorts keep ascending set order
          return compareSetKeyAsc(a, b);
      }
    };

    // Decide card order within a set based on sortBy
    const cardComparator = (a: Card, b: Card) => {
      // Default within-set order: number ascending then name
      if (a.number !== b.number) return a.number - b.number;
      return this.getCardName(a).localeCompare(this.getCardName(b));
    };

    // Convert to array honoring current sort mode
    return Object.keys(groups)
      .sort(groupComparator)
      .map(setKey => ({
        groupTitle: setKey,
        cards: groups[setKey].sort(cardComparator)
      }));
  }

  /**
   * Group cards by the selected category (rarity, pack, type)
   */
  getGroupedCardsByCategory(): { groupTitle: string; cards: Card[] }[] {
    const groups: { [key: string]: Card[] } = {};

    this.filteredCards.forEach(card => {
      let groupKey: string;

      switch (this.groupBy) {
        case 'rarity':
          const rarityCode = this.getCardRarityCode(card);
          const raritySymbol = rarityCode ? this.rarityService.getSymbol(rarityCode) : 'Unknown';
          const rarityDisplayName = rarityCode ? this.rarityService.getDisplayName(rarityCode) : 'Unknown';
          groupKey = `${raritySymbol} ${rarityDisplayName}`;
          break;

        case 'pack':
          groupKey = (card.packs && card.packs.length > 0) ? card.packs[0] : 'No Pack';
          break;

        case 'type':
          {
            const el = ((card as any).element as string | undefined)?.toLowerCase().trim();
            groupKey = el || 'No Type';
          }
          break;

        default:
          groupKey = 'All Cards';
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(card);
    });

    // Sort groups by logical order
    const sortedGroupKeys = Object.keys(groups).sort((a, b) => {
      if (this.groupBy === 'rarity') {
        // Sort by rarity order
        const getOrder = (key: string) => {
          const symbol = key.split(' ')[0];
          return this.rarityService.getRarityOrder(symbol) || 999;
        };
        return getOrder(a) - getOrder(b);
      } else {
        // Alphabetical for pack and type
        return a.localeCompare(b);
      }
    });

    // Sort cards within each group
    const cardComparator = (a: Card, b: Card) => {
      if (a.number !== b.number) return a.number - b.number;
      return this.getCardName(a).localeCompare(this.getCardName(b));
    };

    return sortedGroupKeys.map(groupKey => ({
      groupTitle: groupKey,
      cards: groups[groupKey].sort(cardComparator)
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
   * Get the collected/total count display for a group of cards
   */
  getGroupCollectedCount(cards: Card[]): string {
    const collectedCount = cards.filter(card => this.getOwnedCount(card) > 0).length;
    const totalCount = cards.length;
    return `${collectedCount}/${totalCount}`;
  }

  // Ownership segmented control
  setOwnership(val: 'all' | 'missing' | 'owned') {
    if (this.ownershipFilter !== val) {
      this.ownershipFilter = val;
      this.applyFilters();
      this.cdr.detectChanges();
    }
  }

  // Foil filter control
  setFoilFilter(val: 'all' | 'no-foil' | 'foil-only') {
    if (this.foilFilter !== val) {
      this.foilFilter = val;
      this.applyFilters();
      this.cdr.detectChanges();
    }
  }

  // Rarity chip helpers
  isRaritySelected(symbol: string): boolean {
    return this.selectedRarities.includes(symbol);
  }
  toggleRarity(symbol: string): void {
    const idx = this.selectedRarities.indexOf(symbol);
    if (idx >= 0) {
      this.selectedRarities.splice(idx, 1);
    } else {
      this.selectedRarities.push(symbol);
    }
    this.applyFilters();
    this.cdr.detectChanges();
  }
  clearRarity(): void {
    if (this.selectedRarities.length > 0) {
      this.selectedRarities = [];
      this.applyFilters();
      this.cdr.detectChanges();
    }
  }

  // Types chip helpers
  isTypeSelected(type: string): boolean {
    return this.selectedTypes.includes(type);
  }
  toggleType(type: string): void {
    const idx = this.selectedTypes.indexOf(type);
    if (idx >= 0) {
      this.selectedTypes.splice(idx, 1);
    } else {
      this.selectedTypes.push(type);
    }
    this.applyFilters();
    this.cdr.detectChanges();
  }
  clearTypes(): void {
    if (this.selectedTypes.length > 0) {
      this.selectedTypes = [];
      this.applyFilters();
      this.cdr.detectChanges();
    }
  }

  // Card modal methods


  private handleModalKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.selectedCardForModal) {
      this.closeCardModal();
    }
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

  // -------- Navigation: Top/Bottom and between Sets --------
  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  scrollToBottom(): void {
    const max = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    window.scrollTo({ top: max, behavior: 'smooth' });
  }

  private getSetElements(): HTMLElement[] {
    return Array.from(document.querySelectorAll('.cards-container .card-group')) as HTMLElement[];
  }

  private getCurrentSetIndex(offset: number = 80): number {
    const y = window.scrollY || window.pageYOffset || 0;
    const sections = this.getSetElements();
    let currentIdx = -1;
    for (let i = 0; i < sections.length; i++) {
      const top = sections[i].getBoundingClientRect().top + window.scrollY;
      if (top - offset <= y) {
        currentIdx = i;
      } else {
        break;
      }
    }
    return currentIdx;
  }

  scrollToNextSet(): void {
    const sections = this.getSetElements();
    if (sections.length === 0) return;
    const idx = this.getCurrentSetIndex();
    const nextIdx = Math.min(idx + 1, sections.length - 1);
    if (nextIdx >= 0) {
      const el = sections[nextIdx];
      const top = el.getBoundingClientRect().top + window.scrollY - 12; // small padding
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }

  scrollToPrevSet(): void {
    const sections = this.getSetElements();
    if (sections.length === 0) return;
    const idx = this.getCurrentSetIndex();
    const prevIdx = Math.max(idx - 1, 0);
    const el = sections[prevIdx];
    const top = el.getBoundingClientRect().top + window.scrollY - 12;
    window.scrollTo({ top, behavior: 'smooth' });
  }

  ngOnDestroy(): void {
    // Clean up modal event listener if component is destroyed while modal is open
    if (this.selectedCardForModal) {
      document.removeEventListener('keydown', this.handleModalKeydown);
      document.body.style.overflow = 'auto';
    }
  }
}