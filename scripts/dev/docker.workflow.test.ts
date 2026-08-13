import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('docker workflows', () => {
  it('publishes amd64 and arm64 docker images in ci and release workflows (no armv7)', () => {
    const ciWorkflow = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
    const releaseWorkflow = readFileSync(resolve(process.cwd(), '.github/workflows/release.yml'), 'utf8');

    expect(ciWorkflow).toContain('arch: amd64');
    expect(ciWorkflow).toContain('arch: arm64');
    expect(ciWorkflow).not.toContain('arch: armv7');
    expect(ciWorkflow).not.toContain('linux/arm/v7');
    expect(ciWorkflow).not.toContain('"${tag}-armv7"');

    expect(releaseWorkflow).toContain('arch: amd64');
    expect(releaseWorkflow).toContain('arch: arm64');
    expect(releaseWorkflow).not.toContain('arch: armv7');
    expect(releaseWorkflow).not.toContain('linux/arm/v7');
    expect(releaseWorkflow).not.toContain('"${tag}-armv7"');
  });

  it('derives Docker Hub image names from the configured username secret', () => {
    const ciWorkflow = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
    const releaseWorkflow = readFileSync(resolve(process.cwd(), '.github/workflows/release.yml'), 'utf8');

    expect(ciWorkflow).toContain('DOCKERHUB_IMAGE: ${{ secrets.DOCKERHUB_USERNAME }}/canopy');
    expect(ciWorkflow).not.toContain('images: 1467078763/canopy');

    expect(releaseWorkflow).toContain('DOCKERHUB_IMAGE: ${{ secrets.DOCKERHUB_USERNAME }}/canopy');
    expect(releaseWorkflow).not.toContain('1467078763/canopy');
  });

  it('uses a Node 25 base image in the Dockerfile (no armv7 variant)', () => {
    const dockerfile = readFileSync(resolve(process.cwd(), 'docker/Dockerfile'), 'utf8');

    expect(dockerfile).toContain('FROM node:25-bookworm-slim AS builder');
    expect(dockerfile).toContain('FROM node:25-bookworm-slim');
  });

  it('avoids buildkit-only frontend syntax so managed docker builders can parse it reliably', () => {
    const dockerfile = readFileSync(resolve(process.cwd(), 'docker/Dockerfile'), 'utf8');

    expect(dockerfile).not.toContain('# syntax=docker/dockerfile:');
    expect(dockerfile).not.toContain('RUN --mount=type=cache');
  });

  it('keeps server docker builds isolated from desktop packaging dependencies', () => {
    const dockerfile = readFileSync(resolve(process.cwd(), 'docker/Dockerfile'), 'utf8');

    expect(dockerfile).toContain('npm ci --ignore-scripts --no-audit --no-fund');
    expect(dockerfile).toContain('npm rebuild esbuild sharp better-sqlite3 --no-audit --no-fund');
    expect(dockerfile).not.toContain('npm ci --no-audit --no-fund');
    expect(dockerfile).toContain('RUN npm run build:web && npm run build:server');
    expect(dockerfile).toContain('npm prune --omit=dev --no-audit --no-fund');
  });
});
