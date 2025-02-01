type AutoIncrementDefault = { type: "autoincrement" };
type NowDefault = { type: "now" };
type StaticDefault<T> = { type: "static"; value: T };
type FunctionDefault<T> = { type: "function"; fn: () => T };

type FieldType = "string" | "number" | "boolean" | "date";

type FieldDefinition<T extends FieldType> = {
  type: T;
  primaryKey?: boolean;
  unique?: boolean;
  default?: DefaultValueForType<T>;
};

const fieldSymbol = Symbol("__isField");

type FieldDefinitionWithMeta<
  T extends FieldType,
  HasDefault extends boolean,
  IsPrimaryKey extends boolean
> = FieldDefinition<T> & {
  [fieldSymbol]: true;
  hasDefault: HasDefault;
  isPrimaryKey: IsPrimaryKey;
};

type ObjectStoreSchema = {
  fields: {
    [fieldName: string]: FieldDefinitionWithMeta<FieldType, boolean, boolean>;
  };
};

export type Schema = {
  [storeName: string]: ObjectStoreSchema;
};

type InferFieldType<T extends FieldType> = T extends "string"
  ? string
  : T extends "number"
  ? number
  : T extends "boolean"
  ? boolean
  : T extends "date"
  ? Date
  : never;

type DefaultValueForType<T extends FieldType> = T extends "number"
  ? AutoIncrementDefault | StaticDefault<number> | FunctionDefault<number>
  : T extends "date"
  ? NowDefault | StaticDefault<Date> | FunctionDefault<Date>
  : T extends "string"
  ? StaticDefault<string> | FunctionDefault<string>
  : T extends "boolean"
  ? StaticDefault<boolean> | FunctionDefault<boolean>
  : never;

type InferModelShape<S extends ObjectStoreSchema> = {
  [K in keyof S["fields"]]: InferFieldType<S["fields"][K]["type"]>;
};

type PrimaryKey<T extends ObjectStoreSchema> = {
  [K in keyof T["fields"] as T["fields"][K]["isPrimaryKey"] extends true
    ? K
    : never]: InferFieldType<T["fields"][K]["type"]>;
};

type RequiredFields<T extends ObjectStoreSchema> = {
  [K in keyof T["fields"] as T["fields"][K]["hasDefault"] extends false
    ? K
    : never]: InferFieldType<T["fields"][K]["type"]>;
};

type OptionalFields<T extends ObjectStoreSchema> = {
  [K in keyof T["fields"] as T["fields"][K]["hasDefault"] extends true
    ? K
    : never]?: InferFieldType<T["fields"][K]["type"]>;
};

type CreateInput<T extends ObjectStoreSchema> = RequiredFields<T> &
  OptionalFields<T>;

type UpdateInput<T extends ObjectStoreSchema> = Partial<
  Omit<InferModelShape<T>, keyof PrimaryKey<T>>
>;

type IdType<T extends ObjectStoreSchema> = PrimaryKey<T>[keyof PrimaryKey<T>];

export type ModelMethods<T extends ObjectStoreSchema> = {
  create: (data: CreateInput<T>) => Promise<InferModelShape<T>>;
  findAll: () => Promise<InferModelShape<T>[]>;
  findById: (id: IdType<T>) => Promise<InferModelShape<T> | undefined>;
  update: (id: IdType<T>, data: UpdateInput<T>) => Promise<InferModelShape<T>>;
  delete: (id: IdType<T>) => Promise<void>;
};

type SeedInput<S extends Schema> = {
  [K in keyof S]?: CreateInput<S[K]>[];
};

type Versioning = { type: "auto" } | { type: "manual"; version: number };

type WhereOperator = "equals" | "startsWith" | "endsWith";
type OrderByOperator = "asc" | "desc";

class QueryBuilder<T> {
  private filters: { field: keyof T; operator: string; value: any }[] = [];
  private sortField?: keyof T;
  private sortOrder: OrderByOperator = "asc";
  private limitCount?: number;
  private offsetCount?: number;

  constructor(private db: IDBDatabase, private storeName: string) {}

  // Add a filter condition (where clause)
  where(field: keyof T, operator: WhereOperator, value: any) {
    this.filters.push({ field, operator, value });
    return this;
  }

  // Sort the results by a field
  orderBy(field: keyof T, order: OrderByOperator = "asc") {
    this.sortField = field;
    this.sortOrder = order;
    return this;
  }

  // Limit the number of results
  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  // Skip a number of results (pagination)
  offset(count: number) {
    this.offsetCount = count;
    return this;
  }

  async run(): Promise<T[]> {
    return new Promise<T[]>((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);

      const request = store.openCursor();
      const results: T[] = [];
      let skipped = 0;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

        if (cursor) {
          const record = cursor.value;

          if (this.applyFilters(record)) {
            // Pagination (skip and limit)
            if (this.offsetCount && skipped < this.offsetCount) {
              skipped++;
            } else {
              results.push(record);
              if (this.limitCount && results.length >= this.limitCount) {
                resolve(this.applySorting(results));
                return;
              }
            }
          }

          cursor.continue();
        } else {
          resolve(this.applySorting(results));
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  private applyFilters(record: T): boolean {
    return this.filters.every(({ field, operator, value }) => {
      const fieldValue = record[field];

      switch (operator) {
        case "equals":
          return fieldValue === value;
        case "startsWith":
          return typeof fieldValue === "string" && fieldValue.startsWith(value);
        case "endsWith":
          return typeof fieldValue === "string" && fieldValue.endsWith(value);
        default:
          return true;
      }
    });
  }

  private applySorting(results: T[]): T[] {
    if (!this.sortField) {
      return results; // No sorting needed
    }

    return results.sort((a, b) => {
      const aValue = a[this.sortField!];
      const bValue = b[this.sortField!];

      if (aValue === bValue) return 0;

      if (this.sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      }
      return aValue < bValue ? 1 : -1;
    });
  }
}

export type BackupData<S extends Schema> = {
  [K in keyof S]?: S[K]["fields"][];
};

export type EventCallback<S extends Schema> = (
  storeName: keyof S,
  record: any
) => void;

export type InitOptions<S extends Schema> = {
  schema: S;
  dbName?: string;
  versioning?: Versioning;
  migrations?: (
    oldVersion: number,
    newVersion: number,
    db: IDBDatabase
  ) => void;
  debug?: boolean;
};

export class ORM<S extends Schema> {
  private db!: IDBDatabase;
  private schema: S;
  private dbName: string;
  private versioning: InitOptions<S>["versioning"];
  private migrations?: InitOptions<S>["migrations"];
  private debug: (...args: any[]) => void;
  private currentVersion = 0;
  private eventHandlers: {
    [K in "create" | "update" | "delete"]: EventCallback<S>[];
  } = {
    create: [],
    update: [],
    delete: [],
  };

  #schemaLength = 0;

  private constructor(options: InitOptions<S>) {
    this.schema = options.schema;
    this.dbName = options.dbName || "defaultDB";
    this.versioning = options.versioning || { type: "auto" };
    this.migrations = options.migrations;
    // Custom loggers later on??
    this.debug = options.debug ? $debug : () => {};
  }

  /**
   * Initializes a new `ORM` instance.
   *
  //  * @param {InitOptions<S>} options - Configuration options for initializing the ORM, including the schema, database name, versioning strategy, migrations, and debug flag.
   * @param {S} options.schema - The schema of the database.
   * @param {string} [options.dbName] - The name of the database.
   * @param {Versioning} [options.versioning] - The versioning strategy for the database.
   * @param {(oldVersion: number, newVersion: number, db: IDBDatabase) => void} [options.migrations] - The callback for the manual version migration.
   * @param {boolean} [options.debug] - Wether to enable debug logs
   * @returns {Promise<ORM<S>>} A promise that resolves to the initialized ORM instance.
   */
  static async init<S extends Schema>(
    options: InitOptions<S>
  ): Promise<ORM<S>> {
    const instance = new ORM({ debug: true, ...options });
    await instance.initializeDatabase();
    return instance;
  }

  async migrate(targetVersion: number) {
    if (this.isAutoVersioning()) {
      throw new Error("Cannot manually migrate when using auto versioning");
    }
    await this.migrateDatabase(targetVersion);
  }

  async transaction(
    callback: (trx: { [K in keyof S]: ModelMethods<S[K]> }) => Promise<void>
  ): Promise<void> {
    const storeNames = Object.keys(this.schema);
    const transaction = this.db.transaction(storeNames, "readwrite");

    const trx = storeNames.reduce((acc, storeName) => {
      acc[storeName as keyof S] = this.createModelMethods(
        storeName as keyof S,
        transaction
      );
      return acc;
    }, {} as { [K in keyof S]: ModelMethods<S[K]> });

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        this.debug("Transaction committed successfully");
        resolve();
      };
      transaction.onerror = () => {
        this.debug("Transaction failed, rolling back");
        reject(transaction.error);
      };

      // Execute the user's callback and pass in the trx object
      callback(trx).catch((err) => {
        this.debug("Error in transaction callback:", err);
        transaction.abort();
        reject(err);
      });
    });
  }

  query<K extends keyof S>(storeName: K) {
    return new QueryBuilder<S[K]["fields"]>(this.db, storeName as string);
  }

  /**
   * Seed the database with mock data. This is useful for debugging purposes or creating
   * placeholder records.
   *
   * @param data
   */
  async seed(data: SeedInput<S>) {
    const transaction = this.db.transaction(
      Object.keys(data),
      "readwrite"
    );

    return new Promise<void>((resolve, reject) => {
      for (const storeName of Object.keys(data)) {
        const records = data[storeName as keyof S]!;
        const store = transaction.objectStore(storeName);

        for (const record of records) {
          const fullData = this.applyDefaults(storeName as keyof S, record);
          const request = store.add(fullData);
          
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            this.events.trigger("create", storeName, fullData);
          };
        }
      }

      transaction.oncomplete = () => {
        this.debug("Seed data applied successfully");
        resolve();
      };

      transaction.onerror = (event) => {
        this.debug("Transaction failed during seeding", event);
        reject(transaction.error);
      };
    });
  }

  /**
   * Returns metadata about your database, including size, records and indexes.
   */
  async meta(): Promise<{
    version: number;
    stores: {
      [K in keyof S]: {
        recordCount: number;
        size: string;
        indexes: string[];
        keyRange: { lower: any; upper: any } | null;
        lastUpdated: Date | null;
      };
    };
  }> {
    const transaction = this.db.transaction(
      Object.keys(this.schema),
      "readonly"
    );

    const result: {
      version: number;
      stores: {
        [K in keyof S]: {
          recordCount: number;
          // In bytes
          size: string;
          indexes: string[];
          keyRange: { lower: any; upper: any } | null;
          lastUpdated: Date | null;
        };
      };
    } = {
      version: this.db.version,
      stores: {} as any,
    };

    const storePromises = Object.keys(this.schema).map((storeName) => {
      return new Promise<void>((resolve, reject) => {
        const store = transaction.objectStore(storeName);
        const countRequest = store.count();
        const indexNames = Array.from(store.indexNames);
        let size = 0;
        let lower: any = null;
        let upper: any = null;
        let lastUpdated: Date | null = null;

        countRequest.onsuccess = () => {
          const recordCount = countRequest.result;

          const cursorRequest = store.openCursor();
          cursorRequest.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest<IDBCursorWithValue>)
              .result;
            if (cursor) {
              const storedObject = cursor.value;
              size += this.estimateSize(storedObject);

              if (lower === null || cursor.key < lower) lower = cursor.key;
              if (upper === null || cursor.key > upper) upper = cursor.key;

              // Check for lastUpdated field, if it exists
              if (
                "lastUpdated" in storedObject &&
                storedObject.lastUpdated instanceof Date
              ) {
                if (!lastUpdated || storedObject.lastUpdated > lastUpdated) {
                  lastUpdated = storedObject.lastUpdated;
                }
              }

              cursor.continue();
            } else {
              result.stores[storeName as keyof S] = {
                recordCount,
                size: formatBytes(size),
                indexes: indexNames,
                keyRange:
                  lower !== null && upper !== null ? { lower, upper } : null,
                lastUpdated,
              };
              resolve();
            }
          };
          cursorRequest.onerror = () => reject(cursorRequest.error);
        };
        countRequest.onerror = () => reject(countRequest.error);
      });
    });

    await Promise.all(storePromises);
    return result;
  }

  raw(): IDBDatabase {
    return this.db;
  }

  get events() {
    const self = this;
    return {
      on: (
        eventName: "create" | "update" | "delete",
        callback: EventCallback<S>
      ) => {
        if (!self.eventHandlers[eventName]) {
          self.eventHandlers[eventName] = [];
        }
        const index = self.eventHandlers[eventName].length;
        self.eventHandlers[eventName].push(callback);
        return () => {
          self.eventHandlers[eventName].splice(index, 1);
        };
      },
      trigger: (
        eventName: "create" | "update" | "delete",
        storeName: keyof Schema,
        record: any
      ) => {
        if (self.eventHandlers[eventName]) {
          for (const callback of self.eventHandlers[eventName]) {
            callback(storeName, record);
          }
        }
      },
      off(
        eventName: "create" | "update" | "delete",
        callback: EventCallback<S>
      ): void {
        if (!self.eventHandlers[eventName]) return;

        self.eventHandlers[eventName] = self.eventHandlers[eventName].filter(
          (handler) => handler !== callback
        );
      },
      once: (
        eventName: "create" | "update" | "delete",
        callback: EventCallback<S>
      ) => {
        const wrappedCallback = (storeName: keyof S, record: any) => {
          callback(storeName, record);
          self.events.off(eventName, wrappedCallback);
        };

        self.events.on(eventName, wrappedCallback);
      },
    };
  }

  get models(): { [K in keyof S]: ModelMethods<S[K]> } {
    return new Proxy({} as { [K in keyof S]: ModelMethods<S[K]> }, {
      get: (_, prop: string) => {
        if (prop in this.schema) {
          return this.createModelMethods(prop as keyof S);
        }
        throw new Error(`Model '${prop}' not found in schema`);
      },
    });
  }

  private estimateSize(obj: any): number {
    const jsonString = JSON.stringify(obj);
    return new Blob([jsonString]).size;
  }

  // Initialize IndexedDB and handle migrations
  private async initializeDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName);

      // Handle the `onupgradeneeded` event (for migrations and schema updates)
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;
        const newVersion = event.newVersion;

        this.currentVersion = oldVersion;

        // Remove this debug line!!!
        this.debug(
          `Database upgrade from version ${oldVersion} to ${newVersion}`
        );

        // Automatically create/upgrade stores based on schema
        this.applySchema(db);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.currentVersion = this.db.version;
        this.debug(`Database "${this.dbName}" opened successfully`);

        this.checkAndApplyMigrations().then(() => resolve(this));
      };

      request.onerror = () => reject(request.error);
    });
  }

  private async checkAndApplyMigrations() {
    const targetVersion = this.getTargetVersion();

    if (targetVersion > this.currentVersion) {
      await this.migrateDatabase(targetVersion);
    }
  }

  private getTargetVersion(): number {
    if (this.versioning && this.versioning.type === "auto") {
      return this.calculateSchemaVersion();
    }

    return this.versioning?.version || 0;
  }

  private calculateSchemaVersion(): number {
    let currentSchemaLength = 0;
    for (const storeName in this.schema) {
      currentSchemaLength += Object.keys(this.schema[storeName].fields).length;
    }
    const previousSchemaLength = this.#schemaLength;
    const currentVersion = this.currentVersion;
    this.#schemaLength = currentSchemaLength;
    if (previousSchemaLength !== currentSchemaLength) {
      this.debug("Detected schema change, applying schema...");
      this.currentVersion = currentVersion + 1;
      return this.currentVersion;
    }

    this.debug("No schema change detected");
    return currentVersion;
  }

  private isAutoVersioning(): boolean {
    return (this.versioning && this.versioning.type === "auto") ?? false;
  }

  private async migrateDatabase(targetVersion: number) {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, targetVersion);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;
        const newVersion = event.newVersion!;

        this.debug(
          `Migrating database from version ${oldVersion} to ${newVersion}`
        );

        this.applySchema(db);

        if (this.migrations) {
          this.migrations(oldVersion, newVersion, db);
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.currentVersion = this.db.version;
        this.debug(`Database migrated to version ${this.currentVersion}`);
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  // Apply schema changes to the IndexedDB
  private applySchema(db: IDBDatabase) {
    for (const storeName of Object.keys(this.schema)) {
      const storeSchema = this.schema[storeName];
      if (!db.objectStoreNames.contains(storeName)) {
        let primaryKeyField: string | undefined;

        for (const fieldName of Object.keys(storeSchema.fields)) {
          if (storeSchema.fields[fieldName].primaryKey) {
            primaryKeyField = fieldName;
            break;
          }
        }

        if (!primaryKeyField) {
          throw new Error(
            `No primary key defined for object store "${storeName}"`
          );
        }

        // Create object store with primary key
        const store = db.createObjectStore(storeName, {
          keyPath: primaryKeyField,
          autoIncrement:
            storeSchema.fields[primaryKeyField].default?.type ===
              "autoincrement" || false,
        });

        // Create indexes if defined
        for (const fieldName of Object.keys(storeSchema.fields)) {
          const fieldSchema = storeSchema.fields[fieldName];
          if (fieldSchema.unique) {
            store.createIndex(fieldName, fieldName, { unique: true });
          }
        }
      }
    }

    this.debug("Schema applied");
  }

  private createModelMethods<K extends keyof S>(
    storeName: K,
    __transaction: IDBTransaction = undefined!
  ): ModelMethods<S[K]> {
    return {
      create: async (
        data: CreateInput<S[K]>
      ): Promise<InferModelShape<S[K]>> => {
        return new Promise((resolve, reject) => {
          let transaction: IDBTransaction;
          if (__transaction) {
            transaction = __transaction;
          } else {
            transaction = this.db.transaction(
              [storeName as string],
              "readwrite"
            );
          }

          const store = transaction.objectStore(storeName as string);
          const fullData = this.applyDefaults(storeName, data);

          const primaryKeyField = Object.keys(
            this.schema[storeName].fields
          ).find(
            (fieldName) => this.schema[storeName].fields[fieldName].primaryKey
          );

          if (!primaryKeyField) {
            throw new Error(
              `No primary key defined for object store "${storeName as string}"`
            );
          }

          const request = store.add(fullData);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const id = request.result; // In case of autoincrement, this is the generated ID
            const resultData = { ...fullData, [primaryKeyField]: id };
            this.events.trigger("create", storeName as string, resultData);
            resolve(resultData as InferModelShape<S[K]>);
          };
        });
      },

      findAll: async (): Promise<InferModelShape<S[K]>[]> => {
        return new Promise((resolve, reject) => {
          let transaction: IDBTransaction;
          if (__transaction) {
            transaction = __transaction;
          } else {
            transaction = this.db.transaction(
              [storeName as string],
              "readonly"
            );
          }
          const store = transaction.objectStore(storeName as string);
          const request = store.getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
      },

      findById: async (
        id: IdType<S[K]>
      ): Promise<InferModelShape<S[K]> | undefined> => {
        return new Promise((resolve, reject) => {
          let transaction: IDBTransaction;
          if (__transaction) {
            transaction = __transaction;
          } else {
            transaction = this.db.transaction(
              [storeName as string],
              "readonly"
            );
          }
          const store = transaction.objectStore(storeName as string);

          if (typeof id === "boolean") {
            reject(
              new Error("Invalid ID type: boolean is not a valid IDBValidKey")
            );
            return;
          }

          const request = store.get(id as IDBValidKey);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result || undefined);
        });
      },

      update: async (
        id: IdType<S[K]>,
        data: UpdateInput<S[K]>
      ): Promise<InferModelShape<S[K]>> => {
        return new Promise((resolve, reject) => {
          let transaction: IDBTransaction;
          if (__transaction) {
            transaction = __transaction;
          } else {
            transaction = this.db.transaction(
              [storeName as string],
              "readwrite"
            );
          }
          const store = transaction.objectStore(storeName as string);

          if (typeof id === "boolean") {
            reject(
              new Error("Invalid ID type: boolean is not a valid IDBValidKey")
            );
            return;
          }

          const getRequest = store.get(id as IDBValidKey);
          getRequest.onerror = () => reject(getRequest.error);
          getRequest.onsuccess = () => {
            if (!getRequest.result) {
              reject(new Error(`Record with id ${id} not found`));
              return;
            }
            const updatedData = { ...getRequest.result, ...data };
            const putRequest = store.put(updatedData);
            putRequest.onerror = () => reject(putRequest.error);
            putRequest.onsuccess = () => {
              const resultData = { ...updatedData };
              this.events.trigger("update", storeName as string, resultData);
              resolve(resultData as InferModelShape<S[K]>);
            };
          };
        });
      },

      delete: async (id: IdType<S[K]>): Promise<void> => {
        return new Promise((resolve, reject) => {
          let transaction: IDBTransaction;
          if (__transaction) {
            transaction = __transaction;
          } else {
            transaction = this.db.transaction(
              [storeName as string],
              "readwrite"
            );
          }
          const store = transaction.objectStore(storeName as string);
          if (typeof id === "boolean") {
            reject(
              new Error("Invalid ID type: boolean is not a valid IDBValidKey")
            );
            return;
          }

          const request = store.delete(id as IDBValidKey);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            this.events.trigger("delete", storeName as string, id);
            resolve();
          };
        });
      },
    };
  }

  private applyDefaults<K extends keyof S>(
    storeName: K,
    data: CreateInput<S[K]>
  ): InferModelShape<S[K]> {
    const storeSchema = this.schema[storeName];
    const result = { ...data } as unknown as InferModelShape<S[K]>;

    for (const [fieldName, fieldSchema] of Object.entries(storeSchema.fields)) {
      if (fieldName in data) continue;

      if (fieldSchema.default) {
        const key = fieldName as keyof InferModelShape<S[K]>;
        switch (fieldSchema.default.type) {
          case "now":
            result[key] = new Date() as InferModelShape<S[K]>[typeof key];
            break;
          case "static":
            result[key] = fieldSchema.default.value as InferModelShape<
              S[K]
            >[typeof key];
            break;
          case "function":
            result[key] = fieldSchema.default.fn() as InferModelShape<
              S[K]
            >[typeof key];
            break;
          // 'autoincrement' is handled by IndexedDB, so we don't need to do anything here
        }
      }
    }

    return result;
  }
}

/**
 * Defines a field with metadata based on the provided field definition.
 * @param definition The field definition including type, primary key, unique, and default value.
 * @returns The field definition with metadata inserted.
 * @throws Error if the primary key type is not "number", "string", or "date", or if an invalid default type is provided.
 */
export function field<
  T extends FieldType,
  U extends DefaultValueForType<T> | undefined = undefined,
  V extends boolean | undefined = undefined
>(
  definition: FieldDefinition<T> &
    (U extends undefined ? unknown : { default: U }) &
    (V extends undefined ? unknown : { primaryKey: V })
): FieldDefinitionWithMeta<
  T,
  U extends undefined ? false : true,
  V extends undefined ? false : true
> {
  if (
    definition.primaryKey &&
    !["number", "string", "date"].includes(definition.type)
  ) {
    throw new Error(
      `Primary key must be of type "number", "string" or "date", got "${definition.type}"`
    );
  }

  // Runtime checks for default values
  if (definition.default) {
    switch (definition.type) {
      case "number":
        if (
          !["autoincrement", "static", "function"].includes(
            definition.default.type
          )
        ) {
          throw new Error(
            `Invalid default type for number field: ${definition.default.type}`
          );
        }
        break;
      case "date":
        if (!["now", "static", "function"].includes(definition.default.type)) {
          throw new Error(
            `Invalid default type for date field: ${definition.default.type}`
          );
        }
        break;
      case "string":
      case "boolean":
        if (!["static", "function"].includes(definition.default.type)) {
          throw new Error(
            `Invalid default type for ${definition.type} field: ${definition.default.type}`
          );
        }
        break;
    }
  }

  const hasDefault = !!definition.default;
  const isPrimaryKey = !!definition.primaryKey;

  return Object.assign(definition, {
    [fieldSymbol]: true as const,
    hasDefault,
    isPrimaryKey,
  }) as unknown as FieldDefinitionWithMeta<
    T,
    U extends undefined ? false : true,
    V extends undefined ? false : true
  >;
}

/**
 * Utility to define a valid schema for the database.
 *
 * @param schema The schema to be validated and converted into a valid schema.
 * @returns The validated schema.
 */
export function defineSchema<T extends Schema>(schema: T): T {
  for (const [storeName, store] of Object.entries(schema)) {
    for (const [fieldName, fieldDef] of Object.entries(store.fields)) {
      if (!(fieldSymbol in fieldDef) || fieldDef[fieldSymbol] !== true) {
        throw new Error(
          `Field "${fieldName}" in store "${storeName}" must be created using the \`field\` utility function.`
        );
      }
    }
  }

  return schema;
}

const $debug = (...args: any[]) => {
  if (typeof self !== "undefined" || typeof window === "undefined") {
    console.log(...args);
  }
};

const formatBytes = (bytes: number) => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let l = 0;
  let _bytes = bytes;
  while (_bytes >= 1024 && l < units.length - 1) {
    _bytes /= 1024;
    l++;
  }
  return `${_bytes.toFixed(2)} ${units[l]}`;
};
