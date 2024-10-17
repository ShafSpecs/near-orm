# Near ORM

> A simple ORM for IndexedDB, inspired by [Prisma](https://www.prisma.io/)

- 🛠️ Zero dependencies
- 🔑 Fully-typed APIs
- 🔥 Minimalist package (~10KB uncompressed)
- 🚀 Asynchronous API
- 🧩 Schema definition
- 🔄 Query builder
- 🔒 Type-safe migrations

## Installation

```bash
npm install near-orm
```

<!-- ## Usage

### Define Schema

Like Prisma, you define your database schema before initialising it. In NearORM, you do this using the `defineSchema` function.

```ts
import { defineSchema } from "near-orm";

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
}); -->
