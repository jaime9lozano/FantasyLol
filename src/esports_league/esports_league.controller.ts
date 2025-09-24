import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { EsportsLeagueService } from './esports_league.service';
import { CreateEsportsLeagueDto } from './dto/create-esports_league.dto';
import { UpdateEsportsLeagueDto } from './dto/update-esports_league.dto';
import { ListEsportsLeagueQueryDto } from './dto/list-esports_league-query.dto';

@Controller('esports-league')
export class EsportsLeagueController {
  constructor(private readonly leagueService: EsportsLeagueService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateEsportsLeagueDto) {
    return this.leagueService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListEsportsLeagueQueryDto) {
    return this.leagueService.findAll(query);
  }

  @Get('deleted')
  findDeleted(@Query() query: Omit<ListEsportsLeagueQueryDto, 'includeDeleted'>) {
    return this.leagueService.findDeleted(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.leagueService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEsportsLeagueDto) {
    return this.leagueService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.leagueService.remove(id);
  }

  @Delete(':id/hard')
  @HttpCode(HttpStatus.NO_CONTENT)
  hardDelete(@Param('id') id: string) {
    return this.leagueService.hardDelete(id);
  }

  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string) {
    return this.leagueService.reactivate(id);
  }
}
