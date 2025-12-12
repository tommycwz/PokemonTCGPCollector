import { Component, OnInit } from '@angular/core';
import { SupabaseService, Profile } from '../services/supabase.service';
import { PokemonDataService, SetInfo } from '../../services/pokemon-data.service';
import { Card } from '../../services/card-data.service';
import { RarityService } from '../services/rarity.service';

@Component({
  selector: 'app-trade-gen',
  templateUrl: './trade-gen.component.html',
  styleUrls: ['./trade-gen.component.css']
})
export class TradeGenComponent implements OnInit {
  currentUser: Profile | null = null;
  cards: Card[] = [];
  sets: SetInfo[] = [];
  ownedCards: { [key: string]: number } = {};
  cardMinimumKeepCount: { [key: string]: number } = {};
  cardAllowTrade: { [key: string]: boolean } = {};

  // UI State
  selectedLFsets: string[] = [];
  selectedFTsets: string[] = [];
  availableTradeSets: string[] = [];
  selectedTradeRarities: string[] = [];
  outputFormat: 'foil-trade' | 'discord' | 'details' = 'details'; // Default to details
  tradeFriendCode = ''; // Will be loaded from user profile
  tradeTemplateText = 'Please ping me if there is any possible trades. \nENGLISH cards only please.';
  excludePromo = true; // Default true
  excludeDeluxe = true; // Default true
  overrideMinKeepEnabled = false; // Override minimum keep count
  overrideMinKeepValue = 3; // Override value
  lfSetDropdownOpen = false;
  ftSetDropdownOpen = false;
  generatedText = '';
  loading = true;

  constructor(
    private supabaseService: SupabaseService,
    private pokemonDataService: PokemonDataService,
    private rarityService: RarityService
  ) {}

  async ngOnInit() {
    await this.loadData();
  }

  private async loadData() {
    this.loading = true;

    try {
      // Load current user
      this.currentUser = await this.supabaseService.getCurrentUser();
      
      if (this.currentUser) {
        // Load friend code from user profile
        this.tradeFriendCode = this.currentUser.friend_code || '';
        
        // Load user's collection
        const { quantities, minimumKeepCounts, allowTrade } = await this.supabaseService.syncUserCollection(this.currentUser.id);
        this.ownedCards = quantities;
        this.cardMinimumKeepCount = minimumKeepCounts;
        this.cardAllowTrade = allowTrade;
      }

      // Load Pokemon data
      const data = await this.pokemonDataService.loadAllData().toPromise();
      if (data) {
        this.cards = data.cards;
        this.sets = data.sets;
      }

      // Build available trade sets
      this.updateAvailableTradeSets();

      // Select all sets by default
      this.selectedLFsets = [...this.availableTradeSets];
      this.selectedFTsets = [...this.availableTradeSets];
    } catch (error) {
      console.error('Error loading data:', error);
    }

    this.loading = false;
  }

  updateAvailableTradeSets() {
    let allSets = Array.from(
      new Set(this.cards.map(c => c.set))
    ).sort();

    // Filter based on checkbox settings
    if (this.excludePromo) {
      allSets = allSets.filter(s => !s.startsWith('P-'));
    }
    if (this.excludeDeluxe) {
      allSets = allSets.filter(s => s !== 'A4B');
    }

    this.availableTradeSets = allSets;

    // Update selected sets to only include available ones
    this.selectedLFsets = this.selectedLFsets.filter(s => this.availableTradeSets.includes(s));
    this.selectedFTsets = this.selectedFTsets.filter(s => this.availableTradeSets.includes(s));
  }

  isSpecialSet(setCode: string): boolean {
    return setCode === 'PROMO' || setCode.startsWith('A');
  }

  getSetName(setCode: string): string {
    const set = this.sets.find(s => s.code === setCode);
    return set ? set.name : setCode;
  }

  getSetShortName(setCode: string): string {
    const set = this.sets.find(s => s.code === setCode);
    return set ? set.shortName : setCode;
  }

  getAvailableTradeRaritySymbols() {
    return this.rarityService.getUnifiedRarities();
  }

  isTradeRaritySelected(symbol: string): boolean {
    return this.selectedTradeRarities.includes(symbol);
  }

  toggleTradeRarity(symbol: string) {
    const index = this.selectedTradeRarities.indexOf(symbol);
    if (index > -1) {
      this.selectedTradeRarities.splice(index, 1);
    } else {
      this.selectedTradeRarities.push(symbol);
    }
  }

  clearTradeRarities() {
    this.selectedTradeRarities = [];
  }

  isLFSetSelected(setCode: string): boolean {
    return this.selectedLFsets.includes(setCode);
  }

  toggleLFSet(setCode: string) {
    const index = this.selectedLFsets.indexOf(setCode);
    if (index > -1) {
      this.selectedLFsets.splice(index, 1);
    } else {
      this.selectedLFsets.push(setCode);
    }
  }

  selectAllLFsets() {
    this.selectedLFsets = [...this.availableTradeSets];
  }

  clearLFsets() {
    this.selectedLFsets = [];
  }

  isFTSetSelected(setCode: string): boolean {
    return this.selectedFTsets.includes(setCode);
  }

  toggleFTSet(setCode: string) {
    const index = this.selectedFTsets.indexOf(setCode);
    if (index > -1) {
      this.selectedFTsets.splice(index, 1);
    } else {
      this.selectedFTsets.push(setCode);
    }
  }

  selectAllFTsets() {
    this.selectedFTsets = [...this.availableTradeSets];
  }

  clearFTsets() {
    this.selectedFTsets = [];
  }

  private getCardId(card: Card): string {
    return `${card.set}-${card.number}`;
  }

  private getOwnedCount(card: Card): number {
    return this.ownedCards[this.getCardId(card)] || 0;
  }

  private getCardMinimumKeepCount(card: Card): number {
    return this.cardMinimumKeepCount[this.getCardId(card)] || 0;
  }

  private isCardAllowTrade(card: Card): boolean {
    const cardId = this.getCardId(card);
    return this.cardAllowTrade[cardId] !== false; // Default to true if not set
  }

  generateTradeText() {
    const activeRarities = this.selectedTradeRarities.length > 0 ? this.selectedTradeRarities : [];
    const isFoilTradeMode = this.outputFormat === 'foil-trade';

    // Filter cards for Looking For (LF)
    const lookingForCards = this.cards.filter(card => {
      // For foil trade mode, ignore set filters and only show foil cards
      if (isFoilTradeMode) {
        if (!card['isFoil']) return false;
      } else {
        if (this.selectedLFsets.length > 0 && !this.selectedLFsets.includes(card.set)) return false;
      }
      
      const rarityCode = card.rarity;
      const sym = rarityCode ? this.rarityService.getSymbol(rarityCode) : '';
      if (activeRarities.length > 0 && (!sym || !activeRarities.includes(sym))) return false;
      
      const ownedCount = this.getOwnedCount(card);
      
      // Only include if owned = 0
      return ownedCount === 0;
    });

    // Filter cards for For Trade (FT)
    const forTradeCards = this.cards.filter(card => {
      // For foil trade mode, ignore set filters but include both foil and non-foil
      if (!isFoilTradeMode) {
        if (this.selectedFTsets.length > 0 && !this.selectedFTsets.includes(card.set)) return false;
      }
      
      const rarityCode = card.rarity;
      const sym = rarityCode ? this.rarityService.getSymbol(rarityCode) : '';
      if (activeRarities.length > 0 && (!sym || !activeRarities.includes(sym))) return false;

      const ownedCount = this.getOwnedCount(card);
      const minKeep = this.overrideMinKeepEnabled ? this.overrideMinKeepValue : this.getCardMinimumKeepCount(card);

      return ownedCount > minKeep;
    });

    this.generatedText = this.formatTradeText(lookingForCards, forTradeCards);
  }

  private formatTradeText(lfCards: Card[], ftCards: Card[]): string {
    let text = '';

    if (this.outputFormat === 'foil-trade') {
      text += this.formatFoilTrade(lfCards, ftCards);
    } else if (this.outputFormat === 'discord') {
      text += this.formatDiscord(lfCards, ftCards);
    } else {
      text += this.formatDetails(lfCards, ftCards);
    }

    // Add footer section
    text += '\n';
    
    // Add template text if provided
    if (this.tradeTemplateText) {
      text += this.tradeTemplateText + '\n\n';
    }

    // Add user info
    if (this.currentUser?.username) {
      text += `IGN: ${this.currentUser.username}\n`;
    }
    
    if (this.tradeFriendCode) {
      text += `Friend code: ${this.tradeFriendCode}`;
    }

    return text;
  }

  private formatFoilTrade(lfCards: Card[], ftCards: Card[]): string {
    let text = '**Looking For (Foil Only)**\n';
    // lfCards already filtered for foil in generateTradeText
    if (lfCards.length > 0) {
      const grouped = this.groupBySet(lfCards);
      for (const [setCode, cards] of Object.entries(grouped)) {
        const shortName = this.getSetShortName(setCode);
        const cardNames = cards.map(c => `${c.label.eng} (foil)`);
        text += `[${shortName}] ${cardNames.join(', ')}\n`;
      }
    } else {
      text += 'None\n';
    }

    text += '\n**For Trade**\n';
    // ftCards includes both foil and non-foil
    if (ftCards.length > 0) {
      const grouped = this.groupBySet(ftCards);
      for (const [setCode, cards] of Object.entries(grouped)) {
        const shortName = this.getSetShortName(setCode);
        const cardNames = cards.map(c => {
          const name = c.label.eng;
          return c['isFoil'] ? `${name} (foil)` : name;
        });
        text += `[${shortName}] ${cardNames.join(', ')}\n`;
      }
    } else {
      text += 'None\n';
    }

    return text;
  }

  private formatDiscord(lfCards: Card[], ftCards: Card[]): string {
    let text = '**Looking For**\n';
    if (lfCards.length > 0) {
      const grouped = this.groupBySet(lfCards);
      for (const [setCode, cards] of Object.entries(grouped)) {
        const shortName = this.getSetShortName(setCode);
        text += `[${shortName}] ${cards.map(c => c.label.eng).join(', ')}\n`;
      }
    } else {
      text += 'None\n';
    }

    text += '\n**For Trade**\n';
    if (ftCards.length > 0) {
      const grouped = this.groupBySet(ftCards);
      for (const [setCode, cards] of Object.entries(grouped)) {
        const shortName = this.getSetShortName(setCode);
        text += `[${shortName}] ${cards.map(c => c.label.eng).join(', ')}\n`;
      }
    } else {
      text += 'None\n';
    }

    return text;
  }

  private formatDetails(lfCards: Card[], ftCards: Card[]): string {
    let text = '**Looking For**\n';
    if (lfCards.length > 0) {
      const grouped = this.groupBySet(lfCards);
      for (const [setCode, cards] of Object.entries(grouped)) {
        const shortName = this.getSetShortName(setCode);
        text += `\n[${shortName}]\n`;
        cards.forEach(c => {
          const raritySymbol = this.rarityService.getSymbol(c.rarity);
          text += `${raritySymbol} ${setCode}-${c.number} - ${c.label.eng}\n`;
        });
      }
    } else {
      text += 'None\n';
    }

    text += '\n**For Trade**\n';
    if (ftCards.length > 0) {
      const grouped = this.groupBySet(ftCards);
      for (const [setCode, cards] of Object.entries(grouped)) {
        const shortName = this.getSetShortName(setCode);
        text += `\n[${shortName}]\n`;
        cards.forEach(c => {
          const raritySymbol = this.rarityService.getSymbol(c.rarity);
          text += `${raritySymbol} ${setCode}-${c.number} - ${c.label.eng}\n`;
        });
      }
    } else {
      text += 'None\n';
    }

    return text;
  }

  private groupBySet(cards: Card[]): { [key: string]: Card[] } {
    return cards.reduce((acc, card) => {
      if (!acc[card.set]) {
        acc[card.set] = [];
      }
      acc[card.set].push(card);
      return acc;
    }, {} as { [key: string]: Card[] });
  }

  copyToClipboard() {
    navigator.clipboard.writeText(this.generatedText).then(() => {
    }).catch(err => {
      console.error('Failed to copy:', err);
      alert('Failed to copy to clipboard');
    });
  }
}
