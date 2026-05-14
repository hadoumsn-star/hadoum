# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**hadoum** — a Next.js web site project.

## Common Commands

```bash
npm install          # Install dependencies
npm run dev          # Start development server (http://localhost:3000)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint
```

## Architecture

This is a Next.js project. Once scaffolded, the expected structure follows Next.js conventions:

- `app/` or `pages/` — routes and page components
- `public/` — static assets
- `components/` — shared UI components (if added)
- `.env.local` — local environment variables (gitignored)
