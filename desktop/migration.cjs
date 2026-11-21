const fs = require("node:fs/promises");
const path = require("node:path");
async function migrateProfile(destination, candidates) {
  try {
    await fs.access(destination);
    return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const source of candidates) {
    try {
      await fs.access(source);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    const staging = destination + ".upgrade";
    try {
      await fs.cp(source, staging, {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
      await fs.rename(staging, destination);
    } catch (error) {
      await fs.rm(staging, { recursive: true, force: true });
      throw error;
    }
    return true;
  }
  return false;
}
module.exports = { migrateProfile };
