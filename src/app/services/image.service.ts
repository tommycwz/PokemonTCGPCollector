import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class ImageService {
  private readonly BASE_IMAGE_URL = 'https://raw.githubusercontent.com/flibustier/pokemon-tcg-exchange/main/public/images/cards';
  private imageCache = new Map<string, boolean>();

  constructor(private http: HttpClient) {}

  /**
   * Get the full URL for a card image
   */
  getCardImageUrl(imageName: string): string {
    return `${this.BASE_IMAGE_URL}/${imageName}`;
  }

  /**
   * Check if an image exists and cache the result
   */
  checkImageExists(imageName: string): Observable<boolean> {
    if (this.imageCache.has(imageName)) {
      return of(this.imageCache.get(imageName)!);
    }

    const imageUrl = this.getCardImageUrl(imageName);
    
    return this.http.head(imageUrl, { observe: 'response' }).pipe(
      map(response => {
        const exists = response.status === 200;
        this.imageCache.set(imageName, exists);
        return exists;
      }),
      catchError(() => {
        this.imageCache.set(imageName, false);
        return of(false);
      })
    );
  }

  /**
   * Preload critical images for better UX
   */
  preloadImage(imageName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.imageCache.set(imageName, true);
        resolve(true);
      };
      img.onerror = () => {
        this.imageCache.set(imageName, false);
        resolve(false);
      };
      img.src = this.getCardImageUrl(imageName);
    });
  }

  /**
   * Get placeholder image URL for fallback
   */
  getPlaceholderImageUrl(): string {
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjI4MCIgdmlld0JveD0iMCAwIDIwMCAyODAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjgwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xMDAgMTQwQzExNi41NjkgMTQwIDEzMCAxMjYuNTY5IDEzMCAxMTBDMTMwIDkzLjQzMTUgMTE2LjU2OSA4MCAxMDAgODBDODMuNDMxNSA4MCA3MCA5My40MzE1IDcwIDExMEM3MCAxMjYuNTY5IDgzLjQzMTUgMTQwIDEwMCAxNDBaIiBmaWxsPSIjOUI5QkE4Ii8+CjxwYXRoIGQ9Ik0xMDAgMTAwQzEwNS41MjMgMTAwIDExMCAxMDQuNDc3IDExMCAxMTBDMTEwIDExNS41MjMgMTA1LjUyMyAxMjAgMTAwIDEyMEM5NC40NzcgMTIwIDkwIDExNS41MjMgOTAgMTEwQzkwIDEwNC40NzcgOTQuNDc3IDEwMCAxMDAgMTAwWiIgZmlsbD0iI0Y5RkFGQiIvPgo8L3N2Zz4K';
  }
}