import { DbmsName, getKnexConfig } from "./knexfile";
import { EnvironmentName } from "./environment";
import os from "os";
import path from "path";
import { Knex } from "knex";

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

export function getConfigDir(): string {
    const customAppConfigDir = process.env.CONFIG_DIR;
    if (customAppConfigDir) {
        return path.resolve(customAppConfigDir)
    }

    if (os.platform() != "linux") {
        throw new Error("Unsupported platform");
    }

    const defaultAppConfigDir = path.resolve(os.homedir(), ".doorbell-server");

    return defaultAppConfigDir;
}

export function getDataDir(): string {
    const customAppDataDir = process.env.DATA_DIR;
    if (customAppDataDir) {
        return path.resolve(customAppDataDir)
    }

    return getConfigDir();
}

export function loadAppConfig(): AppConfig {
    const nodeEnv = process.env.NODE_ENV ? (process.env.NODE_ENV as EnvironmentName) : "production";
    const configDir = getConfigDir();
    const certificateDir = path.resolve(configDir, "certificate");
    const credentialsDir = path.resolve(configDir, "credentials");
    const publicDir = path.resolve(configDir, "public");
    const firmwareDir = path.resolve(publicDir, "firmware");
    const httpPort = (process.env.HTTP_PORT ? parseInt(process.env.HTTP_PORT): 0) || (nodeEnv == "development" ? 3000 : 80);
    const httpsPort = (process.env.HTTPS_PORT ? parseInt(process.env.HTTPS_PORT): 0) || (nodeEnv == "development" ? 3001 : 443);
    const dbms = process.env.DBMS as DbmsName || DbmsName.SQLITE3;

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
            knex: getKnexConfig(dbms, configDir)
        }
    };
}

const CONFIG = loadAppConfig();

export function getAppConfig(): AppConfig {
    return CONFIG;
}
