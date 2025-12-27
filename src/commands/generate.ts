import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  outro,
  select,
  spinner,
  text,
} from "@clack/prompts";
import chalk from "chalk";
import { Command } from "commander";
import { format as prettierFormat } from "prettier";
import { getConfig } from "../utils/get-config.js";
import { fetchSchemas, type SchemaInfo, type FieldDefinition } from "../utils/api-client.js";

type GenerateTarget = "types" | "sdk-types" | "schema-json";

interface GenerateOptions {
  cwd: string;
  output?: string;
  target?: GenerateTarget;
  url?: string;
  yes?: boolean;
}

async function generateAction(opts: GenerateOptions) {
  const cwd = path.resolve(opts.cwd);

  intro(chalk.bgBlue.black(" Baasix Type Generator "));

  // Load config
  const config = await getConfig(cwd);
  if (!config && !opts.url) {
    log.error("No Baasix configuration found. Create a .env file with BAASIX_URL or use --url flag.");
    process.exit(1);
  }

  const baasixUrl = opts.url || config?.url || "http://localhost:8056";

  // Select generation target
  let target = opts.target;
  if (!target) {
    const result = await select({
      message: "What do you want to generate?",
      options: [
        {
          value: "types",
          label: "TypeScript Types",
          hint: "Generate types for all collections",
        },
        {
          value: "sdk-types",
          label: "SDK Collection Types",
          hint: "Generate typed SDK helpers for collections",
        },
        {
          value: "schema-json",
          label: "Schema JSON",
          hint: "Export all schemas as JSON",
        },
      ],
    });

    if (isCancel(result)) {
      cancel("Operation cancelled");
      process.exit(0);
    }
    target = result as GenerateTarget;
  }

  // Get output path
  let outputPath = opts.output;
  if (!outputPath) {
    const defaultPath = target === "schema-json" ? "schemas.json" : "baasix.d.ts";
    const result = await text({
      message: "Output file path:",
      placeholder: defaultPath,
      defaultValue: defaultPath,
    });

    if (isCancel(result)) {
      cancel("Operation cancelled");
      process.exit(0);
    }
    outputPath = result as string;
  }

  const s = spinner();
  s.start("Fetching schemas from Baasix...");

  try {
    // Fetch schemas from API
    const schemas = await fetchSchemas({
      url: baasixUrl,
      email: config?.email,
      password: config?.password,
      token: config?.token,
    });

    if (!schemas || schemas.length === 0) {
      s.stop("No schemas found");
      log.warn("No schemas found in your Baasix instance.");
      process.exit(0);
    }

    s.message(`Found ${schemas.length} schemas`);

    let output: string;

    if (target === "types") {
      output = generateTypeScriptTypes(schemas);
    } else if (target === "sdk-types") {
      output = generateSDKTypes(schemas);
    } else {
      output = JSON.stringify(schemas, null, 2);
    }

    // Format with prettier if TypeScript
    if (target !== "schema-json") {
      try {
        output = await prettierFormat(output, {
          parser: "typescript",
          printWidth: 100,
          tabWidth: 2,
          singleQuote: true,
        });
      } catch {
        // Ignore prettier errors
      }
    }

    // Check if file exists
    const fullOutputPath = path.resolve(cwd, outputPath);
    if (existsSync(fullOutputPath) && !opts.yes) {
      s.stop("File already exists");
      const overwrite = await confirm({
        message: `File ${outputPath} already exists. Overwrite?`,
        initialValue: true,
      });

      if (isCancel(overwrite) || !overwrite) {
        cancel("Operation cancelled");
        process.exit(0);
      }
      s.start("Writing file...");
    }

    // Ensure directory exists
    const outputDir = path.dirname(fullOutputPath);
    if (!existsSync(outputDir)) {
      await fs.mkdir(outputDir, { recursive: true });
    }

    await fs.writeFile(fullOutputPath, output);

    s.stop("Types generated successfully");

    outro(chalk.green(`✨ Generated ${outputPath}`));

    // Print usage info
    if (target === "types" || target === "sdk-types") {
      console.log();
      console.log(chalk.bold("Usage:"));
      console.log(`  ${chalk.dim("// Import types in your TypeScript files")}`);
      console.log(`  ${chalk.cyan(`import type { Products, Users } from "./${outputPath.replace(/\.d\.ts$/, "")}";`)}`);
      console.log();
    }

  } catch (error) {
    s.stop("Failed to generate types");
    if (error instanceof Error) {
      log.error(error.message);
    } else {
      log.error("Unknown error occurred");
    }
    process.exit(1);
  }
}

function fieldTypeToTS(field: FieldDefinition): string {
  const type = field.type;

  // Handle nullable
  const nullable = field.allowNull !== false;
  const nullSuffix = nullable ? " | null" : "";

  switch (type) {
    case "String":
    case "Text":
    case "UUID":
    case "SUID":
      return `string${nullSuffix}`;

    case "Integer":
    case "BigInt":
    case "Float":
    case "Real":
    case "Double":
    case "Decimal":
      return `number${nullSuffix}`;

    case "Boolean":
      return `boolean${nullSuffix}`;

    case "Date":
    case "DateTime":
    case "Time":
      return `string${nullSuffix}`; // ISO date strings

    case "JSON":
    case "JSONB":
      return `Record<string, unknown>${nullSuffix}`;

    case "Array":
      const arrayType = field.values?.type || "unknown";
      const innerType = arrayType === "String" ? "string" :
                        arrayType === "Integer" ? "number" :
                        arrayType === "Boolean" ? "boolean" : "unknown";
      return `${innerType}[]${nullSuffix}`;

    case "Enum":
      if (field.values?.values && Array.isArray(field.values.values)) {
        const enumValues = field.values.values.map((v: string) => `"${v}"`).join(" | ");
        return `(${enumValues})${nullSuffix}`;
      }
      return `string${nullSuffix}`;

    case "Geometry":
    case "Point":
    case "LineString":
    case "Polygon":
      return `GeoJSON.Geometry${nullSuffix}`;

    default:
      return `unknown${nullSuffix}`;
  }
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

function generateTypeScriptTypes(schemas: SchemaInfo[]): string {
  const lines: string[] = [
    "/**",
    " * Auto-generated TypeScript types for Baasix collections",
    ` * Generated at: ${new Date().toISOString()}`,
    " * ",
    " * Do not edit this file manually. Re-run 'baasix generate types' to update.",
    " */",
    "",
    "// GeoJSON types for PostGIS fields",
    "declare namespace GeoJSON {",
    "  interface Point { type: 'Point'; coordinates: [number, number]; }",
    "  interface LineString { type: 'LineString'; coordinates: [number, number][]; }",
    "  interface Polygon { type: 'Polygon'; coordinates: [number, number][][]; }",
    "  type Geometry = Point | LineString | Polygon;",
    "}",
    "",
  ];

  // Filter out system collections if desired
  const userSchemas = schemas.filter(
    (s) => !s.collectionName.startsWith("baasix_")
  );

  for (const schema of userSchemas) {
    const typeName = toPascalCase(schema.collectionName);
    const fields = schema.schema.fields;

    lines.push(`/**`);
    lines.push(` * ${schema.schema.name || schema.collectionName} collection`);
    lines.push(` */`);
    lines.push(`export interface ${typeName} {`);

    for (const [fieldName, field] of Object.entries(fields)) {
      const tsType = fieldTypeToTS(field as FieldDefinition);
      const optional = (field as FieldDefinition).allowNull !== false && !((field as FieldDefinition).primaryKey) ? "?" : "";
      lines.push(`  ${fieldName}${optional}: ${tsType};`);
    }

    // Add timestamp fields if enabled
    if (schema.schema.timestamps) {
      lines.push(`  createdAt?: string;`);
      lines.push(`  updatedAt?: string;`);
    }

    // Add soft delete field if paranoid
    if (schema.schema.paranoid) {
      lines.push(`  deletedAt?: string | null;`);
    }

    lines.push(`}`);
    lines.push("");
  }

  // Generate a union type of all collection names
  lines.push("/**");
  lines.push(" * All collection names");
  lines.push(" */");
  lines.push("export type CollectionName =");
  for (const schema of userSchemas) {
    lines.push(`  | "${schema.collectionName}"`);
  }
  lines.push(";");
  lines.push("");

  // Generate a type map
  lines.push("/**");
  lines.push(" * Map collection names to their types");
  lines.push(" */");
  lines.push("export interface CollectionTypeMap {");
  for (const schema of userSchemas) {
    const typeName = toPascalCase(schema.collectionName);
    lines.push(`  ${schema.collectionName}: ${typeName};`);
  }
  lines.push("}");
  lines.push("");

  return lines.join("\n");
}

function generateSDKTypes(schemas: SchemaInfo[]): string {
  const lines: string[] = [
    "/**",
    " * Auto-generated typed SDK helpers for Baasix collections",
    ` * Generated at: ${new Date().toISOString()}`,
    " * ",
    " * Do not edit this file manually. Re-run 'baasix generate sdk-types' to update.",
    " */",
    "",
    'import { createBaasix } from "@tspvivek/baasix-sdk";',
    'import type { QueryParams, Filter, PaginatedResponse } from "@tspvivek/baasix-sdk";',
    "",
  ];

  // Generate types first
  lines.push(generateTypeScriptTypes(schemas));

  // Generate typed items helper
  lines.push("/**");
  lines.push(" * Create a typed Baasix client with collection-specific methods");
  lines.push(" */");
  lines.push("export function createTypedBaasix(config: Parameters<typeof createBaasix>[0]) {");
  lines.push("  const client = createBaasix(config);");
  lines.push("");
  lines.push("  return {");
  lines.push("    ...client,");
  lines.push("    /**");
  lines.push("     * Type-safe items access");
  lines.push("     */");
  lines.push("    collections: {");

  const userSchemas = schemas.filter((s) => !s.collectionName.startsWith("baasix_"));

  for (const schema of userSchemas) {
    const typeName = toPascalCase(schema.collectionName);
    lines.push(`      ${schema.collectionName}: client.items<${typeName}>("${schema.collectionName}"),`);
  }

  lines.push("    },");
  lines.push("  };");
  lines.push("}");
  lines.push("");

  return lines.join("\n");
}

export const generate = new Command("generate")
  .alias("gen")
  .description("Generate TypeScript types from Baasix schemas")
  .option("-c, --cwd <path>", "Working directory", process.cwd())
  .option("-o, --output <path>", "Output file path")
  .option("-t, --target <target>", "Generation target (types, sdk-types, schema-json)")
  .option("--url <url>", "Baasix server URL")
  .option("-y, --yes", "Skip confirmation prompts")
  .action(generateAction);
