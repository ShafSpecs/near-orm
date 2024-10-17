# Near ORM

> A simple ORM for IndexedDB, inspired by [Prisma](https://www.prisma.io/)

- 🛠️ Zero dependencies
- 🔑 Fully-typed APIs
- 🔥 Minimalist package (~10KB uncompressed)
- 🚀 Asynchronous API
- 🧩 Schema definition
- 🔄 Query builder
- 🔒 Type-safe migrations

<div id="toc"></div>

## Table of Content

- [Installation](#installation)
- [Quick Start](#quick-start)
  - [Defining Schema](#defining-schema)
  - [Initialising ORM](#initialising-orm)
  - [CRUD Operations](#crud-operations)
    - [Create](#create)
    - [Update](#update)
    - [Delete](#delete)
    - [Read](#read)
  - [Querying](#querying)
  - [Migrations](#migrations)
  - [Transactions](#transactions)
  - [Seeding](#seeding)
  - [Events](#events)
  - [Going Raw](#going-raw)
  - [Metadata](#metadata)
- [API Documentation](#api-documentation)
  - [`init`](#init)
  - [`defineSchema`](#defineschema)
  - [`field`](#field)
  - [`models`](#models)
    - [`create`](#create-1)
    - [`update`](#update-1)
    - [`delete`](#delete-1)
    - [`findById`](#findbyid)
    - [`findAll`](#findall)
  - [`query`](#query)
  - [`QueryBuilder`](#querybuilder)
    - [`where`](#where)
    - [`orderBy`](#orderby)
    - [`offset`](#offset)
    - [`limit`](#limit)
    - [`run`](#run)
  - [`meta`](#meta)
  - [`transaction`](#transaction)
  - [`seed`](#seed)
  - [`migrate`](#migrate)
  - [`events`](#events-1)
    - [`on`](#on)
    - [`trigger`](#trigger)
  - [`raw`](#raw)
- [License](#license)
## Installation

```bash
npm install near-orm
```

## Quick Start

This section provides a quick overview of how to get started with NearORM.

### Defining Schema

Like Prisma, you define your database schema before initialising it. In NearORM, you do this using the [`defineSchema`](#defineschema) function.

```ts
import { defineSchema, field } from "near-orm";

const schema = defineSchema({
  users: {
    fields: {
      id: field({ type: 'string', primaryKey: true }),
      name: field({ type: 'string' }),
      email: field({ type: 'string', unique: true }),
      createdAt: field({ type: 'date', default: { type: 'now' } }),
      updatedAt: field({ type: 'date', default: { type: 'now' } }),
    }
  }
});
```

Each record within `defineSchema` is similar to a Prisma model/database table.

### Initialising ORM

```ts
import { ORM } from "near-orm";

const db = await ORM.init({ schema });
```

[`init`](#init) returns an `ORM` instance, which you can use to interact with your database.

### CRUD Operations

An `ORM` instance has methods for CRUD operations, allowing you to create, update, delete and fetch records from various tables.

The methods can be accessed via the `models` property of the `ORM` instance.

#### Create

```ts
await db.models.users.create({
  email: "john.doe@gmail.com",
  name: "John Doe",
  id: "1",
})
```

Fields with `default` defined will be automatically generated if not provided.

#### Update

```ts
await db.models.users.update('1', {
  name: "John Doe",
})
```

The `update` method takes in the record's primary key as the first argument, and the new data as the second argument.

#### Delete

```ts
await db.models.users.delete('1')
```

This deletes the record with the primary key `1`.

#### Read

To fetch a record, you can use the `findById` method.

```ts
const user = await db.models.users.findById('1')
```

This fetches the record with the primary key `1`.

You can also fetch all records from a table using the `findAll` method.

```ts
const users = await db.models.users.findAll()
```

This fetches all records from the `users` table.

[⬆️ Back to top](#toc)

### Querying

NearORM also supports querying for records that match a specific criteria via
a simple, and intuitive API

```ts
const users = await db
  .query('user')
  .where('name', 'startsWith', 'A')
  .orderBy('createdAt', 'desc')
  .run()
```

This fetches all records from the `users` table where the `name` field starts with `A`, and orders them by the `createdAt` field in descending order.

### Migrations

NearORM also supports migrations, allowing you to create, modify, and delete tables and fields seamlessly.

When creating an ORM, you can choose to handle your migrations automatically (recommended) via the `versioning` property

```ts
const db = await ORM.init({
  schema,
  versioning: { type: 'auto' }
})
```

Or handle it manually:

```ts
const db = await ORM.init({
  schema,
  versioning: { type: 'manual', version: 1 }
})
```

<!-- This will automatically create a `migrations` table in your database to keep track of your schema changes. -->
This would create an IndexedDB store with the version 1, tied to that specific schema. When your schema changes, a migration would need to be manually triggered via the `migrate` method

```ts
await db.migrate(2);
```

This would migrate the store to version 2.

You can also pass a `migrations` callback to the ORM's `init` that gets invoked whenever a new migration occurs, wether automatically or manually.

```ts
const db = await ORM.init({
  schema,
  versioning: { type: 'auto' },
  migrations: (oldVersion, newVersion, db) => {
    // Do something when a migration occurs
  }
})
```

### Transactions

Transactions are basically one of the core tenets of IndexedDB, it means that changes made to a store are isolated. If all goes well, the change is persisted to the store, else, a "rollback" occurs. Meaning that no change is made to the store.

NearORM provides a `transaction` API that allows to handle a transation **across multiple stores**. Ensuring that you can modify multiple tables in one transaction, and rollback if any error occurs (all or nothing).

```ts
await db.transaction(async (trx) => {
  await trx.users.create({ id: '1', name: 'Abbad', email: 'abbad@example.com' })
  await trx.posts.create({ id: '1', title: 'Hello World', content: 'This is my first post', authorId: '1' })
})
```

This will create a new transaction, adding the users and posts to the database. If any error occurs during the transaction, it will be rolled back, and no data will be persisted to the database.

<!-- TODO: a `rollback` method within `trx`? -->

The beauty of this is that you can perform any CRUD operation within the transaction, and it will ensure that all changes (or none) are persisted to the database.

Read more about IndexedDB transactions [here](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Basic_Terminology#transaction).

### Seeding

Seeding is the process of populating your database with data. This is useful for testing and ensuring that your database is populated with the correct data.

```ts
await db.seed({
  users: [
    { 
      id: '1',
      name: 'Abbad',
      email: 'abbad@example.com',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    { 
      id: '2',
      name: 'John Doe',
      email: 'john.doe@gmail.com',
      createdAt: new Date(),
      updatedAt: new Date()
    },
  ]
})
```

This would create two new records within your `users` table.

[⬆️ Back to top](#toc)

### Events

Events are a way to listen to changes within your database. This is useful for updating the UI or performing other actions when a record is created, updated, deleted, etc.

```ts
db.events.on('create', (storeName, data) => {
  console.log(`New record created in ${storeName}:`, data);
});

db.events.on('update', (storeName, data) => {
  console.log(`Record updated in ${storeName}:`, data);
});
```

This would log the new record created in the `users` store, and the record updated in the `users` store.

> It works with any storename, we are using `users` in the example above, but you can use any storename from your schema.

This can be used to create a pub/sub system, wether that includes UI updates or data synchronization, the possibilities are plenty.

### Going Raw

NearORM also ships a `raw` method that returns the udnerlying `IDBDatabase` instance for low-level or non-standard operations.

```ts
const idb = db.raw()
```

<!-- ### Backing Up

NearORM also allows data exports from your IndexedDB via the `backup` method. This returns a `BackupData` object representing your entire database.

```ts
const backup = await db.backup()
```

This would resemble an object like:

```ts
{
  users: [

  ]
}
```

This `BackupData` object can then be converted to a JSON string, and saved to your local file system. -->

### Metadata

NearORM also comes with a `meta` utility that returns a metadata overview of your database, including size, indexes and column count.

```ts
const meta = await db.meta()
```

This would return an object that resembles:

```ts
{ 
  version: 1,           // Current version of the database
  stores: {
    users: {
      recordCount: 4,   // Number of records (rows) in the store
      size: "579.00 B", // Size of the store
      indexes: [
        "email"
      ],                // List of indexes in the store
      keyRange: {
        lower: "1",     // Lower bound of the key range
        upper: "4"      // Upper bound of the key range
      },
      lastUpdated: null // Last updated timestamp
    }
  }
}
```

<!-- ## Using with Remix -->

If you find this package useful, please consider [sponsoring this project](https://github.com/sponsors/ShafSpecs)!

[⬆️ Back to top](#toc)

## API Documentation

Always remember that NearORM is built on top of IndexedDB, which utilises asynchronous APIs for all its operations.

### `init`

Initialises the ORM and returns an `ORM` instance.

**Signature:**

```ts
export type InitOptions<S extends Schema> = {
  schema: S;  // inferred from the schema you pass
  dbName?: string;
  versioning?: { type: "auto" } | { type: "manual"; version: number };
  migrations?: (
    oldVersion: number,
    newVersion: number,
    db: IDBDatabase
  ) => void;
  debug?: boolean;
};

init(options: InitOptions<S>): Promise<ORM<S>>
```

**Example:**

```ts
import { ORM, defineSchema } from 'near-orm'

const schema = defineSchema({ ... });

const db = await ORM.init({
  schema,
  dbName: 'my-database',
  debug: true,
  versioning: { type: 'auto' },
  migrations: (oldVersion, newVersion, db) => {
    console.log(`Migrating from ${oldVersion} to ${newVersion}`)
  }
});
```

[⬆️ Back to top](#toc)

### `defineSchema`

Allows you to create a NearORM-compliant schema.

**Signature:**

```ts
export function defineSchema<T extends Schema>(schema: T): T
```

**Example:**

```ts
import { defineSchema, field } from "near-orm";

const schema = defineSchema({ /* ... */ });
```

[⬆️ Back to top](#toc)

### `field`

Creates a column definition for your schema.

**Signature:**

```ts
type FieldType = "string" | "number" | "boolean" | "date";

type FieldDefinition<T extends FieldType> = {
  type: T;
  primaryKey?: boolean;
  unique?: boolean;
  default?: DefaultValueForType<T>;
};

function field(def: FieldDefinition<FieldType>): FieldDefinitionWithMeta<FieldType>
```

**Example:**

```ts
import { defineSchema, field } from "near-orm";

const schema = defineSchema({
  users: {
    fields: {
      id: field({ type: 'string', primaryKey: true }),
      name: field({ type: 'string' }),
      email: field({ type: 'string', unique: true }),
      createdAt: field({ type: 'date', default: { type: 'now' } }),
    }
  }
});
```

Depending on the `type` of your field, `default` supports:

- `"autoincrement"`: Increments the value of the field by one. The algorithm is handled by IndexedDB key generator.
- `"now"`: Sets the field to the current date and time.
- `"function"`: Allows you to pass a function that returns the default value (must be of the same type as your field).
- `"static"`: Allows you to pass a static value - like an enum (must be of the same type as your field).

Some field types, like `number`, support "autoincrement", whilst the rest don't.

[⬆️ Back to top](#toc)

### `models`

Model is basically a `Proxy` object that handles all the magic for CRUD operations.

#### `create`

Creates a new record in your table.

**Example:**

```ts
await db.models['name-of-your-table'].create({ /* ... */ })
```

It automatically infers the table names as well as the columns from your schema.

#### `update`

Updates one or more columns in a record.

**Example:**

```ts
await db.models['name-of-your-table'].update('id', { /* ... */ })
```

#### `delete`

Deletes a record from your table.

**Example:**

```ts
await db.models['name-of-your-table'].delete('id')
```

#### `findById`

Finds a record by its primary key.

**Example:**

```ts
const user = await db.models['name-of-your-table'].findById('id')
```

#### `findAll`

Gets all records in your table.

**Example:**

```ts
const users = await db.models['name-of-your-table'].findAll()
```

[⬆️ Back to top](#toc)

### `query`

Returns a [`QueryBuilder`](#querybuilder) that enables you to filter, sort and paginate records within a table.

**Signature:**

```ts
class ORM<S extends Schema> {
  // ...
  query<K extends keyof S>(storeName: K): QueryBuilder<S[K]["fields"]>
}
```

**Example:**

```ts
const users = await db
  .query('users')
  .where('name', 'startsWith', 'A')
  .orderBy('createdAt', 'desc')
  .run()
```

[⬆️ Back to top](#toc)

### `QueryBuilder`

A class that ships with methods for querying, and a `run` to execute your query

#### `where`

**Signature:**

```ts
type WhereOperator = "equals" | "startsWith" | "endsWith";

where(field: string, operator: WhereOperator, value: any): QueryBuilder
```

**Example:**

```ts
const filtered = await db
  .query('users')
  .where('name', 'startsWith', 'Z')
  .run();
```

#### `orderBy`

Allows you to sort your query results according to a particular column in ascending or descending order

**Signature:**

```ts
orderBy(field: string, order: "asc" | "desc"): QueryBuilder
```

**Example:**

```ts
const sorted = await db
  .query('users')
  .orderBy('name', 'desc')
  .run();
```

#### `offset`

Allows you to create a pagination utility, by allowing you to skip a certain number of fields

**Signature:**

```ts
offset(count: number): QueryBuilder
```

**Example:**

```ts
const threeOffset = await db
  .query('users')
  .offset(5) /* skip the first 5 records */
  .run();
```

#### `limit`

Goes hand-in-hand with the `offset` method, allowing you to limit the number of records returned.

**Signature:**

```ts
limit(count: number): QueryBuilder
```

**Example:**

```ts
const pageTwo = await db
  .query('users')
  .offset(10) /* skip the first 10 records */
  .limit(10) /* limit to 10 records */
  .run();
```

> [!NOTE]
> Re-using a method will override the previous one. Except for `where`, which would simply combine with the previous `where` clause to provide a more complex filtering mechanism.
>
> For example, calling `.limit()` twice will override the previous `limit` clause.
> ```ts
> const users = await db
>   .query('users')
>   .limit(10)
>   .limit(20) // This will override the previous limit of 10
>   .run();
> ```

#### `run`

Executes the query and returns the results.

**Signature:**

```ts
run(): Promise<T[]>
```

**Example:**

```ts
const users = await db
  .query('users')
  .where('name', 'startsWith', 'A')
  .orderBy('createdAt', 'desc')
  .offset(10)
  .limit(10)
  .run();
```

> Got an idea for a new query method? Feel free to open an [issue](https://github.com/ShafSpecs/near-orm/issues)

[⬆️ Back to top](#toc)

### `meta`

Returns a metadata overview of your database, including size, indexes and column count.

**Signature:**

```ts
meta(): Promise<Record<string, any>>
```

**Example:**

```ts
const meta = await db.meta()
```

[⬆️ Back to top](#toc)

### `transaction`

A utility method that allows you to perform a transaction across multiple stores.

**Example:**

```ts
await db.transaction(async (trx) => {
  await trx.users.create({ id: '1', name: 'Abbad', email: 'abbad@example.com' })
  await trx.posts.create({ id: '1', title: 'Hello World', content: 'This is my first post', authorId: '1' })
})
```

[⬆️ Back to top](#toc)

### `seed`

A method that allows you to seed your database with data.

**Example:**

```ts
await db.seed({
  users: [
    { id: '1', name: 'Abbad', email: 'abbad@example.com' },
    { id: '2', name: 'John Doe', email: 'john.doe@gmail.com' },
  ],
  posts: [
    { id: '1', title: 'Hello World', content: 'This is my first post', authorId: '1' },
    { id: '2', title: 'Hello World', content: 'This is my second post', authorId: '2' },
  ]
})
```

[⬆️ Back to top](#toc)

### `migrate`

A method that allows you to manually migrate your database to a new version. Re-applying the new schema to the database, and updating the version number.

> [!CAUTION]
> This throws an error if your versioning and migration is already handled automatically.

**Signature:**

```ts
migrate(version: number): Promise<void>
```

**Example:**

```ts
await db.migrate(2)
```

[⬆️ Back to top](#toc)

### `events`

Events are a way to listen to changes within your database. This is useful for updating the UI or performing other actions when a record is created, updated, deleted, etc.

#### `on`

Listens to events within your database.

**Signature:**

```ts
on(
  eventName: "create" | "update" | "delete",
  callback: (storeName: string, record: any) => void
): void
```

**Example:**

```ts
db.events.on('create', (storeName, data) => {
  console.log(`New record created in ${storeName}:`, data);
});
```

#### `trigger`

> [!WARNING]
> This is a low-level method that requires you to manually track events within your codebase. Do not use this method unless you know what you are doing!

Triggers an event within your database. This is useful for creating your own event system. Can be combined with `raw` to build your own ORM.

**Signature:**

```ts
trigger(
  eventName: "create" | "update" | "delete",
  storeName: string,
  record: any
): void
```

**Example:**

```ts
db.events.trigger('create', 'users', { id: '1', name: 'Abbad', email: 'abbad@example.com' })
```

[⬆️ Back to top](#toc)

### `raw`

Returns the underlying `IDBDatabase` instance for low-level or non-standard operations.

> [!WARNING]
> This returns the raw IndexedDB API, and does not go through the ORM's type system. This means that you can bypass all the ORM's type safety and integrity checks. Here be dragons!

**Signature:**

```ts
raw(): IDBDatabase
```

**Example:**

```ts
const idb = db.raw()
```

[⬆️ Back to top](#toc)

## License

MIT
