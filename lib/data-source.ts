export enum DataSourceKind {
  Static = "static",
  Supabase = "supabase",
  Stub = "stub",
}

export type DataSourceUsage = {
  kind: DataSourceKind;
  persistent: boolean;
  productionSafe: boolean;
  description: string;
};

export const DATA_SOURCE_USAGE: Record<DataSourceKind, DataSourceUsage> = {
  [DataSourceKind.Static]: {
    kind: DataSourceKind.Static,
    persistent: true,
    productionSafe: true,
    description: "Versioned static data bundled with the app.",
  },
  [DataSourceKind.Supabase]: {
    kind: DataSourceKind.Supabase,
    persistent: true,
    productionSafe: true,
    description: "Canonical Supabase-backed storage following schema-v3.sql.",
  },
  [DataSourceKind.Stub]: {
    kind: DataSourceKind.Stub,
    persistent: false,
    productionSafe: false,
    description: "Non-durable local/test fixture data. Never return from public production routes unless explicitly feature-flagged.",
  },
};

export function describeDataSource(kind: DataSourceKind): DataSourceUsage {
  return DATA_SOURCE_USAGE[kind];
}

export function isPersistentDataSource(kind: DataSourceKind): boolean {
  return DATA_SOURCE_USAGE[kind].persistent;
}

export function isProductionSafeDataSource(kind: DataSourceKind): boolean {
  return DATA_SOURCE_USAGE[kind].productionSafe;
}

export function isStubStorageFeatureEnabled(): boolean {
  return process.env.FORAI_ENABLE_STUB_STORAGE === "true";
}

export function assertPublicProductionDataSource(kind: DataSourceKind): void {
  if (kind === DataSourceKind.Stub && process.env.NODE_ENV === "production" && !isStubStorageFeatureEnabled()) {
    throw new Error("Stub storage is disabled for public production routes. Set FORAI_ENABLE_STUB_STORAGE=true only for explicit non-production fixtures.");
  }
}
