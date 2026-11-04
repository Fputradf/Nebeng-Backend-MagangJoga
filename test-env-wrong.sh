#!/bin/bash
cd Nebeng-Backend
# Override both DB_NAME and DATABASE_URL to point to nebeng
DB_NAME=nebeng DATABASE_URL="mysql://root:@localhost:3306/nebeng" npx jest --config jest.integration.config.js src/guard-test.int-spec.ts
