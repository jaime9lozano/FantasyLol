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
import { EsportsTournamentService } from './esports_tournament.service';
import { CreateEsportsTournamentDto } from './dto/create-esports_tournament.dto';
import { UpdateEsportsTournamentDto } from './dto/update-esports_tournament.dto';
import { ListEsportsTournamentQueryDto } from './dto/list-esports_tournament-query.dto';

@Controller('esports-tournament')
export class EsportsTournamentController {
  constructor(private readonly tournamentService: EsportsTournamentService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateEsportsTournamentDto) {
    return this.tournamentService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListEsportsTournamentQueryDto) {
    return this.tournamentService.findAll(query);
  }

  @Get('deleted')
  findDeleted(
    @Query() query: Omit<ListEsportsTournamentQueryDto, 'includeDeleted'>,
  ) {
    return this.tournamentService.findDeleted(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tournamentService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEsportsTournamentDto) {
    return this.tournamentService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.tournamentService.remove(id);
  }

  @Delete(':id/hard')
  @HttpCode(HttpStatus.NO_CONTENT)
  hardDelete(@Param('id') id: string) {
    return this.tournamentService.hardDelete(id);
  }

  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string) {
    return this.tournamentService.reactivate(id);
  }
}
