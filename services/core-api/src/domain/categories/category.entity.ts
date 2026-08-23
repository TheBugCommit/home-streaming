export interface Genre {
  id: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
}

export const GENRE_REPOSITORY = Symbol('GENRE_REPOSITORY');
export const CATEGORY_REPOSITORY = Symbol('CATEGORY_REPOSITORY');

export interface GenreRepository {
  findAll(): Promise<Genre[]>;
  findOrCreateByName(name: string): Promise<Genre>;
}

export interface CategoryRepository {
  findAll(): Promise<Category[]>;
  findById(id: string): Promise<Category | null>;
  create(name: string): Promise<Category>;
  update(id: string, name: string): Promise<Category>;
  delete(id: string): Promise<void>;
}
