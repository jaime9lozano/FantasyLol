import { WebSocketGateway, WebSocketServer, OnGatewayInit } from '@nestjs/websockets';
import { Server } from 'socket.io';

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
        if (!Number.isNaN(leagueId)) socket.join(`league:${leagueId}`);
      });
    });
  }
}
