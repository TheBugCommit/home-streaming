import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CreateCategoryUseCase,
  DeleteCategoryUseCase,
  ListCategoriesUseCase,
  UpdateCategoryUseCase,
} from '../../../application/categories/manage-category.use-case';
import { ReadAccessGuard } from '../guards/read-access.guard';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { AdminRolesGuard } from '../guards/roles.guard';
import { CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto';

@ApiTags('categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly listCategories: ListCategoriesUseCase,
    private readonly createCategory: CreateCategoryUseCase,
    private readonly updateCategory: UpdateCategoryUseCase,
    private readonly deleteCategory: DeleteCategoryUseCase,
  ) {}

  @Get()
  @UseGuards(ReadAccessGuard)
  async list() {
    return this.listCategories.execute();
  }

  @Post()
  @UseGuards(JwtAuthGuard, AdminRolesGuard)
  async create(@Body() dto: CreateCategoryDto) {
    return this.createCategory.execute(dto.name);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, AdminRolesGuard)
  async update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.updateCategory.execute(id, dto.name);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminRolesGuard)
  async remove(@Param('id') id: string) {
    await this.deleteCategory.execute(id);
    return { status: 'ok' };
  }
}
