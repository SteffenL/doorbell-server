import { Knex } from "knex";
import path from "path";

export enum DbmsName {
  SQLITE3 = "sqlite3",
  POSTGRESQL = "postgresql",
  MYSQL = "mysql"
}

export type DbmsConfig = {
  dbms: DbmsName,
  database?: string,
  username?: string,
  password?: string,
  hostname?: string,
  port?: number
};

export function getKnexConfig(dbmsConfig: DbmsConfig, dataDir: string): Knex.Config {
  switch (dbmsConfig.dbms) {
    case DbmsName.SQLITE3:
      return {
        client: dbmsConfig.dbms,
        connection: {
          filename: path.join(dataDir, "db.sqlite3")
        },
        useNullAsDefault: false,
        migrations: {
          tableName: "knex_migrations",
          directory: path.resolve(__dirname, "migrations")
        }
      };

    case DbmsName.POSTGRESQL:
    case DbmsName.MYSQL:
      return {
        client: dbmsConfig.dbms,
        connection: {
          database: dbmsConfig.database,
          user: dbmsConfig.username,
          password: dbmsConfig.password,
          host: dbmsConfig.hostname,
          port: dbmsConfig.port
        },
        pool: {
          min: 2,
          max: 10
        },
        migrations: {
          tableName: "knex_migrations",
          directory: path.resolve(__dirname, "migrations")
        }
      };

    default:
      throw new Error(`Invalid DBMS name: ${dbmsConfig.dbms}`);
  }
}

export default getKnexConfig({ dbms: DbmsName.SQLITE3 }, ".");
