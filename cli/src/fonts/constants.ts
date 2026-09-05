export const FONT_ARCHIVE_KEY = "releases/fonts.tar.gz";
export const FONT_CHECKSUM_KEY = "releases/fonts.tar.gz.sha256";
export const FONT_ARCHIVE_NAME = "fonts.tar.gz";
export const FONT_ROOT = "fonts/";
export const FONT_EXTENSIONS = [".otf", ".ttf", ".ttc"] as const;
export const FONT_FILE_MODE = 0o644;
export const INVENTORY_FORMAT = "outfitting-private-fonts-inventory-v1";
export const INVENTORY_MACHINE = "outfitting";
export const INVENTORY_KIND = "private-fonts";

export const RESERVED_FAMILIES = [
  "Helvetica",
  "Arial",
  "Times",
  "Times New Roman",
  "Courier",
  "Geneva",
  "Monaco",
] as const;

export type FontExtension = (typeof FONT_EXTENSIONS)[number];
