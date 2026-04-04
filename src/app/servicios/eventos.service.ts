import { Injectable } from '@angular/core';

export interface Evento {
  anio: number;
  titulo: string;
  link: string | null;
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

  // Promesa en vuelo: si ya hay una traducción en curso, todos esperan la misma
  private enCurso = new Map<string, Promise<Evento[]>>();

  constructor() {}

  async obtenerEventosHoy(): Promise<Evento[]> {
    const hoy   = new Date();
    const mes   = hoy.getMonth() + 1;
    const dia   = hoy.getDate();
    const anio  = hoy.getFullYear();
    const clave = `${anio}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;

    // 1️⃣ Caché en memoria
    if (this.memoriaCache.has(clave)) {
      return this.memoriaCache.get(clave)!;
    }

    // 2️⃣ localStorage
    const local = this.leerLocalStorage(clave);
    if (local) {
      this.memoriaCache.set(clave, local);
      return local;
    }

    // 3️⃣ Storage compartido (todos los usuarios)
    const remota = await this.leerStorageRemoto(clave);
    if (remota) {
      this.memoriaCache.set(clave, remota);
      this.guardarLocalStorage(clave, remota);
      return remota;
    }

    // 4️⃣ Sin caché: evitar que múltiples instancias hagan el mismo trabajo
    // Si ya hay una petición en curso (mismo usuario, múltiples llamadas),
    // todos esperan la misma promesa en lugar de disparar requests duplicados
    if (this.enCurso.has(clave)) {
      console.log('[Cache] Esperando petición en curso...');
      return this.enCurso.get(clave)!;
    }

    // Usar Wikipedia en ESPAÑOL directamente — sin traducción, sin límites, gratis
    const promesa = this.fetchWikipediaES(mes, dia)
      .then(eventos => {
        this.memoriaCache.set(clave, eventos);
        this.guardarLocalStorage(clave, eventos);
        this.guardarStorageRemoto(clave, eventos);
        this.enCurso.delete(clave);
        return eventos;
      })
      .catch(err => {
        this.enCurso.delete(clave);
        throw err;
      });

    this.enCurso.set(clave, promesa);
    return promesa;
  }

  // ── Wikipedia EN ESPAÑOL (sin traducción, sin límites) ───────────────────
  // La API de Wikipedia tiene versión en español nativa.
  // "onthisday" no existe en ES, así que usamos la API de búsqueda de Wikipedia ES
  // para obtener eventos del día directamente en español.
  private async fetchWikipediaES(mes: number, dia: number): Promise<Evento[]> {

    // Estrategia: Wikipedia ES tiene artículos de "efemérides" por fecha
    // Usamos el endpoint de efemerides que sí existe en español
    const meses = [
      'enero','febrero','marzo','abril','mayo','junio',
      'julio','agosto','septiembre','octubre','noviembre','diciembre'
    ];
    const nombreMes = meses[mes - 1];
    const titulo    = `${dia}_de_${nombreMes}`;

    const url = `https://es.wikipedia.org/api/rest_v1/page/summary/${titulo}`;
    const res = await fetch(url);

    if (res.ok) {
      // Tenemos el artículo del día en español, pero el summary solo da intro.
      // Usamos el endpoint de secciones para extraer la lista de eventos.
      const eventos = await this.extraerEventosArticuloES(titulo, mes, dia);
      if (eventos.length > 0) return eventos;
    }

    // Fallback: usar API inglesa y traducir con MyMemory con protección de cuota
    console.warn('[EventosService] Fallback a Wikipedia EN + traducción');
    return this.fetchYTraducirConProteccion(mes, dia);
  }

  // Extrae eventos del artículo de efemérides en español
  private async extraerEventosArticuloES(titulo: string, mes: number, dia: number): Promise<Evento[]> {
    try {
      // Parsear el artículo completo via API de MediaWiki
      const params = new URLSearchParams({
        action:      'parse',
        page:        titulo,
        prop:        'sections|wikitext',
        format:      'json',
        origin:      '*'
      });

      const res  = await fetch(`https://es.wikipedia.org/w/api.php?${params}`);
      const data = await res.json();

      const wikitext: string = data?.parse?.wikitext?.['*'] ?? '';
      if (!wikitext) return [];

      // Extraer líneas de eventos (formato: * [[año]] - descripción)
      const lineas = wikitext
        .split('\n')
        .filter((l: string) => /^\*\s*\[\[\d{1,4}\]\]/.test(l))
        .slice(0, 20);

      const eventos: Evento[] = lineas.map((linea: string) => {
        // Extraer año
        const anioMatch = linea.match(/\[\[(\d{1,4})\]\]/);
        const anio = anioMatch ? parseInt(anioMatch[1], 10) : 0;

        // Limpiar wikisyntax para obtener texto legible
        const titulo_limpio = linea
          .replace(/^\*\s*/, '')
          .replace(/\[\[(\d{1,4})\]\]\s*[-–]\s*/, '')
          .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2') // [[enlace|texto]] → texto
          .replace(/\[\[([^\]]+)\]\]/g, '$1')             // [[enlace]] → enlace
          .replace(/'{2,3}/g, '')                          // negrita/cursiva
          .replace(/\{\{[^}]+\}\}/g, '')                   // templates
          .trim();

        // Construir link a Wikipedia ES
        const anioLink = anioMatch ? anioMatch[1] : null;
        const link = anioLink
          ? `https://es.wikipedia.org/wiki/${encodeURIComponent(titulo_limpio.split(' ').slice(0,4).join('_'))}`
          : null;

        return { anio, titulo: titulo_limpio, link };
      }).filter(e => e.anio > 0 && e.titulo.length > 10);

      return eventos;

    } catch (e) {
      console.warn('[EventosService] Error parseando artículo ES:', e);
      return [];
    }
  }

  // ── Fallback: Wikipedia EN + traducción con protección anti-flood ─────────
  private async fetchYTraducirConProteccion(mes: number, dia: number): Promise<Evento[]> {
    const url = `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mes}/${dia}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Error Wikipedia (${res.status})`);

    const data = await res.json();
    const eventosRaw: Evento[] = data.events.slice(0, 20).map((e: any) => ({
      anio:   e.year,
      titulo: e.text,
      link:   e.pages?.[0]?.content_urls?.desktop?.page ?? null
    }));

    return this.traducirConBackoff(eventosRaw);
  }

  // Traduce con delay entre lotes para respetar límites de MyMemory
  private async traducirConBackoff(eventos: Evento[]): Promise<Evento[]> {
    const CONCURRENCIA = 3;
    const DELAY_MS     = 500; // esperar entre lotes
    const resultado    = [...eventos];

    for (let i = 0; i < eventos.length; i += CONCURRENCIA) {
      const lote = eventos.slice(i, i + CONCURRENCIA);
      const traducciones = await Promise.all(
        lote.map(e => this.traducirTexto(e.titulo))
      );
      traducciones.forEach((t, j) => {
        resultado[i + j] = { ...eventos[i + j], titulo: t };
      });
      // Pequeño delay entre lotes para no saturar la API
      if (i + CONCURRENCIA < eventos.length) {
        await this.esperar(DELAY_MS);
      }
    }
    return resultado;
  }

  private traducirTexto = async (texto: string): Promise<string> => {
    try {
      const params = new URLSearchParams({ q: texto, langpair: 'en|es' });
      const res    = await fetch(`https://api.mymemory.translated.net/get?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.responseStatus === 200 && data.responseData?.translatedText) {
        return data.responseData.translatedText;
      }
      return texto;
    } catch {
      return texto;
    }
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
      // Limpiar entradas de otros días
      Object.keys(localStorage)
        .filter(k => k.startsWith('historia_') && k !== `historia_${clave}`)
        .forEach(k => localStorage.removeItem(k));
    } catch { /* modo privado u otros errores */ }
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