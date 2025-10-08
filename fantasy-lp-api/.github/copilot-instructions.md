# Copilot Coding Agent Instructions – FantasyLol API

Guía concisa para que un agente AI sea productivo inmediatamente en este backend NestJS de Fantasy LoL.

## 1. Arquitectura y Dominios
- Monolito modular NestJS (`src/`), cada dominio en un subdirectorio: `fantasy/*`, `leaguepedia/*`, `cron/*`, `database/*`.
- Dominio Fantasy subdividido: `leagues`, `teams`, `offers`, `market`, `scoring`, `valuation` (nombres de tablas prefijados con `fantasy_`).
- Integración externa: módulo `leaguepedia` (servicios `leaguepedia.stats.service.ts` y `leaguepedia.teams.service.ts`) consume datos y los “upserta”.
- Persistencia: TypeORM; entidades base generales en `src/entities/` y específicas de fantasy bajo `src/fantasy/**`.

## 2. Entidades y Relaciones Clave
- Entidades base: `Player`, `Team`, `Game`, `Tournament`, `League` (tablas públicas). Se conectan con entidades Fantasy (`FantasyLeague`, `FantasyTeam`, `FantasyRosterSlot`, `FantasyPlayerPoints`, `FantasyTeamPoints`, `FantasyScoringPeriod`).
- Puntuación: `FantasyPlayerPoints` (@Unique por liga+player+game) y `FantasyTeamPoints` vinculados a `FantasyScoringPeriod`.
- Mercado / Transferencias: `market_order`, `market_bid`, `transfer_offer`, `transfer_transaction` (ver bajo `fantasy/market` y `fantasy/offers`).

## 3. Cron & Data Pipeline
- Servicio central: `cron/cron.service.ts` define jobs encadenados (orden importante):
  1) Ligas (semanal)
  2) Tournaments (diario) → prerequisite para games
  3) Teams & Players (diario) con estrategias de “candidates” + fallbacks y cooldowns.
  4) Games (hourly) + normalización de teams recientes.
  5) Player Stats (hourly) tras games.
  6) Roster (cada 6h) recalcula roster activo.
- Lock distribuido sencillo (`CronLock` en `cron.utils.ts`) evita ejecuciones solapadas (DataSource + claves numéricas). Reutilizar patrón antes de añadir nuevos jobs.
- Ventanas temporales vía env: `CRON_LEAGUE_YEAR`, `CRON_GAMES_WINDOW_HOURS`, `CRON_STATS_WINDOW_HOURS`, `CRON_ROSTER_SINCE_DAYS`, etc. Utilidades: `readCsvEnv`, `daysAgoUtc`, `hoursAgoUtc`.

## 4. Variables de Entorno Importantes
- `DB_SCHEMA` (default `public`) usado por helper `T()` en tests / queries crudas.
- `LEAGUEPEDIA_TARGET_LEAGUES`, `LEAGUEPEDIA_UA` para ingesta externa.
- Prefijo `CRON_` controla lógica de jobs (añadir nuevas → documentar aquí).
- `PORT` para `main.ts`.

## 5. Testing Strategy
- Unit tests: patrón Nest estándar (archivos `.spec.ts`).
- E2E tests por dominio: `test/<dominio>/*.e2e-spec.ts` (ej: `test/scoring/scoring.e2e-spec.ts`).
- Helpers: `test/helpers/db.ts` (reset, seeds), `schema.util.ts` para `T('table')` considerando `DB_SCHEMA`.
- E2E crea escenario → invoca endpoint → assertions con queries SQL directas. Replicar estilo al añadir casos.

## 6. Patrones de Implementación
- Controladores: finos, delegan a servicios; no meter lógica de scoring/mercado directamente.
- Ingesta Leaguepedia: seguir patrón de upsert + contadores + logs con métricas (`upserts=`, `discovered=`) + sleeps para rate limiting.
- Scoring: centralizar reglas en `fantasy_league.scoring_config` y mantener consistencia en entidades `FantasyPlayerPoints` / `FantasyTeamPoints`.
- Normalización de relaciones tardías: ver `normalizeRecentGamesTeams()` para mapear textos a IDs (cache local en memoria + actualizaciones SQL).

## 7. Estilo de Logs y Errores
- Prefijo `[jobName]` en cron logs; `logger.warn` para fallbacks; `logger.error` sólo en fallos no recuperables del bloque.
- Backoffs explícitos (arrays) para reintentos; evitar lógica mágica inline repetida.

## 8. Añadir un Nuevo Job Cron (Checklist)
1. Elegir `LOCK_KEY` único (> 10_010 actualmente).
2. `tryLock` al inicio, `unlock` en `finally`.
3. Logs: start → pasos clave → done.
4. Respetar orden de dependencias (no consumir datos aún no semillados).
5. Documentar nuevas env vars en sección 4.

## 9. Extender Puntuación
- Nueva métrica: añadir columna/propiedad en entidad → actualizar cálculo en servicio correspondiente → crear E2E que verifique línea base y variante.
- Mantener @Unique en `FantasyPlayerPoints` (liga+player+game); si recalculas un periodo, limpiar registros antiguos o implementar upsert transaccional.

## 10. Comandos Clave
```bash
npm install               # dependencias
npm run start:dev          # servidor en watch
npm test                   # unit tests
npm run test:e2e           # e2e suite completa
npm run test:e2e -- scoring # filtrar (Jest) si config lo permite
```

## 11. Contribución del Agente
- Reutilizar DTOs existentes antes de crear nuevos.
- Si un cambio toca varias capas (entidad + servicio + controller + test), realizarlo en un solo commit cohesivo.
- Añadir pruebas E2E para cambios que afecten cálculos, integraciones o consistencia de datos.

## 12. Cuándo Solicitar Clarificación Humana
- Cambios en la semántica de scoring no reflejados en `fantasy_league.scoring_config`.
- Estructura devuelta por Leaguepedia cambia (campos nuevos/renombrados).
- Necesidad de migraciones complejas (no hay carpeta de migrations todavía).

---
Actualizar este archivo cuando: (a) se añade dominio nuevo, (b) cambia orden de cron jobs, (c) se introducen variables de entorno nuevas, (d) se altera la estrategia de scoring.

Fin de instrucciones.