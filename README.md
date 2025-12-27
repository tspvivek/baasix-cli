# @tspvivek/baasix-cli

Command-line interface for [Baasix](https://baasix.com) Backend-as-a-Service.

## Installation

```bash
# Global installation
npm install -g @tspvivek/baasix-cli

# Or use npx
npx @tspvivek/baasix-cli <command>
```

## Commands

### `baasix init`

Initialize a new Baasix project with scaffolding.

```bash
baasix init [project-name]
```

**Options:**

- `-t, --template <template>` - Project template (api, nextjs)
- `--skip-install` - Skip package installation

**Templates:**

1. **API Server** - Baasix backend API project
2. **Next.js App** - Next.js frontend with Baasix SDK integration

### `baasix generate`

Generate TypeScript types from your Baasix schemas.

```bash
baasix generate
baasix gen
```

**Options:**

- `-o, --output <path>` - Output file path (default: `baasix.d.ts`)
- `-t, --target <target>` - Generation target:
  - `types` - TypeScript interfaces for all collections
  - `sdk-types` - Typed SDK helpers with collection methods
  - `schema-json` - Export schemas as JSON
- `--url <url>` - Baasix server URL
- `-y, --yes` - Skip confirmation prompts

**Example Output:**

```typescript
// Generated types
export interface Products {
  id: string;
  name: string;
  price: number;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Users {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

// Collection type map
export type CollectionName = "products" | "users";
```

### `baasix extension`

Scaffold a new Baasix extension.

```bash
baasix extension [name]
```

**Options:**

- `-t, --type <type>` - Extension type:
  - `endpoint` - Custom API endpoints
  - `hook` - Lifecycle hooks (before/after CRUD operations)

**Extension Types:**

1. **Endpoint Extension** - Add custom routes to your API:

```javascript
// extensions/baasix-endpoint-custom/index.js
export default function (app, options) {
  app.get('/custom/hello', async (req, reply) => {
    return { message: 'Hello from custom endpoint!' };
  });
}
```

2. **Hook Extension** - Add lifecycle hooks:

```javascript
// extensions/baasix-hook-audit/index.js
export default {
  collections: ['*'], // or specific collections
  hooks: {
    beforeCreate: async ({ collection, data, context }) => {
      data.createdBy = context.user?.id;
      return data;
    },
    afterUpdate: async ({ collection, data, context }) => {
      console.log(`${collection} updated:`, data.id);
    },
  },
};
```

### `baasix migrate`

Database migration management.

```bash
baasix migrate [action]
```

**Actions:**

- `status` - Show current migration status
- `list` - List all migrations
- `run` - Run pending migrations
- `create` - Create a new migration file
- `rollback` - Rollback the last batch of migrations
- `reset` - Rollback all migrations (dangerous!)

**Options:**

- `--url <url>` - Baasix server URL
- `-n, --name <name>` - Migration name (for create)
- `-s, --steps <number>` - Number of batches to rollback
- `-y, --yes` - Skip confirmation prompts

**Example Migration:**

```javascript
// migrations/20240115120000_create_products_table.js
export async function up(baasix) {
  await baasix.schema.create("products", {
    name: "Products",
    timestamps: true,
    fields: {
      id: { type: "UUID", primaryKey: true, defaultValue: { type: "UUIDV4" } },
      name: { type: "String", allowNull: false, values: { length: 255 } },
      price: { type: "Decimal", values: { precision: 10, scale: 2 } },
      description: { type: "Text" },
    },
  });
}

export async function down(baasix) {
  await baasix.schema.delete("products");
}
```

## Configuration

The CLI reads configuration from environment variables or a `.env` file:

```env
# Required
BAASIX_URL=http://localhost:8056

# Authentication (optional, for protected operations)
BAASIX_EMAIL=admin@example.com
BAASIX_PASSWORD=your-password

# Or use token auth
BAASIX_TOKEN=your-jwt-token
```

## Project Structure

After running `baasix init`, your project will have this structure:

### API Template

```
my-project/
├── .env
├── package.json
├── server.js
├── extensions/
│   └── .gitkeep
├── migrations/
│   └── .gitkeep
└── uploads/
    └── .gitkeep
```

### Next.js Template

```
my-project/
├── .env.local
├── package.json
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   └── lib/
│       └── baasix.ts
└── public/
```

## Examples

### Generate Types and Use in Code

```bash
# Generate types
baasix generate -t types -o types/baasix.d.ts

# Use in your code
```

```typescript
import type { Products, Users } from "./types/baasix";
import { createBaasix } from "@tspvivek/baasix-sdk";

const baasix = createBaasix({ url: "http://localhost:8056" });

// Type-safe queries
const products = await baasix.items<Products>("products").list();
const user = await baasix.items<Users>("users").get("user-id");
```

### Create and Run Migrations

```bash
# Create a new migration
baasix migrate create -n add_categories_table

# Check status
baasix migrate status

# Run migrations
baasix migrate run

# Rollback if needed
baasix migrate rollback --steps 1
```

### Create Custom Extension

```bash
# Create endpoint extension
baasix extension my-api -t endpoint

# Create hook extension  
baasix extension audit-log -t hook
```

## License

MIT
