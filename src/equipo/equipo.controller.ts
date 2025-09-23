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
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { EquipoService } from './equipo.service';
import { CreateEquipoDto } from './dto/create-equipo.dto';
import { UpdateEquipoDto } from './dto/update-equipo.dto';
import { ListEquipoQueryDto } from './dto/list-equipo-query.dto';

@Controller('equipo')
export class EquipoController {
  constructor(private readonly equipoService: EquipoService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateEquipoDto) {
    return this.equipoService.create(dto);
  }

  @Get('region/:regionId')
  findByRegion(@Param('regionId', ParseIntPipe) regionId: number) {
    return this.equipoService.findByRegion(regionId);
  }


  @Get()
  findAll(@Query() query: ListEquipoQueryDto) {
    return this.equipoService.findAll(query);
  }

  @Get('deleted')
  findDeleted(@Query() query: Omit<ListEquipoQueryDto, 'includeDeleted'>) {
    return this.equipoService.findDeleted(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.equipoService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEquipoDto,
  ) {
    return this.equipoService.update(id, dto);
  }

  @Patch(':id/region/:regionId')
  changeRegion(
    @Param('id', ParseIntPipe) id: number,
    @Param('regionId', ParseIntPipe) regionId: number,
  ) {
    return this.equipoService.changeRegion(id, regionId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.equipoService.remove(id);
  }

  @Delete(':id/hard')
  @HttpCode(HttpStatus.NO_CONTENT)
  hardDelete(@Param('id', ParseIntPipe) id: number) {
    return this.equipoService.hardDelete(id);
  }

  @Patch(':id/reactivate')
  reactivate(@Param('id', ParseIntPipe) id: number) {
    return this.equipoService.reactivate(id);
  }
}
