import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Category,
  CategoryRepository,
  Genre,
  GenreRepository,
} from '../../../domain/categories/category.entity';

@Injectable()
export class PrismaGenreRepository implements GenreRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Genre[]> {
    return this.prisma.genre.findMany({ orderBy: { name: 'asc' } });
  }

  async findOrCreateByName(name: string): Promise<Genre> {
    return this.prisma.genre.upsert({ where: { name }, create: { name }, update: {} });
  }
}

@Injectable()
export class PrismaCategoryRepository implements CategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Category[]> {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  async findById(id: string): Promise<Category | null> {
    return this.prisma.category.findUnique({ where: { id } });
  }

  async create(name: string): Promise<Category> {
    return this.prisma.category.create({ data: { name } });
  }

  async update(id: string, name: string): Promise<Category> {
    return this.prisma.category.update({ where: { id }, data: { name } });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.category.delete({ where: { id } });
  }
}
