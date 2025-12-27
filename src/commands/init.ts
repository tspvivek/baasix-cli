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
import crypto from "node:crypto";
import { detectPackageManager, installDependencies, type PackageManager } from "../utils/package-manager.js";

type ProjectTemplate = "api" | "nextjs" | "nextjs-app";

interface InitOptions {
  cwd: string;
  template?: ProjectTemplate;
  name?: string;
  yes?: boolean;
}

function generateSecret(length: number = 64): string {
  return crypto.randomBytes(length).toString("base64url").slice(0, length);
}

async function initAction(opts: InitOptions) {
  const cwd = path.resolve(opts.cwd);

  intro(chalk.bgCyan.black(" Baasix Project Setup "));

  // Get project name
  let projectName = opts.name;
  if (!projectName) {
    const result = await text({
      message: "What is your project name?",
      placeholder: "my-baasix-app",
      defaultValue: "my-baasix-app",
      validate: (value) => {
        if (!value) return "Project name is required";
        if (!/^[a-z0-9-_]+$/i.test(value)) return "Project name must be alphanumeric with dashes or underscores";
        return undefined;
      },
    });

    if (isCancel(result)) {
      cancel("Operation cancelled");
      process.exit(0);
    }
    projectName = result as string;
  }

  // Select template
  let template = opts.template;
  if (!template) {
    const result = await select({
      message: "Select a project template:",
      options: [
        {
          value: "api",
          label: "API Only",
          hint: "Baasix server with basic configuration",
        },
        {
          value: "nextjs-app",
          label: "Next.js (App Router)",
          hint: "Next.js 14+ with App Router and SDK integration",
        },
        {
          value: "nextjs",
          label: "Next.js (Pages Router)",
          hint: "Next.js with Pages Router and SDK integration",
        },
      ],
    });

    if (isCancel(result)) {
      cancel("Operation cancelled");
      process.exit(0);
    }
    template = result as ProjectTemplate;
  }

  const projectPath = path.join(cwd, projectName);

  // Check if directory exists
  if (existsSync(projectPath)) {
    const overwrite = await confirm({
      message: `Directory ${projectName} already exists. Overwrite?`,
      initialValue: false,
    });

    if (isCancel(overwrite) || !overwrite) {
      cancel("Operation cancelled");
      process.exit(0);
    }
  }

  const s = spinner();
  s.start("Creating project structure...");

  try {
    // Create project directory
    await fs.mkdir(projectPath, { recursive: true });

    // Generate based on template
    if (template === "api") {
      await createApiProject(projectPath, projectName);
    } else if (template === "nextjs-app" || template === "nextjs") {
      await createNextJsProject(projectPath, projectName, template === "nextjs-app");
    }

    s.stop("Project structure created");

    // Detect package manager
    const packageManager = detectPackageManager(cwd);

    // Install dependencies
    const shouldInstall = opts.yes || await confirm({
      message: `Install dependencies with ${packageManager}?`,
      initialValue: true,
    });

    if (shouldInstall && !isCancel(shouldInstall)) {
      s.start("Installing dependencies...");
      try {
        await installDependencies({
          dependencies: [],
          packageManager,
          cwd: projectPath,
        });
        s.stop("Dependencies installed");
      } catch (error) {
        s.stop("Failed to install dependencies");
        log.warn(`Run ${chalk.cyan(`cd ${projectName} && ${packageManager} install`)} to install manually`);
      }
    }

    outro(chalk.green("✨ Project created successfully!"));

    // Print next steps
    console.log();
    console.log(chalk.bold("Next steps:"));
    console.log(`  ${chalk.cyan(`cd ${projectName}`)}`);
    console.log(`  ${chalk.cyan("# Configure your .env file")}`);
    if (template === "api") {
      console.log(`  ${chalk.cyan(`${packageManager} run dev`)}`);
    } else {
      console.log(`  ${chalk.cyan(`${packageManager} run dev`)} ${chalk.dim("# Start Next.js")}`);
      console.log(`  ${chalk.cyan(`${packageManager} run api:dev`)} ${chalk.dim("# Start Baasix API (in another terminal)")}`);
    }
    console.log();

  } catch (error) {
    s.stop("Failed to create project");
    log.error(error instanceof Error ? error.message : "Unknown error");
    process.exit(1);
  }
}

async function createApiProject(projectPath: string, projectName: string) {
  const secretKey = generateSecret(64);
  const cookieSecret = generateSecret(32);

  // package.json
  const packageJson = {
    name: projectName,
    version: "0.1.0",
    type: "module",
    scripts: {
      dev: "node --watch server.js",
      start: "node server.js",
    },
    dependencies: {
      "@tspvivek/baasix": "latest",
    },
  };

  await fs.writeFile(
    path.join(projectPath, "package.json"),
    JSON.stringify(packageJson, null, 2)
  );

  // server.js
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

  await fs.writeFile(path.join(projectPath, "server.js"), serverJs);

  // .env
  const envContent = `# Database (PostgreSQL 14+ required)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=baasix
DB_USER=postgres
DB_PASSWORD=yourpassword

# Server
PORT=8056
NODE_ENV=development

# Security (REQUIRED - auto-generated)
SECRET_KEY=${secretKey}
COOKIE_SECRET=${cookieSecret}

# Cache (Redis 6+ recommended for production)
# CACHE_REDIS_URL=redis://localhost:6379

# Registration
PUBLIC_REGISTRATION=true

# Uncomment to enable real-time features
# SOCKET_ENABLED=true
`;

  await fs.writeFile(path.join(projectPath, ".env"), envContent);

  // .env.example
  const envExample = `# Database (PostgreSQL 14+ required)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=baasix
DB_USER=postgres
DB_PASSWORD=yourpassword

# Server
PORT=8056
NODE_ENV=development

# Security (REQUIRED - min 32 chars)
SECRET_KEY=your-secret-key-min-32-characters-here
COOKIE_SECRET=your-cookie-secret-min-32-chars

# Cache (Redis 6+ recommended for production)
# CACHE_REDIS_URL=redis://localhost:6379

# Registration
PUBLIC_REGISTRATION=true

# Real-time
# SOCKET_ENABLED=true
`;

  await fs.writeFile(path.join(projectPath, ".env.example"), envExample);

  // .gitignore
  const gitignore = `node_modules/
.env
uploads/
logs/
dist/
`;

  await fs.writeFile(path.join(projectPath, ".gitignore"), gitignore);

  // Create extensions directory
  await fs.mkdir(path.join(projectPath, "extensions"), { recursive: true });
  await fs.writeFile(
    path.join(projectPath, "extensions", ".gitkeep"),
    "# Place your Baasix extensions here\n"
  );

  // Create uploads directory
  await fs.mkdir(path.join(projectPath, "uploads"), { recursive: true });
  await fs.writeFile(path.join(projectPath, "uploads", ".gitkeep"), "");

  // README.md
  const readme = `# ${projectName}

A Baasix Backend-as-a-Service project.

## Getting Started

1. **Configure your database**

   Edit \`.env\` and set your PostgreSQL connection details:
   \`\`\`
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=baasix
   DB_USER=postgres
   DB_PASSWORD=yourpassword
   \`\`\`

2. **Start the server**

   \`\`\`bash
   npm run dev
   \`\`\`

3. **Access the API**

   - API: http://localhost:8056
   - Default admin: admin@baasix.com / admin@123

## Documentation

- [Baasix Documentation](https://baasix.com/docs)
- [SDK Guide](https://baasix.com/docs/sdk-guide)
- [API Reference](https://baasix.com/docs/api-reference)

## Extensions

Place your custom hooks and endpoints in the \`extensions/\` directory.

See [Extensions Documentation](https://baasix.com/docs/extensions) for more details.
`;

  await fs.writeFile(path.join(projectPath, "README.md"), readme);
}

async function createNextJsProject(projectPath: string, projectName: string, useAppRouter: boolean) {
  const secretKey = generateSecret(64);
  const cookieSecret = generateSecret(32);

  // package.json
  const packageJson = {
    name: projectName,
    version: "0.1.0",
    type: "module",
    scripts: {
      dev: "next dev",
      build: "next build",
      start: "next start",
      lint: "next lint",
      "api:dev": "node --watch api/server.js",
      "api:start": "node api/server.js",
    },
    dependencies: {
      "@tspvivek/baasix": "latest",
      "@tspvivek/baasix-sdk": "latest",
      next: "^14.0.0",
      react: "^18.2.0",
      "react-dom": "^18.2.0",
    },
    devDependencies: {
      "@types/node": "^20.0.0",
      "@types/react": "^18.2.0",
      "@types/react-dom": "^18.2.0",
      typescript: "^5.0.0",
    },
  };

  await fs.writeFile(
    path.join(projectPath, "package.json"),
    JSON.stringify(packageJson, null, 2)
  );

  // Create api directory with server.js
  await fs.mkdir(path.join(projectPath, "api"), { recursive: true });

  const apiServerJs = `import { startServer } from "@tspvivek/baasix";

startServer({
  port: process.env.API_PORT || 8056,
  logger: {
    level: process.env.LOG_LEVEL || "info",
    pretty: process.env.NODE_ENV !== "production",
  },
}).catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
`;

  await fs.writeFile(path.join(projectPath, "api", "server.js"), apiServerJs);

  // Create extensions directory
  await fs.mkdir(path.join(projectPath, "api", "extensions"), { recursive: true });
  await fs.writeFile(
    path.join(projectPath, "api", "extensions", ".gitkeep"),
    "# Place your Baasix extensions here\n"
  );

  // .env.local
  const envLocal = `# Baasix API URL (for SDK)
NEXT_PUBLIC_BAASIX_URL=http://localhost:8056

# Database (PostgreSQL 14+ required)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=baasix
DB_USER=postgres
DB_PASSWORD=yourpassword

# API Server
API_PORT=8056
NODE_ENV=development

# Security (REQUIRED - auto-generated)
SECRET_KEY=${secretKey}
COOKIE_SECRET=${cookieSecret}

# Registration
PUBLIC_REGISTRATION=true
`;

  await fs.writeFile(path.join(projectPath, ".env.local"), envLocal);

  // tsconfig.json
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
        "@/*": [useAppRouter ? "./src/*" : "./*"],
      },
    },
    include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    exclude: ["node_modules", "api"],
  };

  await fs.writeFile(
    path.join(projectPath, "tsconfig.json"),
    JSON.stringify(tsconfig, null, 2)
  );

  // next.config.mjs
  const nextConfig = `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
`;

  await fs.writeFile(path.join(projectPath, "next.config.mjs"), nextConfig);

  if (useAppRouter) {
    // App Router structure
    await fs.mkdir(path.join(projectPath, "src", "app"), { recursive: true });
    await fs.mkdir(path.join(projectPath, "src", "lib"), { recursive: true });

    // src/lib/baasix.ts - SDK client
    const baasixClient = `import { createBaasix } from "@tspvivek/baasix-sdk";

export const baasix = createBaasix({
  url: process.env.NEXT_PUBLIC_BAASIX_URL || "http://localhost:8056",
  authMode: "jwt",
  autoRefresh: true,
});

// Re-export for convenience
export type { User, Role, QueryParams, Filter } from "@tspvivek/baasix-sdk";
`;

    await fs.writeFile(path.join(projectPath, "src", "lib", "baasix.ts"), baasixClient);

    // src/app/layout.tsx
    const layout = `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "${projectName}",
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

    await fs.writeFile(path.join(projectPath, "src", "app", "layout.tsx"), layout);

    // src/app/globals.css
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

    await fs.writeFile(path.join(projectPath, "src", "app", "globals.css"), globalsCss);

    // src/app/page.tsx
    const page = `"use client";

import { useState, useEffect } from "react";
import { baasix, type User } from "@/lib/baasix";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    baasix.auth.getCachedUser().then((u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const handleLogin = async () => {
    try {
      const { user } = await baasix.auth.login({
        email: "admin@baasix.com",
        password: "admin@123",
      });
      setUser(user);
    } catch (error) {
      console.error("Login failed:", error);
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
      <h1 style={{ marginBottom: "1rem" }}>🚀 ${projectName}</h1>
      <p style={{ marginBottom: "2rem", color: "#888" }}>
        Built with Baasix Backend-as-a-Service
      </p>

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
        <ol style={{ paddingLeft: "1.5rem", lineHeight: "1.8" }}>
          <li>Start the API: <code>npm run api:dev</code></li>
          <li>Start Next.js: <code>npm run dev</code></li>
          <li>Access the API at <a href="http://localhost:8056">http://localhost:8056</a></li>
        </ol>
      </div>
    </main>
  );
}
`;

    await fs.writeFile(path.join(projectPath, "src", "app", "page.tsx"), page);

  } else {
    // Pages Router structure
    await fs.mkdir(path.join(projectPath, "pages"), { recursive: true });
    await fs.mkdir(path.join(projectPath, "lib"), { recursive: true });
    await fs.mkdir(path.join(projectPath, "styles"), { recursive: true });

    // lib/baasix.ts
    const baasixClient = `import { createBaasix } from "@tspvivek/baasix-sdk";

export const baasix = createBaasix({
  url: process.env.NEXT_PUBLIC_BAASIX_URL || "http://localhost:8056",
  authMode: "jwt",
  autoRefresh: true,
});

export type { User, Role, QueryParams, Filter } from "@tspvivek/baasix-sdk";
`;

    await fs.writeFile(path.join(projectPath, "lib", "baasix.ts"), baasixClient);

    // pages/_app.tsx
    const app = `import type { AppProps } from "next/app";
import "@/styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
`;

    await fs.writeFile(path.join(projectPath, "pages", "_app.tsx"), app);

    // styles/globals.css
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

    await fs.writeFile(path.join(projectPath, "styles", "globals.css"), globalsCss);

    // pages/index.tsx
    const index = `import { useState, useEffect } from "react";
import { baasix, type User } from "@/lib/baasix";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    baasix.auth.getCachedUser().then((u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const handleLogin = async () => {
    try {
      const { user } = await baasix.auth.login({
        email: "admin@baasix.com",
        password: "admin@123",
      });
      setUser(user);
    } catch (error) {
      console.error("Login failed:", error);
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
      <h1 style={{ marginBottom: "1rem" }}>🚀 ${projectName}</h1>
      <p style={{ marginBottom: "2rem", color: "#888" }}>
        Built with Baasix Backend-as-a-Service
      </p>

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
        <ol style={{ paddingLeft: "1.5rem", lineHeight: "1.8" }}>
          <li>Start the API: <code>npm run api:dev</code></li>
          <li>Start Next.js: <code>npm run dev</code></li>
          <li>Access the API at <a href="http://localhost:8056">http://localhost:8056</a></li>
        </ol>
      </div>
    </main>
  );
}
`;

    await fs.writeFile(path.join(projectPath, "pages", "index.tsx"), index);
  }

  // .gitignore
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

# Baasix
api/uploads/
api/logs/

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

  await fs.writeFile(path.join(projectPath, ".gitignore"), gitignore);

  // Create uploads directory
  await fs.mkdir(path.join(projectPath, "api", "uploads"), { recursive: true });
  await fs.writeFile(path.join(projectPath, "api", "uploads", ".gitkeep"), "");

  // README.md
  const readme = `# ${projectName}

A full-stack project with Next.js and Baasix Backend-as-a-Service.

## Getting Started

1. **Configure your database**

   Edit \`.env.local\` and set your PostgreSQL connection details.

2. **Start the Baasix API** (in one terminal)

   \`\`\`bash
   npm run api:dev
   \`\`\`

3. **Start Next.js** (in another terminal)

   \`\`\`bash
   npm run dev
   \`\`\`

4. **Open your browser**

   - Frontend: http://localhost:3000
   - API: http://localhost:8056

## Default Admin Credentials

- Email: admin@baasix.com
- Password: admin@123

## Documentation

- [Baasix Documentation](https://baasix.com/docs)
- [SDK Guide](https://baasix.com/docs/sdk-guide)
- [Next.js Documentation](https://nextjs.org/docs)
`;

  await fs.writeFile(path.join(projectPath, "README.md"), readme);
}

export const init = new Command("init")
  .description("Initialize a new Baasix project")
  .option("-c, --cwd <path>", "Working directory", process.cwd())
  .option("-t, --template <template>", "Project template (api, nextjs, nextjs-app)")
  .option("-n, --name <name>", "Project name")
  .option("-y, --yes", "Skip confirmation prompts")
  .action(initAction);
