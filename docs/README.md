# CRAFT Documentation

Comprehensive documentation for the CRAFT platform.

## Table of Contents

### Architecture

- [App Shell Navigation](./architecture/app-shell-navigation.md) - Information architecture and navigation patterns
- [Navigation States](./architecture/navigation-states.md) - Visual reference for all navigation states

### Components

- [App Shell Components](./components/app-shell-components.md) - Technical specifications for shell components

### Operations

- [Cron Authentication](./cron-authentication.md) - Cron route authentication and `CRON_SECRET` rotation

### Getting Started

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Contributing Guidelines](#contributing-guidelines)

---

## Development Setup

### Prerequisites

- Node.js 18+
- npm 9+
- Git

### Installation

```

## Performance tuning

The following environment variables can be used to tune backend performance. They are optional and have the listed defaults.

- `HEALTH_CHECK_BUDGET_MS` (default: `60000`) – Maximum time budget in milliseconds for a single health‑check cron run.
- `HEALTH_CHECK_CONCURRENCY` – Number of concurrent health checks performed per batch. (default defined in code)
- `WORKER_CONCURRENCY` – Number of concurrent worker processes. (default defined in code)
- `LOG_BATCH_SIZE` – Number of log entries to batch before writing to the database. (default defined in code)
- `LOG_FLUSH_INTERVAL_MS` – Interval in milliseconds to flush log batches. (default defined in code)
bash
# Clone the repository
git clone <repository-url>

# Install dependencies
npm install

# Start development server
npm run dev
```

### Environment Variables

```bash
# Copy example env file
cp .env.example .env

# Required variables
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
GITHUB_APP_INSTALLATION_ID=12345678
GITHUB_API_BASE_URL=https://api.github.com

# GitHub Branch Protection and Token Encryption
# GITHUB_DEPLOYMENT_BRANCH: The branch to which deployments are pushed (default: main)
# GITHUB_PROTECTED_BRANCH: The branch protected by required status checks (default: main)
# GITHUB_REQUIRED_STATUS_CHECKS: Comma‑separated list of required status check contexts (e.g., "craft/deployment,ci/build")
# GITHUB_TOKEN: GitHub token with `repo:status` scope. Keep secret.
# GITHUB_TOKEN_ENCRYPTION_KEY: 32‑byte base64 key used to encrypt the token at rest.
#   Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
STRIPE_SECRET_KEY=your_stripe_key
STRIPE_WEBHOOK_SECRET=your_webhook_secret

# Cron & Admin
# Secret used to authenticate cron route calls. Required in production.
# Generate a random secret with: openssl rand -hex 32
CRON_SECRET=your_cron_secret
# Comma-separated list of admin user IDs (UUIDs) granted the admin role.
# Example: ADMIN_USER_IDS=11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222
ADMIN_USER_IDS=
```

See [RBAC & Admin Middleware](./rbac-admin-middleware.md) for details on admin role resolution.
See [Cron Authentication](./cron-authentication.md) for how cron routes are authenticated and how to rotate `CRON_SECRET`.

---

## Project Structure

```
craft/
├── apps/
│   └── web/                    # Next.js web application
│       ├── src/
│       │   ├── app/           # App router pages
│       │   ├── components/    # React components
│       │   ├── lib/          # Utility libraries
│       │   └── services/     # Business logic
│       └── public/           # Static assets
├── packages/
│   ├── types/                # Shared TypeScript types
│   └── stellar/              # Stellar SDK wrapper
├── templates/                # Template projects
├── docs/                     # Documentation
└── Design/                   # Design files
```

---

## Contributing Guidelines

### Branch Naming

```
feature/issue-XXX-short-description
bugfix/issue-XXX-short-description
docs/issue-XXX-short-description
```

### Commit Messages

Follow conventional commits:

```
feat: add user authentication
fix: resolve navigation bug
docs: update API documentation
test: add unit tests for auth service
chore: update dependencies
```

### Pull Request Process

1. Create branch from `main`
2. Implement changes with tests
3. Update documentation
4. Submit PR with description
5. Address review feedback
6. Merge after approval

### Code Style

- Use TypeScript for all new code
- Follow ESLint configuration
- Write tests for new features
- Document complex logic
- Keep functions small and focused

---

## Architecture Overview

### Navigation System

The application uses a dual-navigation system:

1. **Marketing Navigation** (Unauthenticated)
   - Fixed top navbar
   - Responsive mobile menu
   - CTA-focused design

2. **App Shell** (Authenticated)
   - Persistent sidebar navigation
   - Top bar with breadcrumbs
   - Mobile drawer for small screens

See [App Shell Navigation](./architecture/app-shell-navigation.md) for details.

### State Management

- **Server State**: React Query for API data
- **Client State**: React Context for UI state
- **Form State**: React Hook Form
- **URL State**: Next.js router for navigation

### Authentication Flow

```
┌─────────┐     ┌──────────┐     ┌─────────┐
│ Landing │ ──► │  Login   │ ──► │   App   │
└─────────┘     └──────────┘     └─────────┘
                     │                 │
                     │                 ▼
                     │            ┌─────────┐
                     └────────────│ Logout  │
                                  └─────────┘
```

### Data Flow

```
Component ──► Service ──► API ──► Database
    │                              │
    └──────── Cache ◄──────────────┘
```

---

## Testing Strategy

### Unit Tests

- Component rendering
- Business logic
- Utility functions
- 80%+ coverage target

### Integration Tests

- User flows
- API interactions
- Navigation paths

### E2E Tests (Future)

- Critical user journeys
- Payment flows
- Deployment process

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- path/to/test.ts

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

---

## Design System

### Colors

The platform uses a comprehensive color system based on Material Design 3:

- Primary: Deep blues (#000519, #001b4f)
- Secondary: Muted grays
- Tertiary: Cyan accents (#00daf3)
- Surface hierarchy for depth

### Typography

- **Headlines**: Manrope (400-800)
- **Body**: Inter (400-700)
- Scale: 12px - 72px

### Spacing

- Base unit: 4px
- Scale: 4, 8, 12, 16, 24, 32, 48, 64, 96

### Components

All components follow the design system specifications in `Design/DESIGN.md`.

---

## API Documentation

### Authentication Endpoints

```
POST /api/auth/signin      - Sign in user
POST /api/auth/signup      - Create new user
POST /api/auth/signout     - Sign out user
GET  /api/auth/user        - Get current user
GET  /api/auth/profile     - Get user profile
```

### Template Endpoints

```
GET    /api/templates           - List templates
GET    /api/templates/:id       - Get template
POST   /api/templates           - Create template
PUT    /api/templates/:id       - Update template
DELETE /api/templates/:id       - Delete template
```

### Deployment Endpoints

```
GET    /api/deployments         - List deployments
GET    /api/deployments/:id     - Get deployment
POST   /api/deployments         - Create deployment
POST   /api/deployments/:id/repository - Create GitHub repository for deployment
GET    /api/deployments/:id/health - Health check
```

### GitHub Code Push Flow

Deployment updates can optionally push generated workspaces to GitHub as part of the `updating_repo` stage.

Implementation notes:
- Service: `GitHubPushService` (`apps/backend/src/services/github-push.service.ts`)
- Supports both first-time branch creation (from `baseBranch`) and updates to existing branches
- Creates blobs in bounded batches for large generated file sets
- Validates paths to prevent unsafe writes (`..`, absolute paths, `.git`)
- Enforces file-count and total-byte limits for
