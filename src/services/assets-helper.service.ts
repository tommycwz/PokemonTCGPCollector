import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Card } from './card-data.service';

@Injectable({
  providedIn: 'root'
})
export class AssetsHelperService {
  private readonly CARDS_API_URL = 'https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/cards.json';

  constructor(private http: HttpClient) { }

  /**
   * Fetches the cards data and saves it as a downloadable JSON file
   * This is a browser-only solution to help users download the data
   */
  downloadCardsJson(): void {
    this.http.get<Card[]>(this.CARDS_API_URL).subscribe({
      next: (cards) => {
        const jsonContent = JSON.stringify(cards, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = 'cards.json';
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
        
        alert(`Downloaded ${cards.length} cards to cards.json\n\nPlease move the file to: src/assets/cards/cards.json`);
      },
      error: (error) => {
        console.error('Failed to download cards data:', error);
        alert('Failed to download cards data. Please check your internet connection.');
      }
    });
  }

  /**
   * Instructions for manual setup
   */
  showSetupInstructions(): string {
    return `
=== Pokemon TCG Pocket Collector Setup Instructions ===

1. AUTOMATIC DOWNLOAD (Recommended):
   - Click "Download cards.json" button
   - Move the downloaded file to: src/assets/cards/cards.json
   - Restart the development server

2. MANUAL DOWNLOAD:
   - Go to: ${this.CARDS_API_URL}
   - Right-click and "Save As" to src/assets/cards/cards.json
   - Restart the development server

3. VERIFY SETUP:
   - Click "Load Cards Data" to test the service
   - Check browser console for detailed information
   - Data will be cached in localStorage for offline use

=== Service Features ===
- ✅ Fetch cards from Pokemon TCG Pocket database
- ✅ Store data locally for offline access
- ✅ Filter by set, type, rarity
- ✅ Search cards by name
- ✅ Get unique values for filters
- ✅ Automatic fallback to localStorage

For more information, check the browser console when using the services.
    `;
  }
}