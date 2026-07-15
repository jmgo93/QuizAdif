# QuizAdif

PWA para preparar exámenes tipo test de ADIF mediante práctica, simulacros, repetición espaciada y estadísticas. **Sin build ni backend.** Funciona offline y es instalable en móvil y escritorio.

El banco integrado se organiza en **General** y **Específico**, con jerarquía por tema, categoría, subtema y referencia documental. Incluye simulacros General (10), Específico (20) y Completo (10 + 20).

El banco actual contiene **3.280 preguntas**: al menos 250 para cada uno de los 13 temas documentales, 1.260 del bloque General y 2.020 del Específico. No contiene ejercicios de completar palabras. Los cinco formatos son selección conceptual, relación de conceptos, caso aplicado, correspondencia normativa y excepción/afirmación incorrecta.

Las preguntas se distribuyen además entre siete categorías temáticas: objeto y alcance; definiciones; responsabilidades; seguridad; documentación; datos, límites y plazos; y procedimientos. Las generadas conservan el fragmento fuente y se marcan como `draft` hasta su revisión manual.

## Desarrollo

```bash
npm run check
```

El comando valida `bank/questions.json`, comprueba su cobertura documental mínima y ejecuta las pruebas del dominio.

## Funcionalidades

| Área | Detalle |
|---|---|
| **Almacenamiento** | IndexedDB (preguntas, intentos, sesiones, ajustes). Persistente y sin límite práctico. |
| **Modos de estudio** | Práctica (feedback inmediato), Examen (feedback al final), Repaso SRS, Puntos débiles |
| **Algoritmo SRS** | SM-2 simplificado con 3 grados (fallo / dudé / lo sabía). Fallo → 10 min; luego 1d, 3d, ×ease |
| **Banco de preguntas** | CRUD completo, búsqueda, filtros por categoría y estado, dedupe automático al importar |
| **Import/Export** | Drag&drop, multi-archivo, pegado manual. Export completo (backup) o solo preguntas (compartir) |
| **Generador de prompts** | Formulario → prompt optimizado para ChatGPT/Claude/Gemini que devuelve el JSON exacto |
| **Progreso** | Tasa de acierto, racha de días, actividad 14d, rendimiento por categoría, estado de dominio |
| **UX** | Bottom nav móvil, atajos de teclado, háptica, safe-area iOS, sin zoom en inputs |

## Estructura

```
index.html                 Shell + navegación
manifest.webmanifest       PWA
sw.js                      Service worker (offline)
js/db.js                   Capa IndexedDB
js/model.js                Dominio: normalización, SRS, métricas
js/quiz.js                 Motor de sesión
js/views.js                Vistas (home/study/bank/stats/prompt/help)
js/ui.js                   Helpers de UI
js/app.js                  Router + bootstrap
icons/                     Iconos PWA
ejemplo-preguntas.json     Set de muestra
```

## Publicar en GitHub Pages

```bash
git init
git add .
git commit -m "feat: QuizAdif"
git branch -M main
git remote add origin https://github.com/USUARIO/REPO.git
git push -u origin main
```

Luego: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.

URL: `https://USUARIO.github.io/REPO/`

> Todas las rutas son **relativas** (`./`), así que funciona bajo subdirectorio sin configuración.
> `.nojekyll` evita que Jekyll ignore archivos.

## Instalar en el móvil

- **Android/Chrome**: botón `⤓ Instalar` en la cabecera, o menú ⋮ → *Añadir a pantalla de inicio*.
- **iOS/Safari**: Compartir → *Añadir a pantalla de inicio*. (Requiere HTTPS: GitHub Pages lo da.)

## Formato de preguntas

```json
{
  "questions": [
    {
      "enunciado": "¿Cuál es la capital de Francia?",
      "options": ["Lyon", "París", "Marsella", "Niza"],
      "correctIndex": 1,
      "feedback": "París es la capital desde 987.",
      "category": "Geografía",
      "difficulty": 1,
      "tags": ["europa"]
    }
  ]
}
```

Obligatorios: `enunciado`, `options` (≥2), `correctIndex` (base 0).
El importador acepta alias (`question`/`pregunta`, `opciones`, `categoria`, `explicacion`, letra `"B"` como índice).

## Sincronizar entre dispositivos

Sin backend por diseño. Para migrar progreso: **Banco → Exportar → Copia completa** → importar el archivo en el otro dispositivo (conserva historial SRS por `id` o por enunciado).

## Actualizar la app desplegada

Sube la versión de caché en `sw.js` (`CACHE = 'quizadif-v4'`) en cada release para que los clientes reciban los cambios.

## Licencia

MIT
