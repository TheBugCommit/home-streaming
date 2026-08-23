import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ListGenresUseCase } from '../../../application/categories/manage-category.use-case';
import { ReadAccessGuard } from '../guards/read-access.guard';

@ApiTags('genres')
@ApiBearerAuth()
@Controller('genres')
@UseGuards(ReadAccessGuard)
export class GenresController {
  constructor(private readonly listGenres: ListGenresUseCase) {}

  @Get()
  async list() {
    return this.listGenres.execute();
  }
}
