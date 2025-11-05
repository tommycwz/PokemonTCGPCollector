import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'Pokemon TCG Pocket Collector';
  private routerSub?: any;

  constructor(private router: Router) {}

  ngOnInit(): void {
    const applySigninClass = () => {
      const isSignin = this.router.url.startsWith('/signin');
      document.body.classList.toggle('signin-page', isSignin);
    };

    // Initial check
    applySigninClass();

    // Update on navigation
    this.routerSub = this.router.events.subscribe(evt => {
      if (evt instanceof NavigationEnd) {
        applySigninClass();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.routerSub) {
      this.routerSub.unsubscribe?.();
    }
    document.body.classList.remove('signin-page');
  }
}
