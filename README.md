<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Descripción

Backend Fantasy LoL (NestJS + TypeORM) extendido para que una liga de fantasía abarque TODOS los splits/torneos de la liga core (season-wide), con:

- Pool de jugadores por `sourceLeagueId` / `sourceLeagueCode` (sin `source_tournament_id`).
- Puntos históricos y recálculo vectorizado.
- Jornadas (periodos de scoring) automáticas semanales (lunes-domingo) o personalizadas.
- Transferencias con validez temporal (`valid_from` / `valid_to`) y asignación de puntos al equipo dueño en el instante del game.
- Pago de cláusula con soporte de fecha efectiva retro/futura (`effectiveAt`) y autopromoción si el jugador era titular.
 - Configuración económica dinámica (`economic_config`) para amortiguación de valuaciones, recompensas por jornada, decay por inactividad y multiplicador de cláusula.
 - Distribución automática de recompensas al ejecutar compute de un periodo.
 - Ledger de presupuesto auditable para todas las transacciones económicas.
 - Endpoint de snapshot económico consolidado.

### Endpoints principales (fantasy)

Scoring:
- `POST /fantasy/scoring/backfill-all` `{ fantasyLeagueId }` → Inserta/actualiza todos los `fantasy_player_points` para todos los games de la core league (todas las splits).
- `POST /fantasy/scoring/auto-periods` `{ fantasyLeagueId, strategy? }` → Genera semanas (`Week N`) sin duplicar existentes.
- `POST /fantasy/scoring/compute` `{ fantasyLeagueId, periodId }` → Calcula puntos jugadores (periodo) y agrega `fantasy_team_points` aplicando lineup válido y penalización por lineup incompleto.

Valuation / Transferencias:
- `POST /fantasy/valuation/pay-clause` `{ fantasyLeagueId, playerId, toTeamId, effectiveAt? }` → Cierra slot antiguo (`valid_to = effectiveAt`) y crea slot nuevo `valid_from = effectiveAt`.
  - Si el slot original era titular y no `BENCH`, el nuevo se crea mismo slot + `starter=true` (autopromoción).
  - Si no, entra como BENCH.
- `POST /fantasy/valuation/recalc` `{ leagueId }` → Recalcula valuaciones con media móvil (últimos 5 games) de puntos.
Economía / Config:
- `PATCH /fantasy/leagues/:id/economic-config` Body parcial → Actualiza campos del JSON económico sin sobrescribir el resto.
- (Interno dentro de `compute`) Distribución de recompensas según ranking del periodo si `economic_config.rewards.enabled`.
Snapshot:
- `GET /fantasy/valuation/snapshot?leagueId=...` → Devuelve visión económica (equipos, presupuestos, top jugadores, totales, config vigente).

### Modelo temporal
`fantasy_roster_slot` mantiene la historia de pertenencia del jugador:
- `valid_from`: instante desde el cual el jugador pertenece a ese equipo.
- `valid_to`: null si sigue vigente. Al transferir se setea a la fecha efectiva, excluyendo games ≥ `valid_to`.
Durante `compute`, cada game se asigna al slot que estaba activo y starter en el momento exacto (`g.datetime_utc >= valid_from AND (valid_to IS NULL OR g.datetime_utc < valid_to)`).

### Performance
- Backfill y compute usan `INSERT ... SELECT` vectorizados con `ON CONFLICT` para evitar N queries.
- Índices añadidos:
  - `fantasy_roster_slot`: `(fantasyLeague, player, active)`, `(fantasyLeague, fantasyTeam, active)`, `(valid_from, valid_to)`.
  - `fantasy_player_points`: `(fantasyLeague, player)`.

### Estrategias futuras (ideas)
- Ajustar penalizaciones dinámicas por slots vacíos.
- Métricas avanzadas (KDA normalizado, etc.) y ponderaciones dinámicas.
- Cache / materialized views para ranking global.
 - Endpoint de listado de ledger con filtros (pendiente).

## Economic Config (`economic_config`)

Campo JSON almacenado en `fantasy_league.economic_config` que controla la economía. Ejemplo:

```json
{
  "valuation": {
    "windowGames": 5,
    "baseWeight": 1.0,
    "recentWeight": 1.3,
    "dampeningFactor": 0.15,   // amortigua subidas bruscas
    "inactivityDecayPerWeek": 0.05, // reduce valor si el jugador no disputa games
    "minValue": 50,
    "maxValue": 2000
  },
  "clause": { "multiplier": 1.35 },
  "rewards": {
    "enabled": true,
    "distribution": [500, 250, 125], // premios a 1º, 2º, 3º del periodo
    "type": "PERIOD_POINTS"          // (futuro) podría soportar otras métricas
  },
  "budget": { "initial": 5000 }
}
```

Notas:
1. Si un campo no se envía en el PATCH se mantiene el valor previo.
2. Los límites `minValue` / `maxValue` cortan el resultado final tras dampening & decay.
3. `inactivityDecayPerWeek` se aplica por semana sin games jugados en la ventana.

## Ledger Económico

Tabla (p.ej. `fantasy_budget_ledger`) que registra toda mutación de presupuesto:

- `id`
- `fantasy_league_id`
- `fantasy_team_id`
- `delta` (positivo ingreso / negativo gasto)
- `balance_after`
- `type` (ej: `CLAUSE_PAYMENT`, `REWARD_PERIOD`, `MANUAL_ADJUST` ...)
- `metadata` JSON (detalle: jugador, periodo, ranking, etc.)
- `created_at`

Fuentes actuales de entradas:
1. Pago de cláusula (`CLAUSE_PAYMENT`): gasto al equipo comprador (y opcional ingreso al vendedor si lo modelas más adelante).
2. Recompensas de scoring (`REWARD_PERIOD`).
3. Ajustes manuales (si agregas un servicio futuro que llame al BudgetService).

Ventajas: auditoría, posibilidad de reconstruir saldo, analytics económicas.

## Snapshot Económico

`GET /fantasy/valuation/snapshot?leagueId=...` devuelve (estructura aproximada):

```jsonc
{
  "leagueId": 1,
  "config": { ...economic_config vigente... },
  "teams": [
    { "id": 10, "name": "Team A", "budget": 4175, "rosterValue": 5630, "totalLedgerEntries": 8 },
    { "id": 11, "name": "Team B", "budget": 5025, "rosterValue": 4710, "totalLedgerEntries": 6 }
  ],
  "topPlayers": [ { "playerId": 123, "value": 940, "teamId": 10 }, ... ],
  "totals": { "leagueBudget": 9200, "leagueRosterValue": 10340 }
}
```

Uso principal: dashboards, validación rápida tras recálculos y monitoreo de distribución de valor.

## Flujo de Cómputo de un Periodo (Resumido)

1. `compute` calcula puntos jugadores (INSERT SELECT / UPSERT).
2. Agrega a nivel equipo considerando lineup válido y penalizaciones.
3. Inserta / actualiza `fantasy_team_points` del periodo.
4. Reparte recompensas (si config activa) y crea entradas en ledger.
5. (Opcional) disparar snapshot en el frontend tras la respuesta para refrescar panel económico.

## Tests E2E Relevantes

- Transfer temporal (`transfer-weeks.e2e-spec.ts`): valida asignación de puntos según `valid_from`/`valid_to`.
- Auto periodos (`scoring.e2e-spec.ts` / `auto-periods`): generación sin duplicados.
- Recompensas (`scoring-rewards.e2e-spec.ts`): distribución y tolerancia dataset.
- Clausula y autopromoción (`valuation-clause-pricing.e2e-spec.ts`).
- Config económica (`economic-config.e2e-spec.ts`).
- Snapshot (`snapshot.e2e-spec.ts`).

## Roadmap Breve

- Endpoint GET paginado del ledger con filtros (por tipo, fecha, equipo).
- Cálculo de clausula dinámico (por volatilidad / varianza reciente).
- Cache / materialized views para snapshot y ranking.
- Métricas avanzadas (KDA ponderado, participación en kills, etc.).
- Integración de marketplace / pujas avanzadas (ya hay entidades base de market/offer).

## Contribuir

1. Crear rama feature.
2. Añadir/actualizar tests E2E si cambias reglas económicas o scoring.
3. Ejecutar `npm run test:e2e` antes de PR.
4. Describir en PR cualquier ajuste a `economic_config` para actualizar docs.

## FAQ Rápido

**¿Por qué las recompensas no aparecen tras compute?**
Probablemente la distribución está desactivada (`rewards.enabled=false`) o el periodo no tiene puntos aún (sin games asociados).

**¿Por qué el valor de un jugador bajó sin jugar?**
Se aplica `inactivityDecayPerWeek` sobre su valuación al no registrar games recientes.

**¿Cómo limitar inflación de valuaciones?**
Usa `dampeningFactor` y `maxValue`; el dampening suaviza subidas ligadas a rachas cortas.

**¿Puedo recalcular todo desde cero?**
Sí: `backfill-all` (puntos) → `recalc` (valuaciones) → `compute` por cada periodo → snapshot.


## Instalación

```bash
$ npm install
```

## Ejecutar

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deploy

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Recursos

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Soporte

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Contacto

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## Licencia

MIT.
