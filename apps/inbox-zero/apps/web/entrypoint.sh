#!/bin/bash

bun install
bunx prisma migrate dev
bun run dev
