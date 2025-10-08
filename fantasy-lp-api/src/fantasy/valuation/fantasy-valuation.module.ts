// src/fantasy/valuation/fantasy-valuation.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ValuationController } from './valuation.controller';
import { ValuationSnapshotController } from './valuation-snapshot.controller';
import { BudgetService } from '../economy/budget.service';
import { FantasyBudgetLedger } from '../economy/fantasy-budget-ledger.entity';
import { ValuationService } from './valuation.service';
import { FantasyPlayerValuation } from './fantasy-player-valuation.entity';
import { FantasyRosterSlot } from '../teams/fantasy-roster-slot.entity';
import { FantasyTeam } from '../teams/fantasy-team.entity';
import { FantasyLeague } from '../leagues/fantasy-league.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FantasyPlayerValuation, FantasyRosterSlot, FantasyTeam, FantasyLeague, FantasyBudgetLedger])],
  controllers: [ValuationController, ValuationSnapshotController],
  providers: [ValuationService, BudgetService],
  exports: [TypeOrmModule, ValuationService, BudgetService],
})
export class FantasyValuationModule {}