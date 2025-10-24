import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  constructor(
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    const isSignedIn = this.supabaseService.isSignedIn();
    const currentUser = this.supabaseService.getCurrentUser();

    if (isSignedIn && currentUser) {
      return true;
    } else {
      this.router.navigate(['/signin'], { 
        queryParams: { returnUrl: state.url }
      });
      return false;
    }
  }
}