import { Routes } from '@angular/router';


export const routes: Routes = [
    {path: '', loadComponent: () => import('./componentes/eventos/eventos.component').then(m => m.EventosComponent)},
];
