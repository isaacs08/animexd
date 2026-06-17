/*
  Configuración principal de AnimeXD.

  IMPORTANTE:
  1. Pega tu API key de Google Cloud en GOOGLE_API_KEY.
  2. La carpeta de Drive y los videos deben estar compartidos como:
     "Cualquier persona con el enlace puede ver".
  3. La estructura recomendada es:
     Carpeta AnimeXD
       ├── Serie 1
       │     ├── Serie 1 - 01.mp4
       │     ├── Serie 1 - 02.mp4
       ├── Serie 2
       │     ├── Serie 2 - 01.mp4
*/

window.ANIMEXD_CONFIG = {
  APP_TITLE: "AnimeXD",

  // ID tomado de tu enlace:
  // https://drive.google.com/drive/folders/1nsyg64wSLR74fUDsrqhmQInzRRrQDI-a
  ROOT_FOLDER_ID: "1nsyg64wSLR74fUDsrqhmQInzRRrQDI-a",

  // Pega aquí tu API key. Ejemplo: "AIzaSy..."
  GOOGLE_API_KEY: "AIzaSyA-dsV7YMOcbAH5FBxezL3bzKRtRmiKL4M",

  // Si tienes videos MP4 directamente en la carpeta principal,
  // se mostrarán dentro de una sección llamada "Sin serie".
  SHOW_DIRECT_ROOT_FILES: true,

  // "auto": usa Drive preview por defecto para mayor estabilidad.
  // "drive": fuerza el iframe de Google Drive.
  // "native": fuerza el reproductor HTML5.
  PLAYER_MODE: "auto"
};
