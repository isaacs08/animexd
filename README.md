# AnimeXD

Reproductor web estilo Netflix para mostrar videos MP4 alojados en Google Drive.

La web se puede publicar gratis en GitHub Pages. Los videos NO se suben a GitHub; se quedan en Google Drive.

## Estructura recomendada en Google Drive

Tu carpeta principal debería verse así:

```text
AnimeXD/
  Naruto/
    Naruto - 01.mp4
    Naruto - 02.mp4
  One Piece/
    One Piece - 01.mp4
    One Piece - 02.mp4
```

La app toma cada carpeta como una serie y ordena los capítulos por número.

Si pones MP4 directamente dentro de la carpeta principal, aparecerán en una sección llamada "Sin serie".

## Paso 1: compartir la carpeta de Drive

En Google Drive:

1. Abre la carpeta principal.
2. Clic derecho > Compartir.
3. Cambia el acceso a:
   "Cualquier persona con el enlace".
4. Rol:
   "Lector" o "Viewer".
5. Revisa que las subcarpetas y videos también sean accesibles.

Tu carpeta actual está configurada en `config.js` con este ID:

```text
1nsyg64wSLR74fUDsrqhmQInzRRrQDI-a
```

## Paso 2: crear una API key de Google Drive

1. Entra a Google Cloud Console.
2. Crea un proyecto nuevo, por ejemplo: `AnimeXD`.
3. Ve a APIs y servicios.
4. Habilita `Google Drive API`.
5. Ve a Credenciales.
6. Crea una API key.
7. Copia la API key.

Luego abre `config.js` y cambia esto:

```js
GOOGLE_API_KEY: "PEGA_TU_API_KEY_AQUI",
```

por algo como:

```js
GOOGLE_API_KEY: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXX",
```

## Paso 3: restringir la API key

Cuando ya tengas la página publicada, restringe la API key:

### Restricción de aplicación

Usa "HTTP referrers" y agrega:

```text
https://TUUSUARIO.github.io/*
```

Si tu repositorio se llama `animexd`, también puedes agregar:

```text
https://TUUSUARIO.github.io/animexd/*
```

Para pruebas locales puedes agregar temporalmente:

```text
http://localhost:5500/*
http://127.0.0.1:5500/*
```

### Restricción de API

Permite solo:

```text
Google Drive API
```

Esto ayuda a evitar usos no deseados de tu key.

## Paso 4: probar localmente

Abre una terminal dentro de la carpeta del proyecto y ejecuta:

```bash
python -m http.server 5500
```

Luego abre:

```text
http://localhost:5500
```

## Paso 5: subir a GitHub Pages

1. Crea un repositorio en GitHub, por ejemplo: `animexd`.
2. Sube estos archivos:
   - `index.html`
   - `style.css`
   - `app.js`
   - `config.js`
   - `.nojekyll`
   - `README.md`
3. En GitHub entra a:
   Settings > Pages.
4. En "Build and deployment":
   - Source: Deploy from a branch.
   - Branch: main.
   - Folder: /root.
5. Guarda.
6. La página quedará en algo como:

```text
https://TUUSUARIO.github.io/animexd/
```

## Problemas comunes

### No salen videos

Revisa:

- Que la API key esté pegada en `config.js`.
- Que Google Drive API esté habilitada.
- Que la carpeta sea pública con enlace.
- Que los videos sean MP4 o archivos de video.
- Que los videos estén dentro de carpetas de series.

### Aparece error de permisos

La carpeta o los archivos no están públicos, o la API key está restringida de forma incorrecta.

### No se ordenan bien los capítulos

La app busca números en el nombre. Usa nombres como:

```text
Nombre Serie - 01.mp4
Nombre Serie - 02.mp4
Nombre Serie - 03.mp4
```

También entiende nombres tipo:

```text
S01E01.mp4
Cap 01.mp4
Episodio 01.mp4
```

## Nota importante

Usa este proyecto solo con videos propios o contenido que tengas permiso de compartir. Si la página queda pública, cualquiera con el enlace podría acceder.
