# ARBOR: PROTOCOLO DE INYECCIÓN DE CONOCIMIENTO (ZERO-TOUCH)

## 1. La Visión: Currículo y Narrativa Desacoplados
La visión de Arbor para los juegos educativos es separar el **"Qué se aprende"** del **"Cómo se juega"**.

*   **El Profesor (Arbor Studio):** Escribe lecciones en texto plano o Markdown. No sabe nada de programación ni de juegos.
*   **El Desarrollador de Juegos:** Crea contenedores narrativos (escenas, diálogos) sin hardcodear preguntas.
*   **El Motor de Juego (Runtime):** Descarga el contenido crudo de Arbor y utiliza un LLM local (Ollama) o remoto para "entender" la lección y generar mecánicas de juego al vuelo.

---

## 2. Arquitectura "El Arquitecto y El Árbitro"

Dado que el "Builder" de Arbor entrega el contenido tal cual (con HTML, Markdown y ruido), la inteligencia se mueve al cliente (el juego) mediante dos pasos:

### Fase A: El Arquitecto (Carga del Nivel)
Cuando el juego carga un módulo de Arbor, no muestra el texto. Lo envía a un LLM con el rol de "Arquitecto".
*   **Input:** Texto crudo con etiquetas HTML/Markdown (`<p>La <strong>fotosíntesis</strong>...</p>`).
*   **Proceso:** El LLM limpia el texto y extrae una estructura lógica (JSON) en memoria.
*   **Output:** `{"conceptos_clave": ["Clorofila", "Luz Solar"], "trampas": ["Oscuridad"]}`.

### Fase B: El Árbitro (Gameplay)
Durante el juego, cada interacción del jugador se envía al LLM con el rol de "Árbitro".
*   **Input:** Acción del jugador + Reglas generadas por el Arquitecto.
*   **Proceso:** El Árbitro decide si la acción demuestra comprensión de los conceptos extraídos.
*   **Output:** Narrativa reactiva ("El guardia te deja pasar porque explicaste bien la fotosíntesis").

---

## 3. Ventajas del Modelo Zero-Touch

1.  **Compatibilidad Total:** Funciona con cualquier repositorio de Arbor existente, sin necesidad de que el autor haya usado marcadores especiales.
2.  **Mantenimiento Cero:** Si el profesor edita el texto en GitHub, el "Arquitecto" generará nuevas reglas automáticamente la próxima vez que se juegue.
3.  **Resiliencia:** El juego mismo se encarga de "purificar" los datos (eliminar HTML, formatear), haciendo que el backend de Arbor pueda ser tan simple como un servidor de archivos estáticos.

---

## 4. Ejemplo Técnico (Python Prototype)

Ver archivo `juegopython.txt`. Este script demuestra cómo:
1.  Conectar a un JSON raw de Arbor.
2.  Limpiar el HTML sucio usando Python.
3.  Usar Ollama para extraer conceptos pedagógicos.
4.  Jugar una partida de rol contra esos conceptos.