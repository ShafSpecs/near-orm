import { describe, test, expect, beforeEach, afterEach, expectTypeOf } from 'vitest'
import { AtLeastOne, ORM, defineSchema, field } from '../packages/core/orm'

const schema = defineSchema({
  users: {
    fields: {
      id: field({ type: 'string', primaryKey: true }),
      name: field({ type: 'string' }),
      email: field({ type: 'string', unique: true }),
      createdAt: field({ type: 'date', default: { type: 'now' } }),
      updatedAt: field({ type: 'date', default: { type: 'now' } })
    }
  },
  posts: {
    fields: {
      id: field({ type: 'string', primaryKey: true }),
      title: field({ type: 'string' }),
      content: field({ type: 'string' }),
      authorId: field({ type: 'string' }),
      published: field({ type: 'boolean', default: { type: 'static', value: false } }),
      createdAt: field({ type: 'date', default: { type: 'now' } })
    }
  }
})

describe('Near ORM', () => {
  let db: ORM<typeof schema>

  beforeEach(async () => {
    db = await ORM.init({
      schema,
      dbName: 'test-db',
      versioning: { type: 'auto' }
    })
  })

  afterEach(async () => {
    const idb = db.raw()
    idb.close()
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('test-db')
      req.onsuccess = () => resolve()
    })
  })

  describe('Initialization', () => {
    test('should initialize with schema', () => {
      expect(db).toBeDefined()
      expect(db.models.users).toBeDefined()
      expect(db.models.posts).toBeDefined()
    })

    test('should create stores based on schema', async () => {
      const meta = await db.meta()
      expect(meta.stores).toHaveProperty('users')
      expect(meta.stores).toHaveProperty('posts')
    })
  })

  describe('CRUD Operations', () => {
    describe('Create', () => {
      test('should create a new user', async () => {
        const user = await db.models.users.create({
          id: '1',
          name: 'John Doe',
          email: 'john@example.com'
        })

        expect(user).toMatchObject({
          id: '1',
          name: 'John Doe',
          email: 'john@example.com'
        })
        expect(user.createdAt).toBeInstanceOf(Date)
        expect(user.updatedAt).toBeInstanceOf(Date)
      })

      test('should enforce unique constraints', async () => {
        await db.models.users.create({
          id: '1',
          name: 'John Doe',
          email: 'john@example.com'
        })

        await expect(db.models.users.create({
          id: '2',
          name: 'Jane Doe',
          email: 'john@example.com'
        })).rejects.toThrow()
      })
    })

    describe('Read', () => {
      beforeEach(async () => {
        await db.models.users.create({
          id: '1',
          name: 'John Doe',
          email: 'john@example.com'
        })
      })

      test('should find by id', async () => {
        const user = await db.models.users.findById('1')
        expect(user).toBeDefined()
        expect(user?.name).toBe('John Doe')
      })

      test('should return undefined for non-existent id', async () => {
        const user = await db.models.users.findById('999')
        expect(user).toBeUndefined()
      })


      test('should find all records', async () => {
        await db.models.users.create({
          id: '2',
          name: 'Jane Doe',
          email: 'jane@example.com'
        })

        const users = await db.models.users.findAll()
        expect(users).toHaveLength(2)
      })
    })

    describe('Update', () => {
      beforeEach(async () => {
        await db.models.users.create({
          id: '1',
          name: 'John Doe',
          email: 'john@example.com'
        })
      })

      test('should update a record', async () => {
        const updated = await db.models.users.update('1', {
          name: 'John Smith'
        })

        expect(updated.name).toBe('John Smith')
        expect(updated.email).toBe('john@example.com')
      })

      test('should maintain unique constraints on update', async () => {
        await db.models.users.create({
          id: '2',
          name: 'Jane Doe',
          email: 'jane@example.com'
        })

        await expect(db.models.users.update('2', {
          email: 'john@example.com'
        })).rejects.toThrow()
      })
    })

    describe('Delete', () => {
      beforeEach(async () => {
        await db.models.users.create({
          id: '1',
          name: 'John Doe',
          email: 'john@example.com'
        })
      })

      test('should delete a record', async () => {
        await db.models.users.delete('1')
        const user = await db.models.users.findById('1')
        expect(user).toBeUndefined()
      })
    })

    describe('Upsert', () => {
      test('should create new record if not found', async () => {
        const user = await db.models.users.upsert({
          where: { email: 'john@example.com' },
          create: {
            id: '1',
            name: 'John Doe',
            email: 'john@example.com'
          },
          update: {
            name: 'John Smith'
          }
        });
  
        expect(user).toMatchObject({
          id: '1',
          name: 'John Doe',
          email: 'john@example.com'
        });
        expect(user.createdAt).toBeInstanceOf(Date);
      });
  
      test('should update existing record if found', async () => {
        await db.models.users.create({
          id: '1',
          name: 'John Doe',
          email: 'john@example.com'
        });
  
        const updated = await db.models.users.upsert({
          where: { email: 'john@example.com' },
          create: {
            id: '2',
            name: 'New User',
            email: 'john@example.com'
          },
          update: {
            name: 'John Smith'
          }
        });
  
        expect(updated).toMatchObject({
          id: '1',
          name: 'John Smith',
          email: 'john@example.com'
        });
      });
  
      test('should respect unique constraints', async () => {
        await db.models.users.create({
          id: '1',
          name: 'John Doe',
          email: 'john@example.com'
        });
  
        await db.models.users.create({
          id: '2',
          name: 'Jane Doe',
          email: 'jane@example.com'
        });
  
        await expect(db.models.users.upsert({
          where: { id: '2' },
          create: {
            id: '2',
            name: 'New User',
            email: 'john@example.com' // This email is already taken
          },
          update: {
            email: 'john@example.com' // This email is already taken
          }
        })).rejects.toThrow();
      });

      test('should only allow unique/primary key fields in where clause', async () => {
        type WhereClause = Parameters<typeof db.models.users.upsert>[0]['where'];
        type ExpectedType = AtLeastOne<{
          id: string;
          email: string;
        }>;

        expectTypeOf<WhereClause>().toEqualTypeOf<ExpectedType>();

        await db.models.users.create({
          id: '1',
          name: 'John Doe',
          email: 'john@example.com'
        });

        const result = await db.models.users.upsert({
          where: { email: 'john@example.com' },
          create: {
            id: '2',
            name: 'New User',
            email: 'john@example.com'
          },
          update: {
            name: 'Updated Name'
          }
        });

        expect(result.id).toBe('1');
        expect(result.name).toBe('Updated Name');
        expect(result.email).toBe('john@example.com');
      });
    })
  })


  describe('Query Builder', () => {
    beforeEach(async () => {
      await db.models.users.create({
        id: '1',
        name: 'Alice',
        email: 'alice@example.com'
      })
      await db.models.users.create({
        id: '2',
        name: 'Bob',
        email: 'bob@example.com'
      })
      await db.models.users.create({
        id: '3',
        name: 'Charlie',
        email: 'charlie@example.com'
      })
    })

    test('should filter with where clause', async () => {
      const users = await db
        .query('users')
        .where('name', 'startsWith', 'A')
        .run()

      expect(users).toHaveLength(1)
      expect(users[0].name).toBe('Alice')
    })

    test('should order results', async () => {
      const users = await db
        .query('users')
        .orderBy('name', 'desc')
        .run()

      expect(users).toHaveLength(3)
      expect(users[0].name).toBe('Charlie')
      expect(users[2].name).toBe('Alice')
    })

    test('should support pagination', async () => {
      const users = await db
        .query('users')
        .orderBy('name', 'asc')
        .offset(1)
        .limit(1)
        .run()

      expect(users).toHaveLength(1)
      expect(users[0].name).toBe('Bob')
    })
  })

  describe('Transactions', () => {
    test('should handle successful transactions', async () => {
      await db.transaction(async (trx) => {
        await trx.users.create({
          id: '1',
          name: 'John',
          email: 'john@example.com'
        })
        await trx.posts.create({
          id: '1',
          title: 'Hello',
          content: 'World',
          authorId: '1'
        })
      })

      const user = await db.models.users.findById('1')
      const post = await db.models.posts.findById('1')
      expect(user).toBeDefined()
      expect(post).toBeDefined()
    })

    test('should rollback failed transactions', async () => {
      await expect(db.transaction(async (trx) => {
        await trx.users.create({
          id: '1',
          name: 'John',
          email: 'john@example.com'
        })
        // This should fail due to missing required fields
        await trx.posts.create({
          title: '1'
        } as any)

      })).rejects.toThrow()

      const user = await db.models.users.findById('1')
      const post = await db.models.posts.findById('1')
      expect(user).toBeUndefined()
      expect(post).toBeUndefined()

    })
  })

  describe('Events', () => {
    test('should emit create events', async () => {
      const events: any[] = []
      db.events.on('create', (store, data) => {
        events.push({ type: 'create', store, data })
      })

      await db.models.users.create({
        id: '1',
        name: 'John',
        email: 'john@example.com'
      })

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('create')
      expect(events[0].store).toBe('users')
      expect(events[0].data.name).toBe('John')
    })

    test('should support once listeners', async () => {
      const events: any[] = []
      db.events.once('create', (store, data) => {
        events.push({ type: 'create', store, data })
      })

      await db.models.users.create({
        id: '1',
        name: 'John',
        email: 'john@example.com'
      })

      await db.models.users.create({
        id: '2',
        name: 'Jane',
        email: 'jane@example.com'
      })

      expect(events).toHaveLength(1)
    })

    test('should support unsubscribing', async () => {
      const events: any[] = []
      const callback = (store: string, data: any) => {
        events.push({ type: 'create', store, data })
      }

      db.events.on('create', callback)
      db.events.off('create', callback)

      await db.models.users.create({
        id: '1',
        name: 'John',
        email: 'john@example.com'
      })

      expect(events).toHaveLength(0)
    })
  })

  describe('Seeding', () => {
    test('should seed data and trigger events', async () => {
      const events: any[] = []
      db.events.on('create', (store, data) => {
        events.push({ type: 'create', store, data })
      })

      await db.seed({
        users: [
          { id: '1', name: 'John', email: 'john@example.com', createdAt: new Date(), updatedAt: new Date() },
          { id: '2', name: 'Jane', email: 'jane@example.com', createdAt: new Date(), updatedAt: new Date() }
        ],

        posts: [
          { id: '1', title: 'Hello', content: 'World', authorId: '1', published: false, createdAt: new Date() }
        ]
      })

      const users = await db.models.users.findAll()
      const posts = await db.models.posts.findAll()

      expect(users).toHaveLength(2)
      expect(posts).toHaveLength(1)
      expect(events).toHaveLength(3)
    })

    test('should seed data with defaults if missing', async () => {
      await db.seed({
        users: [
          { id: '1', name: 'John', email: 'john@example.com' },
          { id: '2', name: 'Jane', email: 'jane@example.com', createdAt: new Date(), updatedAt: new Date() }
        ],
        posts: [
          { id: '1', title: 'Hello', content: 'World', authorId: '1' }
        ]
      })
    
      const users = await db.models.users.findAll()
      const posts = await db.models.posts.findAll()

      expect(users).toHaveLength(2)
      expect(users[0].createdAt).toBeInstanceOf(Date)
      expect(users[0].updatedAt).toBeInstanceOf(Date)

      expect(users[1].createdAt).toBeInstanceOf(Date)
      expect(users[1].updatedAt).toBeInstanceOf(Date)
    
      expect(posts).toHaveLength(1)
      expect(posts[0].createdAt).toBeInstanceOf(Date)
      expect(posts[0].published).toBe(false)
    }) 
  })
}) 