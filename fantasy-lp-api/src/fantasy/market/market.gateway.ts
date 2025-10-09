import { WebSocketGateway, WebSocketServer, OnGatewayInit } from '@nestjs/websockets';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

@WebSocketGateway({ cors: { origin: '*' } })
export class MarketGateway implements OnGatewayInit {
  @WebSocketServer() server: Server;

  afterInit() {
    // noop
  }

  emitCycleStarted(leagueId: number, payload: { cycleId: number; playerIds: number[] }) {
    this.server.to(`league:${leagueId}`).emit('market.cycle.started', payload);
  }

  emitBidPlaced(leagueId: number, payload: { orderId: number; teamId: number; amount: number }) {
    this.server.to(`league:${leagueId}`).emit('market.bid.placed', payload);
  }

  emitOrderClosed(leagueId: number, payload: { orderId: number }) {
    this.server.to(`league:${leagueId}`).emit('market.order.closed', payload);
  }

  emitOrderAwarded(leagueId: number, payload: { orderId: number; playerId: number; toTeamId: number; amount: number }) {
    this.server.to(`league:${leagueId}`).emit('market.order.awarded', payload);
  }

  // Helper para unir a salas por liga
  // El cliente debe emitir un evento 'join.league' con { leagueId }
  bindJoinHandler() {
    this.server.on('connection', (socket) => {
      socket.on('join.league', (data: any) => {
        const leagueId = Number(data?.leagueId);
        if (Number.isNaN(leagueId)) return;
        const enableAuth = process.env.ENABLE_AUTH?.toLowerCase() === 'true';
        if (!enableAuth) {
          socket.join(`league:${leagueId}`);
          return;
        }
        try {
          const token = (data?.token as string) || (socket.handshake.auth?.token as string) || (socket.handshake.headers['authorization'] as string)?.replace(/^Bearer\s+/i,'');
          if (!token) return;
          const secret = process.env.JWT_SECRET || 'dev-secret';
          const payload = jwt.verify(token, secret) as any;
          if (payload?.leagueId && Number(payload.leagueId) !== leagueId) return;
          socket.join(`league:${leagueId}`);
        } catch {
          // invalid token: ignore join
        }
      });
    });
  }
}
