import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { EventosComponent } from './componentes/eventos/eventos.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'hoy-en-la-historia';
}
