import { Directive, ElementRef, Input, OnInit, OnDestroy, Renderer2 } from '@angular/core';
import { ImageService } from '../services/image.service';

@Directive({
  selector: '[appLazyImage]'
})
export class LazyImageDirective implements OnInit, OnDestroy {
  @Input() appLazyImage!: string; // The image name from cards.json
  @Input() alt: string = 'Pokemon Card';
  
  private observer?: IntersectionObserver;
  private isLoaded = false;

  constructor(
    private el: ElementRef<HTMLImageElement>,
    private imageService: ImageService,
    private renderer: Renderer2
  ) {}

  ngOnInit(): void {
    this.setupLazyLoading();
  }

  ngOnDestroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = undefined;
    }
  }

  private setupLazyLoading(): void {

    
    // Set placeholder initially
    const placeholderUrl = this.imageService.getPlaceholderImageUrl();
    
    this.renderer.setAttribute(this.el.nativeElement, 'src', placeholderUrl);
    this.renderer.setAttribute(this.el.nativeElement, 'alt', this.alt);
    this.renderer.addClass(this.el.nativeElement, 'lazy-loading');

    if (!this.appLazyImage) {
      console.warn('⚠️ No image name provided to lazy loading directive');
      return;
    }

    // TEMPORARY: Load immediately to test if directive works
    this.loadImage();
    return;

    /*
    // Create intersection observer for true lazy loading
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !this.isLoaded) {
            this.loadImage();
          }
        });
      },
      {
        root: null,
        rootMargin: '100px', // Start loading 100px before entering viewport
        threshold: 0.1
      }
    );

    this.observer.observe(this.el.nativeElement);
    */
  }

  private loadImage(): void {
    if (!this.appLazyImage || this.isLoaded) {
      return;
    }

    const imageUrl = this.imageService.getCardImageUrl(this.appLazyImage);
    
    // Create new image to preload
    const img = new Image();

    img.onload = () => {
      // Image loaded successfully, update the actual element
      this.renderer.setAttribute(this.el.nativeElement, 'src', imageUrl);
      this.renderer.removeClass(this.el.nativeElement, 'lazy-loading');
      this.renderer.addClass(this.el.nativeElement, 'lazy-loaded');
      this.isLoaded = true;
      
      // Stop observing once loaded
      if (this.observer) {
        this.observer.unobserve(this.el.nativeElement);
      }
    };

    img.onerror = () => {
      console.error('❌ Image failed to load:', this.appLazyImage, imageUrl);
      // Image failed to load, keep placeholder
      this.renderer.removeClass(this.el.nativeElement, 'lazy-loading');
      this.renderer.addClass(this.el.nativeElement, 'lazy-error');
      this.isLoaded = true;
      
      // Stop observing
      if (this.observer) {
        this.observer.unobserve(this.el.nativeElement);
      }
    };

    // Start loading
    img.src = imageUrl;
  }
}