
# 🌳 Arbor UI

**Explorador de conocimiento visual. Una plataforma de aprendizaje descentralizada.**

Arbor es un mapa de conocimiento dinámico que visualiza rutas de aprendizaje como árboles interactivos.

## ✨ Características

*   **Exploración Visual:** Navega temas complejos como un mapa mental interactivo.
*   **Contenido Descentralizado:** Carga árboles desde cualquier URL.
*   **Sin Servidor:** Funciona 100% en el navegador (Vanilla JS).
*   **Código Abierto:** Licencia GPL-3.0.

## 🚀 Cómo usar (Zero Build)

Este proyecto no requiere compilación (ni Node.js, ni NPM, ni Angular).

1.  **Contenido:** Crea tus lecciones en la carpeta `content/ES/` (o `EN`).
2.  **Generar Datos:** Ejecuta el script de Python para convertir el contenido en JSON:
    ```bash
    python builder_script.txt
    ```
    *Nota: Aunque tiene extensión .txt, es un script de Python.*
3.  **Abrir:** Simplemente abre `index.html` en tu navegador.

## 🌐 Despliegue en GitHub Pages

1.  Asegúrate de haber ejecutado el script para generar la carpeta `data/`.
2.  Sube los archivos al repositorio (`index.html`, carpeta `src`, carpeta `data`, carpeta `content`).
3.  Activa GitHub Pages en la configuración del repositorio apuntando a la rama `main` (root).
4.  ¡Listo!

## 🤝 Contribuir

Lee `HOW_TO_WRITE_CONTENT.md` para aprender a crear tus propios árboles de conocimiento.

## 📄 Licencia

Arbor está licenciado bajo **GNU General Public License v3.0**.
