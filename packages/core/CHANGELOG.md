# 0.4.0

- Updated seeding! When seeding, you no longer need to include fields that have defaults.
- Added an `upsert` method. Create or update a record in one go.

## 0.3.0

- Seeding your database now triggers the `create` event for each record seeded.
- Added the `once` method to the event system, allowing you to listen to an event once.
- Added the `off` method to the event system, allowing you to unsubscribe from an event.
- Returns an unsubscribe function from the `on` method, allowing you to clean up effectively.
