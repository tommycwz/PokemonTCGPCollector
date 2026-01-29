import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

import { AppComponent } from './app.component';
import { CardCollectionComponent } from './card-collection/card-collection.component';
import { SuggestionComponent } from './suggestion/suggestion.component';
import { MainLayoutComponent } from './main-layout.component';
import { SigninComponent } from './signin/signin.component';
import { AppRoutingModule } from './app-routing.module';
import { LazyImageDirective } from './directives/lazy-image.directive';
import { TradeGenComponent } from './trade-gen/trade-gen.component';
import { SyncComponent } from './sync/sync.component';

@NgModule({
  declarations: [
    AppComponent,
    CardCollectionComponent,
    SuggestionComponent,
    MainLayoutComponent,
    SigninComponent,
    LazyImageDirective,
    TradeGenComponent,
    SyncComponent
  ],
  imports: [
    BrowserModule,
    CommonModule,
    HttpClientModule,
    FormsModule,
    AppRoutingModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
