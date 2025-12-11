import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CardCollectionComponent } from './card-collection/card-collection.component';
import { SuggestionComponent } from './suggestion/suggestion.component';
import { TradeGenComponent } from './trade-gen/trade-gen.component';
import { SigninComponent } from './signin/signin.component';
import { MainLayoutComponent } from './main-layout.component';
import { AuthGuard } from './guards/auth.guard';

const routes: Routes = [
  { path: '', redirectTo: '/signin', pathMatch: 'full' },
  { path: 'signin', component: SigninComponent },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [AuthGuard],
    children: [
      { path: 'collection', component: CardCollectionComponent },
      { path: 'suggestion', component: SuggestionComponent },
      { path: 'trade', component: TradeGenComponent }
    ]
  },
  { path: '**', redirectTo: '/signin' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }