# Fantasy LP API

API NestJS para Fantasy League of Legends.

## Seguridad y autenticación

Este proyecto implementa un bloque de seguridad opt‑in basado en JWT que no rompe los flujos locales ni los tests por defecto.

- Autenticación JWT
  - Infraestructura de `@nestjs/passport` + `passport-jwt` con `JwtStrategy`.
  - Guard global estilo Nest que respeta `@Public()` para rutas abiertas.
  - `OptionalJwtAuthGuard`: aplica JWT solo cuando `ENABLE_AUTH=true` (útil en dev/test).
  - `MembershipGuard`: valida pertenencia a liga/equipo (si el token trae `leagueId`/`teamId`).
  - Decorador `@User()` tipado para acceder a `req.user` y habilitar inferencia automática de parámetros.
  - Roles: soporte para `manager` y `admin` mediante `RolesGuard` + `@Roles()`.

- CORS y Helmet
  - Opt‑in por variables de entorno (`ENABLE_CORS`, `CORS_ORIGIN`, `ENABLE_HELMET`).

- Rate limiting (Throttler)
  - Configuración global por ENV (`RATE_LIMIT_TTL`, `RATE_LIMIT_LIMIT`).
  - En rutas de mercado se aplica un `@Throttle({ default: { limit, ttl } })` por endpoint para restricciones finas.

- WebSockets (Socket.IO)
  - Gateway de mercado emite eventos: `market.cycle.started`, `market.bid.placed`, `market.order.awarded`, `market.order.closed`.
  - Salas por liga (`league:<leagueId>`), con evento `join.league`.
  - Si `ENABLE_AUTH=true`, `join.league` requiere token y valida que el `leagueId` del token coincide con el solicitado.

## Variables de entorno

 Las principales variables usadas por el bloque de seguridad:

- `ENABLE_AUTH` (boolean): activa la autenticación JWT y los guards. Por defecto `false` en dev/test.
- `ENABLE_DEV_LOGIN` (boolean): permite `/auth/dev-login` en dev/test. No debe activarse en producción.
- `JWT_SECRET` (string): secreto para firmar JWT. Cambiar en producción.
- `ENABLE_CORS` (boolean): habilita CORS.
- `CORS_ORIGIN` (string): orígenes permitidos (coma). Usa `*` para permitir todos (solo en dev).
- `ENABLE_HELMET` (boolean): habilita Helmet.
- `RATE_LIMIT_TTL` (number): ventana global en segundos para Throttler.
- `RATE_LIMIT_LIMIT` (number): solicitudes permitidas por ventana (global).
 - `ALLOW_REGISTER_ADMIN` (boolean): si es `true`, el endpoint de registro permite crear usuarios con rol `admin`.

Ejemplo `.env` (desarrollo):

```
NODE_ENV=development

# DB
DATABASE_URL=postgresql://user:pass@host:port/db

# Seguridad
ENABLE_CORS=true
CORS_ORIGIN=*
ENABLE_HELMET=false
ENABLE_AUTH=false
ENABLE_DEV_LOGIN=true

# Rate limiting (global)
RATE_LIMIT_TTL=60
RATE_LIMIT_LIMIT=120

# JWT
JWT_SECRET=change-me-en-dev
```

`.env.test` ya contiene los toggles adecuados para la suite E2E (auth desactivado, dev login permitido, secreto de test, etc.).

## Login de desarrollo

Ruta: `POST /auth/dev-login` (marcada como `@Public()`). Solo usar en dev/test.

Body esperado:

```
{ "userId": 1, "teamId": 101, "leagueId": 2025, "name": "Dev" }
```

Respuesta:

```
{ "access_token": "<jwt>", "payload": { ... } }
```

Usa el token en HTTP como `Authorization: Bearer <jwt>` y en WS en el `join.league` (ver abajo).

## Registro y login de usuarios (managers/admin)

Rutas públicas:

- `POST /auth/register` con body `{ displayName, email, password, role? }`. El rol por defecto es `manager`. Para permitir registrar `admin`, establece `ALLOW_REGISTER_ADMIN=true` en el entorno.
- `POST /auth/login` con body `{ email, password }`.

Respuesta común:

```
{ "access_token": "<jwt>", "payload": { sub, name, role, leagueId: null, teamId: null } }
```

Para proteger rutas administrativas, usa `@UseGuards(RolesGuard)` y `@Roles('admin')`.

## Inferencia automática de parámetros (DX)

Si la petición va autenticada, el backend infiere automáticamente `teamId`/`leagueId` desde el token en varios endpoints, por ejemplo:

- Mercado:
  - `POST /fantasy/market/listing` (completa `ownerTeamId` y `fantasyLeagueId`).
  - `POST /fantasy/market/bid` (completa `bidderTeamId`).
  - `POST /fantasy/market/sell-to-league` (completa `teamId` y `fantasyLeagueId` si falta).
- Ofertas:
  - `POST /fantasy/offers` (completa `fromTeamId` y `fantasyLeagueId`).
- Valoración y scoring:
  - `POST /fantasy/valuation/pay-clause` y `POST /fantasy/valuation/recalc`.
  - `POST /fantasy/scoring/compute`, `backfill-all`, `auto-periods` (infieren `fantasyLeagueId`).
- Ledger:
  - `GET /fantasy/ledger` (si faltan `leagueId`/`teamId` en query, usa los del token; si no puede inferir `leagueId`, responde 400).

Esto reduce la superficie de error en el cliente y endurece la validación de pertenencia.

## Protección de rutas y alcance

- Guard global: aplica autenticación JWT salvo rutas anotadas con `@Public()`.
- `MembershipGuard` se aplica a rutas sensibles de lectura/escritura:
  - Mercado, Ledger, Valoración, Scoring, Roster/Compact, Summary.
- Rutas públicas explícitas para bootstrap en test/dev:
  - `POST /auth/dev-login`, `POST /fantasy/leagues`, `POST /fantasy/leagues/join`.

## WebSockets: unión por liga con token

- Unirse a una liga:
  - Evento: `join.league` con payload `{ leagueId, token?: 'Bearer <jwt>' }`.
  - Alternativamente, envía el token en `handshake.auth.token` o `Authorization` (header).
- Si `ENABLE_AUTH=true`, se validará que `payload.leagueId` coincide con el `leagueId` del token.

Eventos emitidos (solo ejemplo):
- `market.cycle.started` { cycleId, playerIds }
- `market.bid.placed` { orderId, teamId, amount }
- `market.order.awarded` { orderId, playerId, toTeamId, amount }
- `market.order.closed` { orderId }

## Rate limiting por endpoint (mercado)

Además del límite global, en el módulo de mercado se añaden límites finos:
- `POST /fantasy/market/listing`: 10/min
- `POST /fantasy/market/bid`: 30/min
- `POST /fantasy/market/close`: 5/min
- `POST /fantasy/market/cycle/start`: 5/min
- `POST /fantasy/market/cycle/rotate`: 5/min
- `POST /fantasy/market/sell-to-league`: 10/min

Estos valores son orientativos y ajustables según carga real.

## Tests E2E

- Suite general: se ejecuta con `ENABLE_AUTH=false` por defecto.
- Suite específica de auth: fuerza `ENABLE_AUTH=true` y valida 401/403 y WS unido con token.

Para ejecutar solo los tests de mercado (rápidos para validar ajustes):

```
npm run test:e2e -- test/market
```

Para ejecutar la suite completa:

```
npm run test:e2e
```

## Notas

- Este proyecto no usa migraciones formales; en el entorno de test se realizan `ALTER`/`CREATE` idempotentes para asegurar esquema mínimo.
- En producción, define correctamente `JWT_SECRET`, `CORS_ORIGIN` y no actives `ENABLE_DEV_LOGIN`.

---

Si necesitas añadir nuevas rutas protegidas o afinar los límites, sigue el patrón: anotar con `@UseGuards(MembershipGuard)`, usar `@User()` para inferir parámetros y documentar la ruta aquí.