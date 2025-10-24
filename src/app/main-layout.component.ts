import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService, Profile } from './services/supabase.service';

@Component({
  selector: 'app-main-layout',
  template: `
    <div class="app-layout">
      <nav class="navbar">
        <div class="nav-container">
          <div class="nav-brand">
            <h2>Pokemon TCG Pocket Collector</h2>
          </div>
          <div class="nav-center">
            <div class="nav-links">
              <a routerLink="/dashboard" routerLinkActive="active" class="nav-link">
                📊 Dashboard
              </a>
              <a routerLink="/collection" routerLinkActive="active" class="nav-link">
                🗂️ Collection
              </a>
              <a *ngIf="currentUser?.role === 'admin'" routerLink="/admin" routerLinkActive="active" class="nav-link admin-link">
                🔧 Admin
              </a>
            </div>
          </div>
          <div class="nav-user" *ngIf="currentUser">
            <span class="username">👤 {{ currentUser.username }}</span>
            <button (click)="signOut()" class="btn-signout">Sign Out</button>
          </div>
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
      background-color: #000000;
    }

    .navbar {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 0 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }

    .nav-container {
      max-width: 1400px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 0;
    }

    .nav-brand h2 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: bold;
      color: white;
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
      background-color: #000000;
    }

    @media (max-width: 768px) {
      .nav-container {
        flex-direction: column;
        gap: 15px;
      }
      
      .nav-center {
        order: 3;
      }
      
      .nav-user {
        order: 2;
      }
      
      .nav-links {
        gap: 15px;
      }
      
      .nav-link {
        padding: 8px 15px;
        font-size: 14px;
      }
    }
  `]
})
export class MainLayoutComponent implements OnInit {
  currentUser: Profile | null = null;

  constructor(
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  ngOnInit() {
    // Subscribe to user changes
    this.supabaseService.currentUser$.subscribe(user => {
      this.currentUser = user;
    });
  }

  signOut(): void {
    this.supabaseService.signOut();
    this.router.navigate(['/signin']);
  }
}