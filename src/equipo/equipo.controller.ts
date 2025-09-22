import { Controller, Get, Post, Patch, Delete, Param, Body, HttpCode, HttpStatus, ParseIntPipe } from '@nestjs/common';
import { EquipoService } from './equipo.service';
import { CreateEquipoDto } from './dto/create-equipo.dto';
import { UpdateEquipoDto } from './dto/update-equipo.dto';

@Controller('equipo')
export class EquipoController {
  constructor(private readonly equipoService: EquipoService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createEquipoDto: CreateEquipoDto) {
    return this.equipoService.create(createEquipoDto);
  }

  @Get()
  findAll() {
    return this.equipoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.equipoService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() updateEquipoDto: UpdateEquipoDto) {
    return this.equipoService.update(+id, updateEquipoDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.equipoService.remove(+id);
  }

  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string) {
    return this.equipoService.reactivate(+id);
  }
}
