const mongoose = require("mongoose");

let memoryServer = null;
let dbMode = "disconnected";

async function connectDatabase() {
  const uri = process.env.MONGODB_URI && process.env.MONGODB_URI.trim();
  if (uri) {
    await mongoose.connect(uri);
    dbMode = "mongodb-uri";
    return dbMode;
  }

  try {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    await mongoose.connect(memoryServer.getUri());
    dbMode = "mongodb-memory-server";
    return dbMode;
  } catch {
    dbMode = "in-memory-fallback";
    return dbMode;
  }
}

function getDbMode() {
  return dbMode;
}

module.exports = { connectDatabase, getDbMode };
