import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { JugadorService } from './jugador.service';
import { CreateFromRiotDto } from './dto/create-from-riot.dto';

@Controller('jugador')
export class JugadorController {
  constructor(private readonly jugadorService: JugadorService) {}

  @Post('from-riot')
  @HttpCode(HttpStatus.CREATED)
  createFromRiot(@Body() dto: CreateFromRiotDto) {
    return this.jugadorService.createFromRiot(
      dto.summonerName,
      dto.teamId,
      dto.regionId,
      dto.roleId,
    );
  }
}

