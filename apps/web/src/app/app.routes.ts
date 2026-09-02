import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'networks' },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login-page.component').then((m) => m.LoginPageComponent)
  },
  {
    path: 'networks',
    canActivate: [authGuard],
    loadComponent: () => import('./features/networks/networks-page.component').then((m) => m.NetworksPageComponent)
  },
  {
    path: 'networks/:networkId/products',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/inventory/product-list-page.component').then((m) => m.ProductListPageComponent)
  },
  {
    path: 'networks/:networkId/members',
    canActivate: [authGuard],
    loadComponent: () => import('./features/networks/members-page.component').then((m) => m.MembersPageComponent)
  },
  {
    path: 'networks/:networkId/reservations/mine',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/inventory/my-reservations-page.component').then((m) => m.MyReservationsPageComponent)
  },
  {
    path: 'networks/:networkId/products/new',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/inventory/product-form-page.component').then((m) => m.ProductFormPageComponent)
  },
  {
    path: 'networks/:networkId/products/:productId/edit',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/inventory/product-form-page.component').then((m) => m.ProductFormPageComponent)
  },
  { path: '**', redirectTo: 'networks' }
];
