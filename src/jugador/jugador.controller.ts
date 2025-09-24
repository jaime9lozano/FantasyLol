import { Controller, Post, Body, HttpCode, HttpStatus, Get, Query } from '@nestjs/common';
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

  
@Get('test-from-riot')
async testFromRiot(
  @Query('summonerName') summonerName: string,
  @Query('teamId') teamId: number,
  @Query('regionId') regionId: number,
  @Query('roleId') roleId: number,
): Promise<string> {
  try {
    const jugador = await this.jugadorService.createFromRiot(
      summonerName,
      Number(teamId),
      Number(regionId),
      Number(roleId),
    );
    return `Jugador creado: ${jugador.summoner_name} (${jugador.tier ?? 'Sin tier'})`;
  } catch (error) {
    return `Error: ${error.message}`;
  }
}


}

