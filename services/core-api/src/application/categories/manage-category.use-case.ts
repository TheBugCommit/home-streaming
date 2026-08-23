import { Inject, Injectable } from '@nestjs/common';
import {
  CATEGORY_REPOSITORY,
  Category,
  CategoryRepository,
  GENRE_REPOSITORY,
  Genre,
  GenreRepository,
} from '../../domain/categories/category.entity';

@Injectable()
export class ListGenresUseCase {
  constructor(@Inject(GENRE_REPOSITORY) private readonly genres: GenreRepository) {}

  async execute(): Promise<Genre[]> {
    return this.genres.findAll();
  }
}

@Injectable()
export class ListCategoriesUseCase {
  constructor(@Inject(CATEGORY_REPOSITORY) private readonly categories: CategoryRepository) {}

  async execute(): Promise<Category[]> {
    return this.categories.findAll();
  }
}

@Injectable()
export class CreateCategoryUseCase {
  constructor(@Inject(CATEGORY_REPOSITORY) private readonly categories: CategoryRepository) {}

  async execute(name: string): Promise<Category> {
    return this.categories.create(name);
  }
}

@Injectable()
export class UpdateCategoryUseCase {
  constructor(@Inject(CATEGORY_REPOSITORY) private readonly categories: CategoryRepository) {}

  async execute(id: string, name: string): Promise<Category> {
    return this.categories.update(id, name);
  }
}

@Injectable()
export class DeleteCategoryUseCase {
  constructor(@Inject(CATEGORY_REPOSITORY) private readonly categories: CategoryRepository) {}

  async execute(id: string): Promise<void> {
    await this.categories.delete(id);
  }
}
