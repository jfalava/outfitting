// @ts-nocheck
/// <reference types="vite/client" />
import { dynamic } from 'fumadocs-mdx/runtime/dynamic';
import * as Config from '../source.config';

const create = await dynamic<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>(Config, {"configPath":"/Users/jfalava/.config/outfitting/repo/documentation/source.config.ts","environment":"vite","outDir":"/Users/jfalava/.config/outfitting/repo/documentation/.source"}, {"doc":{"passthroughs":["extractedReferences"]}});