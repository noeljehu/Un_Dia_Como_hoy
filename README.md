# 📅 Un Día Como Hoy (HoyEnLaHistoria)

Aplicación web que muestra eventos históricos ocurridos en el día actual, con un formato de scroll infinito. Consume la API pública **Wikipedia On This Day** para obtener los datos en tiempo real.

🔗 **Demo en vivo:** [un-dia-como-hoy.vercel.app](https://un-dia-como-hoy.vercel.app/)

## ✨ Características

- Listado de eventos históricos correspondientes a la fecha actual, obtenidos dinámicamente desde la API de Wikipedia.
- Scroll infinito para cargar más eventos sin recargar la página.
- Interfaz construida con componentes reutilizables de Angular.
- Consumo de servicios HTTP y manejo de datos asíncronos.
- Aplicación desplegada en producción mediante Vercel.

## 🛠️ Tecnologías utilizadas

- **Angular** (CLI 19.2.17)
- **TypeScript**
- **Wikipedia On This Day API** (API pública)
- **Vercel** (despliegue)

## 🚀 Cómo ejecutar el proyecto localmente

Clona el repositorio e instala las dependencias:

```bash
git clone https://github.com/noeljehu/HoyEnLaHistoria.git
cd HoyEnLaHistoria
npm install
```

Levanta el servidor de desarrollo:

```bash
ng serve
```

Abre tu navegador en `http://localhost:4200/`. La aplicación se recarga automáticamente al modificar el código fuente.

## 📦 Build de producción

```bash
ng build
```

Los artefactos de compilación se generan en el directorio `dist/`, optimizados para rendimiento.

## 🧪 Tests

Pruebas unitarias con Karma:

```bash
ng test
```

## 👤 Autor

**Jehu Noel Ayllon Vargas**
Desarrollador Backend Junior (Java / Spring Boot) · Frontend (Angular)
[GitHub](https://github.com/noeljehu) · [LinkedIn](https://linkedin.com/in/noel-ayllon)
