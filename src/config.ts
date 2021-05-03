import { DbmsConfig, DbmsName, getKnexConfig } from "./knexfile";
import { EnvironmentName } from "./environment";
import os from "os";
import path from "path";
import { Knex } from "knex";
import fs from "fs";

const APP_HOME_SUBDIR_NAME = ".doorbell-server";

export type PersistedAppConfig = {
    server: {
        httpPort: number,
        httpsPort: number
    },
    database: {
        dbms: DbmsName,
        database?: string,
        username?: string,
        password?: string,
        hostname?: string,
        port?: number
    }
};

export type AppConfig = {
    credentials: {
        firebaseServiceAccountPath: string
    },
    publicDir: string,
    firmwareDir: string,
    server: {
        certificatePath: string,
        keyPath: string,
        httpPort: number,
        httpsPort: number
    },
    database: {
        knex: Knex.Config
    }
};

export function getAppHomeSubdir(): string {
    return path.resolve(os.homedir(), APP_HOME_SUBDIR_NAME);
}

export function getAppConfigDir(): string {
    const customAppConfigDir = process.env.CONFIG_DIR;
    if (customAppConfigDir) {
        return path.resolve(customAppConfigDir)
    }

    return path.resolve(getAppHomeSubdir(), "config");
}

export function getAppDataDir(): string {
    const customAppDataDir = process.env.DATA_DIR;
    if (customAppDataDir) {
        return path.resolve(customAppDataDir)
    }

    return path.resolve(getAppHomeSubdir(), "data");
}

export function loadAppConfig(): AppConfig {
    const nodeEnv = process.env.NODE_ENV ? (process.env.NODE_ENV as EnvironmentName) : "production";
    const configDir = getAppConfigDir();
    const dataDir = getAppDataDir();
    const certificateDir = path.resolve(configDir, "certificate");
    const credentialsDir = path.resolve(configDir, "credentials");
    const publicDir = path.resolve(configDir, "public");
    const firmwareDir = path.resolve(publicDir, "firmware");

    const persistedConfigFilePath = path.join(configDir, "app.config.json");
    const persistedConfig = fs.existsSync(persistedConfigFilePath)
        ? JSON.parse(fs.readFileSync(persistedConfigFilePath, { encoding: "utf8" })) as PersistedAppConfig
        : undefined;
    const dbmsConfig: DbmsConfig = {
        dbms: persistedConfig?.database.dbms || DbmsName.SQLITE3,
        database: persistedConfig?.database.database,
        username: persistedConfig?.database.username,
        password: persistedConfig?.database.password,
        hostname: persistedConfig?.database.hostname,
        port: persistedConfig?.database.port
    };

    const httpPort = persistedConfig?.server?.httpPort || (nodeEnv == "development" ? 3000 : 80);
    const httpsPort = persistedConfig?.server?.httpsPort || (nodeEnv == "development" ? 3001 : 443);

    return {
        credentials: {
            firebaseServiceAccountPath: path.resolve(credentialsDir, "firebase-service-account.json")
        },
        publicDir,
        firmwareDir,
        server: {
            certificatePath: path.resolve(certificateDir, "server.cert.pem"),
            keyPath: path.resolve(certificateDir, "server.key.pem"),
            httpPort,
            httpsPort
        },
        database: {
            knex: getKnexConfig(dbmsConfig, dataDir)
        }
    };
}

const CONFIG = loadAppConfig();

export function getAppConfig(): AppConfig {
    return CONFIG;
}
