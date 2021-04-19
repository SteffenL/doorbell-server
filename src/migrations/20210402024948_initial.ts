import { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
    return knex.schema
      .createTable("monitor", table => {
        table.uuid("uuid").primary().notNullable();
        table.string("token", 255).unique().notNullable();
        table.string("connection_type", 255).notNullable().references("connection_type.name");
      })
      .createTable("device_health", table => {
        table.string("battery_level", 16).notNullable();
        table.integer("battery_voltage").notNullable();
        table.bigInteger("created_at").notNullable();
        table.string("firmware_version").notNullable();
      })
      .createTable("firmware_update", table => {
        table.uuid("uuid").primary().notNullable();
        table.boolean("active").notNullable();
        table.string("version").unique().notNullable();
        table.string("sortable_version").unique().notNullable();
        table.bigInteger("created_at").notNullable();
      });
}


export async function down(knex: Knex): Promise<void> {
    return knex.schema
      .dropTable("firmware_update")
      .dropTable("device_health")
      .dropTable("monitor");
}

