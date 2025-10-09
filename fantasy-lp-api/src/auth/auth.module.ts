import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { AuthController } from './auth.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FantasyManager } from '../fantasy/leagues/fantasy-manager.entity';
import { AuthService } from './auth.service';
import { FantasyTeam } from '../fantasy/teams/fantasy-team.entity';
import { FantasyLeague } from '../fantasy/leagues/fantasy-league.entity';

@Module({
  imports: [
  TypeOrmModule.forFeature([FantasyManager, FantasyTeam, FantasyLeague]),
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [JwtStrategy, AuthService],
  exports: [JwtModule, PassportModule, AuthService],
})
export class AuthModule {}
