import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Card } from './card-data.service';

@Injectable({
  providedIn: 'root'
})
export class FileStorageService {
  private readonly CARDS_API_URL = 'https://raw.githubusercontent.com/flibustier/pokemon-tcg-pocket-database/main/dist/cards.json';

  constructor(private http: HttpClient) { }

  /**
   * Downloads the cards.json file and returns the data
   * This method can be used to get the latest data for manual saving
   */
  downloadCardsData(): Observable<Card[]> {
    return this.http.get<Card[]>(this.CARDS_API_URL).pipe(
      catchError(error => {
        console.error('Error downloading cards data:', error);
        return throwError(() => new Error('Failed to download cards data'));
      })
    );
  }

  /**
   * Downloads and formats the data as a JSON blob for saving
   */
  downloadCardsAsBlob(): Observable<Blob> {
    return this.downloadCardsData().pipe(
      map(cards => {
        const jsonString = JSON.stringify(cards, null, 2);
        return new Blob([jsonString], { type: 'application/json' });
      })
    );
  }

  /**
   * Triggers a download of the cards.json file to the user's download folder
   */
  triggerDownload(): void {
    this.downloadCardsAsBlob().subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'cards.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      },
      error: (error) => {
        console.error('Failed to download cards data:', error);
      }
    });
  }

  /**
   * Returns instructions for manually saving the data
   */
  getStorageInstructions(): string {
    return `
To store the cards data locally:

1. Create a 'cards' folder in src/assets/
2. Use the downloadCardsAsBlob() method to get the data
3. Save the file as 'cards.json' in src/assets/cards/

Alternative: Use triggerDownload() to download the file and manually move it to the assets folder.

Note: In a production environment, you would typically have a backend service 
to handle file storage and serving.
    `;
  }
}