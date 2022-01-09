import { AppConfig, getAppConfig } from "./config";
import firebase from "firebase-admin";
import express from "express";
import asyncHandler from "express-async-handler";
import path from "path";
import knex, { Knex } from "knex";
import net from "net";
import { v4 as uuidv4 } from "uuid";
import socketIo from "socket.io";
import http from "http";
import https from "https";
import fs from "fs";
import flatten from "flat";

enum ConnectionType {
    PUSH = "push",
    SOCKET = "socket"
}

enum TableNames {
    MONITOR = "monitor",
    DEVICE_HEALTH = "device_health",
    FIRMWARE_UPDATE = "firmware_update"
}

interface MonitorTable {
    uuid: string,
    token: string,
    connection_type: ConnectionType
}

interface DeviceHealthTable {
    battery_level: string,
    battery_voltage: number,
    created_at: number,
    firmware_version: string
}

interface FirmwareUpdateTable {
    uuid: string,
    active: boolean,
    version: string,
    sortable_version: string,
    created_at: number
}

enum NotificationType {
    DOORBELL = "doorbell"
}

enum DoorbellEventName {
    BUTTON_PRESSED = "button_pressed",
    BATTERY_LEVEL = "battery_level"
}

enum BatteryLevel {
    HIGH = "high",
    MODERATE = "moderate",
    LOW = "low",
    CRITICAL = "critical"
}

interface HeartbeatRequestData {
    firmware: {
        version: string
    },
    battery: {
        level: BatteryLevel,
        voltage: number
    }
}

interface HeartbeatResponseData {
    update: {
        version: string,
        path: string
    } | undefined
}

interface DeviceHealthResponseData {
    batteryLevel: string,
    batteryVoltage: number,
    firmwareVersion: string
}

async function notifyMonitors(eventName: DoorbellEventName, db: Knex, io: socketIo.Server): Promise<void> {
    const monitors = await db<MonitorTable>(TableNames.MONITOR).select("*");
    const pushMonitors = monitors.filter(monitor => monitor.connection_type === ConnectionType.PUSH);
    const socketMonitors = monitors.filter(monitor => monitor.connection_type === ConnectionType.SOCKET);
    const notification = {
        id: uuidv4(),
        name: eventName
    };

    console.log("Notifying monitors", notification, monitors);

    if (pushMonitors.length > 0) {
        const tokens = pushMonitors.map(monitor => monitor.token);
        const monitorsToRemove: string[] = [];
        const monitorsToKeep: string[] = [];
        try {
            const results = (await firebase.messaging().sendToDevice(tokens, { data: notification }, {
                priority: "high",
                timeToLive: 5,
                contentAvailable: true
            })).results;
            for (let i = 0; i < tokens.length; ++i) {
                const token = tokens[i];
                const result = results[i];
                if (result.error) {
                    if (result.error.code === "messaging/registration-token-not-registered") {
                        monitorsToRemove.push(token);
                    } else {
                        console.log("Failed to send notification to monitor with token:", token, result.error);
                        // Ignore
                    }
                } else {
                    monitorsToKeep.push(token);
                }
            }
        } catch (e) {
            console.log("Failed to send notification to one or more monitors with tokens:", tokens, e);
            // Ignore
        }

        for (let token of monitorsToRemove) {
            await removeMonitor(db, token, ConnectionType.PUSH);
        }
    }

    if (socketMonitors.length > 0) {
        const tokens = socketMonitors.map(monitor => monitor.token);
        const currentSockets = await io.fetchSockets();
        const currentSocketIds = currentSockets.map(socket => socket.id);
        const monitorsToRemove: string[] = [];
        const monitorsToKeep: string[] = [];

        for (let token of tokens) {
            if (currentSocketIds.includes(token)) {
                monitorsToKeep.push(token);
            } else {
                monitorsToRemove.push(token);
            }
        }

        for (let token of monitorsToRemove) {
            await removeMonitor(db, token, ConnectionType.SOCKET);
        }

        for (let token of monitorsToKeep) {
            try {
                const socket = currentSockets.find(socket => socket.id === token);
                if (socket) {
                    socket.emit(NotificationType.DOORBELL, notification.id, notification.name);
                }
            } catch (e) {
                console.log(`Failed to send notification to monitor with token "${token}".`);
                await removeMonitor(db, token, ConnectionType.SOCKET);
            }
        }
    }
}

async function checkHeartbeatAndNotify(db: Knex, io: socketIo.Server): Promise<void> {
    const lastDeviceHealth = await db<DeviceHealthTable>(TableNames.DEVICE_HEALTH).orderBy("created_at", "desc").first();
    if (!lastDeviceHealth) {
        return;
    }
    const batteryLevel = lastDeviceHealth.battery_level;
    const message = `Battery level: ${batteryLevel}`;
    await notifyMonitors(DoorbellEventName.BATTERY_LEVEL, db, io);
}

async function handleRing(db: Knex, io: socketIo.Server): Promise<void> {
    console.log("Handling ring");
    await notifyMonitors(DoorbellEventName.BUTTON_PRESSED, db, io);
}

async function getDeviceHealth(db: Knex): Promise<DeviceHealthResponseData | null> {
    const lastDeviceHealth: DeviceHealthTable = await db<DeviceHealthTable>(TableNames.DEVICE_HEALTH).orderBy("created_at", "desc").first();
    if (!lastDeviceHealth) {
        return null;
    }

    const deviceHealth: DeviceHealthResponseData = {
        batteryLevel: lastDeviceHealth.battery_level,
        batteryVoltage: lastDeviceHealth.battery_voltage,
        firmwareVersion: lastDeviceHealth.firmware_version
    };

    return deviceHealth;
}

function createFirmwareUpdatePath(firmwareUpdate: FirmwareUpdateTable): string {
    return `/firmware/${firmwareUpdate.version}/update.bin`;
}

async function handleHeartbeat(db: Knex, requestData: HeartbeatRequestData): Promise<HeartbeatResponseData> {
    const requestFirmwareVersion = requestData.firmware.version;
    await db<DeviceHealthTable>(TableNames.DEVICE_HEALTH).insert({
        battery_level: requestData.battery.level,
        battery_voltage: requestData.battery.voltage,
        created_at: new Date().getTime(),
        firmware_version: requestFirmwareVersion
    });
    const firmwareUpdateQuery = db<FirmwareUpdateTable>(TableNames.FIRMWARE_UPDATE).orderBy("sortable_version", "desc");
    const firmwareUpdate = await firmwareUpdateQuery.where("active", true)
        .andWhere("sortable_version", ">", createSortableVersion(requestFirmwareVersion))
        .first();
    const responseData: HeartbeatResponseData = {
        update: (firmwareUpdate ? {
            version: firmwareUpdate.version,
            path: createFirmwareUpdatePath(firmwareUpdate)
        } : undefined)
    };
    return responseData;
}

async function addMonitor(db: Knex, token: string, connectionType: ConnectionType): Promise<void> {
    console.log(`Adding monitor with token "${token}".`);
    const uuid = uuidv4();
    await db<MonitorTable>(TableNames.MONITOR)
        .insert({ uuid, token, connection_type: connectionType })
        .onConflict("token")
        .ignore();
}

async function removeMonitor(db: Knex, token: string, connectionType: ConnectionType): Promise<void> {
    console.log(`Removing monitor with token "${token}".`);
    await db<MonitorTable>(TableNames.MONITOR)
        .delete()
        .where({ token, connection_type: connectionType });
}

async function initDatabase(appConfig: AppConfig): Promise<Knex> {
    const db = knex(appConfig.database.knex);

    await db.migrate.latest({
        directory: path.resolve(__dirname, "migrations")
    });

    return db;
}

function unflattenObjectFromString(objectString: string): any {
    const lines = objectString.split("\n");
    const flatProperties = lines.map(s => s.split("="));
    const flatObject: Record<string, any> = {};
    flatProperties.forEach(p => {
        flatObject[p[0]] = p[1];
    });
    const unflattenedObject = flatten.unflatten(flatObject);
    return unflattenedObject;
}

function flattenObjectToString(object: Record<string, any>): string {
    const flatObject = flatten(object) as Record<string, any>;
    const flatProperties = Object.entries(flatObject)
        .filter(entry => entry[1] !== undefined)
        .map(entry => `${entry[0]}=${entry[1]}`);
    const lines = flatProperties.join("\n");
    return lines;
}

function sendFlatmap(res: express.Response, body: Record<string, any>) {
    res.setHeader("content-type", "application/flatmap");
    res.send(flattenObjectToString(body));
}

function flatMapBodyParser(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (req.headers["content-type"] !== "application/flatmap") {
        return next();
    }

    const requestBody = unflattenObjectFromString(req.body as string);
    req.body = requestBody;

    next();
}

async function initWebApp(appConfig: AppConfig): Promise<express.Express> {
    const app = express();
    app.use(express.static(appConfig.publicDir));
    app.use(express.json());
    app.use(express.text({ type: "application/flatmap" }));
    app.use(flatMapBodyParser);
    return app;
}

function addWebRoutes(app: express.Express, db: Knex, io: socketIo.Server) {
    app.post("/monitor", asyncHandler(async (req, res) => {
        const { token } = req.body;
        await addMonitor(db, token, ConnectionType.PUSH);
        res.send();
    }));

    app.post("/ring", asyncHandler(async (req, res) => {
        await handleRing(db, io);
        res.send();
    }));

    app.get("/health", asyncHandler(async (req, res) => {
        res.send("OK");
    }));

    app.post("/heartbeat", asyncHandler(async (req, res) => {
        const responseData = await handleHeartbeat(db, req.body as HeartbeatRequestData);
        await checkHeartbeatAndNotify(db, io);
        sendFlatmap(res, responseData);
    }));

    app.get("/device-info", asyncHandler(async (req, res) => {
        const deviceInfo = await getDeviceHealth(db);
        if (deviceInfo) {
            res.json(deviceInfo);
        } else {
            res.status(404);
            res.send();
        }
    }));
}

async function initSocketServer(db: Knex, httpServer: http.Server): Promise<socketIo.Server> {
    const io = new socketIo.Server(httpServer);

    io.on("connection", async (socket: socketIo.Socket) => {
        const token = socket.id;
        socket.on("ring", () => handleRing(db, io));
        socket.on("disconnect", () => removeMonitor(db, token, ConnectionType.SOCKET));
        await addMonitor(db, token, ConnectionType.SOCKET);
    });

    return io;
}

function createSortableVersion(version: string): string {
    let result = "";
    let [leftAndMiddle] = version.split("+");
    let [left, middle] = leftAndMiddle.split("-");

    left = left.split(".").map(s => parseInt(s).toString().padStart(10, "0")).join(".");
    result += left;

    if (middle) {
        middle = middle.split(".").map(s => {
            const i = parseInt(s);
            return Number.isInteger(i) ? i.toString().padStart(10, "0") : s;
        }).join(".");
        result += "~" + middle;
    }

    return result;
}

async function syncFirmwareUpdates(db: Knex, appConfig: AppConfig) {
    const trackedVersions = (await db<FirmwareUpdateTable>(TableNames.FIRMWARE_UPDATE).select("version")).map(t => t.version);
    const getVersions = (path: string): Promise<string[]> => new Promise((resolve, reject) => fs.readdir(path, (err, files) => {
        if (err) reject(err);
        else resolve(files);
    }));
    const fileExists = (path: string): Promise<boolean> => new Promise((resolve, reject) => fs.stat(path, err => {
        resolve(!err);
    }));
    const localUpdatesDir = appConfig.firmwareDir;
    const localVersions = await getVersions(localUpdatesDir);

    // Add non-tracked firmware updates
    for (const version of localVersions) {
        const updateFilePath = path.join(localUpdatesDir, version, "update.bin");
        if (!(await fileExists(updateFilePath))) {
            console.error(`Firmware update binary for version ${version} was not found`);
            continue;
        }

        if (trackedVersions.indexOf(version) === -1) {
            console.log(`Adding firmware update ${version} to database.`);
            await db<FirmwareUpdateTable>(TableNames.FIRMWARE_UPDATE).insert({
                uuid: uuidv4(),
                active: false,
                created_at: new Date().getTime(),
                version,
                sortable_version: createSortableVersion(version)
            });
        }
    }
    // Remove records of missing firmware updates
    for (const version of trackedVersions) {
        if (localVersions.indexOf(version) === -1) {
            console.log(`Removing firmware update ${version} from database.`);
            await db<FirmwareUpdateTable>(TableNames.FIRMWARE_UPDATE).where({ version }).delete();
        }
    }
}

(async () => {
    const appConfig = getAppConfig();

    firebase.initializeApp({
        credential: firebase.credential.cert(appConfig.credentials.firebaseServiceAccountPath)
    });

    const db = await initDatabase(appConfig);
    const app = await initWebApp(appConfig);
    await syncFirmwareUpdates(db, appConfig);
    setInterval(() => syncFirmwareUpdates(db, appConfig), 60000);
    const httpServer = http.createServer(app);
    const httpsServer = https.createServer({
        key: fs.readFileSync(appConfig.server.keyPath, { encoding: "utf8" }),
        cert: fs.readFileSync(appConfig.server.certificatePath, { encoding: "utf8" })
    }, app);
    const io = await initSocketServer(db, httpServer);
    addWebRoutes(app, db, io);
    httpServer.listen(appConfig.server.httpPort, () => {
        const address = httpServer.address() as net.AddressInfo;
        console.log(`Listening on port ${address.port} (HTTP) at ${address.address}.`);
    });
    httpsServer.listen(appConfig.server.httpsPort, () => {
        const address = httpsServer.address() as net.AddressInfo;
        console.log(`Listening on port ${address.port} (HTTPS) at ${address.address}.`);
    });
})();
