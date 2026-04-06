import { Injectable } from '@angular/core';

export interface Evento {
  anio: number;
  titulo: string;
  link: string | null;
  relevancia?: number;
}

interface CacheEntry {
  fecha:   string;
  eventos: Evento[];
}

@Injectable({
  providedIn: 'root'
})
export class EventosService {

  private memoriaCache = new Map<string, Evento[]>();
  private enCurso      = new Map<string, Promise<Evento[]>>();

  // ── Motor de relevancia ───────────────────────────────────────────────────

  private readonly KEYWORDS_IMPACTO: { patron: RegExp; peso: number }[] = [
    { patron: /primer[ao]?s?\b|primera vez|inauguraci[oó]n|fundaci[oó]n|invento|descubrimiento|lanzamiento/i, peso: 15 },
    { patron: /cohete|nasa|apolo|misión espacial|satélite|luna|aterriz/i,                                      peso: 20 },
    { patron: /vacuna|cura|medicina|epidemia|pandemia/i,                                                        peso: 14 },
    { patron: /guerra|batalla|ataque|bombardeo|invasión|rendición|armisticio|derrota|victoria/i,               peso: 18 },
    { patron: /segunda guerra|primera guerra|guerra civil|revolución/i,                                        peso: 22 },
    { patron: /presidente|rey|reina|emperador|asesinado|asesinato|golpe de estado|independencia/i,             peso: 16 },
    { patron: /terremoto|tsunami|erupci[oó]n|huracán|incendio|hundimiento|naufragio|accidente/i,               peso: 18 },
    { patron: /titanic|chernobyl|hiroshima|nagasaki/i,                                                         peso: 25 },
    { patron: /nobel|campe[oó]n|mundial|olimpi/i,                                                              peso: 10 },
    { patron: /r[eé]cord|hito|hist[oó]ric/i,                                                                   peso:  8 },
  ];

  private readonly KEYWORDS_PENALIZAR: { patron: RegExp; peso: number }[] = [
    { patron: /canonizaci[oó]n|beato|santo\b|obispo|diócesis/i, peso: -10 },
    { patron: /alcalde|concejo|ordenanza/i,                      peso:  -8 },
    { patron: /campeonato regional|liga menor|torneo local/i,    peso:  -6 },
  ];

  private bonoAnioRedondo(anio: number): number {
    const diff = new Date().getFullYear() - anio;
    if (diff <= 0)       return 0;
    if (diff % 100 === 0) return 25;
    if (diff % 50  === 0) return 15;
    if (diff % 25  === 0) return  8;
    if (diff % 10  === 0) return  4;
    return 0;
  }

  private calcularRelevancia(evento: Evento): number {
    let pts = this.bonoAnioRedondo(evento.anio);
    for (const kw of this.KEYWORDS_IMPACTO)   { if (kw.patron.test(evento.titulo)) pts += kw.peso; }
    for (const kw of this.KEYWORDS_PENALIZAR) { if (kw.patron.test(evento.titulo)) pts += kw.peso; }
    const palabras = evento.titulo.split(/\s+/).length;
    if (palabras > 15) pts += 5;
    if (palabras > 25) pts += 5;
    if (evento.link)   pts += 3;
    return pts;
  }

  /**
   * Selecciona los N mejores eventos garantizando diversidad de siglos
   * (máx. 3 eventos por siglo) y los ordena del más reciente al más antiguo.
   */
  private seleccionarMejores(eventos: Evento[], cantidad = 10): Evento[] {
    const puntuados = eventos
      .map(e => ({ ...e, relevancia: this.calcularRelevancia(e) }))
      .sort((a, b) => (b.relevancia ?? 0) - (a.relevancia ?? 0));

    const seleccionados: typeof puntuados = [];
    const conteoSiglo = new Map<number, number>();

    for (const e of puntuados) {
      if (seleccionados.length >= cantidad) break;
      const siglo = Math.floor(e.anio / 100);
      const cnt   = conteoSiglo.get(siglo) ?? 0;
      if (cnt < 3) { seleccionados.push(e); conteoSiglo.set(siglo, cnt + 1); }
    }

    // Completar si la diversidad dejó huecos
    for (const e of puntuados) {
      if (seleccionados.length >= cantidad) break;
      if (!seleccionados.some(s => s.anio === e.anio && s.titulo === e.titulo)) {
        seleccionados.push(e);
      }
    }

    return seleccionados.sort((a, b) => b.anio - a.anio);
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  API PÚBLICA
  // ═════════════════════════════════════════════════════════════════════════

  async obtenerEventosHoy(): Promise<Evento[]> {
    const hoy   = new Date();
    const mes   = hoy.getMonth() + 1;
    const dia   = hoy.getDate();
    const anio  = hoy.getFullYear();
    const clave = `${anio}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;

    if (this.memoriaCache.has(clave))          return this.memoriaCache.get(clave)!;
    const local = this.leerLocalStorage(clave);
    if (local) { this.memoriaCache.set(clave, local); return local; }
    const remota = await this.leerStorageRemoto(clave);
    if (remota) { this.memoriaCache.set(clave, remota); this.guardarLocalStorage(clave, remota); return remota; }
    if (this.enCurso.has(clave))               return this.enCurso.get(clave)!;

    const promesa = this.fetchYFiltrar(mes, dia)
      .then(eventos => {
        this.memoriaCache.set(clave, eventos);
        this.guardarLocalStorage(clave, eventos);
        this.guardarStorageRemoto(clave, eventos);
        this.enCurso.delete(clave);
        return eventos;
      })
      .catch(err => { this.enCurso.delete(clave); throw err; });

    this.enCurso.set(clave, promesa);
    return promesa;
  }

  // ── Orquestador: obtener pool amplio → filtrar por relevancia ────────────

  private async fetchYFiltrar(mes: number, dia: number): Promise<Evento[]> {
    const eventosES = await this.fetchWikipediaES(mes, dia);
    if (eventosES.length >= 5) return this.seleccionarMejores(eventosES, 10);

    console.warn('[EventosService] Fallback a Wikipedia EN + traducción');
    const eventosEN = await this.fetchYTraducirConProteccion(mes, dia);
    return this.seleccionarMejores(eventosEN, 10);
  }

  // ── Wikipedia ES ─────────────────────────────────────────────────────────

  private async fetchWikipediaES(mes: number, dia: number): Promise<Evento[]> {
    const meses     = ['enero','febrero','marzo','abril','mayo','junio',
                       'julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const titulo    = `${dia}_de_${meses[mes - 1]}`;
    const res       = await fetch(`https://es.wikipedia.org/api/rest_v1/page/summary/${titulo}`);
    if (!res.ok) return [];
    return this.extraerEventosArticuloES(titulo);
  }

  private async extraerEventosArticuloES(titulo: string): Promise<Evento[]> {
    try {
      const params = new URLSearchParams({
        action: 'parse', page: titulo, prop: 'wikitext', format: 'json', origin: '*'
      });
      const res    = await fetch(`https://es.wikipedia.org/w/api.php?${params}`);
      const data   = await res.json();
      const wikitext: string = data?.parse?.wikitext?.['*'] ?? '';
      if (!wikitext) return [];

      // Traer 40 para tener buen pool de selección
      const lineas = wikitext
        .split('\n')
        .filter((l: string) => /^\*\s*\[\[\d{1,4}\]\]/.test(l))
        .slice(0, 40);

      return lineas.map((linea: string) => {
        const anioMatch    = linea.match(/\[\[(\d{1,4})\]\]/);
        const anio         = anioMatch ? parseInt(anioMatch[1], 10) : 0;
        const titulo_limpio = linea
          .replace(/^\*\s*/, '')
          .replace(/\[\[(\d{1,4})\]\]\s*[-–]\s*/, '')
          .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
          .replace(/\[\[([^\]]+)\]\]/g, '$1')
          .replace(/'{2,3}/g, '')
          .replace(/\{\{[^}]+\}\}/g, '')
          .trim();
        const link = anioMatch
          ? `https://es.wikipedia.org/wiki/${encodeURIComponent(titulo_limpio.split(' ').slice(0,4).join('_'))}`
          : null;
        return { anio, titulo: titulo_limpio, link };
      }).filter(e => e.anio > 0 && e.titulo.length > 10);

    } catch (e) {
      console.warn('[EventosService] Error parseando artículo ES:', e);
      return [];
    }
  }

  // ── Fallback EN + traducción (pre-filtra antes de traducir) ──────────────

  private async fetchYTraducirConProteccion(mes: number, dia: number): Promise<Evento[]> {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mes}/${dia}`);
    if (!res.ok) throw new Error(`Error Wikipedia (${res.status})`);
    const data = await res.json();

    const eventosRaw: Evento[] = data.events.slice(0, 40).map((e: any) => ({
      anio:   e.year,
      titulo: e.text,
      link:   e.pages?.[0]?.content_urls?.desktop?.page ?? null
    }));

    // Pre-filtrar en inglés antes de traducir → ahorra ~70 % de cuota de traducción
    const mejores = this.seleccionarMejores(eventosRaw, 12);
    return this.traducirConBackoff(mejores);
  }

  private async traducirConBackoff(eventos: Evento[]): Promise<Evento[]> {
    const resultado = [...eventos];
    for (let i = 0; i < eventos.length; i += 3) {
      const traducciones = await Promise.all(
        eventos.slice(i, i + 3).map(e => this.traducirTexto(e.titulo))
      );
      traducciones.forEach((t, j) => { resultado[i + j] = { ...eventos[i + j], titulo: t }; });
      if (i + 3 < eventos.length) await this.esperar(500);
    }
    return resultado;
  }

  private traducirTexto = async (texto: string): Promise<string> => {
    try {
      const params = new URLSearchParams({ q: texto, langpair: 'en|es' });
      const res    = await fetch(`https://api.mymemory.translated.net/get?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.responseStatus === 200 ? data.responseData?.translatedText ?? texto : texto;
    } catch { return texto; }
  }

  private esperar = (ms: number) => new Promise(r => setTimeout(r, ms));

  // ── localStorage ──────────────────────────────────────────────────────────

  private leerLocalStorage(clave: string): Evento[] | null {
    try {
      const raw = localStorage.getItem(`historia_${clave}`);
      if (!raw) return null;
      const entry: CacheEntry = JSON.parse(raw);
      return entry.fecha === clave ? entry.eventos : null;
    } catch { return null; }
  }

  private guardarLocalStorage(clave: string, eventos: Evento[]): void {
    try {
      localStorage.setItem(`historia_${clave}`, JSON.stringify({ fecha: clave, eventos }));
      Object.keys(localStorage)
        .filter(k => k.startsWith('historia_') && k !== `historia_${clave}`)
        .forEach(k => localStorage.removeItem(k));
    } catch {}
  }

  // ── Storage remoto compartido ─────────────────────────────────────────────

  private async leerStorageRemoto(clave: string): Promise<Evento[] | null> {
    try {
      const storage = (window as any).storage;
      if (!storage) return null;
      const result = await storage.get(`historia_${clave}`, true);
      if (!result?.value) return null;
      const entry: CacheEntry = JSON.parse(result.value);
      return entry.fecha === clave ? entry.eventos : null;
    } catch { return null; }
  }

  private async guardarStorageRemoto(clave: string, eventos: Evento[]): Promise<void> {
    try {
      const storage = (window as any).storage;
      if (!storage) return;
      await storage.set(`historia_${clave}`, JSON.stringify({ fecha: clave, eventos }), true);
      console.log('[Cache] ✓ Storage compartido actualizado');
    } catch (e) {
      console.warn('[Cache] No se pudo guardar en storage remoto:', e);
    }
  }
}