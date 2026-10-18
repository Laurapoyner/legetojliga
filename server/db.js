// Databaselaget. På Render bruges MongoDB (MONGODB_URI). I tests bruges en udgave i hukommelsen.
//
// Samlinger:
//   families: { _id, code, tokens: [{ h, at }], state, version, createdAt, updatedAt }
//   photos:   { _id, familyId, data, at }

export async function openMongo(uri, dbName = 'legetoejsligaen') {
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(dbName);
  return wrap(db.collection('families'), db.collection('photos'), () => client.close());
}

export function openMemory() {
  return wrap(new MemCollection(), new MemCollection(), async () => {});
}

async function wrap(families, photos, close) {
  await families.createIndex({ code: 1 }, { unique: true });
  await families.createIndex({ 'tokens.h': 1 });
  await photos.createIndex({ familyId: 1 });
  return {
    close,
    families: {
      byCode: (code) => families.findOne({ code }),
      byToken: (h) => families.findOne({ 'tokens.h': h }),
      byId: (id) => families.findOne({ _id: id }),
      insert: (doc) => families.insertOne(doc),
      // Gemmer kun, hvis ingen anden har gemt imens (version passer)
      async saveState(id, version, state) {
        const r = await families.updateOne(
          { _id: id, version },
          { $set: { state, version: version + 1, updatedAt: new Date() } },
        );
        return r.matchedCount === 1;
      },
      addToken: (id, token) => families.updateOne({ _id: id }, { $push: { tokens: token } }),
      removeToken: (id, h) => families.updateOne({ _id: id }, { $pull: { tokens: { h } } }),
      remove: (id) => families.deleteOne({ _id: id }),
    },
    photos: {
      get: (id, familyId) => photos.findOne({ _id: id, familyId }),
      async put(id, familyId, data) {
        try {
          await photos.updateOne({ _id: id, familyId }, { $set: { data, at: new Date() } }, { upsert: true });
          return true;
        } catch (e) {
          if (e && e.code === 11000) return false; // id tilhører en anden familie
          throw e;
        }
      },
      remove: (id, familyId) => photos.deleteOne({ _id: id, familyId }),
      removeFamily: (familyId) => photos.deleteMany({ familyId }),
    },
  };
}

// ---------- Lille MongoDB-lignende samling i hukommelsen (til tests) ----------

const get = (doc, path) => path.split('.').reduce((v, k) => (Array.isArray(v) ? v.map((x) => x?.[k]) : v?.[k]), doc);

function matches(doc, filter) {
  return Object.entries(filter).every(([k, want]) => {
    const v = get(doc, k);
    return Array.isArray(v) ? v.includes(want) : v === want;
  });
}

class MemCollection {
  constructor() {
    this.docs = new Map();
    this.unique = [];
  }
  async createIndex(spec, opts = {}) {
    if (opts.unique) this.unique.push(Object.keys(spec)[0]);
  }
  find(filter) {
    for (const d of this.docs.values()) if (matches(d, filter)) return d;
    return null;
  }
  async findOne(filter) {
    const d = this.find(filter);
    return d ? structuredClone(d) : null;
  }
  checkUnique(doc) {
    if (this.docs.has(doc._id)) throw Object.assign(new Error('dup'), { code: 11000 });
    for (const k of this.unique) {
      for (const d of this.docs.values()) if (d[k] === doc[k]) throw Object.assign(new Error('dup'), { code: 11000 });
    }
  }
  async insertOne(doc) {
    this.checkUnique(doc);
    this.docs.set(doc._id, structuredClone(doc));
    return { insertedId: doc._id };
  }
  async updateOne(filter, update, opts = {}) {
    let d = this.find(filter);
    if (!d) {
      if (!opts.upsert) return { matchedCount: 0 };
      d = { ...filter };
      this.checkUnique(d);
      this.docs.set(d._id, d);
    }
    for (const [k, v] of Object.entries(update.$set || {})) d[k] = structuredClone(v);
    for (const [k, v] of Object.entries(update.$push || {})) (d[k] = d[k] || []).push(structuredClone(v));
    for (const [k, v] of Object.entries(update.$pull || {})) d[k] = (d[k] || []).filter((x) => !matches(x, v));
    return { matchedCount: 1 };
  }
  async deleteOne(filter) {
    const d = this.find(filter);
    if (d) this.docs.delete(d._id);
    return { deletedCount: d ? 1 : 0 };
  }
  async deleteMany(filter) {
    let n = 0;
    for (const [id, d] of [...this.docs]) if (matches(d, filter)) (this.docs.delete(id), n++);
    return { deletedCount: n };
  }
}
