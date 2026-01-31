import "dotenv/config";
import path from "path";

// import express, { Request, Response } from 'express';

import { BackendApp } from "./app";
import { AppController, AuthController } from "./controllers";
import { User, registerEntities } from "./entities";
import { diContainer } from "./lib/di";
import { DB, Migrations } from "./lib/db";
import { AuthService } from "./lib/auth";

// const app = express();
// const PORT = process.env.PORT || 3000;

// // Middleware
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// // Routes
// app.get('/', (req: Request, res: Response) => {
//   res.json({ message: 'Hello from Express with TypeScript!' });
// });

// app.get('/health', (req: Request, res: Response) => {
//   res.json({ status: 'OK', timestamp: new Date().toISOString() });
// });

// // Start server
// app.listen(PORT, () => {
//   console.log(`Server is running on http://localhost:${PORT}`);
// });

// export default app;

async function run() {
  registerEntities();
  diContainer.register(DB);
  diContainer.register(Migrations);
  diContainer.register(AuthService);

  const migrations = diContainer.resolve<Migrations>(Migrations);
  const db = diContainer.resolve<DB>(DB);
  migrations.registerMigration(1, "initial migration", async () => {
    // Create User table
    await migrations.migrateCreateEntity(User);
  });
  migrations.registerMigration(2, "Add column", async () => {
    // Create seeded user
    const seededUser = db.create(User);
    seededUser.email = "test@test.com";
    seededUser.username = "test";
    seededUser.password = "abc123";
    await db.save(seededUser);
  });
  await migrations.run();

  const app = new BackendApp({
    staticDir: path.resolve(__dirname, "../../client/dist"),
  });
  app.registerController(AppController);
  app.registerController(AuthController);
  app.start();
}

run();
