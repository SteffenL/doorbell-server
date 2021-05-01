import { Knex } from "knex";
import path from "path";

export enum DbmsName {
  SQLITE3 = "sqlite3",
  POSTGRESQL = "postgresql"
}

export function getKnexConfig(dbms: DbmsName, configDir: string): Knex.Config {
  switch (dbms) {
    case DbmsName.SQLITE3:
      return {
        client: "sqlite3",
        connection: {
          filename: path.join(configDir, "db.sqlite3")
        },
        useNullAsDefault: false
      };

    case DbmsName.POSTGRESQL:
      return {
        client: "postgresql",
        connection: {
          database: "my_db",
          user: "username",
          password: "password"
        },
        pool: {
          min: 2,
          max: 10
        },
        migrations: {
          tableName: "knex_migrations"
        }
      };

    default:
      throw new Error(`Invalid DBMS name: ${dbms}`);
  }
}

export default getKnexConfig(DbmsName.SQLITE3, ".");
