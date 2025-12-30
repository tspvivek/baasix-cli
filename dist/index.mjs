#!/usr/bin/env node

// src/index.ts
import { Command as Command5 } from "commander";

// src/commands/init.ts
import { existsSync as existsSync2 } from "fs";
import fs from "fs/promises";
import path2 from "path";
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
  multiselect
} from "@clack/prompts";
import chalk from "chalk";
import { Command } from "commander";
import crypto from "crypto";

// src/utils/package-manager.ts
import { exec } from "child_process";
import { existsSync } from "fs";
import path from "path";
function detectPackageManager(cwd) {
  if (existsSync(path.join(cwd, "bun.lockb"))) {
    return "bun";
  }
  if (existsSync(path.join(cwd, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (existsSync(path.join(cwd, "yarn.lock"))) {
    return "yarn";
  }
  return "npm";
}
function installDependencies({
  dependencies,
  packageManager,
  cwd,
  dev = false
}) {
  let installCommand;
  const devFlag = dev ? packageManager === "npm" ? " --save-dev" : " -D" : "";
  switch (packageManager) {
    case "npm":
      installCommand = `npm install${devFlag}`;
      break;
    case "pnpm":
      installCommand = `pnpm add${devFlag}`;
      break;
    case "bun":
      installCommand = `bun add${devFlag}`;
      break;
    case "yarn":
      installCommand = `yarn add${devFlag}`;
      break;
    default:
      throw new Error("Invalid package manager");
  }
  const command = `${installCommand} ${dependencies.join(" ")}`;
  return new Promise((resolve, reject) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(true);
    });
  });
}

// src/commands/init.ts
function generateSecret(length = 64) {
  return crypto.randomBytes(length).toString("base64url").slice(0, length);
}
async function initAction(opts) {
  const cwd = path2.resolve(opts.cwd);
  intro(chalk.bgCyan.black(" Baasix Project Setup "));
  let projectName = opts.name;
  if (!projectName) {
    const result = await text({
      message: "What is your project name?",
      placeholder: "my-baasix-app",
      defaultValue: "my-baasix-app",
      validate: (value) => {
        if (!value) return "Project name is required";
        if (!/^[a-z0-9-_]+$/i.test(value)) return "Project name must be alphanumeric with dashes or underscores";
        return void 0;
      }
    });
    if (isCancel(result)) {
      cancel("Operation cancelled");
      process.exit(0);
    }
    projectName = result;
  }
  let template = opts.template;
  if (!template) {
    const result = await select({
      message: "Select a project template:",
      options: [
        {
          value: "api",
          label: "API Only",
          hint: "Baasix server with basic configuration"
        },
        {
          value: "nextjs-app",
          label: "Next.js (App Router)",
          hint: "Next.js 14+ with App Router and SDK integration"
        },
        {
          value: "nextjs",
          label: "Next.js (Pages Router)",
          hint: "Next.js with Pages Router and SDK integration"
        }
      ]
    });
    if (isCancel(result)) {
      cancel("Operation cancelled");
      process.exit(0);
    }
    template = result;
  }
  const config = await collectProjectConfig(projectName, template, opts.yes);
  if (!config) {
    cancel("Operation cancelled");
    process.exit(0);
  }
  const projectPath = path2.join(cwd, projectName);
  if (existsSync2(projectPath)) {
    const overwrite = await confirm({
      message: `Directory ${projectName} already exists. Overwrite?`,
      initialValue: false
    });
    if (isCancel(overwrite) || !overwrite) {
      cancel("Operation cancelled");
      process.exit(0);
    }
  }
  const s = spinner();
  s.start("Creating project structure...");
  try {
    await fs.mkdir(projectPath, { recursive: true });
    if (template === "api") {
      await createApiProject(projectPath, config);
    } else if (template === "nextjs-app" || template === "nextjs") {
      await createNextJsProject(projectPath, config, template === "nextjs-app");
    }
    s.stop("Project structure created");
    const packageManager = detectPackageManager(cwd);
    const shouldInstall = opts.yes || await confirm({
      message: `Install dependencies with ${packageManager}?`,
      initialValue: true
    });
    if (shouldInstall && !isCancel(shouldInstall)) {
      s.start("Installing dependencies...");
      try {
        await installDependencies({
          dependencies: [],
          packageManager,
          cwd: projectPath
        });
        s.stop("Dependencies installed");
      } catch (error) {
        s.stop("Failed to install dependencies");
        log.warn(`Run ${chalk.cyan(`cd ${projectName} && ${packageManager} install`)} to install manually`);
      }
    }
    outro(chalk.green("\u2728 Project created successfully!"));
    console.log();
    console.log(chalk.bold("Next steps:"));
    console.log(`  ${chalk.cyan(`cd ${projectName}`)}`);
    if (template === "api") {
      console.log(`  ${chalk.cyan("# Review and update your .env file")}`);
      console.log(`  ${chalk.cyan(`${packageManager} run dev`)}`);
    } else {
      console.log(`  ${chalk.cyan(`${packageManager} run dev`)} ${chalk.dim("# Start Next.js frontend")}`);
      console.log();
      console.log(chalk.dim("  Note: This is a frontend-only project. You need a separate Baasix API."));
      console.log(chalk.dim(`  To create an API: ${chalk.cyan("npx baasix init --template api")}`));
    }
    console.log();
  } catch (error) {
    s.stop("Failed to create project");
    log.error(error instanceof Error ? error.message : "Unknown error");
    process.exit(1);
  }
}
async function collectProjectConfig(projectName, template, skipPrompts) {
  if (skipPrompts) {
    return {
      projectName,
      template,
      databaseUrl: "postgresql://postgres:password@localhost:5432/baasix",
      socketEnabled: false,
      multiTenant: false,
      publicRegistration: true,
      storageDriver: "LOCAL",
      s3Config: void 0,
      cacheAdapter: "memory",
      redisUrl: void 0,
      authServices: ["LOCAL"],
      mailEnabled: false,
      openApiEnabled: true
    };
  }
  const dbUrl = await text({
    message: "PostgreSQL connection URL:",
    placeholder: "postgresql://postgres:password@localhost:5432/baasix",
    defaultValue: "postgresql://postgres:password@localhost:5432/baasix"
  });
  if (isCancel(dbUrl)) return null;
  const multiTenant = await confirm({
    message: "Enable multi-tenancy?",
    initialValue: false
  });
  if (isCancel(multiTenant)) return null;
  const publicRegistration = await confirm({
    message: "Allow public user registration?",
    initialValue: true
  });
  if (isCancel(publicRegistration)) return null;
  const socketEnabled = await confirm({
    message: "Enable real-time features (WebSocket)?",
    initialValue: false
  });
  if (isCancel(socketEnabled)) return null;
  const storageDriver = await select({
    message: "Select storage driver:",
    options: [
      { value: "LOCAL", label: "Local Storage", hint: "Store files locally in uploads folder" },
      { value: "S3", label: "S3 Compatible", hint: "AWS S3, DigitalOcean Spaces, MinIO, etc." }
    ]
  });
  if (isCancel(storageDriver)) return null;
  let s3Config;
  if (storageDriver === "S3") {
    const endpoint = await text({
      message: "S3 endpoint:",
      placeholder: "s3.amazonaws.com",
      defaultValue: "s3.amazonaws.com"
    });
    if (isCancel(endpoint)) return null;
    const bucket = await text({
      message: "S3 bucket name:",
      placeholder: "my-bucket"
    });
    if (isCancel(bucket)) return null;
    const accessKey = await text({
      message: "S3 Access Key ID:",
      placeholder: "AKIAIOSFODNN7EXAMPLE"
    });
    if (isCancel(accessKey)) return null;
    const secretKey = await text({
      message: "S3 Secret Access Key:",
      placeholder: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    });
    if (isCancel(secretKey)) return null;
    const region = await text({
      message: "S3 Region:",
      placeholder: "us-east-1",
      defaultValue: "us-east-1"
    });
    if (isCancel(region)) return null;
    s3Config = {
      endpoint,
      bucket,
      accessKey,
      secretKey,
      region
    };
  }
  const cacheAdapter = await select({
    message: "Select cache adapter:",
    options: [
      { value: "memory", label: "In-Memory", hint: "Simple, good for development" },
      { value: "redis", label: "Redis/Valkey", hint: "Recommended for production" }
    ]
  });
  if (isCancel(cacheAdapter)) return null;
  let redisUrl;
  if (cacheAdapter === "redis") {
    const url = await text({
      message: "Redis connection URL:",
      placeholder: "redis://localhost:6379",
      defaultValue: "redis://localhost:6379"
    });
    if (isCancel(url)) return null;
    redisUrl = url;
  }
  const authServices = await multiselect({
    message: "Select authentication methods:",
    options: [
      { value: "LOCAL", label: "Email/Password", hint: "Built-in authentication" },
      { value: "GOOGLE", label: "Google OAuth" },
      { value: "FACEBOOK", label: "Facebook OAuth" },
      { value: "GITHUB", label: "GitHub OAuth" },
      { value: "APPLE", label: "Apple Sign In" }
    ],
    initialValues: ["LOCAL"],
    required: true
  });
  if (isCancel(authServices)) return null;
  const openApiEnabled = await confirm({
    message: "Enable OpenAPI documentation (Swagger)?",
    initialValue: true
  });
  if (isCancel(openApiEnabled)) return null;
  const mailEnabled = await confirm({
    message: "Configure email sending?",
    initialValue: false
  });
  if (isCancel(mailEnabled)) return null;
  return {
    projectName,
    template,
    databaseUrl: dbUrl,
    socketEnabled,
    multiTenant,
    publicRegistration,
    storageDriver,
    s3Config,
    cacheAdapter,
    redisUrl,
    authServices,
    mailEnabled,
    openApiEnabled
  };
}
async function createApiProject(projectPath, config) {
  const secretKey = generateSecret(64);
  const packageJson = {
    name: config.projectName,
    version: "0.1.0",
    type: "module",
    scripts: {
      dev: "node --watch server.js",
      start: "node server.js"
    },
    dependencies: {
      "@tspvivek/baasix": "latest",
      "dotenv": "^16.3.1"
    }
  };
  await fs.writeFile(
    path2.join(projectPath, "package.json"),
    JSON.stringify(packageJson, null, 2)
  );
  const serverJs = `import { startServer } from "@tspvivek/baasix";

startServer({
  port: process.env.PORT || 8056,
  logger: {
    level: process.env.LOG_LEVEL || "info",
    pretty: process.env.NODE_ENV !== "production",
  },
}).catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
`;
  await fs.writeFile(path2.join(projectPath, "server.js"), serverJs);
  const envContent = generateEnvContent(config, secretKey);
  await fs.writeFile(path2.join(projectPath, ".env"), envContent);
  const envExample = generateEnvExample(config);
  await fs.writeFile(path2.join(projectPath, ".env.example"), envExample);
  const gitignore = `node_modules/
.env
uploads/
logs/
dist/
.cache/
.temp/
`;
  await fs.writeFile(path2.join(projectPath, ".gitignore"), gitignore);
  await fs.mkdir(path2.join(projectPath, "extensions"), { recursive: true });
  await fs.writeFile(
    path2.join(projectPath, "extensions", ".gitkeep"),
    "# Place your Baasix extensions here\n"
  );
  if (config.storageDriver === "LOCAL") {
    await fs.mkdir(path2.join(projectPath, "uploads"), { recursive: true });
    await fs.writeFile(path2.join(projectPath, "uploads", ".gitkeep"), "");
  }
  await fs.mkdir(path2.join(projectPath, "migrations"), { recursive: true });
  await fs.writeFile(path2.join(projectPath, "migrations", ".gitkeep"), "");
  const readme = generateReadme(config);
  await fs.writeFile(path2.join(projectPath, "README.md"), readme);
}
function generateEnvContent(config, secretKey) {
  const lines = [];
  lines.push("#-----------------------------------");
  lines.push("# Server");
  lines.push("#-----------------------------------");
  lines.push("PORT=8056");
  lines.push("HOST=localhost");
  lines.push("NODE_ENV=development");
  lines.push("LOG_LEVEL=info");
  lines.push("");
  lines.push("#-----------------------------------");
  lines.push("# Database");
  lines.push("#-----------------------------------");
  lines.push(`DATABASE_URL="${config.databaseUrl}"`);
  lines.push("DATABASE_LOGGING=false");
  lines.push("DATABASE_POOL_MAX=20");
  lines.push("");
  lines.push("#-----------------------------------");
  lines.push("# Security");
  lines.push("#-----------------------------------");
  lines.push(`SECRET_KEY=${secretKey}`);
  lines.push("ACCESS_TOKEN_EXPIRES_IN=31536000");
  lines.push("");
  lines.push("#-----------------------------------");
  lines.push("# Multi-tenancy");
  lines.push("#-----------------------------------");
  lines.push(`MULTI_TENANT=${config.multiTenant}`);
  lines.push(`PUBLIC_REGISTRATION=${config.publicRegistration}`);
  if (!config.multiTenant) {
    lines.push("DEFAULT_ROLE_REGISTERED=user");
  }
  lines.push("");
  lines.push("#-----------------------------------");
  lines.push("# Real-time (WebSocket)");
  lines.push("#-----------------------------------");
  lines.push(`SOCKET_ENABLED=${config.socketEnabled}`);
  if (config.socketEnabled) {
    lines.push('SOCKET_CORS_ENABLED_ORIGINS="http://localhost:3000,http://localhost:8056"');
    lines.push("SOCKET_PATH=/realtime");
    if (config.cacheAdapter === "redis" && config.redisUrl) {
      lines.push("SOCKET_REDIS_ENABLED=true");
      lines.push(`SOCKET_REDIS_URL=${config.redisUrl}`);
    }
  }
  lines.push("");
  lines.push("#-----------------------------------");
  lines.push("# Cache");
  lines.push("#-----------------------------------");
  lines.push("CACHE_ENABLED=true");
  lines.push(`CACHE_ADAPTER=${config.cacheAdapter}`);
  lines.push("CACHE_TTL=300");
  lines.push("CACHE_STRATEGY=explicit");
  if (config.cacheAdapter === "memory") {
    lines.push("CACHE_SIZE_GB=1");
  } else if (config.cacheAdapter === "redis" && config.redisUrl) {
    lines.push(`CACHE_REDIS_URL=${config.redisUrl}`);
  }
  lines.push("");
  lines.push("#-----------------------------------");
  lines.push("# Storage");
  lines.push("#-----------------------------------");
  if (config.storageDriver === "LOCAL") {
    lines.push('STORAGE_SERVICES_ENABLED="LOCAL"');
    lines.push('STORAGE_DEFAULT_SERVICE="LOCAL"');
    lines.push("STORAGE_TEMP_PATH=./.temp");
    lines.push("");
    lines.push("# Local Storage");
    lines.push("LOCAL_STORAGE_DRIVER=LOCAL");
    lines.push('LOCAL_STORAGE_PATH="./uploads"');
  } else if (config.storageDriver === "S3" && config.s3Config) {
    lines.push('STORAGE_SERVICES_ENABLED="S3"');
    lines.push('STORAGE_DEFAULT_SERVICE="S3"');
    lines.push("STORAGE_TEMP_PATH=./.temp");
    lines.push("");
    lines.push("# S3 Compatible Storage");
    lines.push("S3_STORAGE_DRIVER=S3");
    lines.push(`S3_STORAGE_ENDPOINT=${config.s3Config.endpoint}`);
    lines.push(`S3_STORAGE_BUCKET=${config.s3Config.bucket}`);
    lines.push(`S3_STORAGE_ACCESS_KEY_ID=${config.s3Config.accessKey}`);
    lines.push(`S3_STORAGE_SECRET_ACCESS_KEY=${config.s3Config.secretKey}`);
    lines.push(`S3_STORAGE_REGION=${config.s3Config.region}`);
  }
  lines.push("");
  lines.push("#-----------------------------------");
  lines.push("# Authentication");
  lines.push("#-----------------------------------");
  lines.push(`AUTH_SERVICES_ENABLED=${config.authServices.join(",")}`);
  lines.push('AUTH_APP_URL="http://localhost:3000,http://localhost:8056"');
  lines.push("");
  if (config.authServices.includes("GOOGLE")) {
    lines.push("# Google OAuth");
    lines.push("GOOGLE_CLIENT_ID=your_google_client_id");
    lines.push("GOOGLE_CLIENT_SECRET=your_google_client_secret");
    lines.push("");
  }
  if (config.authServices.includes("FACEBOOK")) {
    lines.push("# Facebook OAuth");
    lines.push("FACEBOOK_CLIENT_ID=your_facebook_client_id");
    lines.push("FACEBOOK_CLIENT_SECRET=your_facebook_client_secret");
    lines.push("");
  }
  if (config.authServices.includes("GITHUB")) {
    lines.push("# GitHub OAuth");
    lines.push("GITHUB_CLIENT_ID=your_github_client_id");
    lines.push("GITHUB_CLIENT_SECRET=your_github_client_secret");
    lines.push("");
  }
  if (config.authServices.includes("APPLE")) {
    lines.push("# Apple Sign In");
    lines.push("APPLE_CLIENT_ID=your_apple_client_id");
    lines.push("APPLE_CLIENT_SECRET=your_apple_client_secret");
    lines.push("APPLE_TEAM_ID=your_apple_team_id");
    lines.push("APPLE_KEY_ID=your_apple_key_id");
    lines.push("");
  }
  lines.push("#-----------------------------------");
  lines.push("# CORS");
  lines.push("#-----------------------------------");
  lines.push('AUTH_CORS_ALLOWED_ORIGINS="http://localhost:3000,http://localhost:8056"');
  lines.push("AUTH_CORS_ALLOW_ANY_PORT=true");
  lines.push("AUTH_CORS_CREDENTIALS=true");
  lines.push("");
  lines.push("#-----------------------------------");
  lines.push("# Cookies");
  lines.push("#-----------------------------------");
  lines.push("AUTH_COOKIE_HTTP_ONLY=true");
  lines.push("AUTH_COOKIE_SECURE=false");
  lines.push("AUTH_COOKIE_SAME_SITE=lax");
  lines.push("AUTH_COOKIE_PATH=/");
  lines.push("");
  if (config.mailEnabled) {
    lines.push("#-----------------------------------");
    lines.push("# Mail");
    lines.push("#-----------------------------------");
    lines.push('MAIL_SENDERS_ENABLED="SMTP"');
    lines.push('MAIL_DEFAULT_SENDER="SMTP"');
    lines.push("SEND_WELCOME_EMAIL=true");
    lines.push("");
    lines.push("# SMTP Configuration");
    lines.push("SMTP_SMTP_HOST=smtp.example.com");
    lines.push("SMTP_SMTP_PORT=587");
    lines.push("SMTP_SMTP_SECURE=false");
    lines.push("SMTP_SMTP_USER=your_smtp_user");
    lines.push("SMTP_SMTP_PASS=your_smtp_password");
    lines.push('SMTP_FROM_ADDRESS="Your App" <noreply@example.com>');
    lines.push("");
  }
  lines.push("#-----------------------------------");
  lines.push("# OpenAPI Documentation");
  lines.push("#-----------------------------------");
  lines.push(`OPENAPI_ENABLED=${config.openApiEnabled}`);
  if (config.openApiEnabled) {
    lines.push("OPENAPI_INCLUDE_AUTH=true");
    lines.push("OPENAPI_INCLUDE_SCHEMA=true");
    lines.push("OPENAPI_INCLUDE_PERMISSIONS=true");
  }
  lines.push("");
  return lines.join("\n");
}
function generateEnvExample(config) {
  const lines = [];
  lines.push("# Database (PostgreSQL 14+ required)");
  lines.push('DATABASE_URL="postgresql://username:password@localhost:5432/baasix"');
  lines.push("");
  lines.push("# Server");
  lines.push("PORT=8056");
  lines.push("NODE_ENV=development");
  lines.push("");
  lines.push("# Security (REQUIRED - generate unique keys)");
  lines.push("SECRET_KEY=your-secret-key-minimum-32-characters-long");
  lines.push("");
  lines.push("# Features");
  lines.push(`MULTI_TENANT=${config.multiTenant}`);
  lines.push(`PUBLIC_REGISTRATION=${config.publicRegistration}`);
  lines.push(`SOCKET_ENABLED=${config.socketEnabled}`);
  lines.push("");
  lines.push("# Storage");
  lines.push(`STORAGE_DEFAULT_SERVICE="${config.storageDriver}"`);
  if (config.storageDriver === "LOCAL") {
    lines.push('LOCAL_STORAGE_PATH="./uploads"');
  } else {
    lines.push("S3_STORAGE_ENDPOINT=your-s3-endpoint");
    lines.push("S3_STORAGE_BUCKET=your-bucket-name");
    lines.push("S3_STORAGE_ACCESS_KEY_ID=your-access-key");
    lines.push("S3_STORAGE_SECRET_ACCESS_KEY=your-secret-key");
  }
  lines.push("");
  lines.push("# Cache");
  lines.push(`CACHE_ADAPTER=${config.cacheAdapter}`);
  if (config.cacheAdapter === "redis") {
    lines.push("CACHE_REDIS_URL=redis://localhost:6379");
  }
  lines.push("");
  lines.push("# Auth");
  lines.push(`AUTH_SERVICES_ENABLED=${config.authServices.join(",")}`);
  lines.push("");
  return lines.join("\n");
}
function generateReadme(config) {
  return `# ${config.projectName}

A Baasix Backend-as-a-Service project.

## Configuration

| Feature | Status |
|---------|--------|
| Multi-tenancy | ${config.multiTenant ? "\u2705 Enabled" : "\u274C Disabled"} |
| Public Registration | ${config.publicRegistration ? "\u2705 Enabled" : "\u274C Disabled"} |
| Real-time (WebSocket) | ${config.socketEnabled ? "\u2705 Enabled" : "\u274C Disabled"} |
| Storage | ${config.storageDriver} |
| Cache | ${config.cacheAdapter} |
| Auth Methods | ${config.authServices.join(", ")} |
| OpenAPI Docs | ${config.openApiEnabled ? "\u2705 Enabled" : "\u274C Disabled"} |

## Getting Started

1. **Configure your database**

   Edit \`.env\` and verify your PostgreSQL connection:
   \`\`\`
   DATABASE_URL="postgresql://username:password@localhost:5432/baasix"
   \`\`\`

2. **Start the server**

   \`\`\`bash
   npm run dev
   \`\`\`

3. **Access the API**

   - API: http://localhost:8056
   - ${config.openApiEnabled ? "Swagger UI: http://localhost:8056/documentation" : "OpenAPI: Disabled"}
   - Default admin: admin@baasix.com / admin@123

## Project Structure

\`\`\`
${config.projectName}/
\u251C\u2500\u2500 .env                 # Environment configuration
\u251C\u2500\u2500 .env.example         # Example configuration
\u251C\u2500\u2500 package.json
\u251C\u2500\u2500 server.js            # Server entry point
\u251C\u2500\u2500 extensions/          # Custom hooks and endpoints
\u251C\u2500\u2500 migrations/          # Database migrations
${config.storageDriver === "LOCAL" ? "\u2514\u2500\u2500 uploads/           # Local file storage" : ""}
\`\`\`

## Extensions

Place your custom hooks and endpoints in the \`extensions/\` directory:

- **Endpoint extensions**: Add custom API routes
- **Hook extensions**: Add lifecycle hooks (before/after CRUD)

See [Extensions Documentation](https://baasix.com/docs/extensions) for details.

## Migrations

\`\`\`bash
# Create a migration
npx baasix migrate create -n create_products_table

# Run migrations
npx baasix migrate run

# Check status
npx baasix migrate status
\`\`\`

## Documentation

- [Baasix Documentation](https://baasix.com/docs)
- [SDK Guide](https://baasix.com/docs/sdk-guide)
- [API Reference](https://baasix.com/docs/api-reference)
`;
}
function generateNextJsEnvContent(config) {
  const lines = [];
  lines.push("#-----------------------------------");
  lines.push("# Baasix API Connection");
  lines.push("#-----------------------------------");
  lines.push("# URL of your Baasix API server");
  lines.push("NEXT_PUBLIC_BAASIX_URL=http://localhost:8056");
  lines.push("");
  lines.push("# Note: Create a separate Baasix API project using:");
  lines.push("#   npx baasix init --template api");
  lines.push("");
  return lines.join("\n");
}
async function createNextJsProject(projectPath, config, useAppRouter) {
  const packageJson = {
    name: config.projectName,
    version: "0.1.0",
    private: true,
    scripts: {
      dev: "next dev",
      build: "next build",
      start: "next start",
      lint: "next lint"
    },
    dependencies: {
      "@tspvivek/baasix-sdk": "latest",
      next: "^14.0.0",
      react: "^18.2.0",
      "react-dom": "^18.2.0"
    },
    devDependencies: {
      "@types/node": "^20.0.0",
      "@types/react": "^18.2.0",
      "@types/react-dom": "^18.2.0",
      typescript: "^5.0.0"
    }
  };
  await fs.writeFile(
    path2.join(projectPath, "package.json"),
    JSON.stringify(packageJson, null, 2)
  );
  const envContent = generateNextJsEnvContent(config);
  await fs.writeFile(path2.join(projectPath, ".env.local"), envContent);
  const tsconfig = {
    compilerOptions: {
      target: "es5",
      lib: ["dom", "dom.iterable", "esnext"],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "preserve",
      incremental: true,
      plugins: [{ name: "next" }],
      paths: {
        "@/*": [useAppRouter ? "./src/*" : "./*"]
      }
    },
    include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    exclude: ["node_modules"]
  };
  await fs.writeFile(
    path2.join(projectPath, "tsconfig.json"),
    JSON.stringify(tsconfig, null, 2)
  );
  const nextConfig = `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
`;
  await fs.writeFile(path2.join(projectPath, "next.config.mjs"), nextConfig);
  if (useAppRouter) {
    await fs.mkdir(path2.join(projectPath, "src", "app"), { recursive: true });
    await fs.mkdir(path2.join(projectPath, "src", "lib"), { recursive: true });
    const baasixClient = `import { createBaasix } from "@tspvivek/baasix-sdk";

export const baasix = createBaasix({
  url: process.env.NEXT_PUBLIC_BAASIX_URL || "http://localhost:8056",
  authMode: "jwt",
  autoRefresh: true,
});

// Re-export for convenience
export type { User, Role, QueryParams, Filter } from "@tspvivek/baasix-sdk";
`;
    await fs.writeFile(path2.join(projectPath, "src", "lib", "baasix.ts"), baasixClient);
    const layout = `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "${config.projectName}",
  description: "Built with Baasix",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;
    await fs.writeFile(path2.join(projectPath, "src", "app", "layout.tsx"), layout);
    const globalsCss = `* {
  box-sizing: border-box;
  padding: 0;
  margin: 0;
}

html,
body {
  max-width: 100vw;
  overflow-x: hidden;
  font-family: system-ui, -apple-system, sans-serif;
}

body {
  background: #0a0a0a;
  color: #ededed;
}

a {
  color: #0070f3;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}
`;
    await fs.writeFile(path2.join(projectPath, "src", "app", "globals.css"), globalsCss);
    const page = `"use client";

import { useState, useEffect } from "react";
import { baasix, type User } from "@/lib/baasix";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    baasix.auth.getCachedUser().then((u) => {
      setUser(u);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, []);

  const handleLogin = async () => {
    setError(null);
    try {
      const { user } = await baasix.auth.login({
        email: "admin@baasix.com",
        password: "admin@123",
      });
      setUser(user);
    } catch (err) {
      setError("Login failed. Make sure your Baasix API server is running.");
      console.error("Login failed:", err);
    }
  };

  const handleLogout = async () => {
    await baasix.auth.logout();
    setUser(null);
  };

  if (loading) {
    return (
      <main style={{ padding: "2rem", textAlign: "center" }}>
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
      <h1 style={{ marginBottom: "1rem" }}>\u{1F680} ${config.projectName}</h1>
      <p style={{ marginBottom: "2rem", color: "#888" }}>
        Next.js Frontend with Baasix SDK
      </p>

      {error && (
        <div style={{ padding: "1rem", background: "#3a1a1a", borderRadius: "8px", marginBottom: "1rem", color: "#ff6b6b" }}>
          {error}
        </div>
      )}

      {user ? (
        <div>
          <p style={{ marginBottom: "1rem" }}>
            Welcome, <strong>{user.email}</strong>!
          </p>
          <button
            onClick={handleLogout}
            style={{
              padding: "0.5rem 1rem",
              background: "#333",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      ) : (
        <div>
          <p style={{ marginBottom: "1rem" }}>Not logged in</p>
          <button
            onClick={handleLogin}
            style={{
              padding: "0.5rem 1rem",
              background: "#0070f3",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Login as Admin
          </button>
        </div>
      )}

      <div style={{ marginTop: "3rem", padding: "1rem", background: "#111", borderRadius: "8px" }}>
        <h2 style={{ marginBottom: "0.5rem", fontSize: "1.2rem" }}>Getting Started</h2>
        <p style={{ marginBottom: "1rem", color: "#888", fontSize: "0.9rem" }}>
          This is a frontend-only Next.js app. You need a separate Baasix API server.
        </p>
        <ol style={{ paddingLeft: "1.5rem", lineHeight: "1.8" }}>
          <li>Create a Baasix API project: <code>npx baasix init --template api</code></li>
          <li>Start the API server: <code>cd your-api && npm run dev</code></li>
          <li>Update <code>.env.local</code> with your API URL if needed</li>
          <li>Start this Next.js app: <code>npm run dev</code></li>
        </ol>
      </div>

      <div style={{ marginTop: "1.5rem", padding: "1rem", background: "#111", borderRadius: "8px" }}>
        <h2 style={{ marginBottom: "0.5rem", fontSize: "1.2rem" }}>API Connection</h2>
        <p style={{ color: "#888", fontSize: "0.9rem" }}>
          Currently configured to connect to: <code>{process.env.NEXT_PUBLIC_BAASIX_URL || "http://localhost:8056"}</code>
        </p>
      </div>
    </main>
  );
}
`;
    await fs.writeFile(path2.join(projectPath, "src", "app", "page.tsx"), page);
  } else {
    await fs.mkdir(path2.join(projectPath, "pages"), { recursive: true });
    await fs.mkdir(path2.join(projectPath, "lib"), { recursive: true });
    await fs.mkdir(path2.join(projectPath, "styles"), { recursive: true });
    const baasixClient = `import { createBaasix } from "@tspvivek/baasix-sdk";

export const baasix = createBaasix({
  url: process.env.NEXT_PUBLIC_BAASIX_URL || "http://localhost:8056",
  authMode: "jwt",
  autoRefresh: true,
});

export type { User, Role, QueryParams, Filter } from "@tspvivek/baasix-sdk";
`;
    await fs.writeFile(path2.join(projectPath, "lib", "baasix.ts"), baasixClient);
    const app = `import type { AppProps } from "next/app";
import "@/styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
`;
    await fs.writeFile(path2.join(projectPath, "pages", "_app.tsx"), app);
    const globalsCss = `* {
  box-sizing: border-box;
  padding: 0;
  margin: 0;
}

html,
body {
  max-width: 100vw;
  overflow-x: hidden;
  font-family: system-ui, -apple-system, sans-serif;
}

body {
  background: #0a0a0a;
  color: #ededed;
}

a {
  color: #0070f3;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}
`;
    await fs.writeFile(path2.join(projectPath, "styles", "globals.css"), globalsCss);
    const index = `import { useState, useEffect } from "react";
import { baasix, type User } from "@/lib/baasix";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    baasix.auth.getCachedUser().then((u) => {
      setUser(u);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, []);

  const handleLogin = async () => {
    setError(null);
    try {
      const { user } = await baasix.auth.login({
        email: "admin@baasix.com",
        password: "admin@123",
      });
      setUser(user);
    } catch (err) {
      setError("Login failed. Make sure your Baasix API server is running.");
      console.error("Login failed:", err);
    }
  };

  const handleLogout = async () => {
    await baasix.auth.logout();
    setUser(null);
  };

  if (loading) {
    return (
      <main style={{ padding: "2rem", textAlign: "center" }}>
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
      <h1 style={{ marginBottom: "1rem" }}>\u{1F680} ${config.projectName}</h1>
      <p style={{ marginBottom: "2rem", color: "#888" }}>
        Next.js Frontend with Baasix SDK
      </p>

      {error && (
        <div style={{ padding: "1rem", background: "#3a1a1a", borderRadius: "8px", marginBottom: "1rem", color: "#ff6b6b" }}>
          {error}
        </div>
      )}

      {user ? (
        <div>
          <p style={{ marginBottom: "1rem" }}>
            Welcome, <strong>{user.email}</strong>!
          </p>
          <button
            onClick={handleLogout}
            style={{
              padding: "0.5rem 1rem",
              background: "#333",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      ) : (
        <div>
          <p style={{ marginBottom: "1rem" }}>Not logged in</p>
          <button
            onClick={handleLogin}
            style={{
              padding: "0.5rem 1rem",
              background: "#0070f3",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Login as Admin
          </button>
        </div>
      )}

      <div style={{ marginTop: "3rem", padding: "1rem", background: "#111", borderRadius: "8px" }}>
        <h2 style={{ marginBottom: "0.5rem", fontSize: "1.2rem" }}>Getting Started</h2>
        <p style={{ marginBottom: "1rem", color: "#888", fontSize: "0.9rem" }}>
          This is a frontend-only Next.js app. You need a separate Baasix API server.
        </p>
        <ol style={{ paddingLeft: "1.5rem", lineHeight: "1.8" }}>
          <li>Create a Baasix API project: <code>npx baasix init --template api</code></li>
          <li>Start the API server: <code>cd your-api && npm run dev</code></li>
          <li>Update <code>.env.local</code> with your API URL if needed</li>
          <li>Start this Next.js app: <code>npm run dev</code></li>
        </ol>
      </div>

      <div style={{ marginTop: "1.5rem", padding: "1rem", background: "#111", borderRadius: "8px" }}>
        <h2 style={{ marginBottom: "0.5rem", fontSize: "1.2rem" }}>API Connection</h2>
        <p style={{ color: "#888", fontSize: "0.9rem" }}>
          Currently configured to connect to: <code>{process.env.NEXT_PUBLIC_BAASIX_URL || "http://localhost:8056"}</code>
        </p>
      </div>
    </main>
  );
}
`;
    await fs.writeFile(path2.join(projectPath, "pages", "index.tsx"), index);
  }
  const gitignore = `# Dependencies
node_modules/
.pnp
.pnp.js

# Testing
coverage/

# Next.js
.next/
out/
build/

# Environment
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Misc
.DS_Store
*.pem
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Vercel
.vercel

# TypeScript
*.tsbuildinfo
next-env.d.ts
`;
  await fs.writeFile(path2.join(projectPath, ".gitignore"), gitignore);
  const readme = `# ${config.projectName}

A Next.js frontend project that connects to a Baasix API server using the SDK.

## Architecture

This is a **frontend-only** project. You need a separate Baasix API server running.

\`\`\`
\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510     HTTP/WS      \u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
\u2502   Next.js App   \u2502 \u25C4\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u25BA \u2502   Baasix API    \u2502
\u2502   (Frontend)    \u2502   via SDK        \u2502   (Backend)     \u2502
\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518                  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518
     Port 3000                            Port 8056
\`\`\`

## Getting Started

### 1. Start your Baasix API Server

If you don't have a Baasix API project yet, create one:

\`\`\`bash
npx baasix init --template api my-api
cd my-api
npm install
npm run dev
\`\`\`

### 2. Configure this Frontend

Update \`.env.local\` if your API is running on a different URL:

\`\`\`
NEXT_PUBLIC_BAASIX_URL=http://localhost:8056
\`\`\`

### 3. Start the Frontend

\`\`\`bash
npm install
npm run dev
\`\`\`

### 4. Open your browser

- Frontend: http://localhost:3000

## Default Admin Credentials

Use these credentials to login (configured in your API server):

- Email: admin@baasix.com
- Password: admin@123

## Project Structure

\`\`\`
${config.projectName}/
\u251C\u2500\u2500 .env.local           # API URL configuration
\u251C\u2500\u2500 package.json
${useAppRouter ? `\u251C\u2500\u2500 src/
\u2502   \u251C\u2500\u2500 app/             # Next.js App Router pages
\u2502   \u2502   \u251C\u2500\u2500 layout.tsx
\u2502   \u2502   \u251C\u2500\u2500 page.tsx
\u2502   \u2502   \u2514\u2500\u2500 globals.css
\u2502   \u2514\u2500\u2500 lib/
\u2502       \u2514\u2500\u2500 baasix.ts    # SDK client` : `\u251C\u2500\u2500 pages/              # Next.js Pages Router
\u2502   \u251C\u2500\u2500 _app.tsx
\u2502   \u2514\u2500\u2500 index.tsx
\u251C\u2500\u2500 lib/
\u2502   \u2514\u2500\u2500 baasix.ts       # SDK client
\u2514\u2500\u2500 styles/
    \u2514\u2500\u2500 globals.css`}
\`\`\`

## SDK Usage

The SDK is pre-configured in \`${useAppRouter ? "src/lib/baasix.ts" : "lib/baasix.ts"}\`:

\`\`\`typescript
import { baasix } from "${useAppRouter ? "@/lib/baasix" : "@/lib/baasix"}";

// Authentication
const { user } = await baasix.auth.login({ email, password });
await baasix.auth.logout();

// CRUD operations
const items = await baasix.items("posts").list();
const item = await baasix.items("posts").create({ title: "Hello" });
await baasix.items("posts").update(id, { title: "Updated" });
await baasix.items("posts").delete(id);
\`\`\`

## Documentation

- [Baasix Documentation](https://baasix.com/docs)
- [SDK Guide](https://baasix.com/docs/sdk-guide)
- [Next.js Documentation](https://nextjs.org/docs)
`;
  await fs.writeFile(path2.join(projectPath, "README.md"), readme);
}
var init = new Command("init").description("Initialize a new Baasix project").option("-c, --cwd <path>", "Working directory", process.cwd()).option("-t, --template <template>", "Project template (api, nextjs, nextjs-app)").option("-n, --name <name>", "Project name").option("-y, --yes", "Skip confirmation prompts").action(initAction);

// src/commands/generate.ts
import { existsSync as existsSync4 } from "fs";
import fs3 from "fs/promises";
import path4 from "path";
import {
  cancel as cancel2,
  confirm as confirm2,
  intro as intro2,
  isCancel as isCancel2,
  log as log2,
  outro as outro2,
  select as select2,
  spinner as spinner2,
  text as text2
} from "@clack/prompts";
import chalk2 from "chalk";
import { Command as Command2 } from "commander";
import { format as prettierFormat } from "prettier";

// src/utils/get-config.ts
import { existsSync as existsSync3 } from "fs";
import fs2 from "fs/promises";
import path3 from "path";
import { parse } from "dotenv";
async function getConfig(cwd) {
  const envPath = path3.join(cwd, ".env");
  let envVars = {};
  if (existsSync3(envPath)) {
    const envContent = await fs2.readFile(envPath, "utf-8");
    envVars = parse(envContent);
  }
  const mergedEnv = { ...envVars, ...process.env };
  const url = mergedEnv.BAASIX_URL || mergedEnv.API_URL || "http://localhost:8056";
  const email = mergedEnv.BAASIX_EMAIL || mergedEnv.ADMIN_EMAIL;
  const password = mergedEnv.BAASIX_PASSWORD || mergedEnv.ADMIN_PASSWORD;
  const token = mergedEnv.BAASIX_TOKEN || mergedEnv.BAASIX_AUTH_TOKEN;
  if (!url) {
    return null;
  }
  return {
    url,
    email,
    password,
    token
  };
}

// src/utils/api-client.ts
import axios from "axios";
var client = null;
var authToken = null;
async function createApiClient(config) {
  if (client) {
    return client;
  }
  client = axios.create({
    baseURL: config.url,
    timeout: 3e4,
    headers: {
      "Content-Type": "application/json"
    }
  });
  if (config.token) {
    authToken = config.token;
    client.defaults.headers.common["Authorization"] = `Bearer ${authToken}`;
  } else if (config.email && config.password) {
    try {
      const response = await client.post("/auth/login", {
        email: config.email,
        password: config.password
      });
      authToken = response.data.token;
      client.defaults.headers.common["Authorization"] = `Bearer ${authToken}`;
    } catch (error) {
      throw new Error(`Failed to authenticate: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
  return client;
}
async function fetchSchemas(config) {
  const client2 = await createApiClient(config);
  const response = await client2.get("/schemas", {
    params: { limit: -1 }
  });
  return response.data.data || [];
}
async function fetchMigrations(config) {
  const client2 = await createApiClient(config);
  const response = await client2.get("/migrations");
  return response.data.data || [];
}
async function runMigrations(config, options) {
  const client2 = await createApiClient(config);
  const response = await client2.post("/migrations/run", options || {});
  return response.data;
}
async function rollbackMigrations(config, options) {
  const client2 = await createApiClient(config);
  const response = await client2.post("/migrations/rollback", options || {});
  return response.data;
}

// src/commands/generate.ts
async function generateAction(opts) {
  const cwd = path4.resolve(opts.cwd);
  intro2(chalk2.bgBlue.black(" Baasix Type Generator "));
  const config = await getConfig(cwd);
  if (!config && !opts.url) {
    log2.error("No Baasix configuration found. Create a .env file with BAASIX_URL or use --url flag.");
    process.exit(1);
  }
  const baasixUrl = opts.url || config?.url || "http://localhost:8056";
  let target = opts.target;
  if (!target) {
    const result = await select2({
      message: "What do you want to generate?",
      options: [
        {
          value: "types",
          label: "TypeScript Types",
          hint: "Generate types for all collections"
        },
        {
          value: "sdk-types",
          label: "SDK Collection Types",
          hint: "Generate typed SDK helpers for collections"
        },
        {
          value: "schema-json",
          label: "Schema JSON",
          hint: "Export all schemas as JSON"
        }
      ]
    });
    if (isCancel2(result)) {
      cancel2("Operation cancelled");
      process.exit(0);
    }
    target = result;
  }
  let outputPath = opts.output;
  if (!outputPath) {
    const defaultPath = target === "schema-json" ? "schemas.json" : "baasix.d.ts";
    const result = await text2({
      message: "Output file path:",
      placeholder: defaultPath,
      defaultValue: defaultPath
    });
    if (isCancel2(result)) {
      cancel2("Operation cancelled");
      process.exit(0);
    }
    outputPath = result;
  }
  const s = spinner2();
  s.start("Fetching schemas from Baasix...");
  try {
    const schemas = await fetchSchemas({
      url: baasixUrl,
      email: config?.email,
      password: config?.password,
      token: config?.token
    });
    if (!schemas || schemas.length === 0) {
      s.stop("No schemas found");
      log2.warn("No schemas found in your Baasix instance.");
      process.exit(0);
    }
    s.message(`Found ${schemas.length} schemas`);
    let output;
    if (target === "types") {
      output = generateTypeScriptTypes(schemas);
    } else if (target === "sdk-types") {
      output = generateSDKTypes(schemas);
    } else {
      output = JSON.stringify(schemas, null, 2);
    }
    if (target !== "schema-json") {
      try {
        output = await prettierFormat(output, {
          parser: "typescript",
          printWidth: 100,
          tabWidth: 2,
          singleQuote: true
        });
      } catch {
      }
    }
    const fullOutputPath = path4.resolve(cwd, outputPath);
    if (existsSync4(fullOutputPath) && !opts.yes) {
      s.stop("File already exists");
      const overwrite = await confirm2({
        message: `File ${outputPath} already exists. Overwrite?`,
        initialValue: true
      });
      if (isCancel2(overwrite) || !overwrite) {
        cancel2("Operation cancelled");
        process.exit(0);
      }
      s.start("Writing file...");
    }
    const outputDir = path4.dirname(fullOutputPath);
    if (!existsSync4(outputDir)) {
      await fs3.mkdir(outputDir, { recursive: true });
    }
    await fs3.writeFile(fullOutputPath, output);
    s.stop("Types generated successfully");
    outro2(chalk2.green(`\u2728 Generated ${outputPath}`));
    if (target === "types" || target === "sdk-types") {
      console.log();
      console.log(chalk2.bold("Usage:"));
      console.log(`  ${chalk2.dim("// Import types in your TypeScript files")}`);
      console.log(`  ${chalk2.cyan(`import type { Products, Users } from "./${outputPath.replace(/\.d\.ts$/, "")}";`)}`);
      console.log();
    }
  } catch (error) {
    s.stop("Failed to generate types");
    if (error instanceof Error) {
      log2.error(error.message);
    } else {
      log2.error("Unknown error occurred");
    }
    process.exit(1);
  }
}
function fieldTypeToTS(field, allSchemas) {
  if (field.relType && field.target) {
    const targetType = toPascalCase(field.target);
    const isSystemCollection = field.target.startsWith("baasix_");
    if (field.relType === "HasMany" || field.relType === "BelongsToMany") {
      return { type: `${targetType}[] | null` };
    }
    return { type: `${targetType} | null` };
  }
  const type = field.type?.toUpperCase();
  const nullable = field.allowNull !== false;
  const nullSuffix = nullable ? " | null" : "";
  const jsdocParts = [];
  if (field.validate) {
    if (field.validate.min !== void 0) jsdocParts.push(`@min ${field.validate.min}`);
    if (field.validate.max !== void 0) jsdocParts.push(`@max ${field.validate.max}`);
    if (field.validate.len) jsdocParts.push(`@length ${field.validate.len[0]}-${field.validate.len[1]}`);
    if (field.validate.isEmail) jsdocParts.push(`@format email`);
    if (field.validate.isUrl) jsdocParts.push(`@format url`);
    if (field.validate.isIP) jsdocParts.push(`@format ip`);
    if (field.validate.isUUID) jsdocParts.push(`@format uuid`);
    if (field.validate.regex) jsdocParts.push(`@pattern ${field.validate.regex}`);
  }
  if (field.values && typeof field.values === "object" && !Array.isArray(field.values)) {
    const vals = field.values;
    if (vals.length) jsdocParts.push(`@maxLength ${vals.length}`);
    if (vals.precision && vals.scale) jsdocParts.push(`@precision ${vals.precision},${vals.scale}`);
  }
  const jsdoc = jsdocParts.length > 0 ? jsdocParts.join(" ") : void 0;
  switch (type) {
    case "STRING":
    case "TEXT":
    case "UUID":
    case "SUID":
      return { type: `string${nullSuffix}`, jsdoc };
    case "INTEGER":
    case "BIGINT":
    case "FLOAT":
    case "REAL":
    case "DOUBLE":
    case "DECIMAL":
      return { type: `number${nullSuffix}`, jsdoc };
    case "BOOLEAN":
      return { type: `boolean${nullSuffix}`, jsdoc };
    case "DATE":
    case "DATETIME":
    case "TIME":
      return { type: `string${nullSuffix}`, jsdoc };
    // ISO date strings
    case "JSON":
    case "JSONB":
      return { type: `Record<string, unknown>${nullSuffix}`, jsdoc };
    case "ARRAY": {
      const vals = field.values;
      const arrayType = vals?.type || "unknown";
      const innerType = arrayType.toUpperCase() === "STRING" ? "string" : arrayType.toUpperCase() === "INTEGER" ? "number" : arrayType.toUpperCase() === "BOOLEAN" ? "boolean" : "unknown";
      return { type: `${innerType}[]${nullSuffix}`, jsdoc };
    }
    case "ENUM": {
      let enumValues;
      if (Array.isArray(field.values)) {
        enumValues = field.values;
      } else if (field.values && typeof field.values === "object") {
        const vals = field.values;
        if (Array.isArray(vals.values)) {
          enumValues = vals.values;
        }
      }
      if (enumValues && enumValues.length > 0) {
        const enumType = enumValues.map((v) => `"${v}"`).join(" | ");
        return { type: `(${enumType})${nullSuffix}`, jsdoc };
      }
      return { type: `string${nullSuffix}`, jsdoc };
    }
    case "GEOMETRY":
    case "POINT":
    case "LINESTRING":
    case "POLYGON":
      return { type: `GeoJSON.Geometry${nullSuffix}`, jsdoc };
    default:
      return { type: `unknown${nullSuffix}`, jsdoc };
  }
}
function toPascalCase(str) {
  return str.split(/[-_]/).map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join("");
}
function generateTypeScriptTypes(schemas) {
  const lines = [
    "/**",
    " * Auto-generated TypeScript types for Baasix collections",
    ` * Generated at: ${(/* @__PURE__ */ new Date()).toISOString()}`,
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
    ""
  ];
  const referencedSystemCollections = /* @__PURE__ */ new Set();
  for (const schema of schemas) {
    for (const field of Object.values(schema.schema.fields)) {
      const fieldDef = field;
      if (fieldDef.relType && fieldDef.target && fieldDef.target.startsWith("baasix_")) {
        referencedSystemCollections.add(fieldDef.target);
      }
    }
  }
  const systemSchemas = schemas.filter(
    (s) => referencedSystemCollections.has(s.collectionName)
  );
  for (const schema of systemSchemas) {
    const typeName = toPascalCase(schema.collectionName);
    const fields = schema.schema.fields;
    lines.push(`/**`);
    lines.push(` * ${schema.schema.name || schema.collectionName} (system collection)`);
    lines.push(` */`);
    lines.push(`export interface ${typeName} {`);
    for (const [fieldName, field] of Object.entries(fields)) {
      const fieldDef = field;
      if (fieldDef.relType) continue;
      const { type: tsType, jsdoc } = fieldTypeToTS(fieldDef, schemas);
      const optional = fieldDef.allowNull !== false && !fieldDef.primaryKey ? "?" : "";
      if (jsdoc) {
        lines.push(`  /** ${jsdoc} */`);
      }
      lines.push(`  ${fieldName}${optional}: ${tsType};`);
    }
    lines.push(`}`);
    lines.push("");
  }
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
      const fieldDef = field;
      const { type: tsType, jsdoc } = fieldTypeToTS(fieldDef, schemas);
      const optional = fieldDef.allowNull !== false && !fieldDef.primaryKey ? "?" : "";
      if (jsdoc) {
        lines.push(`  /** ${jsdoc} */`);
      }
      lines.push(`  ${fieldName}${optional}: ${tsType};`);
    }
    if (schema.schema.timestamps) {
      lines.push(`  createdAt?: string;`);
      lines.push(`  updatedAt?: string;`);
    }
    if (schema.schema.paranoid) {
      lines.push(`  deletedAt?: string | null;`);
    }
    lines.push(`}`);
    lines.push("");
  }
  lines.push("/**");
  lines.push(" * All collection names");
  lines.push(" */");
  lines.push("export type CollectionName =");
  for (const schema of userSchemas) {
    lines.push(`  | "${schema.collectionName}"`);
  }
  lines.push(";");
  lines.push("");
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
function generateSDKTypes(schemas) {
  const lines = [
    "/**",
    " * Auto-generated typed SDK helpers for Baasix collections",
    ` * Generated at: ${(/* @__PURE__ */ new Date()).toISOString()}`,
    " * ",
    " * Do not edit this file manually. Re-run 'baasix generate sdk-types' to update.",
    " */",
    "",
    'import { createBaasix } from "@tspvivek/baasix-sdk";',
    'import type { QueryParams, Filter, PaginatedResponse } from "@tspvivek/baasix-sdk";',
    ""
  ];
  lines.push(generateTypeScriptTypes(schemas));
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
var generate = new Command2("generate").alias("gen").description("Generate TypeScript types from Baasix schemas").option("-c, --cwd <path>", "Working directory", process.cwd()).option("-o, --output <path>", "Output file path").option("-t, --target <target>", "Generation target (types, sdk-types, schema-json)").option("--url <url>", "Baasix server URL").option("-y, --yes", "Skip confirmation prompts").action(generateAction);

// src/commands/extension.ts
import { existsSync as existsSync5 } from "fs";
import fs4 from "fs/promises";
import path5 from "path";
import {
  cancel as cancel3,
  confirm as confirm3,
  intro as intro3,
  isCancel as isCancel3,
  log as log3,
  outro as outro3,
  select as select3,
  spinner as spinner3,
  text as text3
} from "@clack/prompts";
import chalk3 from "chalk";
import { Command as Command3 } from "commander";
async function extensionAction(opts) {
  const cwd = path5.resolve(opts.cwd);
  intro3(chalk3.bgMagenta.black(" Baasix Extension Generator "));
  let extensionType = opts.type;
  if (!extensionType) {
    const result = await select3({
      message: "What type of extension do you want to create?",
      options: [
        {
          value: "hook",
          label: "Hook",
          hint: "Intercept and modify CRUD operations"
        },
        {
          value: "endpoint",
          label: "Custom Endpoint",
          hint: "Add new API routes"
        }
      ]
    });
    if (isCancel3(result)) {
      cancel3("Operation cancelled");
      process.exit(0);
    }
    extensionType = result;
  }
  let extensionName = opts.name;
  if (!extensionName) {
    const result = await text3({
      message: "What is your extension name?",
      placeholder: extensionType === "hook" ? "my-hook" : "my-endpoint",
      validate: (value) => {
        if (!value) return "Extension name is required";
        if (!/^[a-z0-9-_]+$/i.test(value)) return "Name must be alphanumeric with dashes or underscores";
        return void 0;
      }
    });
    if (isCancel3(result)) {
      cancel3("Operation cancelled");
      process.exit(0);
    }
    extensionName = result;
  }
  let collectionName = opts.collection;
  if (extensionType === "hook" && !collectionName) {
    const result = await text3({
      message: "Which collection should this hook apply to?",
      placeholder: "posts",
      validate: (value) => {
        if (!value) return "Collection name is required";
        return void 0;
      }
    });
    if (isCancel3(result)) {
      cancel3("Operation cancelled");
      process.exit(0);
    }
    collectionName = result;
  }
  let useTypeScript = opts.typescript ?? false;
  if (opts.typescript === void 0) {
    const result = await confirm3({
      message: "Use TypeScript?",
      initialValue: false
    });
    if (isCancel3(result)) {
      cancel3("Operation cancelled");
      process.exit(0);
    }
    useTypeScript = result;
  }
  const s = spinner3();
  s.start("Creating extension...");
  try {
    const extensionsDir = path5.join(cwd, "extensions");
    if (!existsSync5(extensionsDir)) {
      await fs4.mkdir(extensionsDir, { recursive: true });
    }
    const ext = useTypeScript ? "ts" : "js";
    const extensionDir = path5.join(extensionsDir, `baasix-${extensionType}-${extensionName}`);
    if (existsSync5(extensionDir)) {
      s.stop("Extension already exists");
      const overwrite = await confirm3({
        message: `Extension baasix-${extensionType}-${extensionName} already exists. Overwrite?`,
        initialValue: false
      });
      if (isCancel3(overwrite) || !overwrite) {
        cancel3("Operation cancelled");
        process.exit(0);
      }
    }
    await fs4.mkdir(extensionDir, { recursive: true });
    if (extensionType === "hook") {
      await createHookExtension(extensionDir, extensionName, collectionName, useTypeScript);
    } else {
      await createEndpointExtension(extensionDir, extensionName, useTypeScript);
    }
    s.stop("Extension created");
    outro3(chalk3.green(`\u2728 Extension created at extensions/baasix-${extensionType}-${extensionName}/`));
    console.log();
    console.log(chalk3.bold("Next steps:"));
    console.log(`  ${chalk3.dim("1.")} Edit ${chalk3.cyan(`extensions/baasix-${extensionType}-${extensionName}/index.${ext}`)}`);
    console.log(`  ${chalk3.dim("2.")} Restart your Baasix server to load the extension`);
    console.log();
  } catch (error) {
    s.stop("Failed to create extension");
    log3.error(error instanceof Error ? error.message : "Unknown error");
    process.exit(1);
  }
}
async function createHookExtension(extensionDir, name, collection, useTypeScript) {
  const ext = useTypeScript ? "ts" : "js";
  const typeAnnotations = useTypeScript ? `
import type { HooksService } from "@tspvivek/baasix";

interface HookContext {
  ItemsService: any;
  schemaManager: any;
  services: Record<string, any>;
}

interface HookPayload {
  data?: Record<string, any>;
  query?: Record<string, any>;
  id?: string | string[];
  accountability: {
    user: { id: string; email: string };
    role: { id: string; name: string };
  };
  collection: string;
  schema: any;
}
` : "";
  const hookContent = `${typeAnnotations}
/**
 * Hook extension for ${collection} collection
 * 
 * Available hooks:
 * - items.create (before/after creating an item)
 * - items.read (before/after reading items)
 * - items.update (before/after updating an item)
 * - items.delete (before/after deleting an item)
 */
export default (hooksService${useTypeScript ? ": HooksService" : ""}, context${useTypeScript ? ": HookContext" : ""}) => {
  const { ItemsService } = context;

  // Hook for creating items
  hooksService.registerHook(
    "${collection}",
    "items.create",
    async ({ data, accountability, collection, schema }${useTypeScript ? ": HookPayload" : ""}) => {
      console.log(\`[${name}] Creating \${collection} item:\`, data);
      
      // Example: Add created_by field
      // data.created_by = accountability.user.id;
      
      // Return modified data
      return { data };
    }
  );

  // Hook for reading items
  hooksService.registerHook(
    "${collection}",
    "items.read",
    async ({ query, data, accountability, collection, schema }${useTypeScript ? ": HookPayload" : ""}) => {
      console.log(\`[${name}] Reading \${collection} with query:\`, query);
      
      // Example: Filter results for non-admin users
      // if (accountability.role.name !== "administrator") {
      //   query.filter = { ...query.filter, published: true };
      // }
      
      return { query };
    }
  );

  // Hook for updating items
  hooksService.registerHook(
    "${collection}",
    "items.update",
    async ({ id, data, accountability, schema }${useTypeScript ? ": HookPayload" : ""}) => {
      console.log(\`[${name}] Updating item \${id}:\`, data);
      
      // Example: Add updated_by field
      // data.updated_by = accountability.user.id;
      
      return { id, data };
    }
  );

  // Hook for deleting items
  hooksService.registerHook(
    "${collection}",
    "items.delete",
    async ({ id, accountability }${useTypeScript ? ": HookPayload" : ""}) => {
      console.log(\`[${name}] Deleting item:\`, id);
      
      // Example: Soft delete instead of hard delete
      // const itemsService = new ItemsService("${collection}", { accountability, schema });
      // await itemsService.update(id, { deletedAt: new Date() });
      // return { skip: true }; // Skip the actual delete
      
      return { id };
    }
  );
};
`;
  await fs4.writeFile(path5.join(extensionDir, `index.${ext}`), hookContent);
  const readme = `# baasix-hook-${name}

A Baasix hook extension for the \`${collection}\` collection.

## Available Hooks

- \`items.create\` - Before/after creating an item
- \`items.read\` - Before/after reading items
- \`items.update\` - Before/after updating an item
- \`items.delete\` - Before/after deleting an item

## Usage

This extension is automatically loaded when placed in the \`extensions/\` directory.

Edit \`index.${ext}\` to customize the hook behavior.

## Documentation

See [Hooks Documentation](https://baasix.com/docs/hooks) for more details.
`;
  await fs4.writeFile(path5.join(extensionDir, "README.md"), readme);
}
async function createEndpointExtension(extensionDir, name, useTypeScript) {
  const ext = useTypeScript ? "ts" : "js";
  const typeAnnotations = useTypeScript ? `
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { APIError } from "@tspvivek/baasix";

interface EndpointContext {
  ItemsService: any;
  schemaManager: any;
  services: Record<string, any>;
}

interface RequestWithAccountability extends FastifyRequest {
  accountability?: {
    user: { id: string; email: string };
    role: { id: string; name: string };
  };
}
` : `import { APIError } from "@tspvivek/baasix";`;
  const endpointContent = `${typeAnnotations}

/**
 * Custom endpoint extension
 * 
 * Register custom routes on the Fastify app instance.
 */
const registerEndpoint = (app${useTypeScript ? ": FastifyInstance" : ""}, context${useTypeScript ? ": EndpointContext" : ""}) => {
  const { ItemsService } = context;

  // GET endpoint example
  app.get("/${name}", async (req${useTypeScript ? ": RequestWithAccountability" : ""}, res${useTypeScript ? ": FastifyReply" : ""}) => {
    try {
      // Check authentication (optional)
      if (!req.accountability || !req.accountability.user) {
        throw new APIError("Unauthorized", 401);
      }

      const { user, role } = req.accountability;

      // Your custom logic here
      const result = {
        message: "Hello from ${name} endpoint!",
        user: {
          id: user.id,
          email: user.email,
        },
        timestamp: new Date().toISOString(),
      };

      return res.send(result);
    } catch (error) {
      throw error;
    }
  });

  // POST endpoint example
  app.post("/${name}", async (req${useTypeScript ? ": RequestWithAccountability" : ""}, res${useTypeScript ? ": FastifyReply" : ""}) => {
    try {
      if (!req.accountability || !req.accountability.user) {
        throw new APIError("Unauthorized", 401);
      }

      const body = req.body${useTypeScript ? " as Record<string, any>" : ""};

      // Example: Create an item using ItemsService
      // const itemsService = new ItemsService("my_collection", {
      //   accountability: req.accountability,
      //   schema: context.schemaManager,
      // });
      // const itemId = await itemsService.createOne(body);

      return res.status(201).send({
        message: "Created successfully",
        data: body,
      });
    } catch (error) {
      throw error;
    }
  });

  // Parameterized endpoint example
  app.get("/${name}/:id", async (req${useTypeScript ? ": RequestWithAccountability" : ""}, res${useTypeScript ? ": FastifyReply" : ""}) => {
    try {
      const { id } = req.params${useTypeScript ? " as { id: string }" : ""};

      return res.send({
        message: \`Getting item \${id}\`,
        id,
      });
    } catch (error) {
      throw error;
    }
  });
};

export default {
  id: "${name}",
  handler: registerEndpoint,
};
`;
  await fs4.writeFile(path5.join(extensionDir, `index.${ext}`), endpointContent);
  const readme = `# baasix-endpoint-${name}

A Baasix custom endpoint extension.

## Endpoints

- \`GET /${name}\` - Example GET endpoint
- \`POST /${name}\` - Example POST endpoint
- \`GET /${name}/:id\` - Example parameterized endpoint

## Usage

This extension is automatically loaded when placed in the \`extensions/\` directory.

Edit \`index.${ext}\` to customize the endpoints.

## Documentation

See [Custom Endpoints Documentation](https://baasix.com/docs/custom-endpoints) for more details.
`;
  await fs4.writeFile(path5.join(extensionDir, "README.md"), readme);
}
var extension = new Command3("extension").alias("ext").description("Generate a new Baasix extension (hook or endpoint)").option("-c, --cwd <path>", "Working directory", process.cwd()).option("-t, --type <type>", "Extension type (hook, endpoint)").option("-n, --name <name>", "Extension name").option("--collection <collection>", "Collection name (for hooks)").option("--typescript", "Use TypeScript").option("--no-typescript", "Use JavaScript").action(extensionAction);

// src/commands/migrate.ts
import { existsSync as existsSync6 } from "fs";
import fs5 from "fs/promises";
import path6 from "path";
import {
  cancel as cancel4,
  confirm as confirm4,
  intro as intro4,
  isCancel as isCancel4,
  log as log4,
  outro as outro4,
  select as select4,
  spinner as spinner4,
  text as text4
} from "@clack/prompts";
import chalk4 from "chalk";
import { Command as Command4 } from "commander";
async function migrateAction(action, opts) {
  const cwd = path6.resolve(opts.cwd);
  intro4(chalk4.bgMagenta.black(" Baasix Migrations "));
  const config = await getConfig(cwd);
  if (!config && !opts.url) {
    log4.error(
      "No Baasix configuration found. Create a .env file with BAASIX_URL or use --url flag."
    );
    process.exit(1);
  }
  const effectiveConfig = config ? { ...config, url: opts.url || config.url } : { url: opts.url || "http://localhost:8056" };
  let selectedAction = action || opts.action;
  if (!selectedAction) {
    const result = await select4({
      message: "What migration action do you want to perform?",
      options: [
        {
          value: "status",
          label: "Status",
          hint: "Show current migration status"
        },
        {
          value: "list",
          label: "List",
          hint: "List all available migrations"
        },
        {
          value: "run",
          label: "Run",
          hint: "Run pending migrations"
        },
        {
          value: "create",
          label: "Create",
          hint: "Create a new migration file"
        },
        {
          value: "rollback",
          label: "Rollback",
          hint: "Rollback the last batch of migrations"
        },
        {
          value: "reset",
          label: "Reset",
          hint: "Rollback all migrations (dangerous!)"
        }
      ]
    });
    if (isCancel4(result)) {
      cancel4("Operation cancelled");
      process.exit(0);
    }
    selectedAction = result;
  }
  const s = spinner4();
  try {
    switch (selectedAction) {
      case "status":
        await showStatus(s, effectiveConfig, cwd);
        break;
      case "list":
        await listMigrations(s, effectiveConfig, cwd);
        break;
      case "run":
        await runMigrations2(s, effectiveConfig, cwd, opts.yes);
        break;
      case "create":
        await createMigration(s, cwd, opts.name);
        break;
      case "rollback":
        await rollbackMigrations2(s, effectiveConfig, cwd, opts.steps || 1, opts.yes);
        break;
      case "reset":
        await resetMigrations(s, effectiveConfig, cwd, opts.yes);
        break;
    }
  } catch (error) {
    s.stop("Migration failed");
    if (error instanceof Error) {
      log4.error(error.message);
    } else {
      log4.error("Unknown error occurred");
    }
    process.exit(1);
  }
}
async function showStatus(s, config, cwd) {
  s.start("Checking migration status...");
  const executedMigrations = await getExecutedMigrations(config);
  const localMigrations = await getLocalMigrations(cwd);
  s.stop("Migration status retrieved");
  const executedNames = new Set(executedMigrations.map((m) => m.name));
  const pendingMigrations = localMigrations.filter((m) => !executedNames.has(m));
  console.log();
  console.log(chalk4.bold("\u{1F4CA} Migration Status"));
  console.log(chalk4.dim("\u2500".repeat(50)));
  console.log(`  Total migrations:    ${chalk4.cyan(localMigrations.length)}`);
  console.log(`  Executed:            ${chalk4.green(executedMigrations.length)}`);
  console.log(
    `  Pending:             ${pendingMigrations.length > 0 ? chalk4.yellow(pendingMigrations.length) : chalk4.gray("0")}`
  );
  console.log();
  if (pendingMigrations.length > 0) {
    console.log(chalk4.bold("Pending migrations:"));
    for (const migration of pendingMigrations) {
      console.log(`  ${chalk4.yellow("\u25CB")} ${migration}`);
    }
    console.log();
    console.log(
      chalk4.dim(`Run ${chalk4.cyan("baasix migrate run")} to execute pending migrations.`)
    );
  } else {
    console.log(chalk4.green("\u2713 All migrations have been executed."));
  }
  outro4("");
}
async function listMigrations(s, config, cwd) {
  s.start("Fetching migrations...");
  const executedMigrations = await getExecutedMigrations(config);
  const localMigrations = await getLocalMigrations(cwd);
  s.stop("Migrations retrieved");
  const executedMap = new Map(executedMigrations.map((m) => [m.name, m]));
  console.log();
  console.log(chalk4.bold("\u{1F4CB} All Migrations"));
  console.log(chalk4.dim("\u2500".repeat(70)));
  if (localMigrations.length === 0) {
    console.log(chalk4.dim("  No migrations found."));
  } else {
    for (const name of localMigrations) {
      const executed = executedMap.get(name);
      if (executed) {
        const executedDate = executed.executedAt ? new Date(executed.executedAt).toLocaleDateString() : "unknown date";
        console.log(
          `  ${chalk4.green("\u2713")} ${name} ${chalk4.dim(`(batch ${executed.batch || "?"}, ${executedDate})`)}`
        );
      } else {
        console.log(`  ${chalk4.yellow("\u25CB")} ${name} ${chalk4.dim("(pending)")}`);
      }
    }
  }
  console.log();
  outro4("");
}
async function runMigrations2(s, config, cwd, skipConfirm) {
  s.start("Checking for pending migrations...");
  const executedMigrations = await getExecutedMigrations(config);
  const localMigrations = await getLocalMigrations(cwd);
  const executedNames = new Set(executedMigrations.map((m) => m.name));
  const pendingMigrations = localMigrations.filter((m) => !executedNames.has(m));
  if (pendingMigrations.length === 0) {
    s.stop("No pending migrations");
    log4.info("All migrations have already been executed.");
    outro4("");
    return;
  }
  s.stop(`Found ${pendingMigrations.length} pending migrations`);
  console.log();
  console.log(chalk4.bold("Migrations to run:"));
  for (const name of pendingMigrations) {
    console.log(`  ${chalk4.cyan("\u2192")} ${name}`);
  }
  console.log();
  if (!skipConfirm) {
    const confirmed = await confirm4({
      message: `Run ${pendingMigrations.length} migration(s)?`,
      initialValue: true
    });
    if (isCancel4(confirmed) || !confirmed) {
      cancel4("Operation cancelled");
      process.exit(0);
    }
  }
  s.start("Running migrations...");
  try {
    const result = await runMigrations(config, {
      step: pendingMigrations.length
    });
    if (result.success) {
      s.stop("Migrations executed");
      outro4(chalk4.green(`\u2728 ${result.message}`));
    } else {
      s.stop("Migration failed");
      log4.error(result.message);
      process.exit(1);
    }
  } catch (error) {
    s.stop("Migration failed");
    throw error;
  }
}
async function createMigration(s, cwd, name) {
  let migrationName = name;
  if (!migrationName) {
    const result = await text4({
      message: "Migration name:",
      placeholder: "create_users_table",
      validate: (value) => {
        if (!value) return "Migration name is required";
        if (!/^[a-z0-9_]+$/i.test(value)) {
          return "Migration name can only contain letters, numbers, and underscores";
        }
        return void 0;
      }
    });
    if (isCancel4(result)) {
      cancel4("Operation cancelled");
      process.exit(0);
    }
    migrationName = result;
  }
  s.start("Creating migration file...");
  const migrationsDir = path6.join(cwd, "migrations");
  if (!existsSync6(migrationsDir)) {
    await fs5.mkdir(migrationsDir, { recursive: true });
  }
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const filename = `${timestamp}_${migrationName}.js`;
  const filepath = path6.join(migrationsDir, filename);
  if (existsSync6(filepath)) {
    s.stop("File already exists");
    log4.error(`Migration file ${filename} already exists.`);
    process.exit(1);
  }
  const template = `/**
 * Migration: ${migrationName}
 * Created: ${(/* @__PURE__ */ new Date()).toISOString()}
 */

/**
 * Run the migration
 * @param {import("@tspvivek/baasix-sdk").BaasixClient} baasix - Baasix client
 */
export async function up(baasix) {
  // Example: Create a collection
  // await baasix.schema.create("tableName", {
  //   name: "TableName",
  //   timestamps: true,
  //   fields: {
  //     id: { type: "UUID", primaryKey: true, defaultValue: { type: "UUIDV4" } },
  //     name: { type: "String", allowNull: false, values: { length: 255 } },
  //   },
  // });

  // Example: Add a field
  // await baasix.schema.update("tableName", {
  //   fields: {
  //     newField: { type: "String", allowNull: true },
  //   },
  // });

  // Example: Insert data
  // await baasix.items("tableName").create({ name: "Example" });
}

/**
 * Reverse the migration
 * @param {import("@tspvivek/baasix-sdk").BaasixClient} baasix - Baasix client
 */
export async function down(baasix) {
  // Reverse the changes made in up()
  // Example: Drop a collection
  // await baasix.schema.delete("tableName");
}
`;
  await fs5.writeFile(filepath, template);
  s.stop("Migration created");
  outro4(chalk4.green(`\u2728 Created migration: ${chalk4.cyan(filename)}`));
  console.log();
  console.log(`  Edit: ${chalk4.dim(path6.relative(cwd, filepath))}`);
  console.log();
}
async function rollbackMigrations2(s, config, cwd, steps, skipConfirm) {
  s.start("Fetching executed migrations...");
  const executedMigrations = await getExecutedMigrations(config);
  if (executedMigrations.length === 0) {
    s.stop("No migrations to rollback");
    log4.info("No migrations have been executed.");
    outro4("");
    return;
  }
  const sortedByBatch = [...executedMigrations].sort(
    (a, b) => (b.batch || 0) - (a.batch || 0)
  );
  const batchesToRollback = /* @__PURE__ */ new Set();
  const migrationsToRollback = [];
  for (const migration of sortedByBatch) {
    const batch = migration.batch || 0;
    if (batchesToRollback.size < steps) {
      batchesToRollback.add(batch);
    }
    if (batchesToRollback.has(batch)) {
      migrationsToRollback.push(migration);
    }
  }
  s.stop(`Found ${migrationsToRollback.length} migration(s) to rollback`);
  console.log();
  console.log(chalk4.bold("Migrations to rollback:"));
  for (const migration of migrationsToRollback) {
    console.log(
      `  ${chalk4.red("\u2190")} ${migration.name} ${chalk4.dim(`(batch ${migration.batch || "?"})`)}`
    );
  }
  console.log();
  if (!skipConfirm) {
    const confirmed = await confirm4({
      message: `Rollback ${migrationsToRollback.length} migration(s)?`,
      initialValue: false
    });
    if (isCancel4(confirmed) || !confirmed) {
      cancel4("Operation cancelled");
      process.exit(0);
    }
  }
  s.start("Rolling back migrations...");
  try {
    const result = await rollbackMigrations(config, {
      step: steps
    });
    if (result.success) {
      s.stop("Rollback complete");
      outro4(chalk4.green(`\u2728 ${result.message}`));
    } else {
      s.stop("Rollback failed");
      log4.error(result.message);
      process.exit(1);
    }
  } catch (error) {
    s.stop("Rollback failed");
    throw error;
  }
}
async function resetMigrations(s, config, cwd, skipConfirm) {
  s.start("Fetching all executed migrations...");
  const executedMigrations = await getExecutedMigrations(config);
  if (executedMigrations.length === 0) {
    s.stop("No migrations to reset");
    log4.info("No migrations have been executed.");
    outro4("");
    return;
  }
  s.stop(`Found ${executedMigrations.length} executed migration(s)`);
  console.log();
  log4.warn(chalk4.red.bold("\u26A0\uFE0F  This will rollback ALL migrations!"));
  console.log();
  if (!skipConfirm) {
    const confirmed = await confirm4({
      message: `Reset all ${executedMigrations.length} migration(s)? This cannot be undone!`,
      initialValue: false
    });
    if (isCancel4(confirmed) || !confirmed) {
      cancel4("Operation cancelled");
      process.exit(0);
    }
    const doubleConfirm = await text4({
      message: "Type 'reset' to confirm:",
      placeholder: "reset",
      validate: (value) => value !== "reset" ? "Please type 'reset' to confirm" : void 0
    });
    if (isCancel4(doubleConfirm)) {
      cancel4("Operation cancelled");
      process.exit(0);
    }
  }
  s.start("Resetting all migrations...");
  try {
    const maxBatch = Math.max(...executedMigrations.map((m) => m.batch || 0));
    const result = await rollbackMigrations(config, {
      step: maxBatch
    });
    if (result.success) {
      s.stop("Reset complete");
      outro4(chalk4.green(`\u2728 ${result.message}`));
    } else {
      s.stop("Reset failed");
      log4.error(result.message);
      process.exit(1);
    }
  } catch (error) {
    s.stop("Reset failed");
    throw error;
  }
}
async function getExecutedMigrations(config) {
  try {
    return await fetchMigrations(config);
  } catch {
    return [];
  }
}
async function getLocalMigrations(cwd) {
  const migrationsDir = path6.join(cwd, "migrations");
  if (!existsSync6(migrationsDir)) {
    return [];
  }
  const files = await fs5.readdir(migrationsDir);
  return files.filter((f) => f.endsWith(".js") || f.endsWith(".ts")).sort();
}
var migrate = new Command4("migrate").description("Run database migrations").argument(
  "[action]",
  "Migration action (status, list, run, create, rollback, reset)"
).option("-c, --cwd <path>", "Working directory", process.cwd()).option("--url <url>", "Baasix server URL").option("-n, --name <name>", "Migration name (for create)").option("-s, --steps <number>", "Number of batches to rollback", parseInt).option("-y, --yes", "Skip confirmation prompts").action(migrateAction);

// src/utils/get-package-info.ts
import fs6 from "fs/promises";
import path7 from "path";
import { fileURLToPath } from "url";
async function getPackageInfo() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path7.dirname(__filename);
  const packageJsonPath = path7.resolve(__dirname, "../../package.json");
  const content = await fs6.readFile(packageJsonPath, "utf-8");
  return JSON.parse(content);
}

// src/index.ts
import "dotenv/config";
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
async function main() {
  const program = new Command5("baasix");
  let packageInfo = {};
  try {
    packageInfo = await getPackageInfo();
  } catch {
  }
  program.addCommand(init).addCommand(generate).addCommand(extension).addCommand(migrate).version(packageInfo.version || "0.1.0").description("Baasix CLI - Backend-as-a-Service toolkit").action(() => program.help());
  program.parse();
}
main().catch((error) => {
  console.error("Error running Baasix CLI:", error);
  process.exit(1);
});
