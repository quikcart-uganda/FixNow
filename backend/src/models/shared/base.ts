import { Schema, type Document, type SchemaDefinition, type SchemaOptions } from 'mongoose';
import {
  DATA_ENVIRONMENTS,
  type DataEnvironment,
} from '../../constants/dataEnvironment.js';

export interface SoftDeleteFields {
  isDeleted: boolean;
  deletedAt?: Date | null;
}

export interface TimestampFields {
  createdAt: Date;
  updatedAt: Date;
}

/** Content environment — orthogonal to process APP_ENV. */
export interface DataEnvironmentFields {
  dataEnvironment: DataEnvironment;
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

export function softDeletePlugin(schema: Schema): void {
  schema.add({
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null, index: true },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filterDeleted = function (this: any) {
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
  schema.add({
    dataEnvironment: {
      type: String,
      enum: DATA_ENVIRONMENTS,
      default: 'production',
      index: true,
    },
  });
}

/** Optional provenance bag (Seed Platform, demo tags, feature flags). */
export function metadataPlugin(schema: Schema): void {
  if (!schema.path('metadata')) {
    schema.add({
      metadata: { type: Schema.Types.Mixed },
    });
  }
}

export const baseSchemaOptions = {
  timestamps: true,
  versionKey: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
} as const;

export function createSchema<T>(definition: SchemaDefinition, options: SchemaOptions = {}) {
  const schema = new Schema(
    definition,
    {
      timestamps: true,
      versionKey: false,
      toJSON: { virtuals: true },
      toObject: { virtuals: true },
      ...options,
    },
  );
  softDeletePlugin(schema);
  dataEnvironmentPlugin(schema);
  metadataPlugin(schema);
  return schema as Schema<T & SoftDeleteFields & TimestampFields & DataEnvironmentFields>;
}
