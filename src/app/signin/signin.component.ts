import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

@Component({
  selector: 'app-signin',
  templateUrl: './signin.component.html',
  styleUrls: ['./signin.component.css']
})
export class SigninComponent implements OnInit {
  username = '';
  password = '';
  loading = false;
  error = '';
  returnUrl = '/collection';

  constructor(
    private supabaseService: SupabaseService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    // Check if user is already signed in
    if (this.supabaseService.isSignedIn()) {
      this.router.navigate([this.returnUrl]);
      return;
    }

    // Get return URL from route parameters or default to collection
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/collection';
  }

  get isFormValid(): boolean {
    return this.username.trim().length > 0 && this.password.trim().length > 0;
  }

  async onSubmit() {
    if (!this.isFormValid) {
      this.error = 'Please enter both username and password';
      return;
    }

    this.loading = true;
    this.error = '';

    try {
      const { user, error } = await this.supabaseService.signIn(this.username.trim(), this.password.trim());
      
      if (error) {
        this.error = error;
        // If it's a lock error, suggest retry
        if (error.includes('Please wait a moment')) {
          this.error += ' This usually resolves itself quickly.';
        }
      } else if (user) {
        this.router.navigate([this.returnUrl]);
      }
    } catch (error) {
      console.error('Sign in error:', error);
      
      // Handle NavigatorLockAcquireTimeoutError specifically
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMessage = (error as any).message;
        if (errorMessage.includes('NavigatorLockAcquireTimeoutError') || errorMessage.includes('lock')) {
          this.error = 'Please wait a moment and try signing in again.';
        } else {
          this.error = 'An unexpected error occurred';
        }
      } else {
        this.error = 'An unexpected error occurred';
      }
    } finally {
      this.loading = false;
    }
  }

  onUsernameChange() {
    this.error = '';
  }

  onPasswordChange() {
    this.error = '';
  }
}