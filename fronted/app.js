const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const CATALOG = process.env.CATALOG_URL || 'http://localhost:4000';
const ORDER = process.env.ORDER_URL || 'http://localhost:5000';

// NEW: replicas lists for Part 2 load balancing (comma-separated URLs)
const CATALOG_REPLICAS = process.env.CATALOG_REPLICAS || null;
const ORDER_REPLICAS = process.env.ORDER_REPLICAS || null;

// NEW: cache enable flag + max size
const CACHE_ENABLED = (process.env.CACHE_ENABLED || 'true').toLowerCase() === 'true';
const CACHE_MAX = parseInt(process.env.CACHE_MAX || '30');

// NEW: simple in-memory cache (key -> value)
const cache = new Map();

// NEW: round-robin indices for load balancing
let catalogIndex = 0;
let orderIndex = 0;

// NEW: helper to parse replicas list, fallback to single URL
const parseReplicas = (listStr, fallbackUrl) => {
  if (!listStr) return [fallbackUrl];
  const list = listStr.split(',').map(s => s.trim()).filter(Boolean);
  return list.length > 0 ? list : [fallbackUrl];
};

// NEW: choose a replica using round-robin
const pickReplica = (replicas, type) => {
  if (type === 'catalog') {
    const chosen = replicas[catalogIndex % replicas.length];
    catalogIndex++;
    return chosen;
  }
  const chosen = replicas[orderIndex % replicas.length];
  orderIndex++;
  return chosen;
};

// NEW: LRU-ish behavior for Map (remove oldest when size > CACHE_MAX)
const enforceCacheLimit = () => {
  while (cache.size > CACHE_MAX) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
};

// NEW: cache key for info request
const infoCacheKey = (id) => `info:${id}`;

// NEW: invalidate cache for a specific book id (called by backend replicas)
app.post('/cache/invalidate/:id', (req, res) => {
  const id = req.params.id;

  // NEW: invalidate only affects cacheable items (info)
  const key = infoCacheKey(id);
  const existed = cache.delete(key);

  console.log(`🧹 Cache invalidate for book ID: ${id} - existed: ${existed}`);
  res.json({ message: 'Cache invalidated', id, existed });
});

// search by topic
app.get('/search/:topic', async (req, res) => {
  try {
    const topic = req.params.topic;
    console.log(`🔍 Frontend: Search request for topic: ${topic}`);

    // NEW: pick a catalog replica (round-robin) for load balancing
    const catalogReplicas = parseReplicas(CATALOG_REPLICAS, CATALOG);
    const chosenCatalog = pickReplica(catalogReplicas, 'catalog');

    const response = await axios.get(`${chosenCatalog}/search/${encodeURIComponent(topic)}`);

    console.log(`✅ Frontend: Search successful, found ${response.data.length} books`);
    res.json(response.data);

  } catch (err) {
    console.error('❌ Frontend: Search error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// search by id
app.get('/info/:id', async (req, res) => {
  try {
    const id = req.params.id;
    console.log(`ℹ️ Frontend: Info request for book ID: ${id}`);

    // serve from cache for read requests (if enabled)
    const key = infoCacheKey(id);
    if (CACHE_ENABLED && cache.has(key)) {
      console.log(`⚡ Frontend: Cache HIT for book ID: ${id}`);
      return res.json(cache.get(key));
    }

    console.log(`🐢 Frontend: Cache MISS for book ID: ${id}`);

    // pick a catalog replica (round-robin) for load balancing
    const catalogReplicas = parseReplicas(CATALOG_REPLICAS, CATALOG);
    const chosenCatalog = pickReplica(catalogReplicas, 'catalog');

    const response = await axios.get(`${chosenCatalog}/info/${id}`);

    console.log(`✅ Frontend: Info retrieved for: "${response.data.title}"`);

    // store in cache (only for read requests)
    if (CACHE_ENABLED) {
      cache.set(key, response.data);
      enforceCacheLimit();
      console.log(`🧠 Frontend: Cached info for book ID: ${id} (cache size: ${cache.size})`);
    }

    res.json(response.data);

  } catch (err) {
    console.error('❌ Frontend: Info error:', err.message);

    if (err.response && err.response.status === 404) {
      return res.status(404).json({ error: 'Book not found' });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

// purchase book 
app.post('/purchase/:id', async (req, res) => {
  try {
    const id = req.params.id;
    console.log(`🛒 Frontend: Purchase request for book ID: ${id}`);

    // NEW: write requests should NOT use cache; load balance to an order replica
    const orderReplicas = parseReplicas(ORDER_REPLICAS, ORDER);
    const chosenOrder = pickReplica(orderReplicas, 'order');

    const response = await axios.post(`${chosenOrder}/purchase/${id}`);

    console.log(`✅ Frontend: Purchase successful - Order ID: ${response.data.order.id}`);
    res.json(response.data);

  } catch (err) {
    console.error('❌ Frontend: Purchase error:', err.message);

    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to Bazar Bookstore API',
    endpoints: {
      search: 'GET /search/:topic',
      info: 'GET /info/:id', 
      purchase: 'POST /purchase/:id'
    },
    // NEW: show Part 2 mode info
    part2: {
      cacheEnabled: CACHE_ENABLED,
      cacheMax: CACHE_MAX,
      catalogReplicas: parseReplicas(CATALOG_REPLICAS, CATALOG),
      orderReplicas: parseReplicas(ORDER_REPLICAS, ORDER)
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🎯 Frontend service running on port ${PORT}`));
