import { Test, TestingModule } from '@nestjs/testing';
import { EsportsLeagueController } from './esports_league.controller';
import { EsportsLeagueService } from './esports_league.service';

describe('EsportsLeagueController', () => {
  let controller: EsportsLeagueController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EsportsLeagueController],
      providers: [EsportsLeagueService],
    }).compile();

    controller = module.get<EsportsLeagueController>(EsportsLeagueController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
