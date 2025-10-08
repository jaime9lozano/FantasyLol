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
