#!/bin/bash
cd Nebeng-Backend
# Create a temporary .env.test with wrong DB_NAME
cp .env.test .env.test.bak
sed -i 's/DB_NAME="nebeng_test"/DB_NAME="nebeng"/' .env.test
npx jest --config jest.integration.config.js src/guard-test.int-spec.ts
mv .env.test.bak .env.test
