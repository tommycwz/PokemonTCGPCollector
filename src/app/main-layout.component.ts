import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService, Profile } from './services/supabase.service';
import { APP_VERSION } from './version';

@Component({
  selector: 'app-main-layout',
  template: `
    <div class="app-layout">
      <nav class="navbar">
        <div class="nav-container">
          <div class="nav-brand">
            <h2>Pokemon TCGP Collector</h2><p>v{{ appVersion }}</p>
          </div>

          <!-- Desktop nav -->
          <div class="nav-center desktop-only">
            <div class="nav-links">              
              <a routerLink="/suggestion" routerLinkActive="active" class="nav-link">
                📊 Suggestion
              </a>

              <a routerLink="/collection" routerLinkActive="active" class="nav-link">
                🗂️ Collection
              </a>

              <a routerLink="/trade" routerLinkActive="active" class="nav-link">
                🔄 Trade (Beta)
              </a>
              
            </div>
          </div>

          <div class="nav-user desktop-only" *ngIf="currentUser">
            <span class="username">👤 {{ currentUser.username }}</span>
            <button (click)="signOut()" class="btn-signout">Sign Out</button>
          </div>

          <!-- Mobile hamburger -->
          <button class="hamburger mobile-only" type="button" (click)="toggleMobileMenu()"
                  [attr.aria-expanded]="isMobileMenuOpen" aria-controls="mobileMenu" aria-label="Menu">
            ☰
          </button>
        </div>

        <!-- Mobile menu panel -->
        <div id="mobileMenu" class="mobile-menu mobile-only" [class.open]="isMobileMenuOpen">
          <div class="mobile-menu-header" *ngIf="currentUser">
            <span class="username">👤 {{ currentUser.username }}</span>
          </div>
          <a routerLink="/collection" routerLinkActive="active" class="mobile-link" (click)="closeMobileMenu()">
            🗂️ Collection
          </a>
          <a routerLink="/suggestion" routerLinkActive="active" class="mobile-link" (click)="closeMobileMenu()">
            📦 Suggestion
          </a>
          <a routerLink="/trade" routerLinkActive="active" class="mobile-link" (click)="closeMobileMenu()">
            📊 Trade (Beta)
          </a>
          
          <button *ngIf="currentUser" (click)="signOut(); closeMobileMenu()" class="mobile-link signout">
            🚪 Sign Out
          </button>
        </div>
      </nav>
      
      <main class="main-content">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styles: [`
    .app-layout {
      min-height: 100vh;
      background-color: #1d1b1bff;
    }

    .navbar {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 0 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      position: relative; /* anchor mobile dropdown */
    }

    .nav-container {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 5px 0;
    }

    .nav-brand h2 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: bold;
      color: white;
    }

    .nav-brand {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }

    .nav-brand p {
      margin: 0;
      color: #f0f0f0;
      opacity: 0.9;
      font-size: 0.95rem;
    }

    .nav-center {
      flex: 1;
      display: flex;
      justify-content: center;
    }

    .nav-links {
      display: flex;
      gap: 30px;
    }

    .nav-link {
      color: white;
      text-decoration: none;
      padding: 10px 20px;
      border-radius: 5px;
      transition: all 0.3s ease;
      font-weight: 500;
    }

    .nav-link:hover {
      background-color: rgba(255,255,255,0.1);
      transform: translateY(-2px);
    }

    .nav-link.active {
      background-color: rgba(255,255,255,0.2);
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    }

    .nav-user {
      display: flex;
      align-items: center;
      gap: 15px;
    }

    .username {
      color: #f0f0f0;
      font-size: 14px;
      font-weight: 500;
    }

    .btn-signout {
      padding: 6px 12px;
      border: 1px solid rgba(255,255,255,0.3);
      border-radius: 4px;
      background-color: transparent;
      color: white;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s ease;
    }

    .btn-signout:hover {
      background-color: #dc3545;
      border-color: #dc3545;
      transform: translateY(-1px);
    }

    .main-content {
      min-height: calc(100vh - 80px);
      background-color: #1d1b1bff;
    }

    /* Responsive helpers */
    .desktop-only { display: flex; }
    .mobile-only { display: none; }

    /* Mobile menu */
    .hamburger {
      background: transparent;
      border: 1px solid rgba(255,255,255,0.35);
      color: #fff;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 18px;
      cursor: pointer;
    }

    .mobile-menu {
      display: none !important;
      position: absolute;
      right: 12px;
      top: 100%;
      margin-top: 8px;
      width: 220px;
      z-index: 100;
      flex-direction: column;
      gap: 8px;
      padding: 10px 12px 12px;
      border: 1px solid rgba(255,255,255,0.16);
      border-radius: 10px;
      background: #1b1f2a;
      box-shadow: 0 10px 28px rgba(0,0,0,0.35);
    }

    .mobile-menu.open { display: flex !important; }

  .mobile-menu .username { margin-bottom: 4px; display: inline-block; opacity: 0.9; }

    .mobile-link {
      text-align: left;
      color: #fff;
      text-decoration: none;
      padding: 10px 12px;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px;
      background: rgba(255,255,255,0.05);
      font-size: 14px;
    }

    .mobile-link.signout { border-color: #dc3545; background: rgba(220,53,69,0.15); }

    @media (max-width: 768px) {
      .desktop-only { display: none !important; }
      .mobile-only { display: inline-flex; }
      .nav-container { padding: 8px 0; }
      
      .nav-brand h2 {
        font-size: 1.1rem;
      }
      
      .nav-brand p {
        font-size: 0.85rem;
      }
    }
  `]
})
export class MainLayoutComponent implements OnInit {
  currentUser: Profile | null = null;
  appVersion: string = APP_VERSION;
  isMobileMenuOpen = false;

  constructor(
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  ngOnInit() {
    // Subscribe to user changes
    this.supabaseService.currentUser$.subscribe(user => {
      this.currentUser = user;
    });
    // Close mobile menu on route change
    this.router.events.subscribe(() => {
      this.isMobileMenuOpen = false;
    });
  }

  signOut(): void {
    this.supabaseService.signOut();
    this.router.navigate(['/signin']);
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen = false;
  }
}