import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { CardCollectionComponent } from './card-collection/card-collection.component';
import { SigninComponent } from './signin/signin.component';
import { MainLayoutComponent } from './main-layout.component';
import { AdminComponent } from './admin/admin.component';
import { AuthGuard } from './guards/auth.guard';

const routes: Routes = [
  { path: '', redirectTo: '/signin', pathMatch: 'full' },
  { path: 'signin', component: SigninComponent },
  { 
    path: '', 
    component: MainLayoutComponent,
    canActivate: [AuthGuard],
    children: [
      { path: 'dashboard', component: DashboardComponent },
      { path: 'collection', component: CardCollectionComponent },
      { path: 'admin', component: AdminComponent }
    ]
  },
  { path: '**', redirectTo: '/signin' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }