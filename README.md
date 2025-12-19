# Gist

A modern RSS reader application built with Next.js.

## Getting Started

```bash
# Install dependencies
bun install

# Copy environment variables
cp .env.example .env

# Generate Prisma client and initialize database
bunx prisma generate
bunx prisma db push

# Run development server
bun run dev
```

## Build

```bash
bun run build
bun run start
```

## License

[GPL-2.0](./LICENSE)