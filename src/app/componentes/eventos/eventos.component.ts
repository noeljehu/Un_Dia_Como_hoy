import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone
} from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { EventosService, Evento } from '../../servicios/eventos.service';

@Component({
  selector: 'app-eventos',
  standalone: true,
  imports: [NgFor, NgIf],
  templateUrl: './eventos.component.html',
  styleUrls: ['./eventos.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventosComponent implements OnInit, OnDestroy {

  @ViewChild('feedContainer') feedContainer!: ElementRef<HTMLElement>;

  eventos:      Evento[] = [];
  error:        string   = '';
  horaLocal:    string   = '';
  fechaHoy:     string   = '';
  cargando:     boolean  = true;
  cargandoMas:  boolean  = false;
  eventoActivo: number   = 0;

  // Exponer String para usarlo en el template
  readonly String = String;

  private timerHora!:       ReturnType<typeof setInterval>;
  private scrollTimeout!:   ReturnType<typeof setTimeout>;
  private paginaActual:     number = 0;
  private itemsPorPagina:   number = 5;
  private eventosBuffer:    Evento[] = [];

  constructor(
    private service: EventosService,
    private cdr:     ChangeDetectorRef,
    private zone:    NgZone
  ) {}

  async ngOnInit(): Promise<void> {
    this.iniciarReloj();
    await this.cargarEventos();
  }

  ngOnDestroy(): void {
    clearInterval(this.timerHora);
    clearTimeout(this.scrollTimeout);
  }

  // ── Reloj ─────────────────────────────────────────────────────────────────
  private iniciarReloj(): void {
    const actualizar = () => {
      const ahora    = new Date();
      this.horaLocal = ahora.toLocaleTimeString('es-PE', { hour12: false });
      this.fechaHoy  = ahora.toLocaleDateString('es-PE', {
        weekday: 'long', day: 'numeric', month: 'long'
      });
      this.cdr.markForCheck();
    };
    actualizar();
    this.timerHora = setInterval(actualizar, 1000);
  }

  // ── Carga ─────────────────────────────────────────────────────────────────
  async cargarEventos(): Promise<void> {
    this.cargando = true;
    this.error    = '';
    this.cdr.markForCheck();

    try {
      this.eventosBuffer = await this.service.obtenerEventosHoy();
      this.mostrarPagina();
    } catch (err: any) {
      this.error    = err.message ?? 'Error desconocido';
      this.cargando = false;
      this.cdr.markForCheck();
    }
  }

  // ── Paginación lazy ───────────────────────────────────────────────────────
  private mostrarPagina(): void {
    const inicio = this.paginaActual * this.itemsPorPagina;
    const fin    = inicio + this.itemsPorPagina;
    const nuevos = this.eventosBuffer.slice(inicio, fin);

    if (nuevos.length === 0) {
      this.cargandoMas = false;
      this.cargando    = false;
      this.cdr.markForCheck();
      return;
    }

    this.eventos     = [...this.eventos, ...nuevos];
    this.cargando    = false;
    this.cargandoMas = false;
    this.cdr.markForCheck();
  }

  private precargarSiguientes(): void {
    const total        = this.eventosBuffer.length;
    const cargados     = this.eventos.length;
    const quedanPorVer = cargados - (this.eventoActivo + 1);

    if (quedanPorVer < 3 && cargados < total) {
      this.paginaActual++;
      this.cargandoMas = true;
      this.cdr.markForCheck();
      setTimeout(() => this.mostrarPagina(), 300);
    }
  }

  // ── Scroll ────────────────────────────────────────────────────────────────
  onScroll(event: Event): void {
    clearTimeout(this.scrollTimeout);
    this.scrollTimeout = setTimeout(() => {
      const el     = event.target as HTMLElement;
      const indice = Math.round(el.scrollTop / el.clientHeight);

      if (indice !== this.eventoActivo) {
        this.zone.run(() => {
          this.eventoActivo = indice;
          this.precargarSiguientes();
          this.cdr.markForCheck();
        });
      }
    }, 60);
  }

  irASlide(index: number): void {
    const el = this.feedContainer?.nativeElement;
    if (!el) return;
    el.scrollTo({ top: index * el.clientHeight, behavior: 'smooth' });
  }

  recargar(): void {
    this.eventos       = [];
    this.eventosBuffer = [];
    this.paginaActual  = 0;
    this.eventoActivo  = 0;
    this.cargarEventos();
  }

  trackByIndex(index: number): number {
    return index;
  }
}