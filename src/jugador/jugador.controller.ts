import { Controller, Post, Body, HttpCode, HttpStatus, Get, Query, Delete, Param, ParseIntPipe, Patch } from '@nestjs/common';
import { JugadorService } from './jugador.service';
import { CreateJugadorDto } from './dto/create-jugador.dto';
import { ListJugadorQueryDto } from './dto/list-jugador-query.dto';
import { UpdateJugadorDto } from './dto/update-jugador.dto';

@Controller('jugador')
export class JugadorController {
  constructor(private readonly jugadorService: JugadorService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateJugadorDto) {
    return this.jugadorService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListJugadorQueryDto) {
    return this.jugadorService.findAll(query);
  }

  @Get('deleted')
  findDeleted(@Query() query: Omit<ListJugadorQueryDto, 'includeDeleted'>) {
    return this.jugadorService.findDeleted(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.jugadorService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateJugadorDto) {
    return this.jugadorService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.jugadorService.remove(id);
  }

  @Delete(':id/hard')
  @HttpCode(HttpStatus.NO_CONTENT)
  hardDelete(@Param('id', ParseIntPipe) id: number) {
    return this.jugadorService.hardDelete(id);
  }

  @Patch(':id/reactivate')
  reactivate(@Param('id', ParseIntPipe) id: number) {
    return this.jugadorService.reactivate(id);
  }
}


