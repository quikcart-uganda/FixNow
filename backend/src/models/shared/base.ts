import {
  Schema,
  type Document,
  type SchemaDefinition,
  type SchemaOptions,
} from 'mongoose';
import {
  DATA_ENVIRONMENTS,
  type DataEnvironment,
} from '../../constants/dataEnvironment.js';

export interface SoftDeleteFields {
  isDeleted: boolean;
  deletedAt?: Date | null;
  /**
   * Added by metadataPlugin / dataEnvironmentPlugin on every createSchema model.
   * Declared here so HydratedDocument&lt;T&gt; exposes the fields without Document&lt;unknown&gt;.
   */
  metadata?: Record<string, unknown> | null;
  dataEnvironment?: DataEnvironment;
}

export interface TimestampFields {
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Content environment — orthogonal to process APP_ENV.
 * Optional so domain interfaces remain compatible with `model&lt;IDomain&gt;(...)`.
 * The plugin still persists the field at runtime.
 */
export interface DataEnvironmentFields {
  dataEnvironment?: DataEnvironment;
}

export type BaseDocument = Document & SoftDeleteFields & TimestampFields & DataEnvironmentFields;

/** Canonical GeoJSON Point for 2dsphere indexes */
export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
  accuracyMeters?: number;
  label?: string;
}

/** Uganda administrative hierarchy (LC1-ready) */
export interface UgandaLocation {
  country: string;
  district?: string;
  city?: string;
  division?: string;
  subcounty?: string;
  parish?: string;
  village?: string;
  landmark?: string;
  geo?: GeoPoint;
}

export const geoPointSchema = new Schema<GeoPoint>(
  {
    type: { type: String, enum: ['Point'], default: 'Point', required: true },
    coordinates: {
      type: [Number],
      validate: {
        validator(v: number[]) {
          return (
            Array.isArray(v) &&
            v.length === 2 &&
            Number.isFinite(v[0]) &&
            Number.isFinite(v[1]) &&
            v[0]! >= -180 &&
            v[0]! <= 180 &&
            v[1]! >= -90 &&
            v[1]! <= 90
          );
        },
        message: 'coordinates must be [lng, lat]',
      },
    },
    accuracyMeters: { type: Number, min: 0 },
    label: { type: String, trim: true, maxlength: 200 },
  },
  { _id: false },
);

export const ugandaLocationSchema = new Schema<UgandaLocation>(
  {
    country: { type: String, default: 'UG', uppercase: true, trim: true, maxlength: 2 },
    district: { type: String, trim: true, maxlength: 100 },
    city: { type: String, trim: true, maxlength: 100 },
    division: { type: String, trim: true, maxlength: 100 },
    subcounty: { type: String, trim: true, maxlength: 100 },
    parish: { type: String, trim: true, maxlength: 100 },
    village: { type: String, trim: true, maxlength: 100 },
    landmark: { type: String, trim: true, maxlength: 200 },
    geo: { type: geoPointSchema },
  },
  { _id: false },
);

type SoftDeleteQuery = {
  getOptions?: () => { withDeleted?: boolean };
  getFilter?: () => { isDeleted?: unknown };
  where: (criteria: { isDeleted: boolean }) => unknown;
};

const softDeleteFieldsSchema = new Schema(
  {
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { _id: false },
);

const dataEnvironmentFieldsSchema = new Schema(
  {
    dataEnvironment: {
      type: String,
      enum: DATA_ENVIRONMENTS,
      default: 'production',
      index: true,
    },
  },
  { _id: false },
);

const metadataFieldsSchema = new Schema(
  {
    metadata: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

/**
 * Soft-delete query helper.
 * Bare `Schema` is the Mongoose plugin convention; createSchema still constructs
 * `Schema&lt;T&gt;` so InferSchemaType keeps DocType = T.
 */
export function softDeletePlugin(schema: Schema): void {
  schema.add(softDeleteFieldsSchema);

  const filterDeleted = function (this: SoftDeleteQuery) {
    const options = this.getOptions?.() ?? {};
    if (options.withDeleted) return;
    const filter = this.getFilter?.() ?? {};
    if (filter.isDeleted !== undefined) return;
    this.where({ isDeleted: false });
  };

  schema.pre('find', filterDeleted);
  schema.pre('findOne', filterDeleted);
  schema.pre('countDocuments', filterDeleted);
  schema.pre('findOneAndUpdate', filterDeleted);
  schema.pre('findOneAndDelete', filterDeleted);
}

/** Tags every marketplace/platform document with a data environment (default production). */
export function dataEnvironmentPlugin(schema: Schema): void {
  schema.add(dataEnvironmentFieldsSchema);
}

/** Optional provenance bag (Seed Platform, demo tags, feature flags). */
export function metadataPlugin(schema: Schema): void {
  if (!schema.path('metadata')) {
    schema.add(metadataFieldsSchema);
  }
}

export const baseSchemaOptions = {
  timestamps: true,
  versionKey: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
} as const;

/**
 * Create a typed Schema for FixNow models.
 *
 * Root cause of Render `Document&lt;unknown&gt;` failures (Mongoose 8.24 + TS 5.9):
 * `mongoose.model(name, schema)` resolves via
 * `Model&lt;InferSchemaType&lt;typeof schema&gt;&gt;`. InferSchemaType reads the Schema
 * DocType generic. The previous helper did `new Schema(definition)` (untyped)
 * and only asserted the return as `Schema&lt;T&gt;`, so DocType stayed unknown.
 *
 * Fix: construct `new Schema&lt;T&gt;(...)` so RawDocType/DocType are the domain
 * interface (e.g. IWallet). Domain interfaces already include SoftDelete + timestamps.
 */
export function createSchema<T extends object>(
  definition: SchemaDefinition<T>,
  options: SchemaOptions<T> = {},
) {
  const schema = new Schema<T>(definition, {
    timestamps: true,
    versionKey: false,
  });

  schema.set('toJSON', { virtuals: true });
  schema.set('toObject', { virtuals: true });

  if (options.collection) schema.set('collection', options.collection);
  if (options.autoIndex !== undefined) schema.set('autoIndex', options.autoIndex);
  if (options.minimize !== undefined) schema.set('minimize', options.minimize);
  if (options.strict !== undefined) schema.set('strict', options.strict);
  if (options.selectPopulatedPaths !== undefined) {
    schema.set('selectPopulatedPaths', options.selectPopulatedPaths);
  }

  softDeletePlugin(schema);
  dataEnvironmentPlugin(schema);
  metadataPlugin(schema);
  return schema;
}
