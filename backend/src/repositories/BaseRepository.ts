import type { FilterQuery, Model, UpdateQuery } from 'mongoose';

/**
 * Thin repository base. Domain services should depend on repositories,
 * not on Mongoose models directly, so persistence can evolve independently.
 */
export abstract class BaseRepository<T> {
  constructor(protected readonly model: Model<T>) {}

  create(data: Partial<T>) {
    return this.model.create(data as T);
  }

  findById(id: string) {
    return this.model.findById(id);
  }

  findOne(filter: FilterQuery<T>) {
    return this.model.findOne(filter);
  }

  find(
    filter: FilterQuery<T> = {},
    options: { limit?: number; skip?: number; sort?: Record<string, 1 | -1> } = {},
  ) {
    let query = this.model.find(filter);
    if (options.sort) query = query.sort(options.sort);
    if (options.skip) query = query.skip(options.skip);
    if (options.limit) query = query.limit(options.limit);
    return query;
  }

  updateById(id: string, update: UpdateQuery<T>) {
    return this.model.findByIdAndUpdate(id, update, { new: true });
  }

  deleteById(id: string) {
    return this.model.findByIdAndDelete(id);
  }

  count(filter: FilterQuery<T> = {}) {
    return this.model.countDocuments(filter);
  }
}
