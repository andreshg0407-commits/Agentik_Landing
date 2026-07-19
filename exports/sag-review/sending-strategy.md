# Estrategia de Envío — SAG Executive Pack

**Uso exclusivo interno — Equipo de Integraciones Agentik**

> Versión 2.6.0 &nbsp;|&nbsp; 2026-05-31

---

## Objetivo de la Estrategia

Maximizar la probabilidad de una respuesta positiva por parte de SAG mediante un envío estructurado por fases. El View Request completo **no se enviará en el primer contacto**. El primer envío está orientado exclusivamente a validar fuentes de información, resolver preguntas abiertas y acordar la mejor estrategia de integración conjuntamente con el equipo SAG.

---

## FASE 1 — Primer contacto con SAG

### Documentos a adjuntar

| # | Documento | Archivo PDF | Páginas est. |
|---|---|---|---|
| 1 | Resumen Ejecutivo | `Agentik-SAG-Resumen-Ejecutivo-v2.6.0.pdf` | ~3 págs |
| 2 | Preguntas Abiertas | `Agentik-SAG-Preguntas-Abiertas-v2.6.0.pdf` | ~8 págs |

### Lo que NO se envía en Fase 1

- **View Request completo** — el documento de especificación técnica campo a campo (17 páginas) **no se adjunta en el primer contacto**.
- Razón: enviarlo antes de validar disposición técnica de SAG puede generar la percepción de que Agentik ya decidió la arquitectura de forma unilateral. El mensaje de Fase 1 debe ser de escucha y validación, no de especificación.

### Objetivo de Fase 1

> Validar qué fuentes de información están disponibles en SAG, resolver las preguntas abiertas identificadas durante el análisis funcional y acordar conjuntamente la mejor estrategia de integración según las posibilidades técnicas del equipo SAG.

### Mensaje central de Fase 1

> "Ya realizamos el análisis de información que necesitamos para la integración. Queremos validar con ustedes cuáles son las fuentes correctas en SAG y estamos abiertos a la recomendación técnica que el equipo considere más adecuada."

### Correo a usar

Utilizar el borrador **EMAIL-TI-SAG-01** disponible en `email-preview.md` (versión técnica — Jefe de TI / DBA SAG).

---

## FASE 2 — Después de la validación inicial

### Condición de activación

Una de las siguientes condiciones debe cumplirse antes de ejecutar Fase 2:
- SAG respondió al primer contacto de forma positiva, o
- Se realizó la reunión técnica de alineación con el equipo SAG.

### Documentos a compartir

| # | Documento | Archivo PDF | Páginas est. |
|---|---|---|---|
| 3 | Solicitud de Campos | `Agentik-SAG-Solicitud-Vistas-v2.6.0.pdf` | ~11 págs |

### Objetivo de Fase 2

> Revisar el detalle campo a campo de cada dominio de información, validar disponibilidad de la información identificada y definir la implementación técnica final según las recomendaciones del equipo SAG.

### Cómo presentar el View Request en Fase 2

- Presentarlo como "especificación de referencia para la conversación técnica" — no como lista de requisitos obligatorios.
- Enfatizar que la nomenclatura, el mecanismo de acceso y la estructura definitiva de las fuentes serán definidos conjuntamente.
- Usar el documento para guiar la conversación campo a campo, no para imponer una arquitectura.

---

## Preguntas de Prioridad Alta — Foco de Fase 1

Solo estas 4 preguntas requieren validación antes de poder iniciar desarrollo técnico:

| ID | Dominio | Pregunta resumida | Por qué requiere validación temprana |
|---|---|---|---|
| GEN-01 | Acceso General | ¿Cuál es el mecanismo de autenticación recomendado? | Sin esta definición no es posible diseñar la conexión |
| GEN-02 | Acceso General | ¿Las fuentes estarán disponibles en producción o staging? | Define el ambiente de desarrollo y testing |
| BAN-01 | Bancos | ¿REFERENCIA_BANCARIA es del extracto bancario o código interno SAG? | Define si la reconciliación automática es técnicamente viable |
| PRO-01 | Productos | ¿REFERENCIA es la clave de cruce garantizada entre todos los dominios? | Define la integridad del modelo de datos multi-dominio |

Las 18 preguntas de **Prioridad Media** y 10 de **Prioridad Baja** pueden resolverse durante la implementación o al recibir los datos reales.

---

## Justificación de la estrategia por fases

| Riesgo | Estrategia aplicada |
|---|---|
| El View Request puede interpretarse como arquitectura ya decidida | Enviarlo solo en Fase 2, después de confirmación de SAG |
| 32 preguntas pueden abrumar en el primer contacto | Solo 4 de Prioridad Alta requieren respuesta antes de iniciar |
| 11 páginas de tablas técnicas pueden generar fricción inicial | El Resumen Ejecutivo (~3 págs) es suficiente para primer contacto |
| Percepción de imposición técnica | Lenguaje colaborativo + dominios en nombres de negocio + tono de validación |
| Riesgo de respuesta negativa por exceso de información | Progresividad: primero contexto + preguntas, luego detalle técnico |

---

## Checklist — Fase 1 (antes de enviar)

```
[ ] Agentik-SAG-Resumen-Ejecutivo-v2.6.0.pdf generado y verificado
[ ] Agentik-SAG-Preguntas-Abiertas-v2.6.0.pdf generado y verificado
[ ] Correo redactado usando borrador EMAIL-TI-SAG-01 (email-preview.md)
[ ] Correo revisado por al menos 2 personas del equipo
[ ] Contacto SAG confirmado: nombre + correo vigente
[ ] Sin referencias internas (Copilot, IA, roadmap, sprint) en los adjuntos
[ ] Fecha de envío registrada en tracker de integración SAG
[ ] Ticket de seguimiento creado para reunión de validación técnica
```

## Checklist — Fase 2 (después de confirmación SAG)

```
[ ] SAG respondió positivamente o se realizó reunión técnica
[ ] Agentik-SAG-Solicitud-Vistas-v2.6.0.pdf generado y verificado
[ ] Contexto de conversación documentado antes de enviar Fase 2
[ ] View Request presentado como referencia, no como requisito
```

---

*Documento de uso interno — No enviar a SAG*
