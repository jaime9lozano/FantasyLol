<h1 align="center">Fantasy LoL</h1>

Aplicación completa (full‑stack) para gestionar ligas de Fantasy de League of Legends.

Este repositorio contiene:

- Backend API (NestJS) en `fantasy-lp-api/`.
- Frontend (próximamente) en `fantasy-lp-web/`.

La idea: una única liga de fantasy que cubre toda la temporada (todos los splits/torneos) con mercado, pujas, transferencias, recompensas por jornada y un ledger económico auditable.

## Módulos principales

- Mercado con subastas diarias/rotación, pujas y cierres transaccionales.
- Scoring por periodos semanales y cómputo vectorizado de puntos.
- Valuación dinámica y pago de cláusulas con efecto retro/futuro.
- Ledger de presupuesto y snapshot económico.
- Autenticación con managers/admin, roles y WebSockets por liga.

## Estructura de carpetas

```
fantasy-lp-api/        # API de backend (NestJS + TypeORM)
fantasy-lp-web/        # Frontend (se añadirá)
```

Documentación técnica detallada:
- Backend: ver `fantasy-lp-api/README.md`.
- Frontend: cuando exista `fantasy-lp-web/`, tendrá su propio `README.md` con setup y decisiones técnicas.

## Cómo ejecutar localmente

1) Backend API:
   - Dirígete a `fantasy-lp-api/` y sigue su README (instalación, variables de entorno y comandos).

2) Frontend (pendiente):
   - Se documentará en `fantasy-lp-web/README.md`.

## Estado actual

- API con autenticación JWT (roles manager/admin), guards de pertenencia, sockets por liga, y endpoints de fantasy: mercado, ofertas, valoración, scoring, ledger y equipos.
- Suite E2E cubre los flujos principales.
