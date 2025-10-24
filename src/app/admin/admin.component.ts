import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { SupabaseService, Profile } from '../services/supabase.service';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminComponent implements OnInit {
  currentUser: Profile | null = null;
  
  // JSON file contents
  cardsJson: string = '';
  rarityJson: string = '';
  setsJson: string = '';
  
  // Loading states
  loadingCards = false;
  loadingRarity = false;
  loadingSets = false;
  
  // Messages
  message: string = '';
  messageType: 'success' | 'error' | '' = '';

  constructor(
    private supabaseService: SupabaseService,
    private router: Router,
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Check if user is signed in and is admin
    this.currentUser = this.supabaseService.getCurrentUser();
    if (!this.currentUser) {
      this.router.navigate(['/signin']);
      return;
    }

    if (this.currentUser.role !== 'admin') {
      this.router.navigate(['/collection']);
      return;
    }

    // Load current JSON files
    this.loadAllJsonFiles();
  }

  /**
   * Load all JSON files from assets
   */
  async loadAllJsonFiles(): Promise<void> {
    await Promise.all([
      this.loadCardsJson(),
      this.loadRarityJson(),
      this.loadSetsJson()
    ]);
  }

  /**
   * Load cards.json
   */
  async loadCardsJson(): Promise<void> {
    this.loadingCards = true;
    this.cdr.detectChanges();
    
    try {
      const response = await this.http.get('/assets/cards/cards.json', { responseType: 'text' }).toPromise();
      this.cardsJson = response || '';
      this.showMessage('Cards JSON loaded successfully', 'success');
    } catch (error) {
      console.error('Error loading cards.json:', error);
      this.showMessage('Error loading cards.json', 'error');
      this.cardsJson = '[]';
    } finally {
      this.loadingCards = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Load rarity.json
   */
  async loadRarityJson(): Promise<void> {
    this.loadingRarity = true;
    this.cdr.detectChanges();
    
    try {
      const response = await this.http.get('/assets/cards/rarity.json', { responseType: 'text' }).toPromise();
      this.rarityJson = response || '';
      this.showMessage('Rarity JSON loaded successfully', 'success');
    } catch (error) {
      console.error('Error loading rarity.json:', error);
      this.showMessage('Error loading rarity.json', 'error');
      this.rarityJson = '{}';
    } finally {
      this.loadingRarity = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Load sets.json
   */
  async loadSetsJson(): Promise<void> {
    this.loadingSets = true;
    this.cdr.detectChanges();
    
    try {
      const response = await this.http.get('/assets/cards/sets.json', { responseType: 'text' }).toPromise();
      this.setsJson = response || '';
      this.showMessage('Sets JSON loaded successfully', 'success');
    } catch (error) {
      console.error('Error loading sets.json:', error);
      this.showMessage('Error loading sets.json', 'error');
      this.setsJson = '[]';
    } finally {
      this.loadingSets = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Download cards.json
   */
  downloadCardsJson(): void {
    this.downloadFile(this.cardsJson, 'cards.json', 'application/json');
  }

  /**
   * Download rarity.json
   */
  downloadRarityJson(): void {
    this.downloadFile(this.rarityJson, 'rarity.json', 'application/json');
  }

  /**
   * Download sets.json
   */
  downloadSetsJson(): void {
    this.downloadFile(this.setsJson, 'sets.json', 'application/json');
  }

  /**
   * Copy cards.json to clipboard
   */
  copyCardsToClipboard(): void {
    if (!this.validateJson(this.cardsJson)) {
      this.showMessage('Invalid JSON format for cards', 'error');
      return;
    }

    this.copyToClipboard(this.cardsJson, 'Cards JSON copied to clipboard');
  }

  /**
   * Copy rarity.json to clipboard
   */
  copyRarityToClipboard(): void {
    if (!this.validateJson(this.rarityJson)) {
      this.showMessage('Invalid JSON format for rarity', 'error');
      return;
    }

    this.copyToClipboard(this.rarityJson, 'Rarity JSON copied to clipboard');
  }

  /**
   * Copy sets.json to clipboard
   */
  copySetsToClipboard(): void {
    if (!this.validateJson(this.setsJson)) {
      this.showMessage('Invalid JSON format for sets', 'error');
      return;
    }

    this.copyToClipboard(this.setsJson, 'Sets JSON copied to clipboard');
  }

  /**
   * Validate JSON format
   */
  private validateJson(jsonString: string): boolean {
    try {
      JSON.parse(jsonString);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Copy to clipboard helper
   */
  private copyToClipboard(content: string, successMessage: string): void {
    if (navigator.clipboard && window.isSecureContext) {
      // Use modern clipboard API
      navigator.clipboard.writeText(content).then(() => {
        this.showMessage(successMessage, 'success');
      }).catch(() => {
        this.fallbackCopyToClipboard(content, successMessage);
      });
    } else {
      // Fallback for older browsers or non-secure contexts
      this.fallbackCopyToClipboard(content, successMessage);
    }
  }

  /**
   * Fallback copy to clipboard method
   */
  private fallbackCopyToClipboard(content: string, successMessage: string): void {
    const textArea = document.createElement('textarea');
    textArea.value = content;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      document.execCommand('copy');
      this.showMessage(successMessage, 'success');
    } catch (err) {
      this.showMessage('Failed to copy to clipboard', 'error');
    } finally {
      document.body.removeChild(textArea);
    }
  }
  private downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
    
    this.showMessage(`${filename} downloaded successfully`, 'success');
  }

  /**
   * Show message to user
   */
  private showMessage(message: string, type: 'success' | 'error'): void {
    this.message = message;
    this.messageType = type;
    this.cdr.detectChanges();
    
    // Clear message after 3 seconds
    setTimeout(() => {
      this.message = '';
      this.messageType = '';
      this.cdr.detectChanges();
    }, 3000);
  }

  /**
   * Format JSON with proper indentation
   */
  formatJson(jsonString: string): void {
    try {
      const parsed = JSON.parse(jsonString);
      const formatted = JSON.stringify(parsed, null, 2);
      
      // Update the appropriate field
      if (jsonString === this.cardsJson) {
        this.cardsJson = formatted;
      } else if (jsonString === this.rarityJson) {
        this.rarityJson = formatted;
      } else if (jsonString === this.setsJson) {
        this.setsJson = formatted;
      }
      
      this.cdr.detectChanges();
      this.showMessage('JSON formatted successfully', 'success');
    } catch (error) {
      this.showMessage('Invalid JSON format', 'error');
    }
  }
}