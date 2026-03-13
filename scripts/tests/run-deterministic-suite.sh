#!/usr/bin/env bash

set -euo pipefail

mapfile -t all_files < <(rg --files tests -g "*.test.ts" -g "*.test.tsx" | sort)

filtered_files=()
for file in "${all_files[@]}"; do
  if [[ "$file" =~ ^tests/apps/dust-permits/e2e/ ]]; then
    continue
  fi
  if [[ "$file" =~ \.live\.test\.ts$ ]]; then
    continue
  fi
  if [[ "$file" =~ \.integration\.test\.ts$ ]]; then
    continue
  fi
  if [[ "$file" =~ e2e\.test\.ts$ ]]; then
    continue
  fi

  filtered_files+=("$file")
done

if ((${#filtered_files[@]} == 0)); then
  echo "No deterministic tests found"
  exit 0
fi

non_mock_files=()
mocked_files=()

for file in "${filtered_files[@]}"; do
  if rg -q "mock\\.module\\(" "$file"; then
    mocked_files+=("$file")
  else
    non_mock_files+=("$file")
  fi
done

if ((${#non_mock_files[@]} > 0)); then
  bun test "${non_mock_files[@]}"
fi

if ((${#mocked_files[@]} > 0)); then
  for file in "${mocked_files[@]}"; do
    bun test --max-concurrency=1 "$file"
  done
fi
