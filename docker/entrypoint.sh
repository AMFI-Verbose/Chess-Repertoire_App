#!/bin/sh
set -e

# Apply migrations on every boot; they are idempotent. `SEED_ON_FIRST_RUN=1`
# fills an empty database with the sample content the first time only.
npx prisma migrate deploy

if [ "$SEED_ON_FIRST_RUN" = "1" ]; then
  node -e '
    const { PrismaClient } = require("@prisma/client");
    const db = new PrismaClient();
    db.study.count().then((n) => { process.exit(n === 0 ? 0 : 1); }).catch(() => process.exit(1));
  ' || npm run db:setup
fi

exec npm start
